import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { erreurCommise } from "@/lib/bilan-cb";
import { corriger, type ReponseCopie, type StatutReponseCb } from "@/lib/correction-cb";
import { chargerCadreCorrection } from "@/lib/correction-cb-execution";
import {
  chargerQuestionsJouables,
  lireMaximum,
  type QuestionPassage,
  type ReponseEleveCb,
} from "@/lib/passage-cb";

/**
 * Après le bilan : relire sa copie corrigée, et refaire l'épreuve.
 *
 * Tout s'ouvre au même moment, et pas avant : quand le bilan de la session a
 * été envoyé à l'élève. C'est l'embargo du §4.4 — des élèves composent à des
 * heures différentes, et le corrigé ne doit pas circuler tant que la session
 * n'est pas close. La condition est revérifiée à chaque appel, pas seulement
 * à l'affichage du bouton.
 *
 * Une reprise est de l'entraînement : elle vit dans ses propres tables,
 * corrigée par la même règle que la copie officielle, mais rien de ce qui
 * calcule une note, un rang ou un bilan ne la lit.
 */

/** Quatre heures : de quoi composer sans limite de temps, relire, revenir sur une figure. */
const SIGNATURE_REPRISE = 4 * 3600;

export type RefusApresBilan = "introuvable" | "non_assignee" | "bilan_pas_envoye";

type EpreuveOuverte = {
  id: string;
  matiere: string;
  concours: string;
  dureeMinutes: number;
  reponsesMaximum: number | null;
};

/**
 * L'épreuve est-elle rouverte à cet élève ? Elle doit lui être assignée — ou
 * il doit l'avoir composée, s'il a changé de promotion depuis — et son bilan
 * de la session doit avoir été envoyé.
 */
async function ouverteApresBilan(
  userId: string,
  epreuveCbId: string,
): Promise<{ epreuve: EpreuveOuverte } | { refus: RefusApresBilan }> {
  const admin = createAdminClient();

  const { data: epreuve } = await admin
    .from("epreuves_cb")
    .select("id, session_cb_id, matiere, duree_minutes, statut, regles, concours(nom)")
    .eq("id", epreuveCbId)
    .maybeSingle();
  if (!epreuve || epreuve.statut !== "publiee") return { refus: "introuvable" };

  const [{ data: eleve }, { data: passage }, { data: bilan }] = await Promise.all([
    admin.from("users").select("cohorte_id").eq("id", userId).maybeSingle(),
    admin
      .from("passages")
      .select("id")
      .eq("epreuve_cb_id", epreuveCbId)
      .eq("user_id", userId)
      .maybeSingle(),
    admin
      .from("bilans")
      .select("statut")
      .eq("session_cb_id", epreuve.session_cb_id)
      .eq("user_id", userId)
      .maybeSingle(),
  ]);

  let assignee = Boolean(passage);
  if (!assignee && eleve?.cohorte_id) {
    const { data: lien } = await admin
      .from("epreuve_cb_cohortes")
      .select("cohorte_id")
      .eq("epreuve_cb_id", epreuveCbId)
      .eq("cohorte_id", eleve.cohorte_id)
      .maybeSingle();
    assignee = Boolean(lien);
  }
  if (!assignee) return { refus: "non_assignee" };
  if (bilan?.statut !== "envoye") return { refus: "bilan_pas_envoye" };

  return {
    epreuve: {
      id: epreuve.id as string,
      matiere: epreuve.matiere as string,
      concours: (epreuve.concours as unknown as { nom: string } | null)?.nom ?? "—",
      dureeMinutes: epreuve.duree_minutes as number,
      reponsesMaximum: lireMaximum(epreuve.regles as Record<string, unknown> | null),
    },
  };
}

// ---------------------------------------------------------------------------
// Le corrigé
// ---------------------------------------------------------------------------

export type PropositionCorrigee = {
  id: string;
  texte: string;
  estCorrecte: boolean;
  cochee: boolean;
};

