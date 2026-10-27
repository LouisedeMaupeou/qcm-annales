/**
 * Lecture des deux classeurs d'extraction des concours blancs et conversion
 * vers le format d'import Parkours (specs module concours blancs, §3).
 *
 * Les classeurs d'extraction ne sont pas au format Parkours : les propositions
 * y tiennent dans une seule cellule, il n'y a ni `ordre`, ni `bloc_id`, ni
 * `points`, et deux conventions de colonnes cohabitent (`texte_question` côté
 * ingénieurs, `enonce` côté SÉSAME). Ce module fait la traduction, et surtout
 * il *signale* chaque endroit où il a dû décider à la place d'un humain : rien
 * n'est corrigé en silence, tout atterrit dans la file de relecture.
 *
 * Module partagé par convertir-cb-format-parkours.mjs et exporter-relecture-cb.mjs.
 */

import * as fs from "node:fs";
import * as XLSX from "xlsx";

// La distribution ESM de SheetJS n'a pas d'accès disque par défaut.
XLSX.set_fs(fs);

export const COLONNES_PARKOURS = [
  "id_question",
  "epreuve_id",
  "ordre",
  "type",
  "bloc_id",
  "enonce_commun",
  "enonce",
  "proposition_a",
  "proposition_b",
  "proposition_c",
  "proposition_d",
  "proposition_e",
  "proposition_f",
  "cle",
  "points",
  "chapitre",
  "sous_chapitre",
  "notions",
  "travail_a_realiser",
  "auto_correction",
  "retroaction",
  "fichier_image",
  "document_associe",
  "statut_extraction",
  "commentaire",
];

/** Plusieurs documents dans une cellule : séparés par « | », jamais par « ; ». */
export const SEPARATEUR_DOCUMENTS = " | ";

const texte = (v) => String(v ?? "").trim();
const ROMAINS = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII"];

// ---------------------------------------------------------------------------
// Lecture des classeurs
// ---------------------------------------------------------------------------

/**
 * Lit un classeur d'extraction et rend ses lignes normalisées, feuille par
 * feuille, dans l'ordre du fichier (qui est l'ordre du sujet).
 */
function lireClasseur(chemin, origine) {
  const classeur = XLSX.readFile(chemin);
  const lignes = [];

  for (const feuille of classeur.SheetNames) {
    if (feuille === "Lisez-moi") continue;
    const brutes = XLSX.utils.sheet_to_json(classeur.Sheets[feuille], {
      defval: "",
      raw: false,
    });

    brutes.forEach((l, i) => {
      lignes.push({
        origine,
        feuille,
        ligneFichier: i + 2, // en-tête en ligne 1
        rang: i,
        id: texte(l.ID_QUESTION),
        epreuve: texte(l.EPREUVE_ID) || feuille,
        numero: texte(l["N° XML"]),
        type: texte(l.type),
        enonceCommun: texte(l.enonce_commun),
        // Deux conventions de colonnes selon le classeur.
        enonce: texte(l.texte_question) || texte(l.enonce),
        propositions: texte(l.propositions),
        cle: texte(l.cle_correction),
        chapitre: texte(l.chapitre),
        sousChapitre: texte(l.sous_chapitre),
        notions: texte(l.notions),
        travail: texte(l.travail_a_realiser),
        autoCorrection: texte(l.auto_correction).toUpperCase(),
        retroaction: texte(l.retroaction_ciblee),
        statut: texte(l.statut_extraction).toUpperCase(),
        commentaire: texte(l.commentaire_extraction) || texte(l.commentaire),
        fichierImage: texte(l.fichier_image),
        documentAssocie: texte(l.document_associe),
      });
    });
  }

  return lignes;
}

export function lireExtractions({ cheminIngenieurs, cheminSesame }) {
  return [
    ...lireClasseur(cheminIngenieurs, "ingenieurs"),
    ...lireClasseur(cheminSesame, "sesame"),
  ];
}

// ---------------------------------------------------------------------------
// Propositions
// ---------------------------------------------------------------------------

/**
 * « a. -6 | b. 3 | c. 12 | d. 6 » → ["-6", "3", "12", "6"].
 *
 * Deux cas particuliers : « VRAI / FAUX » ne porte pas de proposition (la
 * question *est* l'affirmation), et « (voir image de la question) » signale un
 * énoncé en capture — la question est jouable, mais sans texte.
 */
