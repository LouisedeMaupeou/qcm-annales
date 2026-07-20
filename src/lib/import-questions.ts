import "server-only";

import * as XLSX from "xlsx";

/**
 * Import en masse XLSX/CSV (§6.1) : 1 ligne = 1 proposition.
 *
 * Regroupement, sur deux niveaux :
 *
 *  - `groupe_id` réunit les propositions d'UNE question. Pour un vrai/faux
 *    ACCÈS, c'est 1 énoncé et ses 4 propositions ; le scoring tout ou rien du
 *    §2.3 s'applique à l'ensemble.
 *  - `bloc_id`, facultatif, réunit plusieurs `groupe_id` dans un même bloc lié,
 *    tiré entier et dans l'ordre (§2.2) — le cas du problème chaîné maths
 *    Q11-Q15 du §10.3. Sans cette colonne, chaque groupe forme son propre bloc,
 *    ce qui rend le format du fichier POC directement importable.
 *
 * Le fichier vient d'un téléversement : rien n'est présumé. Chaque ligne est
 * validée et les anomalies sont rapportées sans interrompre l'analyse, pour
 * permettre l'import partiel demandé au §6.1.
 */

export const COLONNES_ATTENDUES = [
  "concours",
  "annee",
  "epreuve",
  "groupe_id",
  "item",
  "type",
  "enonce_commun",
  "proposition",
  "bonne_reponse",
] as const;

export const COLONNES_FACULTATIVES = [
  "bloc_id",
  "explication",
  "chapitre_propose",
  "chapitre",
  "image_requise",
  "statut_extraction",
  "commentaire",
  "confiance",
] as const;

const TYPES_V1 = ["choix_unique", "vrai_faux"] as const;
const TYPES_CONNUS = [...TYPES_V1, "choix_multiple", "redaction"] as const;

export type Anomalie = {
  ligne: number | null;
  gravite: "bloquante" | "avertissement";
  message: string;
};

export type QuestionPreparee = {
  blocCle: string;
  groupeId: string;
  epreuve: string;
  type: (typeof TYPES_V1)[number];
  enonce: string;
  chapitre: string;
  explication: string | null;
  commentaire: string | null;
  statutExtraction: "manuel" | "ok" | "a_verifier";
  confiance: number | null;
  imageRequise: boolean;
  propositions: { texte: string; estCorrecte: boolean; ordre: number }[];
};

export type Rapport = {
  concours: string | null;
  annee: number | null;
  lignes: number;
  anomalies: Anomalie[];
  questions: QuestionPreparee[];
  ignorees: number;
};

const nettoyer = (v: unknown) => String(v ?? "").trim();

/** Lit la première feuille du classeur en lignes clé/valeur. */
function lireLignes(donnees: ArrayBuffer): Record<string, unknown>[] {
  const classeur = XLSX.read(donnees, { type: "array" });
  const premiere = classeur.SheetNames[0];
  if (!premiere) return [];
  return XLSX.utils.sheet_to_json(classeur.Sheets[premiere], {
    defval: "",
    raw: false,
  });
}