export type QuestionCorrigee = Omit<QuestionPassage, "propositions" | "reponse"> & {
  propositions: PropositionCorrigee[];
  /** Réponse rédigée, le cas échéant. */
  texte: string | null;
  /**
   * `a_corriger` sur une copie officielle : en attente d'une note humaine.
   * Sur une reprise, une rédaction n'est jamais notée — on montre l'attendu.
   */
  statut: StatutReponseCb;
  /** Points obtenus ; nuls si la question n'est pas notée. */
  points: number | null;
  /** Annotation de la correctrice, sur une copie officielle. */
  annotation: string | null;
  chapitre: string | null;
  notion: string | null;
  /** Explication de la bonne réponse, telle que le référentiel la donne. */
  correction: string | null;
  /**
   * Sur une réponse fausse : l'erreur commise — le retour propre à la
   * proposition cochée —, ce qu'il faut reprendre et la méthode. Les mêmes
   * rubriques que le plan de travail du bilan.
   */
  erreur: string | null;
  aReprendre: string | null;
  methode: string | null;
};

export type Corrige = {
  epreuveCbId: string;
  concours: string;
  matiere: string;
  noteSur20: number | null;
  nbBonnes: number;
  nbFausses: number;
  nbAbstentions: number;
  questions: QuestionCorrigee[];
};

type Verdict = { statut: StatutReponseCb; points: number | null; annotation?: string | null };

/**
 * Assemble le corrigé : l'énoncé tel qu'il a été servi, ce que l'élève a
 * coché, la bonne réponse et l'explication. Les verdicts sont fournis par
 * l'appelant — enregistrés pour une copie officielle (ils peuvent porter une
 * note manuelle), recalculés pour une reprise.
 */
async function assemblerCorrige(
  epreuveCbId: string,
  reponses: Map<string, ReponseEleveCb>,
  verdicts: Map<string, Verdict>,
): Promise<QuestionCorrigee[]> {
  const admin = createAdminClient();

  // Le contenu servi est exactement celui du passage, réponses comprises.
  const jouables = await chargerQuestionsJouables(epreuveCbId, reponses, SIGNATURE_REPRISE);

  // Ce que le passage cache, et que le corrigé montre.
  const ids = jouables.map((q) => q.id);
  const cles = new Map<string, Set<string>>();
  const pedagogie = new Map<
    string,
    {
      chapitre: string | null;
      notion: string | null;
      correction: string | null;
      aReprendre: string | null;
      methode: string | null;
    }
  >();
  /** Retour propre à chaque proposition fausse : l'erreur de qui la coche. */
  const retours = new Map<string, string | null>();
  for (let i = 0; i < ids.length; i += 100) {
    const lot = ids.slice(i, i + 100);
    const { data } = await admin
      .from("questions")
      .select(
        "id, chapitre, sous_chapitre, notions, retroaction_ciblee, explication, methode, travail_a_realiser, reponses_possibles(id, est_correcte, retroaction)",
      )
      .in("id", lot);
    for (const q of data ?? []) {
      const propositions = (q.reponses_possibles ?? []) as {
        id: string;
        est_correcte: boolean;
        retroaction: string | null;
      }[];
      for (const p of propositions) {
        if (!p.est_correcte) retours.set(p.id, p.retroaction);
      }
      cles.set(
        q.id as string,
        new Set(propositions.filter((p) => p.est_correcte).map((p) => p.id)),
      );
      pedagogie.set(q.id as string, {
        chapitre: (q.chapitre as string | null) ?? null,
        notion: ((q.sous_chapitre ?? q.notions) as string | null) ?? null,
        correction: ((q.retroaction_ciblee ?? q.explication) as string | null) ?? null,
        aReprendre: (q.travail_a_realiser as string | null) ?? null,
        methode: (q.methode as string | null) ?? null,
      });
    }
  }

  return jouables.map((q) => {
    const reponse = q.reponse ?? {};
    const cochees = new Set([reponse.reponseId, ...(reponse.reponseIds ?? [])].filter(Boolean));
    const bonnes = cles.get(q.id) ?? new Set<string>();
    const verdict = verdicts.get(q.id) ?? { statut: "abstention" as const, points: null };
    const peda = pedagogie.get(q.id);
    // `reponse` et `propositions` sont remplacés : le corrigé n'expose pas
    // l'objet brut de la copie.
    const { reponse: _reponse, propositions, ...reste } = q;
    void _reponse;
    return {
      ...reste,
      propositions: propositions.map((p) => ({
        id: p.id,
        texte: p.texte,
        estCorrecte: bonnes.has(p.id),
        cochee: cochees.has(p.id),
      })),
      texte: reponse.texte?.trim() || null,
      statut: verdict.statut,
      points: verdict.points,
      annotation: verdict.annotation ?? null,
      chapitre: peda?.chapitre ?? null,
      notion: peda?.notion ?? null,
      correction: peda?.correction ?? null,
      // Seulement sur une réponse fausse : une abstention n'a pas d'erreur à
      // nommer, une réponse juste non plus.
      ...(verdict.statut === "incorrecte"
        ? {
            erreur:
              [...cochees]
                .map((id) => erreurCommise(retours.get(id as string) ?? null))
                .find(Boolean) ?? null,
            aReprendre: peda?.aReprendre ?? null,
            methode: peda?.methode ?? null,
          }
        : { erreur: null, aReprendre: null, methode: null }),
    };
  });
}