export function decouperPropositions(cellule) {
  const brut = texte(cellule);
  if (!brut) return { propositions: [], porteesParImage: false };
  if (/^vrai\s*\/\s*faux$/i.test(brut)) return { propositions: [], porteesParImage: false };
  if (/^\(voir image/i.test(brut)) return { propositions: [], porteesParImage: true };

  const morceaux = brut
    .split("|")
    .map((m) => m.trim())
    .filter(Boolean)
    .map((m) => m.replace(/^[a-fA-F][.)]\s*/, "").trim());

  return { propositions: morceaux, porteesParImage: false };
}

/** « Bonne(s) réponse(s) : A, D. » → « A;D ». Rien de reconnu → null. */
export function cleDepuisRetroaction(retroaction) {
  const m = texte(retroaction).match(
    /Bonne(?:\(s\))?\s+réponses?(?:\(s\))?\s*:\s*([A-F](?:\s*[,;et]+\s*[A-F])*)/i,
  );
  if (!m) return null;
  const lettres = m[1]
    .toUpperCase()
    .split(/[^A-F]+/)
    .filter(Boolean);
  return [...new Set(lettres)].sort().join(";") || null;
}

// ---------------------------------------------------------------------------
// Ordre et blocs
// ---------------------------------------------------------------------------

/**
 * Position dans l'épreuve, en tri numérique (§3 : « 5.2 = sous-question 2 de
 * la question 5 »). Chaque épreuve a sa propre numérotation source.
 */
function calculerOrdre(ligne, rangExerciceRedaction) {
  const n = ligne.numero;

  // GEIPI, partie rédigée : la numérotation source se répète d'un exercice à
  // l'autre (« I-1 » trois fois). On la remplace par un rang calculé, placé
  // après les 8 exercices du QCM.
  if (ligne.type === "redaction" && rangExerciceRedaction) {
    return rangExerciceRedaction.exercice + rangExerciceRedaction.sous / 100;
  }

  // « I-A » (GEIPI QCM) → 1.01
  let m = n.match(/^([IVX]+)-([A-Z])$/i);
  if (m) {
    const exo = ROMAINS.indexOf(m[1].toUpperCase()) + 1;
    return exo + (m[2].toUpperCase().charCodeAt(0) - 64) / 100;
  }

  // « 1-a » (Puissance Alpha) → 1.01
  m = n.match(/^(\d+)-([a-z])$/i);
  if (m) return Number(m[1]) + (m[2].toLowerCase().charCodeAt(0) - 96) / 100;

  // « 13-case1 » (questions à trous SÉSAME) → 13.01
  m = n.match(/^(\d+)-case(\d+)$/i);
  if (m) return Number(m[1]) + Number(m[2]) / 100;

  // « 05.1 » (sous-questions SÉSAME maths) → 5.1
  m = n.match(/^(\d+)\.(\d+)$/);
  if (m) return Number(m[1]) + Number(m[2]) / 100;

  // « 01 », « 45 »
  if (/^\d+$/.test(n)) return Number(n);

  return null;
}

/**
 * Identifiant du bloc : les questions liées se tirent et se corrigent
 * ensemble. Trois raisons distinctes de regrouper ici :
 *
 *  - un exercice partage son énoncé (GEIPI, Puissance Alpha) — et son plancher
 *    de points pour GEIPI ;
 *  - une question à trous partage son image et sa règle « tout ou rien »
 *    (analyse documentaire SÉSAME) ;
 *  - une épreuve partage un corpus documentaire (analyse documentaire).
 */
function calculerBloc(ligne, rangExerciceRedaction) {
  if (ligne.epreuve === "SES-ADOC") return "SES-ADOC-CORPUS";

  if (ligne.type === "redaction" && rangExerciceRedaction) {
    return `${ligne.epreuve}-SPE-${rangExerciceRedaction.libelle}`;
  }

  let m = ligne.numero.match(/^([IVX]+)-[A-Z]$/i);
  if (m) return `${ligne.epreuve}-EX-${m[1].toUpperCase()}`;

  m = ligne.numero.match(/^(\d+)-[a-z]$/i);
  if (m) return `${ligne.epreuve}-EX${String(m[1]).padStart(2, "0")}`;

  m = ligne.numero.match(/^(\d+)\.\d+$/);
  if (m) return `${ligne.epreuve}-Q${String(m[1]).padStart(2, "0")}`;

  return ""; // question isolée
}

