"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { emailReinitialisation, envoyerEmail } from "@/lib/emails";
import { urlSite } from "@/lib/parent";
import { schemaEmail } from "@/lib/validation";

export type EtatOubli = { envoye?: boolean; message?: string };

export async function demanderReinitialisation(
  _precedent: EtatOubli,
  donnees: FormData,
): Promise<EtatOubli> {
  const analyse = schemaEmail.safeParse({
    email: String(donnees.get("email") ?? "").trim(),
  });
  if (!analyse.success) {
    return { message: "Adresse email invalide." };
  }

  const admin = createAdminClient();
  const { data, error } = await admin.auth.admin.generateLink({
    type: "recovery",
    email: analyse.data.email,
  });

  // Réponse identique que le compte existe ou non : répondre différemment
  // permettrait de tester quelles adresses sont inscrites.
  if (!error && data) {
    const url = `${urlSite()}/auth/confirmer?token_hash=${
      data.properties.hashed_token
    }&type=recovery`;
    try {
      await envoyerEmail(analyse.data.email, emailReinitialisation(url));
    } catch (e) {
      console.error("Envoi du lien de réinitialisation échoué :", e);
    }
  }

  return { envoye: true };
}
