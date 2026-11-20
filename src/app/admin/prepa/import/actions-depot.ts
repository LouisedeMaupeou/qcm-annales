"use server";

import { revalidatePath } from "next/cache";
import { exigerPrepa } from "@/lib/admin";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  BUCKET_DEPOTS,
  cheminSur,
  constaterTeleversements,
  roleDepuisNom,
  TAILLE_MAX_DEPOT,
} from "@/lib/depots-extraction";

/** Dépôts de sujets à extraire (module concours blancs, §3). */

export type EtatDepot = {
  message?: string;
  succes?: string;
  /** Jetons de téléversement, consommés par le navigateur. */
  cibles?: { nom: string; chemin: string; token: string }[];
  depotId?: string;
};

type FichierAnnonce = { nom: string; taille: number };

/**
 * Ouvre un dépôt et délivre une URL signée par fichier.
 *
 * Rien n'est téléversé ici : l'action crée les lignes et rend des jetons que
 * le navigateur utilise pour envoyer les fichiers directement au stockage. Un
 * sujet scanné dépasse largement ce qu'une fonction serverless accepte dans
 * le corps d'une requête.
 */
export async function ouvrirDepot(
  _precedent: EtatDepot,
  donnees: FormData,
): Promise<EtatDepot> {
  const { userId } = await exigerPrepa();

  const libelle = String(donnees.get("libelle") ?? "").trim();
  if (!libelle) return { message: "Donne un intitulé au dépôt." };

  let annonces: FichierAnnonce[];
  try {
    annonces = JSON.parse(String(donnees.get("fichiers") ?? "[]")) as FichierAnnonce[];
  } catch {
    return { message: "Liste de fichiers illisible." };
  }
  if (annonces.length === 0) return { message: "Choisis au moins un fichier." };

  const trop = annonces.find((f) => f.taille > TAILLE_MAX_DEPOT);
  if (trop) {
    return {
      message: `« ${trop.nom} » pèse ${Math.round(trop.taille / 1024 / 1024)} Mo : la limite est de 100 Mo par fichier.`,
    };
  }

  const admin = createAdminClient();

  const { data: depot, error } = await admin
    .from("depots_extraction")
    .insert({
      libelle,
      consigne: String(donnees.get("consigne") ?? "").trim() || null,
      depose_par: userId,
    })
    .select("id")
    .single();
  if (error) return { message: `Création du dépôt : ${error.message}` };

  const cibles: NonNullable<EtatDepot["cibles"]> = [];

  for (const f of annonces) {
    const chemin = cheminSur(depot.id as string, f.nom);

    const { data: signature, error: eSignature } = await admin.storage
      .from(BUCKET_DEPOTS)
      .createSignedUploadUrl(chemin);
    if (eSignature) {
      await admin.from("depots_extraction").delete().eq("id", depot.id);
      return { message: `Préparation du téléversement : ${eSignature.message}` };
    }

    const { error: eLigne } = await admin.from("depot_fichiers").insert({
      depot_id: depot.id,
      chemin,
      nom: f.nom,
      role: roleDepuisNom(f.nom),
      taille: f.taille,
    });
    if (eLigne) {
      await admin.from("depots_extraction").delete().eq("id", depot.id);
      return { message: `Enregistrement du fichier : ${eLigne.message}` };
    }

    cibles.push({ nom: f.nom, chemin, token: signature.token });
  }

  return { depotId: depot.id as string, cibles };
}

/** Constate les arrivées après les téléversements du navigateur. */
export async function cloturerDepot(
  _precedent: EtatDepot,
  donnees: FormData,
): Promise<EtatDepot> {
  await exigerPrepa();

  const depotId = String(donnees.get("depotId") ?? "");
  if (!depotId) return { message: "Dépôt inconnu." };

  const { constates, manquants } = await constaterTeleversements(depotId);

  revalidatePath("/admin/prepa/import");

  if (constates === 0) {
    return { message: "Aucun fichier n'est arrivé au stockage. Réessaie." };
  }

  return {
    succes:
      manquants === 0
        ? `Dépôt complet : ${constates} fichier(s) reçu(s).`
        : `${constates} fichier(s) reçu(s), ${manquants} manquant(s) — la liste les signale.`,
  };
}

export async function changerStatutDepot(formulaire: FormData) {
  await exigerPrepa();

  const id = String(formulaire.get("depotId") ?? "");
  const statut = String(formulaire.get("statut") ?? "");
  if (!["depose", "en_cours", "livre", "importe", "abandonne"].includes(statut)) return;

  const admin = createAdminClient();
  await admin
    .from("depots_extraction")
    .update({
      statut,
      note_suivi: String(formulaire.get("noteSuivi") ?? "").trim() || null,
    })
    .eq("id", id);

  revalidatePath("/admin/prepa/import");
}