/** « EXERCICE II — MATHS SPÉCIALITÉ (20 points). … » → « II ». */
function exerciceDeSpecialite(enonceCommun) {
  const m = texte(enonceCommun).match(/^EXERCICE\s+([IVX]+)/i);
  return m ? m[1].toUpperCase() : null;
}

// ---------------------------------------------------------------------------
// Corpus de l'analyse documentaire
// ---------------------------------------------------------------------------

/**
 * Les lignes SÉSAME-ADOC référencent « corpus-adoc/ (41 pages) » : un libellé,
 * pas un nom de fichier. On le remplace par deux choses :
 *
 *  - la page précise citée par la rétroaction (« Référence documentaire :
 *    Illustration 5-A, p. 18 » → corpus-adoc/adoc-18.jpg), quand elle existe ;
 *  - le corpus entier, porté par la première ligne du bloc, puisque le candidat
 *    compose avec le fascicule complet sous les yeux.
 */
export function pagesCitees(retroaction, images) {
  const ref = texte(retroaction).match(/Référence(?:\s+documentaire)?\s*:\s*([^\n]*)/i);
  if (!ref) return [];

  const pages = new Set();
  // « p. 18 », « p. 6–7 », « p. 28-29 » — le tiret peut être long.
  for (const m of ref[1].matchAll(/p\.\s*(\d+)(?:\s*[–-]\s*(\d+))?/gi)) {
    const debut = Number(m[1]);
    const fin = m[2] ? Number(m[2]) : debut;
    for (let p = debut; p <= fin; p++) {
      const nom = images.parNom.get(`adoc-${String(p).padStart(2, "0")}.jpg`);
      if (nom) pages.add(nom);
    }
  }
  return [...pages];
}

// ---------------------------------------------------------------------------
// Conversion
// ---------------------------------------------------------------------------

export const GRAVITES = { bloquante: "bloquante", relecture: "relecture" };

/**
 * Convertit les lignes d'extraction en lignes au format Parkours.
 *
 * @param lignes       sortie de lireExtractions()
 * @param images       index des fichiers d'images : { chemins: Set<string>,
 *                     parNom: Map<basename, chemin relatif> }
 */
