// Pas de `server-only` ici, contrairement au reste de src/lib : ce module ne
// touche ni aux secrets ni à la base — il transforme un fichier en données.
// Le garde vit sur `supabase/admin.ts`, qui détient la clé service_role. Ce
// choix est ce qui permet à `scripts/importer-concours-blancs.mjs` de rejouer
// exactement le même import que le back-office au lieu d'en recopier la logique.

import * as XLSX from "xlsx";

/**
 * Import des questions de concours blancs au format Parkours (module concours
 * blancs, §3) : 1 ligne = 1 question, CSV point-virgule ou XLSX.
 *
 * C'est le format de référence pour l'avenir, à égalité avec le XML Moodle
 * qu'il remplace (§9). Il diffère de l'import en masse du socle, qui compte
 * une ligne par *proposition* : ici les propositions tiennent dans les
 * colonnes proposition_a … proposition_f, et la bonne réponse est désignée par
 * une clé (« B », « A;C », « VRAI »).
 *
 * Comme pour le socle (§6.1), chaque ligne est validée séparément et les
 * anomalies sont rapportées sans interrompre l'analyse : l'import est partiel,
 * les lignes saines entrent.
 */

export const COLONNES_CB = [
  "id_question",
  "epreuve_id",
  "type",
  "cle",
] as const;

export const COLONNES_CB_FACULTATIVES = [
  "ordre",
  "bloc_id",
  "enonce_commun",
  "enonce",
  "proposition_a",
  "proposition_b",
  "proposition_c",
  "proposition_d",
  "proposition_e",
  "proposition_f",
  "points",
  "chapitre",
  "sous_chapitre",
  "notions",
  "travail_a_realiser",
  "auto_correction",
  "retroaction",
  "fichier_image",
  "document_associe",
  // Hors tableau du §3, mais indispensables : sans elles, une question dont
  // l'extraction porte une réserve entrerait publiée, et la file de relecture
  // du socle resterait vide alors que le §3 l'alimente explicitement.
  "statut_extraction",
  "commentaire",
] as const;

const TYPES = ["choix_unique", "choix_multiple", "vrai_faux", "redaction"] as const;
export type TypeCb = (typeof TYPES)[number];

/** Plusieurs documents dans une cellule, séparés par « | ». */
const SEPARATEUR_DOCUMENTS = "|";

export type AnomalieCb = {
  ligne: number | null;
  gravite: "bloquante" | "avertissement";
  message: string;
};

export type QuestionCb = {
  ligne: number;
  idExterne: string;
  epreuveIdExterne: string;
  ordre: number;
  blocCle: string;
  type: TypeCb;
  /** Type réellement stocké : voir la note sur le vrai/faux plus bas. */
  typeStocke: Exclude<TypeCb, "vrai_faux">;
  enonceCommun: string | null;
  enonce: string;
  propositions: { texte: string; estCorrecte: boolean; ordre: number }[];
  points: number;
  chapitre: string;
  sousChapitre: string | null;
  notions: string | null;
  travail: string | null;
  autoCorrection: boolean;
  retroaction: string | null;
  fichierImage: string | null;
  documents: string[];
  /** Réserve héritée de l'extraction : décide de la mise en relecture. */
  statutExtraction: "manuel" | "ok" | "a_verifier";
  commentaire: string | null;
};

export type RapportCb = {
  lignes: number;
  questions: QuestionCb[];
  ignorees: number;
  anomalies: AnomalieCb[];
  epreuves: string[];
};

const nettoyer = (v: unknown) => String(v ?? "").trim();

/**
 * Le classeur d'extraction écrit « OK », « A VERIFIER » ou « FIGURE ».
 * Tout ce qui n'est pas un OK franc est une réserve : la question entre en
 * relecture plutôt que d'être servie telle quelle à un élève en épreuve.
 */
function lireStatutExtraction(brut: string): QuestionCb["statutExtraction"] {
  const valeur = brut
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  if (!valeur) return "manuel";
  return valeur === "OK" ? "ok" : "a_verifier";
}

function lireLignes(donnees: ArrayBuffer): Record<string, unknown>[] {
  // FS: ";" — le format Parkours est explicitement en point-virgule, et un
  // énoncé contient des virgules à chaque ligne.
  const classeur = XLSX.read(donnees, { type: "array", FS: ";", raw: false });
  const premiere = classeur.SheetNames[0];
  if (!premiere) return [];
  return XLSX.utils.sheet_to_json(classeur.Sheets[premiere], {
    defval: "",
    raw: false,
  });
}

