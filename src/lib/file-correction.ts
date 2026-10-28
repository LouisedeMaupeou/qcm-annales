import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

/**
 * File de correction manuelle (module concours blancs, §5.3).
 *
 * N'y entrent que les questions `auto_correction = NON` — rédactions GEIPI,
 * synthèse ACCÈS. Le reste est noté à la remise.
 */

export type ReponseACorriger = {
  passageId: string;
  questionId: string;
  eleve: string;
  epreuve: string;
  ordre: number;
  enonce: string;
  enonceCommun: string | null;
  /** Ce que l'élève a écrit. Vide = copie blanche, qui se note aussi. */
  texte: string | null;
  abstention: boolean;
  maximum: number;
  pointsActuels: number | null;
  annotation: string | null;
};

export type CopieEnCorrection = {
  passageId: string;
  eleve: string;
  epreuve: string;
  remisLe: string | null;
  reponses: ReponseACorriger[];
};

export async function chargerFileCorrection(): Promise<CopieEnCorrection[]> {
  const admin = createAdminClient();

  const { data: aCorriger } = await admin
    .from("passage_reponses")
    .select("passage_id, question_id, reponse, points, annotation")
    .eq("statut", "a_corriger")
    .limit(1000);

  if (!aCorriger || aCorriger.length === 0) return [];

  const passageIds = [...new Set(aCorriger.map((r) => r.passage_id as string))];
  const questionIds = [...new Set(aCorriger.map((r) => r.question_id as string))];

  const [{ data: passages }, { data: questions }] = await Promise.all([
    admin
      .from("passages")
      .select("id, remis_at, epreuve_cb_id, users(nom, prenom), epreuves_cb(matiere, points_bonne, concours(nom))")
      .in("id", passageIds),
    admin
      .from("questions")
      .select("id, enonce, bloc_id, blocs(enonce_commun)")
      .in("id", questionIds),
  ]);

  // La pondération vit sur le lien épreuve × question.
  const { data: liens } = await admin
    .from("epreuve_cb_questions")
    .select("epreuve_cb_id, question_id, ordre, points")
    .in("question_id", questionIds);

  const parQuestion = new Map((questions ?? []).map((q) => [q.id as string, q]));
  const parPassage = new Map((passages ?? []).map((p) => [p.id as string, p]));
  const parLien = new Map(
    (liens ?? []).map((l) => [`${l.epreuve_cb_id}|${l.question_id}`, l]),
  );

  const copies = new Map<string, CopieEnCorrection>();

  for (const r of aCorriger) {
    const passage = parPassage.get(r.passage_id as string);
    const question = parQuestion.get(r.question_id as string);
    if (!passage || !question) continue;

    const eleveRow = passage.users as unknown as { nom: string; prenom: string } | null;
    const epreuveRow = passage.epreuves_cb as unknown as {
      matiere: string;
      points_bonne: number;
      concours: { nom: string } | null;
    } | null;

    const eleve = eleveRow ? `${eleveRow.prenom} ${eleveRow.nom}` : "—";
    const epreuve = epreuveRow
      ? `${epreuveRow.concours?.nom ?? ""} — ${epreuveRow.matiere}`
      : "—";

    const lien = parLien.get(`${passage.epreuve_cb_id}|${r.question_id}`);
    const reponse = (r.reponse ?? {}) as { texte?: string; abstention?: boolean };

    if (!copies.has(passage.id as string)) {
      copies.set(passage.id as string, {
        passageId: passage.id as string,
        eleve,
        epreuve,
        remisLe: passage.remis_at as string | null,
        reponses: [],
      });
    }

    copies.get(passage.id as string)!.reponses.push({
      passageId: passage.id as string,
      questionId: r.question_id as string,
      eleve,
      epreuve,
      ordre: Number(lien?.ordre ?? 0),
      enonce: question.enonce as string,
      enonceCommun:
        (question.blocs as unknown as { enonce_commun: string | null } | null)
          ?.enonce_commun ?? null,
      texte: reponse.texte?.trim() || null,
      abstention: Boolean(reponse.abstention),
      maximum: Number(epreuveRow?.points_bonne ?? 1) * Number(lien?.points ?? 1),
      pointsActuels: r.points === null ? null : Number(r.points),
      annotation: (r.annotation as string | null) ?? null,
    });
  }

  for (const copie of copies.values()) {
    copie.reponses.sort((a, b) => a.ordre - b.ordre);
  }

  // Les copies les plus anciennement remises d'abord : on ne fait pas attendre
  // un élève plus longtemps qu'un autre.
  return [...copies.values()].sort((a, b) =>
    (a.remisLe ?? "").localeCompare(b.remisLe ?? ""),
  );
}
