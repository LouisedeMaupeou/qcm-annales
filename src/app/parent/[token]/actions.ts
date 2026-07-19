"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { empreinteJeton } from "@/lib/parent";

export type EtatAutorisation = { message?: string };

/**
 * §5.1 : le parent d'un élève de moins de 15 ans autorise l'inscription. Le
 * trigger users_calculer_actif rend alors le compte utilisable, à condition que
 * le double opt-in élève soit fait.
 */
export async function autoriser(
  _precedent: EtatAutorisation,
  donnees: FormData,
): Promise<EtatAutorisation> {
  const jeton = String(donnees.get("jeton") ?? "");
  if (!jeton) return { message: "Lien invalide." };

  const admin = createAdminClient();
  const { data: acces } = await admin
    .from("parent_access")
    .select("user_id, expires_at")
    .eq("token_hash", empreinteJeton(jeton))
    .maybeSingle();

  if (!acces || (acces.expires_at && new Date(acces.expires_at) < new Date())) {
    return { message: "Ce lien n'est plus valable." };
  }

  const { error } = await admin
    .from("users")
    .update({ autorisation_parentale: "accordee" })
    .eq("id", acces.user_id)
    .eq("autorisation_parentale", "en_attente");

  if (error) return { message: "L'autorisation n'a pas pu être enregistrée." };

  revalidatePath(`/parent/${jeton}`);
  return {};
}