export function analyserFichierCb(donnees: ArrayBuffer): RapportCb {
  const anomalies: AnomalieCb[] = [];
  const vide = (message: string): RapportCb => ({
    lignes: 0,
    questions: [],
    ignorees: 0,
    epreuves: [],
    anomalies: [{ ligne: null, gravite: "bloquante", message }],
  });

  let lignes: Record<string, unknown>[];
  try {
    lignes = lireLignes(donnees);
  } catch (e) {
    return vide(`Fichier illisible : ${e instanceof Error ? e.message : String(e)}`);
  }

  if (lignes.length === 0) return vide("Le fichier est vide.");

  const colonnes = Object.keys(lignes[0]);
  const manquantes = COLONNES_CB.filter((c) => !colonnes.includes(c));
  if (manquantes.length > 0) {
    return vide(`Colonnes manquantes : ${manquantes.join(", ")}.`);
  }

  const questions: QuestionCb[] = [];
  const identifiants = new Map<string, number>();
  let ignorees = 0;

  lignes.forEach((l, i) => {
    const numero = i + 2; // en-tête en ligne 1
    const rejeter = (message: string) => {
      anomalies.push({ ligne: numero, gravite: "bloquante", message });
      ignorees += 1;
    };

    const idExterne = nettoyer(l.id_question);
    if (!idExterne) return rejeter("id_question vide.");
    if (identifiants.has(idExterne)) {
      return rejeter(
        `${idExterne} : identifiant déjà utilisé ligne ${identifiants.get(idExterne)}.`,
      );
    }
    identifiants.set(idExterne, numero);

    const epreuveIdExterne = nettoyer(l.epreuve_id);
    if (!epreuveIdExterne) return rejeter(`${idExterne} : epreuve_id vide.`);

    const type = nettoyer(l.type) as TypeCb;
    if (!TYPES.includes(type)) {
      return rejeter(`${idExterne} : type « ${type} » inconnu.`);
    }

    const chapitre = nettoyer(l.chapitre);
    if (!chapitre) return rejeter(`${idExterne} : chapitre manquant (obligatoire).`);

    const ordreBrut = nettoyer(l.ordre).replace(",", ".");
    const ordre = Number(ordreBrut);
    if (ordreBrut && !Number.isFinite(ordre)) {
      return rejeter(`${idExterne} : ordre « ${ordreBrut} » illisible.`);
    }

    const pointsBrut = nettoyer(l.points).replace(",", ".");
    const points = pointsBrut ? Number(pointsBrut) : 1;
    if (!Number.isFinite(points) || points <= 0) {
      return rejeter(`${idExterne} : points « ${pointsBrut} » invalides.`);
    }

    const textesPropositions = ["a", "b", "c", "d", "e", "f"]
      .map((lettre) => nettoyer(l[`proposition_${lettre}`]))
      .filter(Boolean);

    const enonce = nettoyer(l.enonce);
    const cle = nettoyer(l.cle).toUpperCase();

    // --- Clé et propositions, selon le type --------------------------------
    let propositions: QuestionCb["propositions"] = [];
    let typeStocke: QuestionCb["typeStocke"];

    if (type === "redaction") {
      typeStocke = "redaction";
      if (cle) {
        anomalies.push({
          ligne: numero,
          gravite: "avertissement",
          message: `${idExterne} : clé « ${cle} » ignorée, une rédaction se corrige à la main.`,
        });
      }
      if (textesPropositions.length > 0) {
        anomalies.push({
          ligne: numero,
          gravite: "avertissement",
          message: `${idExterne} : propositions ignorées sur une question rédigée.`,
        });
      }
      if (!enonce) return rejeter(`${idExterne} : énoncé vide.`);
    } else if (type === "vrai_faux") {
      // Une ligne vrai/faux porte UNE affirmation à juger. Le type
      // `vrai_faux` du socle désigne autre chose — un énoncé suivi de
      // plusieurs affirmations, notées tout ou rien (§2.3). Pour ne pas
      // confondre deux granularités, l'affirmation est stockée comme un choix
      // unique entre Vrai et Faux : même énoncé, même notation (+ / − par
      // affirmation), et c'est déjà la convention retenue pour les QCM GEIPI
      // et Puissance Alpha importés dans la banque.
      typeStocke = "choix_unique";
      if (!enonce) return rejeter(`${idExterne} : énoncé vide.`);
      if (cle !== "VRAI" && cle !== "FAUX") {
        return rejeter(`${idExterne} : clé « ${cle} » attendue VRAI ou FAUX.`);
      }
      propositions = [
        { texte: "Vrai", estCorrecte: cle === "VRAI", ordre: 1 },
        { texte: "Faux", estCorrecte: cle === "FAUX", ordre: 2 },
      ];
    } else {
      typeStocke = type;
      if (textesPropositions.length < 2) {
        return rejeter(
          `${idExterne} : ${textesPropositions.length} proposition(s), il en faut au moins 2.`,
        );
      }

      const lettres = cle.split(";").map((x) => x.trim()).filter(Boolean);
      if (lettres.length === 0) {
        return rejeter(`${idExterne} : clé manquante.`);
      }
      if (type === "choix_unique" && lettres.length > 1) {
        return rejeter(
          `${idExterne} : clé « ${cle} » à plusieurs réponses pour un choix unique.`,
        );
      }

      const correctes = new Set<number>();
      for (const lettre of lettres) {
        if (!/^[A-F]$/.test(lettre)) {
          return rejeter(`${idExterne} : clé « ${lettre} » non reconnue (A à F attendu).`);
        }
        const rang = lettre.charCodeAt(0) - 65;
        if (rang >= textesPropositions.length) {
          return rejeter(
            `${idExterne} : clé « ${lettre} » hors des ${textesPropositions.length} propositions.`,
          );
        }
        correctes.add(rang);
      }

      propositions = textesPropositions.map((texte, rang) => ({
        texte,
        estCorrecte: correctes.has(rang),
        ordre: rang + 1,
      }));

      // Une proposition « (voir image) » n'est pas une erreur — les sujets
      // SÉSAME sont des captures — mais une question sans image ni texte
      // n'est pas jouable.
      const toutEnImage = textesPropositions.every((t) => /^\(voir image/i.test(t));
      if (toutEnImage && !nettoyer(l.fichier_image)) {
        return rejeter(
          `${idExterne} : propositions renvoyées à une image, mais aucun fichier_image.`,
        );
      }
    }

    if (!enonce && !nettoyer(l.fichier_image)) {
      return rejeter(`${idExterne} : ni énoncé ni image, la question serait vide.`);
    }

    const autoBrut = nettoyer(l.auto_correction).toUpperCase();
    const autoCorrection = type === "redaction" ? false : autoBrut !== "NON";
    if (type !== "redaction" && !autoCorrection) {
      anomalies.push({
        ligne: numero,
        gravite: "avertissement",
        message: `${idExterne} : marquée non auto-corrigeable alors qu'elle a une clé — elle ira en correction manuelle.`,
      });
    }

    questions.push({
      ligne: numero,
      idExterne,
      epreuveIdExterne,
      ordre: ordreBrut ? ordre : i + 1,
      blocCle: nettoyer(l.bloc_id) || idExterne,
      type,
      typeStocke,
      enonceCommun: nettoyer(l.enonce_commun) || null,
      enonce,
      propositions,
      points,
      chapitre,
      sousChapitre: nettoyer(l.sous_chapitre) || null,
      notions: nettoyer(l.notions) || null,
      travail: nettoyer(l.travail_a_realiser) || null,
      autoCorrection,
      retroaction: nettoyer(l.retroaction) || null,
      fichierImage: nettoyer(l.fichier_image) || null,
      documents: nettoyer(l.document_associe)
        .split(SEPARATEUR_DOCUMENTS)
        .map((d) => d.trim())
        .filter(Boolean),
      statutExtraction: lireStatutExtraction(nettoyer(l.statut_extraction)),
      commentaire: nettoyer(l.commentaire) || null,
    });
  });

  // Un bloc ne doit pas chevaucher deux épreuves : il serait servi au mauvais
  // endroit, et son chapeau avec.
  const epreuveDuBloc = new Map<string, string>();
  for (const q of questions) {
    const connue = epreuveDuBloc.get(q.blocCle);
    if (connue && connue !== q.epreuveIdExterne) {
      anomalies.push({
        ligne: q.ligne,
        gravite: "bloquante",
        message: `Bloc « ${q.blocCle} » réparti entre ${connue} et ${q.epreuveIdExterne}.`,
      });
    }
    epreuveDuBloc.set(q.blocCle, q.epreuveIdExterne);
  }

  return {
    lignes: lignes.length,
    questions,
    ignorees,
    anomalies,
    epreuves: [...new Set(questions.map((q) => q.epreuveIdExterne))].sort(),
  };
}

/**
 * Contrôle croisé fichier ↔ zip d'images (§3).
 *
 * Une image manquante n'écarte pas la question : elle la met en relecture.
 * Mieux vaut une banque complète dont trois questions attendent leur figure
 * qu'un import rejeté en bloc la veille d'une session.
 */
export function verifierImages(
  questions: QuestionCb[],
  presentes: Set<string>,
): { anomalies: AnomalieCb[]; manquantes: Set<string> } {
  const anomalies: AnomalieCb[] = [];
  const manquantes = new Set<string>();

  for (const q of questions) {
    const references = [q.fichierImage, ...q.documents].filter(Boolean) as string[];
    for (const reference of references) {
      const base = reference.split("/").pop()!;
      if (presentes.has(base)) continue;
      manquantes.add(q.idExterne);
      anomalies.push({
        ligne: q.ligne,
        gravite: "avertissement",
        message: `${q.idExterne} : « ${reference} » absent du zip — la question reste en relecture.`,
      });
    }
  }

  return { anomalies, manquantes };
}
