"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export type EtatSuppression = { message?: string };

const CONFIRMATION_ATTENDUE = "SUPPRIMER";

/**
 * Droit à l'effacement (§8.4). La suppression du compte auth cascade sur
 * public.users, puis sur les sessions, réponses, signalements et l'accès
 * parent — toutes les clés étrangères sont en ON DELETE CASCADE (§7).
 *
 * Irréversible : d'où la confirmation saisie à la main.
 */
export async function supprimerMonCompte(
  _precedent: EtatSuppression,
  donnees: FormData,
): Promise<EtatSuppression> {
  if (String(donnees.get("confirmation") ?? "").trim() !== CONFIRMATION_ATTENDUE) {
    return {
      message: `Pour confirmer, écris ${CONFIRMATION_ATTENDUE} en majuscules.`,
    };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/connexion");

  const admin = createAdminClient();
  const { error } = await admin.auth.admin.deleteUser(user.id);
  if (error) {
    console.error("Suppression de compte échouée :", error);
    return {
      message: "La suppression a échoué. Réessaie ou contacte-nous.",
    };
  }

  await supabase.auth.signOut();
  redirect("/?compte=supprime");
}
