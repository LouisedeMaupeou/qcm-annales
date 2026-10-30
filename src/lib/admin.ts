import "server-only";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type RoleStaff =
  | "admin"
  | "contributeur"
  | "responsable_prepa"
  | "professeur";

const ROLES_STAFF: readonly string[] = [
  "admin",
  "contributeur",
  "responsable_prepa",
  // Le professeur franchit la porte du back-office pour la seule section
  // Oraux (§5.5) ; toutes les autres pages le renvoient par leur propre garde.
  "professeur",
];

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

  if (!profil || !ROLES_STAFF.includes(profil.role)) {
    redirect("/tableau-de-bord");
  }

  return { role: profil.role as RoleStaff, userId: user.id };
}

/**
 * Section Oraux (module concours blancs, §5.5) : admin, responsable des
 * prépas et professeurs.
 *
 * C'est la seule section ouverte au professeur. Il entre dans le back-office
 * — le garde général le laisse passer — mais toutes les autres pages
 * appellent exigerStaff, exigerPrepa ou exigerAdmin, qui le renvoient. La
 * restriction tient donc par défaut : une page oubliée lui reste fermée,
 * plutôt que de s'ouvrir.
 */
export async function exigerOraux() {
  const { role, userId } = await exigerStaff();
  if (role === "contributeur") redirect("/admin");
  return { role, userId };
}

/** Sections réservées à l'admin : les barèmes engagent la note des élèves. */
export async function exigerAdmin() {
  const { role, userId } = await exigerStaff();
  if (role !== "admin") redirect("/admin");
  return { role, userId };
}

/**
 * Section Prépa (module concours blancs, §5) : admin et responsable des
 * prépas. Le contributeur en est exclu — il relit du contenu, il n'a pas à
 * voir les listes d'élèves de la prépa, qui sont des données personnelles de
 * mineurs.
 */
export async function exigerPrepa() {
  const { role, userId } = await exigerStaff();
  if (role !== "admin" && role !== "responsable_prepa") redirect("/admin");
  return { role, userId };
}
