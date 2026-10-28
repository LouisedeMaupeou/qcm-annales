import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import {
  classerChapitres,
  enQuelquesMots,
  moyenne,
  niveauEpreuve,
  prioriser,
  rang,
  SEUILS_PAR_DEFAUT,
  type ChapitreClasse,
  type Priorite,
  type SeuilsChapitre,
  type StatsChapitre,
} from "@/lib/bilan-cb";

/**
 * Assemblage d'un bilan de session (module concours blancs, §5.4).
 *
 * Les chiffres sont recalculés à chaque lecture depuis les passages : rien
 * n'est figé dans `bilans`, qui ne porte que les textes relus et l'état.
 * C'est ce qui garantit qu'une clé corrigée après coup se répercute.
 *
 * La structure rendue suit les modèles Parkours V10 fournis : un tableau à
 * une colonne par épreuve, et en lignes les indicateurs. Les modèles
 * ingénieurs et commerce ne portent pas les mêmes lignes — le détail
 * justes/fausses/sans réponse n'apparaît que côté ingénieurs — mais ils se
 * calculent de la même façon ; c'est l'affichage qui filtre.
 */

export type ColonneBilan = {
  epreuveCbId: string;
  concours: string;
  matiere: string;
  noteSur20: number | null;
  points: number | null;
  pointsMax: number | null;
  tauxBonnesReponses: number | null;
  moyenneGroupe: number | null;
  rang: number | null;
  participants: number;
  nbBonnes: number;
  nbFausses: number;
  nbAbstentions: number;
  niveau: string | null;
  /** Textes relus par la responsable, vides tant qu'elle n'a rien écrit. */
  forces: string;
  ameliorations: string;
  methode: string;
  conseils: string;
  /** La copie n'a pas été remise : la colonne reste vide, elle ne vaut pas zéro. */
  absent: boolean;
  /** Colonne d'oral : pas de détail justes/fausses, le modèle V10 n'en porte pas. */
  oral: boolean;
};

export type BilanAssemble = {
  bilanId: string | null;
  statut: "genere" | "en_relecture" | "valide" | "envoye";
  eleve: { id: string; prenom: string; nom: string; email: string; emailParent: string | null };
  cohorte: { nom: string; filiere: "commerce" | "ingenieur" } | null;
  session: string;
  colonnes: ColonneBilan[];
  chapitres: ChapitreClasse[];
  priorites: Priorite[];
  enQuelquesMots: string;
  /** Vrai tant qu'une copie de la session n'est pas entièrement corrigée (§5.3). */
  bloqueParCorrection: boolean;
  valideLe: string | null;
  envoyeLe: string | null;
};

async function lireSeuils(): Promise<SeuilsChapitre> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("parametres")
    .select("cle, valeur")
    .in("cle", [
      "seuil_chapitre_maitrise",
      "seuil_chapitre_consolider",
      "erreurs_priorite_chapitre",
    ]);

  const v = new Map((data ?? []).map((p) => [p.cle as string, Number(p.valeur)]));
  return {
    maitrise: v.get("seuil_chapitre_maitrise") ?? SEUILS_PAR_DEFAUT.maitrise,
    consolider: v.get("seuil_chapitre_consolider") ?? SEUILS_PAR_DEFAUT.consolider,
    erreursPriorite:
      v.get("erreurs_priorite_chapitre") ?? SEUILS_PAR_DEFAUT.erreursPriorite,
  };
}

/** Élèves concernés par une session : ceux des cohortes assignées à ses épreuves. */
export async function elevesDeLaSession(sessionCbId: string) {
  const admin = createAdminClient();

  const { data: epreuves } = await admin
    .from("epreuves_cb")
    .select("id")
    .eq("session_cb_id", sessionCbId);
  const epreuveIds = (epreuves ?? []).map((e) => e.id as string);
  if (epreuveIds.length === 0) return [];

  const { data: liens } = await admin
    .from("epreuve_cb_cohortes")
    .select("cohorte_id")
    .in("epreuve_cb_id", epreuveIds);
  const cohorteIds = [...new Set((liens ?? []).map((l) => l.cohorte_id as string))];
  if (cohorteIds.length === 0) return [];

  const { data: eleves } = await admin
    .from("users")
    .select("id, nom, prenom, email, email_parent, cohorte_id, cohortes(nom, filiere)")
    .in("cohorte_id", cohorteIds)
    .order("nom")
    .order("prenom");

  return eleves ?? [];
}