/** La copie officielle, corrigée, telle qu'elle a compté dans le bilan. */
export async function chargerCopieCorrigee(
  userId: string,
  epreuveCbId: string,
): Promise<Corrige | { refus: RefusApresBilan | "pas_de_copie" }> {
  const acces = await ouverteApresBilan(userId, epreuveCbId);
  if ("refus" in acces) return acces;

  const admin = createAdminClient();
  const { data: passage } = await admin
    .from("passages")
    .select("id, statut, note_sur_20, nb_bonnes, nb_fausses, nb_abstentions")
    .eq("epreuve_cb_id", epreuveCbId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!passage || passage.statut === "en_cours") return { refus: "pas_de_copie" };

  const { data: lignes } = await admin
    .from("passage_reponses")
    .select("question_id, reponse, statut, points, annotation")
    .eq("passage_id", passage.id);

  const reponses = new Map<string, ReponseEleveCb>();
  const verdicts = new Map<string, Verdict>();
  for (const l of lignes ?? []) {
    reponses.set(l.question_id as string, (l.reponse ?? {}) as ReponseEleveCb);
    verdicts.set(l.question_id as string, {
      statut: (l.statut as StatutReponseCb | null) ?? "abstention",
      points: l.points === null ? null : Number(l.points),
      annotation: (l.annotation as string | null) ?? null,
    });
  }

  return {
    epreuveCbId,
    concours: acces.epreuve.concours,
    matiere: acces.epreuve.matiere,
    noteSur20: passage.note_sur_20 === null ? null : Number(passage.note_sur_20),
    nbBonnes: passage.nb_bonnes as number,
    nbFausses: passage.nb_fausses as number,
    nbAbstentions: passage.nb_abstentions as number,
    questions: await assemblerCorrige(epreuveCbId, reponses, verdicts),
  };
}

// ---------------------------------------------------------------------------
// Les reprises
// ---------------------------------------------------------------------------

export type ResumeReprise = {
  id: string;
  commenceeLe: string;
  remiseLe: string | null;
  noteSur20: number | null;
};

