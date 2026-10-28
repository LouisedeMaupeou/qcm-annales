"use server";

import { revalidatePath } from "next/cache";
import { exigerPrepa } from "@/lib/admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { corrigerPassage } from "@/lib/correction-cb-execution";

/** File de correction manuelle (module concours blancs, §5.3). */

export type EtatCorrection = { message?: string; succes?: string };

export async function noterReponse(
  _precedent: EtatCorrection,
  donnees: FormData,
): Promise<EtatCorrection> {
  const { userId } = await exigerPrepa();

  const passageId = String(donnees.get("passageId") ?? "");
  const questionId = String(donnees.get("questionId") ?? "");
  const maximum = Number(donnees.get("maximum") ?? 0);

  const brut = String(donnees.get("points") ?? "").trim().replace(",", ".");
  if (!brut) return { message: "Donne une note." };

  const points = Number(brut);
  if (!Number.isFinite(points)) return { message: "Note illisible." };
  if (points < 0) return { message: "Une note négative n'a pas de sens ici." };
  if (maximum > 0 && points > maximum) {
    return { message: `Le maximum de cette question est ${maximum}.` };
  }

  const admin = createAdminClient();

  const { error } = await admin
    .from("passage_reponses")
    .update({
      points,
      annotation: String(donnees.get("annotation") ?? "").trim() || null,
      correcteur_id: userId,
    })
    .eq("passage_id", passageId)
    .eq("question_id", questionId);

  if (error) return { message: `Enregistrement impossible : ${error.message}` };

  // La note de la copie se recalcule entièrement : c'est ce recalcul qui fait
  // passer le passage en « corrigé » quand plus rien n'attend.
  const resultat = await corrigerPassage(passageId);

  revalidatePath("/admin/prepa/correction");

  return {
    succes:
      resultat && resultat.nbEnAttente === 0
        ? `Noté. Copie entièrement corrigée : ${resultat.noteSur20}/20.`
        : `Noté. ${resultat?.nbEnAttente ?? 0} question(s) restante(s) sur cette copie.`,
  };
}

/**
 * Relance la correction automatique d'une copie.
 *
 * Utile après une correction de clé en relecture : la copie a été notée avec
 * l'ancienne réponse attendue, et personne ne le saurait sans rejouer.
 */
export async function recorrigerCopie(formulaire: FormData) {
  await exigerPrepa();
  const passageId = String(formulaire.get("passageId") ?? "");
  await corrigerPassage(passageId);
  revalidatePath("/admin/prepa/correction");
}