export async function assemblerBilan(
  sessionCbId: string,
  userId: string,
): Promise<BilanAssemble | null> {
  const admin = createAdminClient();
  const seuils = await lireSeuils();

  const [{ data: eleve }, { data: session }, { data: bilan }] = await Promise.all([
    admin
      .from("users")
      .select("id, nom, prenom, email, email_parent, cohorte_id, cohortes(nom, filiere)")
      .eq("id", userId)
      .maybeSingle(),
    admin.from("sessions_cb").select("nom").eq("id", sessionCbId).maybeSingle(),
    admin
      .from("bilans")
      .select("id, statut, en_quelques_mots, analyse_epreuves, priorites, valide_le, envoye_le")
      .eq("session_cb_id", sessionCbId)
      .eq("user_id", userId)
      .maybeSingle(),
  ]);

  if (!eleve || !session) return null;

  const cohorteRow = eleve.cohortes as unknown as {
    nom: string;
    filiere: "commerce" | "ingenieur";
  } | null;

  // --- Épreuves de la session assignées à la cohorte de l'élève ------------
  const { data: epreuves } = await admin
    .from("epreuves_cb")
    .select("id, matiere, concours(nom), epreuve_cb_cohortes(cohorte_id)")
    .eq("session_cb_id", sessionCbId)
    .eq("statut", "publiee")
    .order("epreuve_id_externe");

  const siennes = (epreuves ?? []).filter((e) =>
    ((e.epreuve_cb_cohortes as unknown as { cohorte_id: string }[]) ?? []).some(
      (c) => c.cohorte_id === eleve.cohorte_id,
    ),
  );
  const epreuveIds = siennes.map((e) => e.id as string);

  // --- Tous les passages : les siens, et ceux du groupe pour moyenne et rang
  const { data: passages } = epreuveIds.length
    ? await admin
        .from("passages")
        .select("epreuve_cb_id, user_id, statut, note, note_sur_20, nb_bonnes, nb_fausses, nb_abstentions")
        .in("epreuve_cb_id", epreuveIds)
    : { data: [] };

  const siens = new Map(
    (passages ?? [])
      .filter((p) => p.user_id === userId)
      .map((p) => [p.epreuve_cb_id as string, p]),
  );

  const textes = (bilan?.analyse_epreuves ?? {}) as Record<
    string,
    { forces?: string; ameliorations?: string; methode?: string; conseils?: string }
  >;

  const colonnes: ColonneBilan[] = siennes.map((e) => {
    const id = e.id as string;
    const mien = siens.get(id);

    // §10.2 : moyenne et rang sur les participants Parkours ayant remis.
    const duGroupe = (passages ?? [])
      .filter((p) => p.epreuve_cb_id === id && p.statut !== "en_cours" && p.note_sur_20 !== null)
      .map((p) => Number(p.note_sur_20));

    const note = mien?.note_sur_20 === null || mien === undefined
      ? null
      : Number(mien.note_sur_20);

    const t = textes[id] ?? {};

    return {
      epreuveCbId: id,
      concours: (e.concours as unknown as { nom: string } | null)?.nom ?? "—",
      matiere: e.matiere as string,
      noteSur20: note,
      points: mien?.note === null || mien === undefined ? null : Number(mien.note),
      pointsMax: null,
      tauxBonnesReponses:
        mien && mien.nb_bonnes + mien.nb_fausses + mien.nb_abstentions > 0
          ? Math.round(
              (mien.nb_bonnes /
                (mien.nb_bonnes + mien.nb_fausses + mien.nb_abstentions)) *
                100,
            )
          : null,
      moyenneGroupe: moyenne(duGroupe),
      rang: note === null ? null : rang(note, duGroupe),
      participants: duGroupe.length,
      nbBonnes: mien?.nb_bonnes ?? 0,
      nbFausses: mien?.nb_fausses ?? 0,
      nbAbstentions: mien?.nb_abstentions ?? 0,
      niveau: note === null ? null : niveauEpreuve(note, seuils),
      forces: t.forces ?? "",
      ameliorations: t.ameliorations ?? "",
      methode: t.methode ?? "",
      conseils: t.conseils ?? "",
      absent: !mien || mien.statut === "en_cours",
      oral: false,
    };
  });

  // §5.5 : la note d'oral et son appréciation alimentent le bilan, en colonne
  // supplémentaire. Seules les évaluations validées y entrent — un brouillon
  // de professeur n'a pas à partir chez des parents.
  colonnes.push(...(await colonnesOrales(sessionCbId, userId, seuils)));

  // --- Analyse par chapitre -------------------------------------------------
  const chapitres = await statsParChapitre(userId, epreuveIds);
  const classes = classerChapitres(chapitres, seuils);
  const prioritesCalculees = prioriser(classes, seuils);

  const prioritesEditees = (bilan?.priorites ?? []) as Priorite[];
  const priorites =
    prioritesEditees.length > 0 ? prioritesEditees : prioritesCalculees;

  const composees = colonnes.filter((c) => !c.absent && c.noteSur20 !== null);

  // §5.3 : pas de bilan tant qu'une copie n'est pas entièrement corrigée.
  const bloqueParCorrection = (passages ?? []).some(
    (p) => p.user_id === userId && p.statut === "remis",
  );

  return {
    bilanId: (bilan?.id as string) ?? null,
    statut: (bilan?.statut as BilanAssemble["statut"]) ?? "genere",
    eleve: {
      id: eleve.id as string,
      prenom: eleve.prenom as string,
      nom: eleve.nom as string,
      email: eleve.email as string,
      emailParent: (eleve.email_parent as string | null) ?? null,
    },
    cohorte: cohorteRow,
    session: session.nom as string,
    colonnes,
    chapitres: classes,
    priorites,
    enQuelquesMots:
      (bilan?.en_quelques_mots as string | null) ||
      enQuelquesMots(
        eleve.prenom as string,
        composees.map((c) => ({
          concours: c.concours,
          matiere: c.matiere,
          noteSur20: c.noteSur20!,
          moyenneGroupe: c.moyenneGroupe,
          rang: c.rang ?? 0,
          participants: c.participants,
        })),
        priorites,
      ),
    bloqueParCorrection,
    valideLe: (bilan?.valide_le as string | null) ?? null,
    envoyeLe: (bilan?.envoye_le as string | null) ?? null,
  };
}

