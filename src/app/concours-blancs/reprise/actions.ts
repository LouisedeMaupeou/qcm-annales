"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { ReponseEleveCb } from "@/lib/passage-cb";
import {
  enregistrerReponseReprise,
  ouvrirReprise,
  terminerReprise,
} from "@/lib/reprise-cb";
import type { EtatSauvegarde } from "../[epreuveId]/actions";

/** Actions des reprises d'épreuve, une fois le bilan envoyé. */

async function exigerEleve() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/connexion?suite=/concours-blancs");
  return user.id;
}

/** Ouvre une reprise (ou reprend celle en cours) et y envoie l'élève. */
export async function refaire(formulaire: FormData) {
  const userId = await exigerEleve();
  const epreuveId = String(formulaire.get("epreuveId") ?? "");

  const resultat = await ouvrirReprise(userId, epreuveId);
  if ("refus" in resultat) redirect(`/concours-blancs?refus=${resultat.refus}`);

  redirect(`/concours-blancs/reprise/${resultat.repriseId}`);
}

export async function sauvegarderReprise(
  _precedent: EtatSauvegarde,
  donnees: FormData,
): Promise<EtatSauvegarde> {
  const userId = await exigerEleve();

  const repriseId = String(donnees.get("repriseId") ?? "");
  const questionId = String(donnees.get("questionId") ?? "");

  let reponse: ReponseEleveCb;
  try {
    reponse = JSON.parse(String(donnees.get("reponse") ?? "{}")) as ReponseEleveCb;
  } catch {
    return { refus: "illisible" };
  }

  const resultat = await enregistrerReponseReprise(userId, repriseId, questionId, reponse);
  if ("refus" in resultat) return { refus: resultat.refus };
  return { enregistreLe: Date.now() };
}

/** Termine la reprise : le corrigé s'affiche aussitôt, sur la même adresse. */
export async function terminer(formulaire: FormData) {
  const userId = await exigerEleve();
  const repriseId = String(formulaire.get("repriseId") ?? "");

  await terminerReprise(userId, repriseId);

  revalidatePath("/concours-blancs");
  redirect(`/concours-blancs/reprise/${repriseId}`);
}
