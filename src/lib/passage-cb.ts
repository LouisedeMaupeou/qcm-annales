import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { urlsSigneesFigures } from "@/lib/images-questions";
import { corrigerPassage } from "@/lib/correction-cb-execution";

/**
 * Passage d'une épreuve blanche (module concours blancs, §4.3 et §4.4).
 *
 * Tout ce qui décide est ici, côté serveur. Le navigateur affiche un
 * chronomètre, mais il ne fait jamais foi : l'échéance est calculée en base à
 * partir de `started_at`, et une réponse arrivée après est refusée. Un élève
 * qui remet l'horloge de son poste ne gagne pas une minute.
 *
 * Les questions sont servies expurgées — ni `est_correcte`, ni rétroaction,
 * ni points. L'embargo du §4.4 interdit de laisser filtrer quoi que ce soit du
 * corrigé avant la validation du bilan, et la table `questions` est de toute
 * façon fermée aux élèves : c'est ce module qui sert le contenu jouable.
 */

export type PropositionJouable = { id: string; texte: string };

export type QuestionPassage = {
  id: string;
  ordre: number;
  type: "choix_unique" | "choix_multiple" | "redaction";
  enonce: string;
  enonceCommun: string | null;
  figureUrl: string | null;
  /** La question porte une figure qui n'a pas pu être servie : injouable telle quelle. */
  figureManquante: boolean;
  propositions: PropositionJouable[];
  /** Réponse déjà enregistrée, telle quelle — la copie se reprend où elle en était. */
  reponse: ReponseEleveCb | null;
};

export type ReponseEleveCb = {
  reponseId?: string;
  reponseIds?: string[];
  texte?: string;
  abstention?: boolean;
  aRevoir?: boolean;
};

export type EtatPassage = {
  passageId: string;
  epreuveCbId: string;
  concours: string;
  matiere: string;
  dureeMinutes: number;
  /** Échéance effective : début + durée, ou fermeture de la fenêtre si plus tôt. */
  finLe: string;
  remis: boolean;
  questions: QuestionPassage[];
};

export type RefusPassage =
  | "introuvable"
  | "non_assignee"
  | "pas_ouverte"
  | "fermee"
  | "deja_remis";

/** La ligne d'épreuve dont le passage a besoin, une fois l'accès autorisé. */
type EpreuveAutorisee = {
  id: string;
  matiere: string;
  duree_minutes: number;
  fenetre_debut: string | null;
  fenetre_fin: string | null;
  statut: string;
  concours: { nom: string } | null;
};

/** Union discriminée explicite : sans elle, le rétrécissement de type laisse
 *  `refus` possiblement indéfini chez l'appelant. */
type Autorisation =
  | { refus: RefusPassage; epreuve?: never }
  | { refus?: never; epreuve: EpreuveAutorisee };

/** L'échéance : la durée officielle, sauf si la fenêtre se ferme avant. */
function echeance(demarreLe: string, dureeMinutes: number, fenetreFin: string | null) {
  const parDuree = new Date(demarreLe).getTime() + dureeMinutes * 60_000;
  const parFenetre = fenetreFin ? new Date(fenetreFin).getTime() : null;
  return new Date(parFenetre ? Math.min(parDuree, parFenetre) : parDuree).toISOString();
}

/**
 * Vérifie qu'un élève a le droit de composer, et rend l'épreuve.
 *
 * Trois conditions, toutes revérifiées ici et pas seulement à l'affichage :
 * l'épreuve est publiée, elle est assignée à la cohorte de l'élève, et la
 * fenêtre est ouverte.
 */
async function autoriser(userId: string, epreuveCbId: string): Promise<Autorisation> {
  const admin = createAdminClient();

  const { data: eleve } = await admin
    .from("users")
    .select("cohorte_id")
    .eq("id", userId)
    .maybeSingle();
  if (!eleve?.cohorte_id) return { refus: "non_assignee" as const };

  const { data: epreuve } = await admin
    .from("epreuves_cb")
    .select("id, matiere, duree_minutes, fenetre_debut, fenetre_fin, statut, concours(nom)")
    .eq("id", epreuveCbId)
    .maybeSingle();
  if (!epreuve) return { refus: "introuvable" as const };
  if (epreuve.statut !== "publiee") return { refus: "non_assignee" as const };

  const { data: assignation } = await admin
    .from("epreuve_cb_cohortes")
    .select("cohorte_id")
    .eq("epreuve_cb_id", epreuveCbId)
    .eq("cohorte_id", eleve.cohorte_id)
    .maybeSingle();
  if (!assignation) return { refus: "non_assignee" as const };

  const maintenant = Date.now();
  if (epreuve.fenetre_debut && maintenant < new Date(epreuve.fenetre_debut).getTime()) {
    return { refus: "pas_ouverte" as const };
  }
  if (epreuve.fenetre_fin && maintenant > new Date(epreuve.fenetre_fin).getTime()) {
    return { refus: "fermee" as const };
  }

  return { epreuve: epreuve as unknown as EpreuveAutorisee };
}