export function convertir(lignes, images) {
  const resoudre = (nom) => {
    const propre = String(nom ?? "")
      .trim()
      .replace(/^\.?\//, "");
    if (!propre) return null;
    if (images.chemins.has(propre)) return propre;
    return images.parNom.get(propre.split("/").pop()) ?? null;
  };

  const sorties = [];
  const signalements = [];

  const signaler = (ligne, motif, detail) =>
    signalements.push({
      id: ligne.id,
      epreuve: ligne.epreuve,
      ligneFichier: ligne.ligneFichier,
      feuille: ligne.feuille,
      motif,
      detail,
    });

  // Rang des exercices rédigés GEIPI, dont la numérotation source est inutilisable.
  const rangsRedaction = new Map();
  let prochainExerciceRedige = 9; // après les 8 exercices du QCM
  for (const l of lignes) {
    if (l.type !== "redaction") continue;
    const libelle = exerciceDeSpecialite(l.enonceCommun) ?? "X";
    const cle = `${l.epreuve}|${libelle}`;
    if (!rangsRedaction.has(cle)) {
      rangsRedaction.set(cle, { exercice: prochainExerciceRedige++, libelle, sous: 0 });
    }
  }

  const corpusComplet = [...images.chemins]
    .filter((f) => f.includes("corpus-adoc/"))
    .sort();
  const blocsCorpusServis = new Set();

  for (const ligne of lignes) {
    // Tout ce que la conversion signale sur cette ligne la met en relecture :
    // l'import lit statut_extraction pour décider si la question est servie
    // telle quelle ou si elle attend un relecteur.
    const avantSignalements = signalements.length;
    let rang = null;
    if (ligne.type === "redaction") {
      const libelle = exerciceDeSpecialite(ligne.enonceCommun) ?? "X";
      const entree = rangsRedaction.get(`${ligne.epreuve}|${libelle}`);
      entree.sous += 1;
      rang = { exercice: entree.exercice, libelle, sous: entree.sous };
    }

    const ordre = calculerOrdre(ligne, rang);
    if (ordre === null) {
      signaler(ligne, "ordre illisible", `N° source « ${ligne.numero} » non reconnu`);
    }

    const blocId = calculerBloc(ligne, rang);
    const { propositions, porteesParImage } = decouperPropositions(ligne.propositions);

    // --- Type et clé -------------------------------------------------------
    let type = ligne.type;
    let cle = ligne.cle.toUpperCase();
    let autoCorrection = ligne.autoCorrection === "NON" ? "NON" : "OUI";

    if (type === "choix_multiple" && /^[A-F]$/.test(cle)) {
      // Analyse documentaire : une « case » de question à trous n'a qu'une
      // réponse. Le choix multiple est au niveau de la question, pas de la case
      // (§5.3 : auto-correction case par case selon la clé).
      type = "choix_unique";
      signaler(
        ligne,
        "type corrigé",
        "case de question à trous : choix_multiple → choix_unique (une seule clé)",
      );
    }

    if (!cle && type !== "redaction") {
      const recuperee = cleDepuisRetroaction(ligne.retroaction);
      if (recuperee) {
        cle = recuperee;
        const multiple = recuperee.includes(";");
        if (multiple && type === "choix_unique") {
          type = "choix_multiple";
          signaler(
            ligne,
            "type corrigé",
            `clé absente de la colonne, lue dans la rétroaction (${recuperee}) : plusieurs bonnes réponses → choix_multiple`,
          );
        } else {
          signaler(
            ligne,
            "clé récupérée",
            `clé absente de la colonne, lue dans la rétroaction : ${recuperee}`,
          );
        }
        // Ces questions étaient marquées non auto-corrigeables faute de clé :
        // la clé retrouvée les rend corrigeables automatiquement.
        autoCorrection = "OUI";
      } else {
        signaler(ligne, "clé manquante", "aucune clé en colonne ni dans la rétroaction");
      }
    }

    if (type === "redaction") autoCorrection = "NON";

    // --- Propositions portées par l'image ----------------------------------
    // Les sujets SÉSAME sont découpés en captures : l'énoncé et les choix sont
    // dans l'image, pas en texte. La question reste jouable, mais il lui faut
    // des propositions à cocher. On en crée autant que la clé en suppose, sans
    // jamais descendre sous les 4 du format SÉSAME.
    let propositionsFinales = propositions;
    if (type === "redaction") {
      // La colonne source porte un libellé (« réponse rédigée — correction
      // manuelle ») : c'est une consigne, pas une proposition à cocher.
      propositionsFinales = [];
    } else if (porteesParImage) {
      const derniere = cle
        .split(";")
        .filter(Boolean)
        .reduce((max, l) => Math.max(max, l.charCodeAt(0) - 64), 0);
      const combien = Math.max(4, derniere);
      propositionsFinales = Array.from({ length: combien }, () => "(voir image)");
    }

    // --- Cohérence clé / propositions --------------------------------------
    if (type !== "redaction" && !porteesParImage && propositions.length > 0) {
      const maxLettre = String.fromCharCode(64 + propositions.length);
      for (const lettre of cle.split(";").filter(Boolean)) {
        if (lettre > maxLettre) {
          signaler(
            ligne,
            "clé hors propositions",
            `clé « ${lettre} » alors que la question n'a que ${propositions.length} proposition(s)`,
          );
        }
      }
    }

    // --- Chapitre (obligatoire en base) ------------------------------------
    let chapitre = ligne.chapitre;
    if (!chapitre) {
      chapitre = ligne.epreuve === "SES-ADOC" ? "Analyse documentaire" : "À classer";
      signaler(ligne, "chapitre ajouté", `chapitre absent du référentiel → « ${chapitre} »`);
    }

    // --- Images et documents -----------------------------------------------
    const image = ligne.fichierImage;
    const cheminImage = resoudre(image);
    if (image && !cheminImage) {
      signaler(ligne, "image absente", `« ${image} » référencée mais absente des zips`);
    }

    const documents = [];
    for (const brut of ligne.documentAssocie.split(";").map((d) => d.trim()).filter(Boolean)) {
      if (/^corpus-adoc\/\s*\(/.test(brut)) {
        // Le corpus entier, une seule fois, sur la première ligne du bloc.
        if (!blocsCorpusServis.has(blocId)) {
          documents.push(...corpusComplet);
          blocsCorpusServis.add(blocId);
        }
        continue;
      }
      const chemin = resoudre(brut);
      if (!chemin) {
        signaler(ligne, "document absent", `« ${brut} » référencé mais absent des zips`);
      }
      documents.push(chemin ?? brut);
      signaler(
        ligne,
        "rattachement à confirmer",
        `document « ${brut} » rattaché à cette seule question : vérifier s'il sert aussi aux questions voisines`,
      );
    }

    // Page précise du corpus citée par la rétroaction.
    for (const page of pagesCitees(ligne.retroaction, images)) {
      if (!documents.includes(page)) documents.push(page);
    }

    // --- Réserves héritées de l'extraction ---------------------------------
    if (ligne.statut === "A VERIFIER") {
      signaler(ligne, "à vérifier (source)", ligne.commentaire || "réserve d'extraction");
    } else if (ligne.statut === "FIGURE") {
      signaler(
        ligne,
        "figure à contrôler",
        ligne.commentaire || "la question dépend d'une image découpée du PDF",
      );
    }

    sorties.push({
      id_question: ligne.id,
      epreuve_id: ligne.epreuve,
      ordre: ordre === null ? "" : String(ordre),
      type,
      bloc_id: blocId,
      enonce_commun: ligne.enonceCommun,
      enonce: ligne.enonce,
      proposition_a: propositionsFinales[0] ?? "",
      proposition_b: propositionsFinales[1] ?? "",
      proposition_c: propositionsFinales[2] ?? "",
      proposition_d: propositionsFinales[3] ?? "",
      proposition_e: propositionsFinales[4] ?? "",
      proposition_f: propositionsFinales[5] ?? "",
      cle,
      points: "1",
      chapitre,
      sous_chapitre: ligne.sousChapitre,
      notions: ligne.notions,
      travail_a_realiser: ligne.travail,
      auto_correction: autoCorrection,
      retroaction: ligne.retroaction,
      fichier_image: cheminImage ?? image,
      document_associe: documents.join(SEPARATEUR_DOCUMENTS),
      ...reserves(signalements.slice(avantSignalements)),
      // Hors format Parkours, pour la relecture seulement.
      _source: ligne,
    });
  }

  // Unicité des identifiants (clé de rapprochement et de mise à jour, §3).
  const vus = new Map();
  for (const s of sorties) {
    if (vus.has(s.id_question)) {
      signalements.push({
        id: s.id_question,
        epreuve: s.epreuve_id,
        ligneFichier: s._source.ligneFichier,
        feuille: s._source.feuille,
        motif: "identifiant en double",
        detail: `déjà vu ligne ${vus.get(s.id_question)}`,
      });
    }
    vus.set(s.id_question, s._source.ligneFichier);
  }

  return { lignes: sorties, signalements };
}

/**
 * Traduit les signalements d'une ligne en réserve d'extraction.
 *
 * Un rattachement de document à confirmer ne met pas la question en relecture :
 * il ne remet en cause ni son énoncé, ni sa clé. Il reste noté en commentaire.
 */
function reserves(miens) {
  if (miens.length === 0) return { statut_extraction: "OK", commentaire: "" };

  const bloquants = miens.filter((m) => m.motif !== "rattachement à confirmer");
  return {
    statut_extraction: bloquants.length > 0 ? "A VERIFIER" : "OK",
    commentaire: miens.map((m) => `${m.motif} : ${m.detail}`).join(" — "),
  };
}

// ---------------------------------------------------------------------------
// Écriture CSV
// ---------------------------------------------------------------------------

export function versCsv(lignes) {
  const echapper = (v) => {
    const s = String(v ?? "");
    return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };

  const corps = lignes.map((l) =>
    COLONNES_PARKOURS.map((c) => echapper(l[c])).join(";"),
  );

  // BOM : Excel ouvre sinon l'UTF-8 en ANSI et massacre les accents.
  return "﻿" + [COLONNES_PARKOURS.join(";"), ...corps].join("\r\n") + "\r\n";
}
