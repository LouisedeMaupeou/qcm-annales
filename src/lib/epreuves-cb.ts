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

// ---------------------------------------------------------------------------
// Durées officielles (§3)
// ---------------------------------------------------------------------------
/**
 * Relevé web d'octobre 2026, repris du tableau du §3. Préremplit la durée à la
 * création d'une épreuve blanche ; la responsable peut la corriger.
 *
 * ⚠ Le §3 le dit explicitement : « à recaler sur le règlement de chaque
 * session avant usage noté ». Ces valeurs sont une commodité de saisie, pas
 * une source officielle.
 */
const DUREES: Record<string, Record<string, number>> = {
  "ACCÈS": {
    "Synthèse": 180,
    "Raisonnement logique et mathématiques": 120,
    "Anglais": 60,
  },
  "SÉSAME": {
    "Enjeux contemporains": 30,
    "Compétences digitales": 20,
    "Mathématiques": 40,
    "Français": 30,
    "Anglais": 30,
    "LV2 Allemand": 30,
    "LV2 Espagnol": 30,
    "Analyse documentaire": 120,
  },
  "Avenir": {
    "Mathématiques": 90,
    "Sciences": 60,
    "Physique-Chimie": 60,
    "NSI": 60,
    "Sciences de l'ingénieur": 60,
    "SVT": 60,
    "Anglais": 30,
  },
  "Advance": {
    // ⚠ Écart relevé au §3 : le concours blanc Parkours compte 60 questions
    // là où l'épreuve officielle en compte 40 en 1 h 30. Durée officielle
    // retenue par défaut, à proratiser si la responsable le décide.
    "Mathématiques": 90,
    "Anglais": 30,
  },
  "Puissance Alpha": {
    "Mathématiques": 90,
    "Sciences": 60,
    "Physique-Chimie": 60,
    "NSI": 60,
    "SVT": 60,
    "Anglais": 45,
  },
  "GEIPI Polytech": {
    // QCM de maths + 2 sujets de spécialité, 3 h au total, répartition libre.
    "Mathématiques": 180,
    "Physique-Chimie": 180,
    "NSI": 180,
    "Sciences de l'ingénieur": 180,
    "SVT": 180,
  },
};

export function dureeOfficielle(concours: string, matiere: string): number | null {
  return DUREES[concours]?.[matiere] ?? null;
}

// ---------------------------------------------------------------------------
// Barèmes relevés sur les sujets (§10)
// ---------------------------------------------------------------------------
export type BaremeOfficiel = {
  pointsBonne: number;
  pointsMauvaise: number;
  pointsAbstention: number;
  /** Ce que le triplet ne sait pas dire : voir epreuves_cb.regles. */
  regles: Record<string, unknown>;
  /** La consigne du sujet, mot pour mot — c'est elle qui fait foi. */
  source: string;
};

const BAREMES: Record<string, BaremeOfficiel> = {
  "Avenir": {
    pointsBonne: 3,
    pointsMauvaise: -1,
    pointsAbstention: 0,
    regles: {},
    source:
      "Chaque réponse exacte est gratifiée de 3 points, chaque réponse fausse est " +
      "pénalisée par le retrait d'1 point. Une question non traitée n'apporte ni ne " +
      "retire aucun point.",
  },
  "Advance": {
    pointsBonne: 1,
    pointsMauvaise: -0.5,
    pointsAbstention: 0,
    regles: {},
    source:
      "Toute réponse exacte rapporte un point ; toute réponse inexacte entraîne le " +
      "retrait de 0,5 point ; l'annulation d'une réponse ou l'abstention n'est pas " +
      "prise en compte.",
  },
  "Puissance Alpha": {
    pointsBonne: 1,
    pointsMauvaise: -0.5,
    pointsAbstention: 0,
    regles: {
      bonification_bloc_complet: 1,
      blocs_au_choix: { obligatoires: 4, a_choisir: 4 },
    },
    source:
      "Toute réponse exacte rapporte 1 point ; toute réponse inexacte retire 0,5 " +
      "point ; l'abstention ne rapporte ni ne retire rien. Une bonification d'un " +
      "point est ajoutée chaque fois qu'un exercice est traité correctement en " +
      "entier. 8 exercices maximum dont les 4 fondamentaux.",
  },
  "GEIPI Polytech": {
    pointsBonne: 1,
    pointsMauvaise: -1,
    pointsAbstention: 0,
    regles: { plancher_par_bloc: true },
    source:
      "Une réponse fausse sera pénalisée par des points négatifs. Pour chaque " +
      "exercice, le total des points obtenu ne peut être strictement négatif. " +
      "Aucun point n'est enlevé en l'absence de réponse. ⚠ Le sujet ne chiffre pas " +
      "la pénalité : −1 est une hypothèse à confirmer.",
  },
  "SÉSAME": {
    pointsBonne: 1,
    pointsMauvaise: 0,
    pointsAbstention: 0,
    regles: {},
    source: "Barème à confirmer sur le règlement SÉSAME.",
  },
  "ACCÈS": {
    pointsBonne: 1,
    pointsMauvaise: 0,
    pointsAbstention: 0,
    regles: {},
    source: "Barème à confirmer sur le règlement ACCÈS.",
  },
};

/**
 * Barème par défaut d'une épreuve blanche. L'analyse documentaire SÉSAME a sa
 * propre règle, posée par le concours : toutes les cases justes cochées et
 * aucune autre, sinon zéro (§5.3).
 */
export function baremeOfficiel(concours: string, matiere: string): BaremeOfficiel | null {
  const base = BAREMES[concours];
  if (!base) return null;

  if (concours === "SÉSAME" && matiere === "Analyse documentaire") {
    return {
      ...base,
      regles: { tout_ou_rien_par_question: true },
      source:
        "Toutes les cases justes cochées et aucune autre = points de la question, " +
        "sinon 0 (une seule mauvaise coche annule la question).",
    };
  }

  return base;
}
