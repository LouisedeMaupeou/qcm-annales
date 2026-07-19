import "server-only";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type RoleStaff = "admin" | "contributeur";

/**
 * Garde du back-office (§4). Renvoie le rôle, ou redirige.
 *
 * Les pages du back-office lisent ensuite avec le client authentifié, pas avec
 * le service_role : la RLS reste donc la barrière réelle, et ce garde ne fait
 * qu'éviter d'afficher une page vide à un élève égaré.
 */
export async function exigerStaff(): Promise<{
  role: RoleStaff;
  userId: string;
}> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/connexion?suite=/admin");

  const { data: profil } = await supabase
    .from("users")
    .select("role")
    .eq("id", user.id)
    .single();

  if (profil?.role !== "admin" && profil?.role !== "contributeur") {
    redirect("/tableau-de-bord");
  }

  return { role: profil.role as RoleStaff, userId: user.id };
}

/** Sections réservées à l'admin : les barèmes engagent la note des élèves. */
export async function exigerAdmin() {
  const { role, userId } = await exigerStaff();
  if (role !== "admin") redirect("/admin");
  return { role, userId };
}
