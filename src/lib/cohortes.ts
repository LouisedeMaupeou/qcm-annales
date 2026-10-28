import "server-only";

import * as XLSX from "xlsx";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Cohortes de la prépa (module concours blancs, §5.1).
 *
 * Les listes d'élèves portent des données personnelles de mineurs : toutes les
 * lectures passent par le service_role après contrôle du rôle dans la page
 * appelante, jamais depuis un composant client.
 */

export type Cohorte = {
  id: string;
  nom: string;
  filiere: "commerce" | "ingenieur";
  millesime: string;
  active: boolean;
  nbEleves: number;
  nbEnAttente: number;
};

export type MembreCohorte = {
  id: string;
  email: string;
  nom: string;
  prenom: string;
  emailParent: string | null;
  telephoneParent: string | null;
  emailVerifie: boolean;
  actif: boolean;
  suspendu: boolean;
  inviteLe: string | null;
};

export async function chargerCohortes(): Promise<Cohorte[]> {
  const admin = createAdminClient();

  const [{ data: cohortes }, { data: membres }] = await Promise.all([
    admin
      .from("cohortes")
      .select("id, nom, filiere, millesime, active")
      .order("millesime", { ascending: false })
      .order("nom"),
    admin.from("users").select("cohorte_id, email_verifie").not("cohorte_id", "is", null),
  ]);

  const compte = new Map<string, { total: number; enAttente: number }>();
  for (const m of membres ?? []) {
    const e = compte.get(m.cohorte_id) ?? { total: 0, enAttente: 0 };
    e.total += 1;
    if (!m.email_verifie) e.enAttente += 1;
    compte.set(m.cohorte_id, e);
  }

  return (cohortes ?? []).map((c) => ({
    id: c.id,
    nom: c.nom,
    filiere: c.filiere,
    millesime: c.millesime,
    active: c.active,
    nbEleves: compte.get(c.id)?.total ?? 0,
    nbEnAttente: compte.get(c.id)?.enAttente ?? 0,
  }));
}

export async function chargerMembres(cohorteId: string): Promise<MembreCohorte[]> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("users")
    .select(
      "id, email, nom, prenom, email_parent, telephone_parent, email_verifie, actif, suspendu, invite_le",
    )
    .eq("cohorte_id", cohorteId)
    .order("nom")
    .order("prenom");

  return (data ?? []).map((u) => ({
    id: u.id,
    email: u.email,
    nom: u.nom,
    prenom: u.prenom,
    emailParent: u.email_parent,
    telephoneParent: u.telephone_parent,
    emailVerifie: u.email_verifie,
    actif: u.actif,
    suspendu: u.suspendu,
    inviteLe: u.invite_le,
  }));
}

// ---------------------------------------------------------------------------
// Import de la liste d'une cohorte
// ---------------------------------------------------------------------------

export const COLONNES_LISTE = ["nom", "prenom", "email"] as const;
export const COLONNES_LISTE_FACULTATIVES = [
  "email_parent",
  "telephone_parent",
  "ville",
  "etablissement",
] as const;

export type LigneListe = {
  ligne: number;
  nom: string;
  prenom: string;
  email: string;
  emailParent: string | null;
  telephoneParent: string | null;
  ville: string | null;
  etablissement: string | null;
};

export type AnomalieListe = {
  ligne: number | null;
  gravite: "bloquante" | "avertissement";
  message: string;
};

export type RapportListe = {
  lignes: number;
  eleves: LigneListe[];
  anomalies: AnomalieListe[];
};

const nettoyer = (v: unknown) => String(v ?? "").trim();
const EMAIL = /^[^@\s]+@[^@\s.]+\.[^@\s]+$/;

/**
 * Lit la liste d'une cohorte (XLSX ou CSV, 1 ligne = 1 élève).
 *
 * Même mécanique que l'import de questions du socle (§6.1) : les lignes
 * valides passent, les autres sont rapportées ligne à ligne sans interrompre
 * l'analyse. Un fichier à moitié bon vaut mieux qu'un fichier rejeté en bloc,
 * surtout quand il arrive d'un tableur tenu à la main.
 */