/** L'historique des reprises de l'élève sur cette épreuve, la plus récente d'abord. */
export async function listerReprises(userId: string, epreuveCbId: string): Promise<ResumeReprise[]> {
  const { data } = await createAdminClient()
    .from("reprises_cb")
    .select("id, started_at, remis_at, note_sur_20")
    .eq("epreuve_cb_id", epreuveCbId)
    .eq("user_id", userId)
    .order("started_at", { ascending: false });
  return (data ?? []).map((r) => ({
    id: r.id as string,
    commenceeLe: r.started_at as string,
    remiseLe: (r.remis_at as string | null) ?? null,
    noteSur20: r.note_sur_20 === null ? null : Number(r.note_sur_20),
  }));
}

/**
 * Ouvre une reprise, ou rend celle qui est en cours : un double clic ou un
 * retour arrière ne doit pas semer des reprises vides dans l'historique.
 */
export async function ouvrirReprise(
  userId: string,
  epreuveCbId: string,
): Promise<{ repriseId: string } | { refus: RefusApresBilan }> {
  const acces = await ouverteApresBilan(userId, epreuveCbId);
  if ("refus" in acces) return acces;

  const admin = createAdminClient();
  const { data: enCours } = await admin
    .from("reprises_cb")
    .select("id")
    .eq("epreuve_cb_id", epreuveCbId)
    .eq("user_id", userId)
    .is("remis_at", null)
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (enCours) return { repriseId: enCours.id as string };

  const { data: creee, error } = await admin
    .from("reprises_cb")
    .insert({ epreuve_cb_id: epreuveCbId, user_id: userId })
    .select("id")
    .single();
  if (error) throw new Error(`Ouverture de la reprise : ${error.message}`);
  return { repriseId: creee.id as string };
}

type RepriseLue = {
  id: string;
  epreuve_cb_id: string;
  started_at: string;
  remis_at: string | null;
  note_sur_20: number | null;
  nb_bonnes: number | null;
  nb_fausses: number | null;
  nb_abstentions: number | null;
};

/** La reprise, si elle appartient bien à l'élève et que l'épreuve lui est rouverte. */
async function lireReprise(
  userId: string,
  repriseId: string,
): Promise<{ reprise: RepriseLue; epreuve: EpreuveOuverte } | { refus: RefusApresBilan }> {
  const { data: reprise } = await createAdminClient()
    .from("reprises_cb")
    .select("id, epreuve_cb_id, user_id, started_at, remis_at, note_sur_20, nb_bonnes, nb_fausses, nb_abstentions")
    .eq("id", repriseId)
    .maybeSingle();
  if (!reprise || reprise.user_id !== userId) return { refus: "introuvable" };

  const acces = await ouverteApresBilan(userId, reprise.epreuve_cb_id as string);
  if ("refus" in acces) return acces;
  return { reprise: reprise as unknown as RepriseLue, epreuve: acces.epreuve };
}

async function reponsesDeReprise(repriseId: string): Promise<Map<string, ReponseEleveCb>> {
  const { data } = await createAdminClient()
    .from("reprise_reponses")
    .select("question_id, reponse")
    .eq("reprise_id", repriseId);
  return new Map(
    (data ?? []).map((r) => [r.question_id as string, (r.reponse ?? {}) as ReponseEleveCb]),
  );
}

export type EtatReprise =
  | {
      enCours: true;
      repriseId: string;
      epreuveCbId: string;
      concours: string;
      matiere: string;
      dureeMinutes: number;
      reponsesMaximum: number | null;
      commenceeLe: string;
      questions: QuestionPassage[];
    }
  | ({ enCours: false; repriseId: string; remiseLe: string } & Corrige);