export function analyserFichier(donnees: ArrayBuffer): Rapport {
  const anomalies: Anomalie[] = [];
  let lignes: Record<string, unknown>[];

  try {
    lignes = lireLignes(donnees);
  } catch (e) {
    return {
      concours: null,
      annee: null,
      lignes: 0,
      ignorees: 0,
      questions: [],
      anomalies: [
        {
          ligne: null,
          gravite: "bloquante",
          message: `Fichier illisible : ${e instanceof Error ? e.message : String(e)}`,
        },
      ],
    };
  }

  if (lignes.length === 0) {
    return {
      concours: null,
      annee: null,
      lignes: 0,
      ignorees: 0,
      questions: [],
      anomalies: [
        { ligne: null, gravite: "bloquante", message: "Le fichier est vide." },
      ],
    };
  }

  const colonnes = Object.keys(lignes[0]);
  const manquantes = COLONNES_ATTENDUES.filter((c) => !colonnes.includes(c));
  if (manquantes.length > 0) {
    return {
      concours: null,
      annee: null,
      lignes: lignes.length,
      ignorees: lignes.length,
      questions: [],
      anomalies: [
        {
          ligne: null,
          gravite: "bloquante",
          message: `Colonnes manquantes : ${manquantes.join(", ")}.`,
        },
      ],
    };
  }

  // L'import porte sur une annale : un seul couple concours × année.
  const concoursVus = new Set(lignes.map((l) => nettoyer(l.concours)));
  const anneesVues = new Set(lignes.map((l) => nettoyer(l.annee)));
  if (concoursVus.size > 1) {
    anomalies.push({
      ligne: null,
      gravite: "bloquante",
      message: `Le fichier mélange plusieurs concours (${[...concoursVus].join(", ")}). Un import = une annale.`,
    });
  }
  if (anneesVues.size > 1) {
    anomalies.push({
      ligne: null,
      gravite: "bloquante",
      message: `Le fichier mélange plusieurs années (${[...anneesVues].join(", ")}).`,
    });
  }

  const concours = [...concoursVus][0] ?? null;
  const anneeBrute = [...anneesVues][0] ?? "";
  const annee = /^\d{4}$/.test(anneeBrute) ? Number(anneeBrute) : null;
  if (annee === null) {
    anomalies.push({
      ligne: null,
      gravite: "bloquante",
      message: `Année illisible : « ${anneeBrute} ».`,
    });
  }

  // --- Regroupement par question ------------------------------------------
  const parGroupe = new Map<
    string,
    { ligne: number; donnees: Record<string, unknown> }[]
  >();

  lignes.forEach((l, i) => {
    const numero = i + 2; // en-tête en ligne 1
    const groupe = nettoyer(l.groupe_id);
    if (!groupe) {
      anomalies.push({
        ligne: numero,
        gravite: "bloquante",
        message: "groupe_id vide : la ligne ne peut être rattachée à une question.",
      });
      return;
    }
    if (!parGroupe.has(groupe)) parGroupe.set(groupe, []);
    parGroupe.get(groupe)!.push({ ligne: numero, donnees: l });
  });

  const questions: QuestionPreparee[] = [];
  let ignorees = 0;

  for (const [groupeId, items] of parGroupe) {
    const tete = items[0].donnees;
    const premiereLigne = items[0].ligne;
    const rejeter = (message: string) => {
      anomalies.push({ ligne: premiereLigne, gravite: "bloquante", message });
      ignorees += items.length;
    };

    const type = nettoyer(tete.type) as (typeof TYPES_CONNUS)[number];
    if (!TYPES_CONNUS.includes(type)) {
      rejeter(`${groupeId} : type « ${type} » inconnu.`);
      continue;
    }
    if (!TYPES_V1.includes(type as (typeof TYPES_V1)[number])) {
      // §2.1 : choix_multiple en V1.5, redaction en V2.
      rejeter(
        `${groupeId} : le type « ${type} » n'est pas encore servi en V1 (choix_unique et vrai_faux uniquement).`,
      );
      continue;
    }

    const enonce = nettoyer(tete.enonce_commun);
    if (!enonce) {
      rejeter(`${groupeId} : énoncé vide.`);
      continue;
    }

    // §6.1 : chapitre obligatoire.
    const chapitre = nettoyer(tete.chapitre_propose) || nettoyer(tete.chapitre);
    if (!chapitre) {
      rejeter(`${groupeId} : chapitre manquant (obligatoire).`);
      continue;
    }

    const epreuve = nettoyer(tete.epreuve);
    if (!epreuve) {
      rejeter(`${groupeId} : épreuve manquante.`);
      continue;
    }

    // --- Propositions ------------------------------------------------------
    const propositions: QuestionPreparee["propositions"] = [];
    let invalide = false;

    for (const { ligne, donnees } of items) {
      const texte = nettoyer(donnees.proposition);
      if (!texte) {
        anomalies.push({
          ligne,
          gravite: "bloquante",
          message: `${groupeId} : proposition vide.`,
        });
        invalide = true;
        continue;
      }

      const reponse = nettoyer(donnees.bonne_reponse).toUpperCase();
      const vrai = ["VRAI", "V", "TRUE", "1", "OUI", "X"].includes(reponse);
      const faux = ["FAUX", "F", "FALSE", "0", "NON", ""].includes(reponse);
      if (!vrai && !faux) {
        anomalies.push({
          ligne,
          gravite: "bloquante",
          message: `${groupeId} : bonne_reponse « ${reponse} » non reconnue (attendu VRAI ou FAUX).`,
        });
        invalide = true;
        continue;
      }

      const ordre = Number(nettoyer(donnees.item));
      propositions.push({
        texte,
        estCorrecte: vrai,
        ordre: Number.isFinite(ordre) && ordre > 0 ? ordre : propositions.length + 1,
      });
    }

    if (invalide) {
      ignorees += items.length;
      continue;
    }

    if (propositions.length < 2) {
      rejeter(`${groupeId} : ${propositions.length} proposition(s), il en faut au moins 2.`);
      continue;
    }

    if (type === "vrai_faux" && propositions.length !== 4) {
      // §2 : le format ACCÈS et Puissance Alpha est de 4 propositions. On laisse
      // passer en avertissant : un autre concours pourrait différer.
      anomalies.push({
        ligne: premiereLigne,
        gravite: "avertissement",
        message: `${groupeId} : ${propositions.length} propositions pour un vrai/faux (4 attendues).`,
      });
    }

    if (type === "choix_unique") {
      const correctes = propositions.filter((p) => p.estCorrecte).length;
      if (correctes !== 1) {
        rejeter(
          `${groupeId} : un choix unique doit avoir exactement une bonne réponse (${correctes} trouvée·s).`,
        );
        continue;
      }
    }

    // --- Confiance et statut d'extraction ----------------------------------
    const confianceBrute = nettoyer(tete.confiance);
    let confiance: number | null = null;
    if (confianceBrute) {
      const n = Number(confianceBrute.replace(",", "."));
      if (!Number.isFinite(n) || n < 0 || n > 100) {
        anomalies.push({
          ligne: premiereLigne,
          gravite: "avertissement",
          message: `${groupeId} : confiance « ${confianceBrute} » ignorée (attendu 0-100).`,
        });
      } else {
        confiance = Math.round(n);
      }
    }

    const statutBrut = nettoyer(tete.statut_extraction).toUpperCase();
    const statutExtraction: QuestionPreparee["statutExtraction"] =
      statutBrut === "OK" ? "ok" : statutBrut ? "a_verifier" : "manuel";

    const imageRequise = ["OUI", "YES", "TRUE", "1"].includes(
      nettoyer(tete.image_requise).toUpperCase(),
    );
    if (imageRequise) {
      anomalies.push({
        ligne: premiereLigne,
        gravite: "avertissement",
        message: `${groupeId} : une figure est signalée indispensable mais aucune image n'est importée — la question restera en relecture.`,
      });
    }

    const commentaires = [
      ...new Set(items.map((i) => nettoyer(i.donnees.commentaire)).filter(Boolean)),
    ];

    questions.push({
      blocCle: nettoyer(tete.bloc_id) || groupeId,
      groupeId,
      epreuve,
      type: type as (typeof TYPES_V1)[number],
      enonce,
      chapitre,
      explication: nettoyer(tete.explication) || null,
      commentaire: commentaires.join(" ") || null,
      statutExtraction,
      confiance,
      imageRequise,
      propositions: propositions.sort((a, b) => a.ordre - b.ordre),
    });
  }

  return {
    concours,
    annee,
    lignes: lignes.length,
    ignorees,
    questions,
    anomalies,
  };
}

/**
 * §6.1 : ≥ seuil → publication automatique marquée `auto_publiee` ; en dessous →
 * file de relecture, publication impossible sans validation humaine.
 *
 * Deux réserves s'ajoutent au seuil :
 *  - une réserve d'extraction explicite (statut « à vérifier ») l'emporte ;
 *  - une figure manquante rend la question injouable telle quelle.
 *
 * L'explication n'entre pas dans la décision : une question auto-publiée l'est
 * sans son explication tant que celle-ci n'est pas relue, la question restant
 * jouable sans elle.
 */
export function decisionPublication(
  question: QuestionPreparee,
  seuil: number,
): { statut: "publie" | "a_verifier"; autoPubliee: boolean } {
  const douteuse =
    question.statutExtraction === "a_verifier" ||
    question.imageRequise ||
    question.confiance === null ||
    question.confiance < seuil;

  return douteuse
    ? { statut: "a_verifier", autoPubliee: false }
    : { statut: "publie", autoPubliee: true };
}