export function analyserListeEleves(donnees: ArrayBuffer): RapportListe {
  const anomalies: AnomalieListe[] = [];
  let brutes: Record<string, unknown>[];

  try {
    const classeur = XLSX.read(donnees, { type: "array" });
    const premiere = classeur.SheetNames[0];
    brutes = premiere
      ? XLSX.utils.sheet_to_json(classeur.Sheets[premiere], {
          defval: "",
          raw: false,
        })
      : [];
  } catch (e) {
    return {
      lignes: 0,
      eleves: [],
      anomalies: [
        {
          ligne: null,
          gravite: "bloquante",
          message: `Fichier illisible : ${e instanceof Error ? e.message : String(e)}`,
        },
      ],
    };
  }

  if (brutes.length === 0) {
    return {
      lignes: 0,
      eleves: [],
      anomalies: [{ ligne: null, gravite: "bloquante", message: "Le fichier est vide." }],
    };
  }

  // Les en-têtes viennent d'un tableur humain : accents et majuscules varient.
  const normaliser = (c: string) =>
    c
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/\s+/g, "_");

  const correspondance = new Map<string, string>();
  for (const brut of Object.keys(brutes[0])) correspondance.set(normaliser(brut), brut);

  const lire = (l: Record<string, unknown>, colonne: string) => {
    const source = correspondance.get(colonne);
    return source ? nettoyer(l[source]) : "";
  };

  const manquantes = COLONNES_LISTE.filter((c) => !correspondance.has(c));
  if (manquantes.length > 0) {
    return {
      lignes: brutes.length,
      eleves: [],
      anomalies: [
        {
          ligne: null,
          gravite: "bloquante",
          message: `Colonnes manquantes : ${manquantes.join(", ")}.`,
        },
      ],
    };
  }

  const eleves: LigneListe[] = [];
  const emailsVus = new Map<string, number>();

  brutes.forEach((l, i) => {
    const numero = i + 2; // en-tête en ligne 1
    const email = lire(l, "email").toLowerCase();
    const nom = lire(l, "nom");
    const prenom = lire(l, "prenom");

    if (!email && !nom && !prenom) return; // ligne vide en fin de feuille

    if (!EMAIL.test(email)) {
      anomalies.push({
        ligne: numero,
        gravite: "bloquante",
        message: `Adresse email invalide : « ${email} ».`,
      });
      return;
    }
    if (!nom || !prenom) {
      anomalies.push({
        ligne: numero,
        gravite: "bloquante",
        message: `${email} : nom ou prénom manquant.`,
      });
      return;
    }
    if (emailsVus.has(email)) {
      anomalies.push({
        ligne: numero,
        gravite: "bloquante",
        message: `${email} : déjà présent ligne ${emailsVus.get(email)}.`,
      });
      return;
    }
    emailsVus.set(email, numero);

    const emailParent = lire(l, "email_parent").toLowerCase();
    if (emailParent && !EMAIL.test(emailParent)) {
      anomalies.push({
        ligne: numero,
        gravite: "avertissement",
        message: `${email} : email parent « ${emailParent} » invalide, ignoré. Le bilan ne pourra pas être envoyé au parent.`,
      });
    }
    if (!emailParent) {
      anomalies.push({
        ligne: numero,
        gravite: "avertissement",
        message: `${email} : pas d'email parent — le bilan de session ne partira qu'à l'élève (§5.4).`,
      });
    }

    eleves.push({
      ligne: numero,
      nom,
      prenom,
      email,
      emailParent: emailParent && EMAIL.test(emailParent) ? emailParent : null,
      telephoneParent: lire(l, "telephone_parent") || null,
      ville: lire(l, "ville") || null,
      etablissement: lire(l, "etablissement") || null,
    });
  });

  return { lignes: brutes.length, eleves, anomalies };
}
