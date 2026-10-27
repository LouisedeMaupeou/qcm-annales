"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { exigerPrepa } from "@/lib/admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { emailInvitationPrepa, envoyerEmail } from "@/lib/emails";
import { urlSite } from "@/lib/site";
import {
  analyserListeEleves,
  type AnomalieListe,
  type LigneListe,
} from "@/lib/cohortes";

/**
 * Section Prépa — cohortes et rattachements (module concours blancs, §5.1).
 *
 * Toutes les écritures passent par le service_role : les privilèges de colonne
 * du socle (§9 de la migration RLS) interdisent à `authenticated` de modifier
 * les colonnes sensibles de `users`, rôle compris. Le contrôle d'accès est
 * fait ici, en tête de chaque action, par exigerPrepa().
 */

export type EtatCohorte = { message?: string; succes?: string };

export async function creerCohorte(
  _precedent: EtatCohorte,
  donnees: FormData,
): Promise<EtatCohorte> {
  await exigerPrepa();

  const nom = String(donnees.get("nom") ?? "").trim();
  const filiere = String(donnees.get("filiere") ?? "");
  const millesime = String(donnees.get("millesime") ?? "").trim();

  if (!nom) return { message: "Donne un nom à la cohorte." };
  if (filiere !== "commerce" && filiere !== "ingenieur") {
    return { message: "Filière invalide." };
  }
  if (!/^\d{4}(-\d{4})?$/.test(millesime)) {
    return { message: "Millésime attendu au format 2026-2027." };
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("cohortes")
    .insert({ nom, filiere, millesime });

  if (error) {
    return {
      message: error.code === "23505" ? "Une cohorte porte déjà ce nom." : error.message,
    };
  }

  revalidatePath("/admin/prepa");
  return { succes: `Cohorte « ${nom} » créée.` };
}

export async function basculerActivite(cohorteId: string, active: boolean) {
  await exigerPrepa();
  const admin = createAdminClient();
  await admin.from("cohortes").update({ active }).eq("id", cohorteId);
  revalidatePath("/admin/prepa");
  revalidatePath(`/admin/prepa/${cohorteId}`);
}

// ---------------------------------------------------------------------------
// Import de la liste d'une cohorte
// ---------------------------------------------------------------------------

export type EtatImportListe = {
  message?: string;
  rapport?: {
    simulation: boolean;
    lignes: number;
    valides: number;
    rattaches: number;
    crees: number;
    inchanges: number;
    invitesEnvoyes: number;
    invitesEchoues: number;
    anomalies: AnomalieListe[];
  };
};

const TAILLE_MAX = 2 * 1024 * 1024;

export async function importerListeEleves(
  _precedent: EtatImportListe,
  donnees: FormData,
): Promise<EtatImportListe> {
  await exigerPrepa();

  const cohorteId = String(donnees.get("cohorteId") ?? "");
  const simulation = donnees.get("mode") !== "import";
  const fichier = donnees.get("fichier");

  if (!(fichier instanceof File) || fichier.size === 0) {
    return { message: "Choisis un fichier." };
  }
  if (fichier.size > TAILLE_MAX) {
    return { message: "Fichier trop volumineux (2 Mo maximum)." };
  }

  const admin = createAdminClient();
  const { data: cohorte } = await admin
    .from("cohortes")
    .select("id, nom")
    .eq("id", cohorteId)
    .maybeSingle();
  if (!cohorte) return { message: "Cohorte introuvable." };

  const rapport = analyserListeEleves(await fichier.arrayBuffer());
  const anomalies = [...rapport.anomalies];

  // Comptes déjà existants : inscription publique antérieure, ou réimport de
  // la même liste. On rattache, on ne recrée pas (§5.1).
  const emails = rapport.eleves.map((e) => e.email);
  const { data: existants } = emails.length
    ? await admin
        .from("users")
        .select("id, email, role, cohorte_id, email_verifie")
        .in("email", emails)
    : { data: [] };

  const parEmail = new Map(
    (existants ?? []).map((u) => [u.email.toLowerCase(), u]),
  );

  let rattaches = 0;
  let crees = 0;
  let inchanges = 0;

  for (const eleve of rapport.eleves) {
    const existant = parEmail.get(eleve.email);
    if (!existant) {
      crees += 1;
      continue;
    }
    if (existant.role !== "eleve") {
      anomalies.push({
        ligne: eleve.ligne,
        gravite: "bloquante",
        message: `${eleve.email} : compte de back-office (${existant.role}), non rattaché.`,
      });
      continue;
    }
    if (existant.cohorte_id === cohorteId) inchanges += 1;
    else rattaches += 1;
  }

  const base = {
    simulation,
    lignes: rapport.lignes,
    valides: rapport.eleves.length,
    rattaches,
    crees,
    inchanges,
    invitesEnvoyes: 0,
    invitesEchoues: 0,
    anomalies,
  };

  const bloquantSansLigne = anomalies.some(
    (a) => a.gravite === "bloquante" && a.ligne === null,
  );
  if (simulation || bloquantSansLigne || rapport.eleves.length === 0) {
    return { rapport: base };
  }

  // --- Écriture ------------------------------------------------------------
  let invitesEnvoyes = 0;
  let invitesEchoues = 0;

  for (const eleve of rapport.eleves) {
    const existant = parEmail.get(eleve.email);

    if (existant) {
      if (existant.role !== "eleve") continue;
      const { error } = await admin
        .from("users")
        .update({
          cohorte_id: cohorteId,
          email_parent: eleve.emailParent ?? undefined,
          telephone_parent: eleve.telephoneParent ?? undefined,
        })
        .eq("id", existant.id);
      if (error) {
        anomalies.push({
          ligne: eleve.ligne,
          gravite: "bloquante",
          message: `${eleve.email} : rattachement refusé (${error.message}).`,
        });
      }
      continue;
    }

    const resultat = await creerEtInviter(eleve, cohorteId, cohorte.nom);
    if (resultat.erreur) {
      anomalies.push({
        ligne: eleve.ligne,
        gravite: "bloquante",
        message: `${eleve.email} : ${resultat.erreur}`,
      });
      continue;
    }
    if (resultat.inviteEnvoyee) invitesEnvoyes += 1;
    else invitesEchoues += 1;
  }

  revalidatePath("/admin/prepa");
  revalidatePath(`/admin/prepa/${cohorteId}`);

  return {
    rapport: { ...base, invitesEnvoyes, invitesEchoues, anomalies },
  };
}

/**
 * Crée le compte d'un élève de la prépa et lui envoie son invitation.
 *
 * L'adresse est réputée vérifiée : c'est l'établissement qui inscrit l'élève
 * au titre du contrat de scolarité (§7.1), il n'y a pas de double opt-in à
 * refaire. Le mot de passe initial est aléatoire et jamais communiqué —
 * l'élève choisit le sien par le lien de l'invitation.
 */
async function creerEtInviter(eleve: LigneListe, cohorteId: string, nomCohorte: string) {
  const admin = createAdminClient();

  const { data: cree, error: erreurAuth } = await admin.auth.admin.createUser({
    email: eleve.email,
    password: randomUUID() + randomUUID(),
    email_confirm: true,
  });
  if (erreurAuth || !cree.user) {
    return { erreur: erreurAuth?.message ?? "création du compte impossible" };
  }

  const { error: erreurProfil } = await admin.from("users").insert({
    id: cree.user.id,
    email: eleve.email,
    role: "eleve",
    nom: eleve.nom,
    prenom: eleve.prenom,
    ville: eleve.ville,
    etablissement: eleve.etablissement,
    email_parent: eleve.emailParent,
    telephone_parent: eleve.telephoneParent,
    cohorte_id: cohorteId,
    email_verifie: true,
    autorisation_parentale: "non_requise",
    // Les CGU n'ont pas été acceptées par l'élève : elles le seront à sa
    // première connexion. On ne pose pas de date mensongère.
    cgu_acceptees_date: null,
  });

  if (erreurProfil) {
    await admin.auth.admin.deleteUser(cree.user.id);
    return { erreur: erreurProfil.message };
  }

  const inviteEnvoyee = await envoyerInvitation(
    cree.user.id,
    eleve.email,
    eleve.prenom,
    nomCohorte,
  );
  return { inviteEnvoyee };
}

async function envoyerInvitation(
  userId: string,
  email: string,
  prenom: string,
  nomCohorte: string,
) {
  const admin = createAdminClient();
  try {
    const { data: lien, error } = await admin.auth.admin.generateLink({
      type: "recovery",
      email,
    });
    if (error || !lien) throw new Error(error?.message ?? "lien indisponible");

    const url = `${urlSite()}/auth/confirmer?token_hash=${
      lien.properties.hashed_token
    }&type=recovery`;

    await envoyerEmail(email, emailInvitationPrepa(prenom, nomCohorte, url));
    await admin
      .from("users")
      .update({ invite_le: new Date().toISOString() })
      .eq("id", userId);
    return true;
  } catch (e) {
    // Un envoi raté ne doit pas annuler le rattachement : la relance est à un
    // clic dans la liste des membres.
    console.error(`Invitation non envoyée à ${email} :`, e);
    return false;
  }
}

export async function relancerInvitation(formulaire: FormData) {
  await exigerPrepa();

  const userId = String(formulaire.get("userId") ?? "");
  const admin = createAdminClient();
  const { data: eleve } = await admin
    .from("users")
    .select("id, email, prenom, cohorte_id, cohortes(nom)")
    .eq("id", userId)
    .maybeSingle();

  if (!eleve) return;

  const cohorte = eleve.cohortes as unknown as { nom: string } | null;
  await envoyerInvitation(eleve.id, eleve.email, eleve.prenom, cohorte?.nom ?? "prépa Parkours");
  revalidatePath(`/admin/prepa/${eleve.cohorte_id}`);
}

export async function detacherEleve(formulaire: FormData) {
  await exigerPrepa();

  const userId = String(formulaire.get("userId") ?? "");
  const cohorteId = String(formulaire.get("cohorteId") ?? "");

  // Détacher, jamais supprimer : le compte reste celui de l'élève, avec sa
  // progression en entraînement libre.
  const admin = createAdminClient();
  await admin.from("users").update({ cohorte_id: null }).eq("id", userId);

  revalidatePath("/admin/prepa");
  revalidatePath(`/admin/prepa/${cohorteId}`);
}