/**
 * Ouvre la copie, ou rend celle qui est déjà en cours.
 *
 * Le démarrage n'est pas idempotent par accident : il l'est par nécessité.
 * Une coupure réseau, un rafraîchissement, un second onglet ne doivent pas
 * relancer le chronomètre — c'est l'unicité (epreuve_cb_id, user_id) qui le
 * garantit, et `started_at` ne bouge plus jamais une fois posé.
 */
export async function ouvrirPassage(
  userId: string,
  epreuveCbId: string,
): Promise<{ passageId: string } | { refus: RefusPassage }> {
  const autorisation = await autoriser(userId, epreuveCbId);
  if (autorisation.refus) return { refus: autorisation.refus };

  const admin = createAdminClient();

  const { data: existant } = await admin
    .from("passages")
    .select("id, statut")
    .eq("epreuve_cb_id", epreuveCbId)
    .eq("user_id", userId)
    .maybeSingle();

  if (existant) {
    // §4.3 : tentative unique. Une copie remise ne se rouvre pas.
    if (existant.statut !== "en_cours") return { refus: "deja_remis" };
    return { passageId: existant.id as string };
  }

  const { data: cree, error } = await admin
    .from("passages")
    .insert({ epreuve_cb_id: epreuveCbId, user_id: userId })
    .select("id")
    .single();

  // Deux onglets ouverts en même temps : l'unicité rejette le second, on relit.
  if (error) {
    const { data: rattrape } = await admin
      .from("passages")
      .select("id, statut")
      .eq("epreuve_cb_id", epreuveCbId)
      .eq("user_id", userId)
      .maybeSingle();
    if (!rattrape) throw new Error(`Ouverture du passage : ${error.message}`);
    if (rattrape.statut !== "en_cours") return { refus: "deja_remis" };
    return { passageId: rattrape.id as string };
  }

  return { passageId: cree.id as string };
}

/** Charge la copie en cours : questions expurgées, réponses déjà saisies. */
export async function chargerPassage(
  userId: string,
  epreuveCbId: string,
): Promise<EtatPassage | { refus: RefusPassage }> {
  const autorisation = await autoriser(userId, epreuveCbId);
  if (autorisation.refus) return { refus: autorisation.refus };
  const { epreuve } = autorisation;

  const admin = createAdminClient();

  const { data: passage } = await admin
    .from("passages")
    .select("id, started_at, statut")
    .eq("epreuve_cb_id", epreuveCbId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!passage) return { refus: "introuvable" };

  const { data: liens } = await admin
    .from("epreuve_cb_questions")
    .select("ordre, questions(id, type, enonce, image_url, bloc_id, reponses_possibles(id, texte, ordre))")
    .eq("epreuve_cb_id", epreuveCbId)
    .order("ordre")
    .limit(1000);

  const { data: reponses } = await admin
    .from("passage_reponses")
    .select("question_id, reponse")
    .eq("passage_id", passage.id);

  const parQuestion = new Map(
    (reponses ?? []).map((r) => [r.question_id as string, r.reponse as ReponseEleveCb]),
  );

  // Les énoncés de bloc, en une fois plutôt qu'une requête par question.
  const blocIds = [
    ...new Set(
      (liens ?? [])
        .map((l) => (l.questions as unknown as { bloc_id: string } | null)?.bloc_id)
        .filter((v): v is string => Boolean(v)),
    ),
  ];
  const { data: blocs } = blocIds.length
    ? await admin.from("blocs").select("id, enonce_commun").in("id", blocIds)
    : { data: [] };
  const enonceDuBloc = new Map(
    (blocs ?? []).map((b) => [b.id as string, b.enonce_commun as string | null]),
  );

  // Les figures sont signées en une fois, et pour la durée restante de
  // l'épreuve plus une marge : une épreuve GEIPI dure trois heures, une URL
  // d'une heure se périmerait en pleine composition.
  const finLe = echeance(
    passage.started_at as string,
    epreuve.duree_minutes,
    epreuve.fenetre_fin,
  );
  const resteSecondes = Math.max(
    600,
    Math.ceil((new Date(finLe).getTime() - Date.now()) / 1000) + 900,
  );
  const cheminsFigures = (liens ?? [])
    .map((l) => (l.questions as unknown as { image_url: string | null } | null)?.image_url)
    .filter((v): v is string => Boolean(v));
  const figures = await urlsSigneesFigures(cheminsFigures, resteSecondes);

  const questions: QuestionPassage[] = [];
  for (const lien of liens ?? []) {
    const q = lien.questions as unknown as {
      id: string;
      type: QuestionPassage["type"];
      enonce: string;
      image_url: string | null;
      bloc_id: string;
      reponses_possibles: { id: string; texte: string; ordre: number }[];
    } | null;
    if (!q) continue;

    questions.push({
      id: q.id,
      ordre: Number(lien.ordre),
      type: q.type,
      enonce: q.enonce,
      enonceCommun: enonceDuBloc.get(q.bloc_id) ?? null,
      figureUrl: q.image_url ? (figures.get(q.image_url) ?? null) : null,
      figureManquante: Boolean(q.image_url) && !figures.get(q.image_url ?? ""),
      propositions: [...(q.reponses_possibles ?? [])]
        .sort((a, b) => a.ordre - b.ordre)
        .map((p) => ({ id: p.id, texte: p.texte })),
      reponse: parQuestion.get(q.id) ?? null,
    });
  }

  return {
    passageId: passage.id as string,
    epreuveCbId,
    concours: epreuve.concours?.nom ?? "—",
    matiere: epreuve.matiere,
    dureeMinutes: epreuve.duree_minutes,
    finLe,
    remis: passage.statut !== "en_cours",
    questions,
  };
}