/** Colonnes d'oral du bilan, une par épreuve orale évaluée et validée. */
async function colonnesOrales(
  sessionCbId: string,
  userId: string,
  seuils: SeuilsChapitre,
): Promise<ColonneBilan[]> {
  const admin = createAdminClient();

  const { data: epreuves } = await admin
    .from("epreuves_orales")
    .select("id, nom, ordre, concours(nom)")
    .eq("session_cb_id", sessionCbId)
    .order("ordre");
  if (!epreuves || epreuves.length === 0) return [];

  const ids = epreuves.map((e) => e.id as string);
  const { data: evaluations } = await admin
    .from("evaluations_orales")
    .select("epreuve_orale_id, user_id, note_globale, appreciation, recommandation, statut")
    .in("epreuve_orale_id", ids)
    .eq("statut", "validee");

  const miennes = new Map(
    (evaluations ?? [])
      .filter((e) => e.user_id === userId)
      .map((e) => [e.epreuve_orale_id as string, e]),
  );

  return epreuves
    .filter((e) => miennes.has(e.id as string))
    .map((e) => {
      const ev = miennes.get(e.id as string)!;
      const note = ev.note_globale === null ? null : Number(ev.note_globale);

      const duGroupe = (evaluations ?? [])
        .filter((x) => x.epreuve_orale_id === e.id && x.note_globale !== null)
        .map((x) => Number(x.note_globale));

      return {
        epreuveCbId: `oral-${e.id}`,
        concours: (e.concours as unknown as { nom: string } | null)?.nom ?? "—",
        matiere: e.nom as string,
        noteSur20: note,
        points: null,
        pointsMax: null,
        tauxBonnesReponses: null,
        moyenneGroupe: moyenne(duGroupe),
        rang: note === null ? null : rang(note, duGroupe),
        participants: duGroupe.length,
        nbBonnes: 0,
        nbFausses: 0,
        nbAbstentions: 0,
        niveau: note === null ? null : niveauEpreuve(note, seuils),
        forces: (ev.appreciation as string | null) ?? "",
        ameliorations: "",
        methode: "",
        conseils: (ev.recommandation as string | null) ?? "",
        absent: false,
        oral: true,
      } satisfies ColonneBilan;
    });
}

/**
 * Réussite par chapitre, sur l'ensemble des copies de la session.
 *
 * Le chapitre et le travail à réaliser viennent du référentiel, importés avec
 * la question : c'est ce qui permet de proposer une action plutôt qu'un
 * constat (§5.4).
 */
async function statsParChapitre(
  userId: string,
  epreuveIds: string[],
): Promise<StatsChapitre[]> {
  if (epreuveIds.length === 0) return [];
  const admin = createAdminClient();

  const { data: passages } = await admin
    .from("passages")
    .select("id, epreuve_cb_id")
    .eq("user_id", userId)
    .in("epreuve_cb_id", epreuveIds);

  const passageIds = (passages ?? []).map((p) => p.id as string);
  if (passageIds.length === 0) return [];

  const { data: reponses } = await admin
    .from("passage_reponses")
    .select("question_id, statut, questions(chapitre, travail_a_realiser, notions, epreuve_id_externe)")
    .in("passage_id", passageIds)
    .limit(5000);

  const parChapitre = new Map<string, StatsChapitre>();

  for (const r of reponses ?? []) {
    const q = r.questions as unknown as {
      chapitre: string;
      travail_a_realiser: string | null;
      notions: string | null;
      epreuve_id_externe: string | null;
    } | null;
    if (!q?.chapitre) continue;

    // La matière se lit sur l'identifiant d'épreuve : AV-MAT-… → mathématiques.
    const matiere = (q.epreuve_id_externe ?? "").split("-")[1] ?? "";

    const cle = `${matiere}|${q.chapitre}`;
    const entree =
      parChapitre.get(cle) ??
      ({
        chapitre: q.chapitre,
        matiere,
        posees: 0,
        justes: 0,
        fausses: 0,
        abstentions: 0,
        travailARealiser: q.travail_a_realiser,
        notions: q.notions,
      } satisfies StatsChapitre);

    entree.posees += 1;
    if (r.statut === "correcte") entree.justes += 1;
    else if (r.statut === "incorrecte") entree.fausses += 1;
    else if (r.statut === "abstention") entree.abstentions += 1;

    parChapitre.set(cle, entree);
  }

  return [...parChapitre.values()];
}
