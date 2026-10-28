"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  enregistrerReponse,
  ouvrirPassage,
  remettre,
  type ReponseEleveCb,
} from "@/lib/passage-cb";

/** Actions du passage élève (module concours blancs, §4.3). */

async function exigerEleve() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/connexion?suite=/concours-blancs");
  return user.id;
}

/** Démarre ou reprend la copie, puis ouvre l'écran de composition. */
export async function commencer(formulaire: FormData) {
  const userId = await exigerEleve();
  const epreuveId = String(formulaire.get("epreuveId") ?? "");

  const resultat = await ouvrirPassage(userId, epreuveId);
  if ("refus" in resultat) {
    redirect(`/concours-blancs?refus=${resultat.refus}`);
  }

  redirect(`/concours-blancs/${epreuveId}`);
}

export type EtatSauvegarde = { enregistreLe?: number; refus?: string };

/**
 * Sauvegarde continue : appelée à chaque geste de l'élève.
 *
 * Renvoie un état plutôt que de rediriger — l'écran doit rester en place,
 * c'est tout l'intérêt. Un refus (échéance dépassée) est remonté pour que
 * l'écran bascule de lui-même sur la confirmation de remise.
 */
export async function sauvegarder(
  _precedent: EtatSauvegarde,
  donnees: FormData,
): Promise<EtatSauvegarde> {
  const userId = await exigerEleve();

  const epreuveId = String(donnees.get("epreuveId") ?? "");
  const questionId = String(donnees.get("questionId") ?? "");

  let reponse: ReponseEleveCb;
  try {
    reponse = JSON.parse(String(donnees.get("reponse") ?? "{}")) as ReponseEleveCb;
  } catch {
    return { refus: "illisible" };
  }

  const resultat = await enregistrerReponse(userId, epreuveId, questionId, reponse);
  if ("refus" in resultat) return { refus: resultat.refus };

  return { enregistreLe: Date.now() };
}

/** Remise, par l'élève ou par le chronomètre. */
export async function remettreCopie(formulaire: FormData) {
  const userId = await exigerEleve();
  const epreuveId = String(formulaire.get("epreuveId") ?? "");

  await remettre(userId, epreuveId);

  revalidatePath("/concours-blancs");
  redirect(`/concours-blancs/${epreuveId}?remise=ok`);
}
