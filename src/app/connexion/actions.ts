"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { schemaConnexion } from "@/lib/validation";

export type EtatConnexion = { message?: string };

export async function seConnecter(
  _precedent: EtatConnexion,
  donnees: FormData,
): Promise<EtatConnexion> {
  const analyse = schemaConnexion.safeParse({
    email: String(donnees.get("email") ?? "").trim(),
    motDePasse: String(donnees.get("motDePasse") ?? ""),
  });
  if (!analyse.success) {
    return { message: "Adresse email ou mot de passe invalide." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email: analyse.data.email,
    password: analyse.data.motDePasse,
  });

  if (error || !data.user) {
    // Message volontairement identique quel que soit le motif : distinguer
    // « email inconnu » de « mot de passe faux » permet d'énumérer les comptes.
    return { message: "Adresse email ou mot de passe incorrect." };
  }

  // Le compte peut exister sans être utilisable : double opt-in non fait, ou
  // autorisation parentale toujours attendue (§5.1).
  const admin = createAdminClient();
  const { data: profil } = await admin
    .from("users")
    .select("actif, email_verifie, autorisation_parentale, suspendu")
    .eq("id", data.user.id)
    .single();

  if (!profil?.actif) {
    await supabase.auth.signOut();

    if (profil?.suspendu) {
      return { message: "Ce compte a été désactivé. Contacte-nous si tu penses qu'il s'agit d'une erreur." };
    }
    if (!profil?.email_verifie) {
      return {
        message:
          "Ton adresse email n'est pas encore confirmée. Clique sur le lien que nous t'avons envoyé à l'inscription.",
      };
    }
    if (profil?.autorisation_parentale === "en_attente") {
      return {
        message:
          "Ton compte attend l'accord de ton parent. Il a reçu un email avec le lien d'autorisation.",
      };
    }
    return { message: "Ce compte n'est pas encore actif." };
  }

  const suite = String(donnees.get("suite") ?? "");
  redirect(suite.startsWith("/") && !suite.startsWith("//") ? suite : "/tableau-de-bord");
}

export async function seDeconnecter() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/");
}
