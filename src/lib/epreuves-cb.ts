/**
 * Lecture d'un EPREUVE_ID de concours blanc (module concours blancs, §3).
 *
 * Les identifiants du référentiel Parkours suivent tous la même forme :
 * `<concours>-<matière>[-<session>]` — AV-MAT-TOUS26, SES-ADOC, ADV-MAT-OCT26,
 * PA-MAT-TOUS26, GE-MAT-TOUS26, SES-FR-S2.
 *
 * On les décode par préfixe plutôt que par table d'identifiants complets :
 * une nouvelle session (AV-MAT-NOEL27) doit s'importer sans toucher au code.
 * Un préfixe inconnu, en revanche, est refusé — mieux vaut un import bloqué
 * qu'une épreuve rattachée au mauvais concours.
 *
 * Module pur : aucun accès base, testable isolément.
 */

const CONCOURS: Record<string, string> = {
  AV: "Avenir",
  GE: "GEIPI Polytech",
  PA: "Puissance Alpha",
  ADV: "Advance",
  SES: "SÉSAME",
  ACC: "ACCÈS",
};

const MATIERES: Record<string, string> = {
  MAT: "Mathématiques",
  ANG: "Anglais",
  SCI: "Sciences",
  PHY: "Physique-Chimie",
  NSI: "NSI",
  SI: "Sciences de l'ingénieur",
  SVT: "SVT",
  EC: "Enjeux contemporains",
  DIG: "Compétences digitales",
  FR: "Français",
  DE: "LV2 Allemand",
  ES: "LV2 Espagnol",
  ADOC: "Analyse documentaire",
  SYN: "Synthèse",
  LOG: "Raisonnement logique et mathématiques",
};

export type EpreuveDecodee = {
  concours: string;
  matiere: string;
  /** Partie session de l'identifiant, quand elle existe : TOUS26, OCT26, S1… */
  session: string | null;
};

export function decoderEpreuveId(id: string): EpreuveDecodee | null {
  const morceaux = id.trim().toUpperCase().split("-");
  if (morceaux.length < 2) return null;

  const concours = CONCOURS[morceaux[0]];
  const matiere = MATIERES[morceaux[1]];
  if (!concours || !matiere) return null;

  return {
    concours,
    matiere,
    session: morceaux.slice(2).join("-") || null,
  };
}

/** Pour les messages d'erreur : ce que l'import sait lire. */
export const PREFIXES_CONNUS = {
  concours: Object.keys(CONCOURS),
  matieres: Object.keys(MATIERES),
};