/** Une reprise en cours se compose ; une reprise remise se lit corrigée. */
export async function chargerReprise(
  userId: string,
  repriseId: string,
): Promise<EtatReprise | { refus: RefusApresBilan }> {
  const lue = await lireReprise(userId, repriseId);
  if ("refus" in lue) return lue;
  const { reprise, epreuve } = lue;
  const reponses = await reponsesDeReprise(repriseId);

  if (!reprise.remis_at) {
    return {
      enCours: true,
      repriseId,
      epreuveCbId: epreuve.id,
      concours: epreuve.concours,
      matiere: epreuve.matiere,
      dureeMinutes: epreuve.dureeMinutes,
      reponsesMaximum: epreuve.reponsesMaximum,
      commenceeLe: reprise.started_at,
      questions: await chargerQuestionsJouables(epreuve.id, reponses, SIGNATURE_REPRISE),
    };
  }

  // Les verdicts sont recalculés plutôt que stockés : la règle est celle de
  // la correction officielle, et elle ne dépend que de la copie et des clés.
  const cadre = await chargerCadreCorrection(epreuve.id);
  const verdicts = new Map<string, Verdict>();
  if (cadre) {
    const resultat = corriger(cadre.questions, reponses as Map<string, ReponseCopie>, cadre.bareme);
    for (const r of resultat.parQuestion) {
      verdicts.set(r.questionId, {
        statut: r.statut,
        points: r.statut === "a_corriger" ? null : r.points,
      });
    }
  }

  return {
    enCours: false,
    repriseId,
    remiseLe: reprise.remis_at,
    epreuveCbId: epreuve.id,
    concours: epreuve.concours,
    matiere: epreuve.matiere,
    noteSur20: reprise.note_sur_20 === null ? null : Number(reprise.note_sur_20),
    nbBonnes: reprise.nb_bonnes ?? 0,
    nbFausses: reprise.nb_fausses ?? 0,
    nbAbstentions: reprise.nb_abstentions ?? 0,
    questions: await assemblerCorrige(epreuve.id, reponses, verdicts),
  };
}

/** Sauvegarde continue, comme pendant le passage — sans échéance. */
export async function enregistrerReponseReprise(
  userId: string,
  repriseId: string,
  questionId: string,
  reponse: ReponseEleveCb,
): Promise<{ ok: true } | { refus: "interdit" | "deja_remise" }> {
  const lue = await lireReprise(userId, repriseId);
  if ("refus" in lue) return { refus: "interdit" };
  if (lue.reprise.remis_at) return { refus: "deja_remise" };

  const admin = createAdminClient();
  // La question doit appartenir à l'épreuve reprise.
  const { data: lien } = await admin
    .from("epreuve_cb_questions")
    .select("question_id")
    .eq("epreuve_cb_id", lue.epreuve.id)
    .eq("question_id", questionId)
    .maybeSingle();
  if (!lien) return { refus: "interdit" };

  const { error } = await admin
    .from("reprise_reponses")
    .upsert(
      { reprise_id: repriseId, question_id: questionId, reponse },
      { onConflict: "reprise_id,question_id" },
    );
  if (error) throw new Error(`Enregistrement de la réponse : ${error.message}`);
  return { ok: true };
}

/**
 * Termine la reprise et la note. Idempotent : seule la mise à jour qui trouve
 * encore la reprise ouverte l'écrit.
 */
export async function terminerReprise(userId: string, repriseId: string): Promise<void> {
  const lue = await lireReprise(userId, repriseId);
  if ("refus" in lue || lue.reprise.remis_at) return;

  const cadre = await chargerCadreCorrection(lue.epreuve.id);
  const reponses = await reponsesDeReprise(repriseId);
  const resultat = cadre
    ? corriger(cadre.questions, reponses as Map<string, ReponseCopie>, cadre.bareme)
    : null;

  await createAdminClient()
    .from("reprises_cb")
    .update({
      remis_at: new Date().toISOString(),
      // Une épreuve entièrement rédigée n'a pas de note automatique.
      note_sur_20:
        resultat && resultat.pointsMax > 0 ? Math.round(resultat.noteSur20 * 100) / 100 : null,
      nb_bonnes: resultat?.nbBonnes ?? 0,
      nb_fausses: resultat?.nbFausses ?? 0,
      nb_abstentions: resultat?.nbAbstentions ?? 0,
    })
    .eq("id", repriseId)
    .is("remis_at", null);
}
