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
/**
 * Ligne de nomenclature des modèles d'import : la deuxième ligne du fichier
 * explique quoi mettre dans chaque colonne, et commence par OBLIGATOIRE sur
 * les colonnes requises. On l'écarte pour que l'utilisateur puisse la laisser
 * en place en remplissant son tableau — la retirer serait la première cause
 * d'un import où plus personne ne sait ce que veut dire une colonne.
 */
function estNomenclature(ligne: Record<string, unknown>): boolean {
  return Object.values(ligne).some((v) =>
    String(v ?? "").trim().toUpperCase().startsWith("OBLIGATOIRE"),
  );
}

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

  brutes = brutes.filter((l) => !estNomenclature(l));

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

// ---------------------------------------------------------------------------
// Bilans d'une cohorte (§5.4)
// ---------------------------------------------------------------------------
/**
 * Les bilans de chaque élève, pour la fiche de cohorte.
 *
 * La responsable travaille élève par élève : relire le texte qui partira aux
 * parents, puis l'envoyer. Ces deux gestes vivaient dans la section Sessions,
 * à deux niveaux de navigation de la liste où elle a les élèves sous les yeux.
 */

/**
 * Ce que la responsable a besoin de savoir d'un coup d'œil.
 *
 * L'état du bilan en base — généré, relu, validé — dit où en est son travail
 * à elle. La colonne doit dire autre chose : ce qui manque pour que le bilan
 * soit envoyable, et qui ne dépend pas d'elle. Une épreuve qu'un élève n'a
 * pas composée ne se rattrape pas en relisant, et une correction inachevée
 * fausserait tout ce qu'on enverrait.
 */
export type EtatResultats =
  | "epreuve_non_realisee"
  | "correction_incomplete"
  | "pret"
  | "envoye";

export type BilanDeCohorte = {
  id: string;
  session: string;
  sessionId: string;
  statut: "genere" | "en_relecture" | "valide" | "envoye";
  etat: EtatResultats;
  /** Ce qui manque, pour l'expliquer sans ouvrir le bilan. */
  detail: string | null;
  envoyeLe: string | null;
  /** Nombre de destinataires atteints au dernier envoi. */
  destinataires: number;
};

export async function bilansDeLaCohorte(
  cohorteId: string,
): Promise<Map<string, BilanDeCohorte[]>> {
  const admin = createAdminClient();

  const { data: membres } = await admin
    .from("users")
    .select("id")
    .eq("cohorte_id", cohorteId);
  const ids = (membres ?? []).map((m) => m.id as string);
  if (ids.length === 0) return new Map();

  const { data: bilans } = await admin
    .from("bilans")
    .select("id, user_id, statut, envoye_le, destinataires, session_cb_id, sessions_cb(nom)")
    .in("user_id", ids)
    .order("genere_le", { ascending: false });

  // Ce qui manque pour chaque session touchée : les copies non composées ou
  // non corrigées, et les oraux non validés.
  const sessions = [...new Set((bilans ?? []).map((b) => b.session_cb_id as string))];
  const manques = new Map<string, { nonRealisees: number; aCorriger: number; orauxManquants: number }>();

  const { data: cohorte } = await admin
    .from("cohortes")
    .select("filiere")
    .eq("id", cohorteId)
    .maybeSingle();
  const filiere = (cohorte?.filiere as string | null) ?? null;

  for (const sessionId of sessions) {
    const { data: epreuves } = await admin
      .from("epreuves_cb")
      .select("id, epreuve_cb_cohortes(cohorte_id)")
      .eq("session_cb_id", sessionId)
      .eq("statut", "publiee");

    const siennes = (epreuves ?? []).filter((e) =>
      ((e.epreuve_cb_cohortes as unknown as { cohorte_id: string }[]) ?? []).some(
        (c) => c.cohorte_id === cohorteId,
      ),
    );
    const epreuveIds = siennes.map((e) => e.id as string);

    const [{ data: passages }, { data: oraux }] = await Promise.all([
      epreuveIds.length
        ? admin
            .from("passages")
            .select("user_id, epreuve_cb_id, statut")
            .in("epreuve_cb_id", epreuveIds)
            .in("user_id", ids)
        : Promise.resolve({ data: [] }),
      filiere
        ? admin
            .from("epreuves_orales")
            .select("id")
            .eq("session_cb_id", sessionId)
            .eq("filiere", filiere)
        : Promise.resolve({ data: [] }),
    ]);

    const oralIds = (oraux ?? []).map((o) => o.id as string);
    const { data: evaluations } = oralIds.length
      ? await admin
          .from("evaluations_orales")
          .select("user_id, epreuve_orale_id, statut")
          .in("epreuve_orale_id", oralIds)
          .in("user_id", ids)
      : { data: [] };

    for (const userId of ids) {
      const siens = (passages ?? []).filter((p) => p.user_id === userId);
      const validees = (evaluations ?? []).filter(
        (e) => e.user_id === userId && e.statut === "validee",
      ).length;

      manques.set(`${sessionId}|${userId}`, {
        // Pas de copie, ou copie jamais remise : l'épreuve n'a pas été faite.
        nonRealisees:
          epreuveIds.length -
          siens.filter((p) => p.statut === "remis" || p.statut === "corrige").length,
        aCorriger: siens.filter((p) => p.statut === "remis").length,
        orauxManquants: oralIds.length - validees,
      });
    }
  }

  const parEleve = new Map<string, BilanDeCohorte[]>();
  for (const b of bilans ?? []) {
    const cle = b.user_id as string;
    const statut = b.statut as BilanDeCohorte["statut"];
    const m = manques.get(`${b.session_cb_id}|${cle}`) ?? {
      nonRealisees: 0,
      aCorriger: 0,
      orauxManquants: 0,
    };

    // L'envoi prime : une fois parti, c'est l'information utile. Vient
    // ensuite ce qui ne se rattrape pas, puis ce qui reste à corriger.
    let etat: EtatResultats = "pret";
    let detail: string | null = null;
    if (statut === "envoye") {
      etat = "envoye";
    } else if (m.nonRealisees > 0) {
      etat = "epreuve_non_realisee";
      detail = `${m.nonRealisees} épreuve${m.nonRealisees > 1 ? "s" : ""} non composée${m.nonRealisees > 1 ? "s" : ""}`;
    } else if (m.aCorriger > 0 || m.orauxManquants > 0) {
      etat = "correction_incomplete";
      detail = [
        m.aCorriger > 0 && `${m.aCorriger} copie${m.aCorriger > 1 ? "s" : ""} à corriger`,
        m.orauxManquants > 0 &&
          `${m.orauxManquants} oral${m.orauxManquants > 1 ? "aux" : ""} à noter`,
      ]
        .filter(Boolean)
        .join(", ");
    }

    if (!parEleve.has(cle)) parEleve.set(cle, []);
    parEleve.get(cle)!.push({
      id: b.id as string,
      session: (b.sessions_cb as unknown as { nom: string } | null)?.nom ?? "session",
      sessionId: b.session_cb_id as string,
      statut,
      etat,
      detail,
      envoyeLe: (b.envoye_le as string | null) ?? null,
      destinataires: Array.isArray(b.destinataires) ? b.destinataires.length : 0,
    });
  }

  return parEleve;
}
