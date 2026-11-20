import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Dépôts de sujets à extraire (module concours blancs, §3).
 *
 * Le téléversement ne passe pas par une Server Action : le corps d'une
 * fonction serverless est plafonné à quelques méga-octets, et un sujet scanné
 * pèse davantage. Le navigateur envoie donc le fichier directement au
 * stockage, avec une URL signée que le serveur délivre après avoir vérifié le
 * rôle. Le serveur constate ensuite la présence du fichier avant de le
 * déclarer déposé — le client n'est pas cru sur parole.
 */

export const BUCKET_DEPOTS = "depots-cb";

/** 100 Mo, la limite du bucket. Au-delà, le stockage refuse. */
export const TAILLE_MAX_DEPOT = 100 * 1024 * 1024;

export type RoleFichier = "sujet" | "reponses" | "autre";

export type FichierDepot = {
  id: string;
  nom: string;
  role: RoleFichier;
  taille: number | null;
  televerse: boolean;
  /** URL signée d'une heure, pour relire le fichier depuis le back-office. */
  url: string | null;
};

export type Depot = {
  id: string;
  libelle: string;
  consigne: string | null;
  statut: "depose" | "en_cours" | "livre" | "importe" | "abandonne";
  noteSuivi: string | null;
  deposePar: string | null;
  creeLe: string;
  fichiers: FichierDepot[];
};

/** Déduit le rôle d'un fichier de son extension : un tableur porte les clés. */
export function roleDepuisNom(nom: string): RoleFichier {
  const n = nom.toLowerCase();
  if (n.endsWith(".pdf")) return "sujet";
  if (n.endsWith(".xlsx") || n.endsWith(".xls") || n.endsWith(".csv")) return "reponses";
  return "autre";
}

/** Nom de fichier sûr pour un chemin de stockage, accents et espaces retirés. */
export function cheminSur(depotId: string, nom: string): string {
  const propre = nom
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .slice(-120);
  return `${depotId}/${Date.now()}-${propre}`;
}

export async function chargerDepots(): Promise<Depot[]> {
  const admin = createAdminClient();

  const { data: depots } = await admin
    .from("depots_extraction")
    .select("id, libelle, consigne, statut, note_suivi, created_at, users(prenom, nom)")
    .order("created_at", { ascending: false })
    .limit(100);

  if (!depots || depots.length === 0) return [];

  const { data: fichiers } = await admin
    .from("depot_fichiers")
    .select("id, depot_id, chemin, nom, role, taille, televerse")
    .in(
      "depot_id",
      depots.map((d) => d.id as string),
    );

  // Une seule signature pour tous les fichiers déposés : un dépôt en compte
  // facilement une dizaine, et chaque signature est un aller-retour réseau.
  const chemins = (fichiers ?? []).filter((f) => f.televerse).map((f) => f.chemin as string);
  const urls = new Map<string, string>();
  if (chemins.length > 0) {
    const { data } = await admin.storage
      .from(BUCKET_DEPOTS)
      .createSignedUrls(chemins, 3600);
    for (const e of data ?? []) {
      if (e.path && e.signedUrl) urls.set(e.path, e.signedUrl);
    }
  }

  return depots.map((d) => {
    const auteur = d.users as unknown as { prenom: string; nom: string } | null;
    return {
      id: d.id as string,
      libelle: d.libelle as string,
      consigne: (d.consigne as string | null) ?? null,
      statut: d.statut as Depot["statut"],
      noteSuivi: (d.note_suivi as string | null) ?? null,
      deposePar: auteur ? `${auteur.prenom} ${auteur.nom}` : null,
      creeLe: d.created_at as string,
      fichiers: (fichiers ?? [])
        .filter((f) => f.depot_id === d.id)
        .map((f) => ({
          id: f.id as string,
          nom: f.nom as string,
          role: f.role as RoleFichier,
          taille: f.taille === null ? null : Number(f.taille),
          televerse: f.televerse as boolean,
          url: urls.get(f.chemin as string) ?? null,
        }))
        .sort((a, b) => a.role.localeCompare(b.role) || a.nom.localeCompare(b.nom)),
    };
  });
}

/**
 * Vérifie dans le stockage quels fichiers d'un dépôt sont réellement arrivés.
 *
 * Appelée après les téléversements du navigateur. Un fichier annoncé mais
 * absent reste marqué non téléversé : la liste le montre, et on sait quoi
 * reprendre au lieu de croire le dépôt complet.
 */
export async function constaterTeleversements(depotId: string) {
  const admin = createAdminClient();

  const { data: fichiers } = await admin
    .from("depot_fichiers")
    .select("id, chemin")
    .eq("depot_id", depotId);
  if (!fichiers || fichiers.length === 0) return { constates: 0, manquants: 0 };

  const { data: objets } = await admin.storage.from(BUCKET_DEPOTS).list(depotId, {
    limit: 1000,
  });
  const presents = new Set((objets ?? []).map((o) => `${depotId}/${o.name}`));

  let constates = 0;
  let manquants = 0;
  for (const f of fichiers) {
    const present = presents.has(f.chemin as string);
    if (present) constates += 1;
    else manquants += 1;
    await admin.from("depot_fichiers").update({ televerse: present }).eq("id", f.id);
  }

  return { constates, manquants };
}
