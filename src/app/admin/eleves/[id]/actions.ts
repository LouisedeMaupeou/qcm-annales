"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { exigerAdmin } from "@/lib/admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { emailReinitialisation, envoyerEmail } from "@/lib/emails";
import { urlSite } from "@/lib/parent";

export type EtatAction = { message?: string; succes?: string };

const idSchema = z.uuid();

/** §6.2 : action « désactiver ». Réversible, contrairement à la suppression. */
export async function basculerSuspension(
  _precedent: EtatAction,
  donnees: FormData,
): Promise<EtatAction> {
  await exigerAdmin();

  const id = String(donnees.get("id") ?? "");
  if (!idSchema.safeParse(id).success) return { message: "Élève inconnu." };

  const admin = createAdminClient();
  const { data: eleve } = await admin
    .from("users")
    .select("suspendu, role")
    .eq("id", id)
    .single();

  if (!eleve) return { message: "Élève introuvable." };
  if (eleve.role !== "eleve") {
    return { message: "Cette action ne vise que les comptes élèves." };
  }

  const { error } = await admin
    .from("users")
    .update({ suspendu: !eleve.suspendu })
    .eq("id", id);

  if (error) return { message: `Échec : ${error.message}` };

  revalidatePath(`/admin/eleves/${id}`);
  return {
    succes: eleve.suspendu
      ? "Compte réactivé."
      : "Compte désactivé : l'élève ne peut plus se connecter.",
  };
}

/** §6.2 : action « reset » — envoi d'un lien de réinitialisation. */
export async function envoyerReinitialisation(
  _precedent: EtatAction,
  donnees: FormData,
): Promise<EtatAction> {
  await exigerAdmin();

  const id = String(donnees.get("id") ?? "");
  if (!idSchema.safeParse(id).success) return { message: "Élève inconnu." };

  const admin = createAdminClient();
  const { data: eleve } = await admin
    .from("users")
    .select("email")
    .eq("id", id)
    .single();

  if (!eleve) return { message: "Élève introuvable." };

  const { data: lien, error } = await admin.auth.admin.generateLink({
    type: "recovery",
    email: eleve.email,
  });

  if (error || !lien) return { message: "Le lien n'a pas pu être généré." };

  try {
    await envoyerEmail(
      eleve.email,
      emailReinitialisation(
        `${urlSite()}/auth/confirmer?token_hash=${lien.properties.hashed_token}&type=recovery`,
      ),
    );
  } catch (e) {
    console.error("Envoi du lien de réinitialisation échoué :", e);
    return { message: "Le lien a été généré mais l'email n'est pas parti." };
  }

  return { succes: `Lien de réinitialisation envoyé à ${eleve.email}.` };
}

/**
 * §6.2 et §8.4 : suppression RGPD.
 *
 * La suppression du compte auth cascade sur public.users puis sur les sessions,
 * réponses, signalements et l'accès parent. Irréversible : d'où la confirmation
 * saisie à la main, comme côté élève.
 */
export async function supprimerEleve(
  _precedent: EtatAction,
  donnees: FormData,
): Promise<EtatAction> {
  await exigerAdmin();

  const id = String(donnees.get("id") ?? "");
  if (!idSchema.safeParse(id).success) return { message: "Élève inconnu." };

  const admin = createAdminClient();
  const { data: eleve } = await admin
    .from("users")
    .select("email, role")
    .eq("id", id)
    .single();

  if (!eleve) return { message: "Élève introuvable." };
  if (eleve.role !== "eleve") {
    return { message: "Cette action ne vise que les comptes élèves." };
  }

  const confirmation = String(donnees.get("confirmation") ?? "").trim();
  if (confirmation !== eleve.email) {
    return {
      message:
        "Pour confirmer, recopie exactement l'adresse email de l'élève. C'est irréversible.",
    };
  }

  const { error } = await admin.auth.admin.deleteUser(id);
  if (error) {
    console.error("Suppression RGPD échouée :", error);
    return { message: "La suppression a échoué." };
  }

  redirect("/admin/eleves?supprime=1");
}
