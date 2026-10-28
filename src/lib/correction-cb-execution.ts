import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import {
  corriger,
  type Bareme,
  type QuestionACorriger,
  type ReponseCopie,
} from "@/lib/correction-cb";

/**
 * Applique la correction à une copie (module concours blancs, §5.3).
 *
 * Le calcul lui-même vit dans `correction-cb.ts`, pur et testé. Ce module ne
 * fait que l'alimenter et écrire le résultat — la séparation est volontaire :
 * la note d'un élève doit pouvoir se vérifier sans base de données.
 *
 * Appelé à la remise, puis rejoué après chaque correction manuelle : la
 * fonction est idempotente, elle recalcule tout à partir de la copie.
 */

/** Points attribués à la main, pour les questions non auto-corrigeables. */
type PointsManuels = Map<string, number | null>;

export type ResultatCorrection = {
  points: number;
  pointsMax: number;
  noteSur20: number;
  nbBonnes: number;
  nbFausses: number;
  nbAbstentions: number;
  /** Questions attendant encore une note humaine. */
  nbEnAttente: number;
};

export async function corrigerPassage(
  passageId: string,
): Promise<ResultatCorrection | null> {
  const admin = createAdminClient();

  const { data: passage } = await admin
    .from("passages")
    .select("id, epreuve_cb_id, statut")
    .eq("id", passageId)
    .maybeSingle();
  if (!passage) return null;

  const { data: epreuve } = await admin
    .from("epreuves_cb")
    .select("points_bonne, points_mauvaise, points_abstention, note_sur, regles")
    .eq("id", passage.epreuve_cb_id)
    .maybeSingle();
  if (!epreuve) return null;

  const { data: liens } = await admin
    .from("epreuve_cb_questions")
    .select("ordre, points, questions(id, type, bloc_id, auto_correction, reponses_possibles(id, est_correcte))")
    .eq("epreuve_cb_id", passage.epreuve_cb_id)
    .limit(1000);

  const { data: reponses } = await admin
    .from("passage_reponses")
    .select("question_id, reponse, points, statut")
    .eq("passage_id", passageId);

  const questions: QuestionACorriger[] = [];
  for (const lien of liens ?? []) {
    const q = lien.questions as unknown as {
      id: string;
      type: QuestionACorriger["type"];
      bloc_id: string;
      auto_correction: boolean;
      reponses_possibles: { id: string; est_correcte: boolean }[];
    } | null;
    if (!q) continue;

    questions.push({
      id: q.id,
      type: q.type,
      ordre: Number(lien.ordre),
      blocId: q.bloc_id,
      poids: Number(lien.points ?? 1),
      autoCorrection: q.auto_correction !== false,
      propositions: (q.reponses_possibles ?? []).map((p) => ({
        id: p.id,
        estCorrecte: p.est_correcte,
      })),
    });
  }

  const copie = new Map<string, ReponseCopie>();
  const manuels: PointsManuels = new Map();
  for (const r of reponses ?? []) {
    copie.set(r.question_id as string, r.reponse as ReponseCopie);
    if (r.points !== null) manuels.set(r.question_id as string, Number(r.points));
  }

  const bareme: Bareme = {
    pointsBonne: Number(epreuve.points_bonne),
    pointsMauvaise: Number(epreuve.points_mauvaise),
    pointsAbstention: Number(epreuve.points_abstention),
    noteSur: Number(epreuve.note_sur),
    regles: (epreuve.regles ?? {}) as Bareme["regles"],
  };

  const resultat = corriger(questions, copie, bareme);

  // --- Points attribués à la main ------------------------------------------
  // Le module pur ignore les questions manuelles : elles n'ont pas de clé. On
  // ajoute ici ce que la responsable a attribué, et le maximum correspondant.
  const aCorriger = resultat.parQuestion.filter((r) => r.statut === "a_corriger");
  const poidsDe = new Map(questions.map((q) => [q.id, q.poids]));

  let pointsManuels = 0;
  let maxManuel = 0;
  let enAttente = 0;
  for (const r of aCorriger) {
    const poids = poidsDe.get(r.questionId) ?? 1;
    maxManuel += bareme.pointsBonne * poids;
    const note = manuels.get(r.questionId);
    if (note === undefined || note === null) enAttente += 1;
    else pointsManuels += note;
  }

  const points = resultat.points + pointsManuels;
  const pointsMax = resultat.pointsMax + maxManuel;
  const noteSur20 =
    pointsMax > 0
      ? Math.min(bareme.noteSur, Math.max(0, (points / pointsMax) * bareme.noteSur))
      : 0;

  const arrondir = (n: number) => Math.round(n * 100) / 100;

  // --- Écriture -------------------------------------------------------------
  for (const r of resultat.parQuestion) {
    // Une question corrigée à la main garde ses points : on ne réécrit que son
    // statut, jamais la note de la responsable.
    const estManuelle = r.statut === "a_corriger";
    const dejaNotee = manuels.has(r.questionId);

    await admin.from("passage_reponses").upsert(
      {
        passage_id: passageId,
        question_id: r.questionId,
        reponse: copie.get(r.questionId) ?? null,
        statut: r.statut,
        ...(estManuelle && dejaNotee ? {} : { points: estManuelle ? null : r.points }),
      },
      { onConflict: "passage_id,question_id" },
    );
  }

  await admin
    .from("passages")
    .update({
      // §5.3 : la copie n'est « corrigée » que lorsque plus rien n'attend une
      // note humaine. Le bilan de session en dépend.
      statut: enAttente === 0 ? "corrige" : "remis",
      note: arrondir(points),
      note_sur_20: arrondir(noteSur20),
      nb_bonnes: resultat.nbBonnes,
      nb_fausses: resultat.nbFausses,
      nb_abstentions: resultat.nbAbstentions,
    })
    .eq("id", passageId);

  return {
    points: arrondir(points),
    pointsMax: arrondir(pointsMax),
    noteSur20: arrondir(noteSur20),
    nbBonnes: resultat.nbBonnes,
    nbFausses: resultat.nbFausses,
    nbAbstentions: resultat.nbAbstentions,
    nbEnAttente: enAttente,
  };
}