/**
 * Remet la copie. Idempotent : une copie déjà remise le reste, avec sa date
 * d'origine — la remise automatique et le clic de l'élève peuvent se croiser.
 */
export async function remettre(userId: string, epreuveCbId: string) {
  const admin = createAdminClient();

  const { data: passage } = await admin
    .from("passages")
    .select("id, started_at, statut")
    .eq("epreuve_cb_id", epreuveCbId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!passage) return;
  if (passage.statut !== "en_cours") return;

  const maintenant = new Date();
  const { data: remise } = await admin
    .from("passages")
    .update({
      statut: "remis",
      remis_at: maintenant.toISOString(),
      temps_passe: Math.round(
        (maintenant.getTime() - new Date(passage.started_at as string).getTime()) / 1000,
      ),
    })
    .eq("id", passage.id)
    // Garde contre la double remise : le clic de l'élève et le chronomètre
    // peuvent se croiser. Seule la mise à jour qui trouve encore « en_cours »
    // renvoie une ligne, donc une seule correction est lancée.
    .eq("statut", "en_cours")
    .select("id");

  if (!remise || remise.length === 0) return;

  // §5.3 : correction automatique à la remise. Elle ne doit pas faire échouer
  // la remise elle-même — une copie enregistrée mais non corrigée se rattrape,
  // une copie perdue non.
  try {
    await corrigerPassage(passage.id as string);
  } catch (e) {
    console.error(`Correction automatique du passage ${passage.id} échouée :`, e);
  }
}

/**
 * Enregistre une réponse. Rendue à la sauvegarde continue du §4.3 : chaque
 * geste de l'élève part immédiatement, une coupure ne coûte que le dernier.
 *
 * Refuse après l'échéance, et remet alors la copie : un navigateur resté
 * ouvert ne doit pas permettre de répondre une heure après la fin.
 */
export async function enregistrerReponse(
  userId: string,
  epreuveCbId: string,
  questionId: string,
  reponse: ReponseEleveCb,
): Promise<{ ok: true } | { refus: "expire" | "deja_remis" | "interdit" }> {
  const autorisation = await autoriser(userId, epreuveCbId);
  if (autorisation.refus) {
    // Fenêtre fermée pendant la composition : on clôt proprement.
    if (autorisation.refus === "fermee") {
      await remettre(userId, epreuveCbId);
      return { refus: "expire" };
    }
    return { refus: "interdit" };
  }

  const admin = createAdminClient();

  const { data: passage } = await admin
    .from("passages")
    .select("id, started_at, statut")
    .eq("epreuve_cb_id", epreuveCbId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!passage) return { refus: "interdit" };
  if (passage.statut !== "en_cours") return { refus: "deja_remis" };

  const fin = echeance(
    passage.started_at as string,
    autorisation.epreuve.duree_minutes,
    autorisation.epreuve.fenetre_fin,
  );
  if (Date.now() > new Date(fin).getTime()) {
    await remettre(userId, epreuveCbId);
    return { refus: "expire" };
  }

  // La question doit appartenir à l'épreuve : sinon n'importe quelle question
  // de la banque pourrait être rattachée à la copie.
  const { data: lien } = await admin
    .from("epreuve_cb_questions")
    .select("question_id")
    .eq("epreuve_cb_id", epreuveCbId)
    .eq("question_id", questionId)
    .maybeSingle();
  if (!lien) return { refus: "interdit" };

  const { error } = await admin.from("passage_reponses").upsert(
    { passage_id: passage.id, question_id: questionId, reponse },
    { onConflict: "passage_id,question_id" },
  );
  if (error) throw new Error(`Enregistrement de la réponse : ${error.message}`);

  return { ok: true };
}
