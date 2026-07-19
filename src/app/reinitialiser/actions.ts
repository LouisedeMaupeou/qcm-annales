"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { schemaNouveauMotDePasse } from "@/lib/validation";

export type EtatNouveauMotDePasse = { message?: string };

export async function definirMotDePasse(
  _precedent: EtatNouveauMotDePasse,
  donnees: FormData,
): Promise<EtatNouveauMotDePasse> {
  const analyse = schemaNouveauMotDePasse.safeParse({
    motDePasse: String(donnees.get("motDePasse") ?? ""),
    confirmation: String(donnees.get("confirmation") ?? ""),
  });
  if (!analyse.success) {
    return { message: analyse.error.issues[0]?.message };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/connexion?erreur=lien_expire");

  const { error } = await supabase.auth.updateUser({
    password: analyse.data.motDePasse,
  });
  if (error) {
    return { message: "Le mot de passe n'a pas pu être changé. Réessaie." };
  }

  redirect("/tableau-de-bord?motdepasse=1");
}
