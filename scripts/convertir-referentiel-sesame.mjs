import * as XLSX from "xlsx";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Référentiel pédagogique SÉSAME → fichiers d'import Parkours (§3).
 *
 * Le référentiel porte déjà les énoncés validés, les clés, les chapitres et les
 * feedbacks : la conversion ne réécrit rien, elle traduit. Deux règles y
 * président.
 *
 * 1. Une question n'entre servable que si le référentiel l'atteste. Tout autre
 *    statut de qualité, une clé absente, ou une mention dans « POINTS À
 *    CORRIGER » la renvoie en relecture avec son motif. Mieux vaut vingt
 *    questions en relecture qu'une seule servie avec une clé douteuse.
 * 2. Un passage partagé devient un bloc. Les sujets de langues posent plusieurs
 *    questions sur un même texte ; sans bloc, le texte serait recopié à
 *    l'identique sur chaque ligne et l'élève le relirait à chaque question.
 */

const SOURCE = process.argv[2];
const SORTIE = process.argv[3];
mkdirSync(SORTIE, { recursive: true });

const EPREUVES = {
  "FRANÇAIS": { id: "SES-FR-S2", fichier: "SES-FR-S2-francais" },
  "ANGLAIS": { id: "SES-ANG-S2", fichier: "SES-ANG-S2-anglais" },
  "MATHÉMATIQUES": { id: "SES-MAT-S1", fichier: "SES-MAT-S1-mathematiques" },
  "COMPÉTENCES DIGITALES": { id: "SES-DIG-S1", fichier: "SES-DIG-S1-competences-digitales" },
  "ANALYSE DOCUMENTAIRE": { id: "SES-ADOC-CB1", fichier: "SES-ADOC-CB1-analyse-documentaire" },
  "ALLEMAND": { id: "SES-DE-S2", fichier: "SES-DE-S2-lv2-allemand" },
  "ESPAGNOL": { id: "SES-ES-S2", fichier: "SES-ES-S2-lv2-espagnol" },
};

/**
 * Épreuves dont le sujet a été découpé en une capture par question.
 *
 * L'analyse documentaire en a besoin : la question 19 est un texte à trous,
 * la 16 oppose deux plans sur plusieurs lignes — la mise en page fait partie
 * de l'énoncé. Les propositions restent du texte sélectionnable à côté de la
 * capture : enfermer les réponses dans l'image les rendrait incliquables.
 */
const CAPTURES = new Set(["ANALYSE DOCUMENTAIRE"]);

/** Statuts par lesquels le référentiel atteste qu'une clé est sûre. */
const STATUTS_SURS = new Set([
  "RÉPONSE PÉDAGOGIQUE RETENUE",
  "CHOIX ÉDITORIAL VALIDÉ PAR PARKOURS",
  "VALIDÉ — CONFIRMÉ PAR LE SUJET",
  "CORRIGÉ FOURNI RECTIFIÉ — VÉRIFIÉ",
]);

const TYPES = {
  QCM_CHOIX_UNIQUE: "choix_unique",
  QCM_CHOIX_MULTIPLES: "choix_multiple",
  QCM_CHOIX_MULTIPLE: "choix_multiple",
  VRAI_FAUX: "vrai_faux",
  REDACTION: "redaction",
};

const COLONNES = [
  "id_question", "epreuve_id", "ordre", "bloc_id", "type", "enonce_commun", "enonce",
  "proposition_a", "proposition_b", "proposition_c", "proposition_d",
  "cle", "points", "chapitre", "sous_chapitre", "notions",
  "retroaction", "fichier_image", "document_associe", "statut_extraction", "commentaire",
];

const txt = (v) => String(v ?? "").replace(/\s+/g, " ").trim();
const wb = XLSX.read(readFileSync(SOURCE), { type: "buffer" });

// Les défauts connus, relevés par le référentiel lui-même.
const bloques = new Map();
for (const l of XLSX.utils.sheet_to_json(wb.Sheets["POINTS À CORRIGER"], { defval: "", raw: false })) {
  const cle = `${txt(l["Matière"]).toUpperCase()}#${txt(l["Question"])}`;
  bloques.set(cle, {
    probleme: txt(l["Problème relevé"]),
    prevue: txt(l["Réponse prévue par le rédacteur"]),
    correction: txt(l["Correction proposée avant Moodle"]),
  });
}

/**
 * Applique la correction que le référentiel prescrit pour une question fautive.
 *
 * Ces six questions sont inexploitables telles quelles — deux bonnes réponses,
 * ou aucune. Le référentiel ne se contente pas de les signaler : il écrit la
 * correction à appliquer. On la suit à la lettre plutôt que d'inventer, et la
 * question reste en relecture pour que ce choix soit validé par un humain.
 *
 * La clé est celle que le rédacteur avait prévue ; quand il n'en avait aucune,
 * c'est la proposition réécrite qui devient la bonne — c'est tout l'objet de
 * la réécriture.
 */
function appliquerCorrection(ligne, defaut) {
  if (!defaut) return { applique: null, cle: null };

  const c = defaut.correction;
  const citation = /[«"]\s*([^»"]+?)\s*[»"]/;
  const applique = [];
  let cle = defaut.prevue.replace(/AUCUNE/i, "").trim().toUpperCase();

  const proposition = c.match(/Remplacer\s+([A-F])\s+par\s*[«"]\s*([^»"]+?)\s*[»"]/i);
  if (proposition) {
    const lettre = proposition[1].toUpperCase();
    ligne[`Réponse ${lettre}`] = proposition[2];
    applique.push(`proposition ${lettre} réécrite`);
    if (!cle) cle = lettre;
  }

  const enonce = c.match(/Remplacer\s+l['’]énoncé\s+par\s*[«"]\s*([^»"]+?)\s*[»"]/i);
  const precision = !enonce && /Préciser/i.test(c) ? c.match(citation) : null;
  if (enonce || precision) {
    ligne["Énoncé exact / version validée"] = (enonce ?? precision)[1];
    applique.push("énoncé précisé");
  }

  const reponseDite = c.match(/réponse\s+([A-F])\b/i);
  if (!cle && reponseDite) cle = reponseDite[1].toUpperCase();

  return { applique: applique.length ? applique.join(" et ") : null, cle: cle || null };
}

/** « Texte 2, encart C » → ["texte-2.png", "encart-C.png"] */
/** Les neuf textes du dossier, pour une question qui porte sur son ensemble. */
const DOSSIER_COMPLET = Array.from({ length: 9 }, (_, i) => `texte-${i + 1}.png`);

function documents(mention) {
  const m = txt(mention);
  // Les questions de synthèse portent sur tout le dossier : on le leur donne
  // en entier plutôt que de les renvoyer en relecture faute de document.
  if (/dossier complet/i.test(m)) return { fichiers: DOSSIER_COMPLET, complet: false };
  if (!m) return { fichiers: [], complet: false };
  const fichiers = [];
  for (const n of m.matchAll(/textes?\s*([0-9]+(?:\s*(?:,|et)\s*[0-9]+)*)/gi)) {
    for (const num of n[1].match(/[0-9]+/g) ?? []) fichiers.push(`texte-${num}.png`);
  }
  for (const n of m.matchAll(/encarts?\s*([A-M](?:\s*(?:,|et)\s*[A-M])*)/gi)) {
    for (const lettre of n[1].match(/[A-M]/g) ?? []) fichiers.push(`encart-${lettre}.png`);
  }
  return { fichiers: [...new Set(fichiers)], complet: false };
}

const bilan = [];

for (const [feuille, epreuve] of Object.entries(EPREUVES)) {
  const lignes = XLSX.utils.sheet_to_json(wb.Sheets[feuille], { defval: "", raw: false });

  // Un même passage partagé par plusieurs questions devient un bloc. Un vrai
  // passage porte le texte ; une simple référence (« Texte 7 ») ne le porte pas.
  const passages = new Map();
  if (feuille !== "ANALYSE DOCUMENTAIRE") {
    for (const l of lignes) {
      const doc = txt(l["Document / encart associé"]);
      if (doc.length > 120 && !passages.has(doc)) {
        passages.set(doc, `${epreuve.id}-B${passages.size + 1}`);
      }
    }
  }

  const sortie = [];
  let servables = 0;
  const reserves = [];

  for (const l of lignes) {
    const numero = txt(l["N° question"]);
    const matiere = txt(l["Épreuve"]).toUpperCase();
    const defaut =
      bloques.get(`${matiere}#${numero}`) ??
      bloques.get(`${txt(l["Domaine"]).toUpperCase()}#${numero}`);

    const statutQualite = txt(l["Statut de qualité"]);
    const cleBrute = txt(l["Réponse(s) à retenir"]).toUpperCase().replace(/\s*(?:ET|,|\/)\s*/g, ";");
    const correction = appliquerCorrection(l, defaut);
    const cle = cleBrute || correction.cle || "";

    const motifs = [];
    if (defaut) {
      motifs.push(
        `Défaut relevé au référentiel : ${defaut.probleme}` +
          (correction.applique
            ? ` Correction du référentiel appliquée (${correction.applique}, clé ${cle || "?"}) — à valider.`
            : ` Correction proposée : ${defaut.correction}`),
      );
    }
    if (!cleBrute) motifs.push("Clé absente du référentiel.");
    if (!STATUTS_SURS.has(statutQualite)) motifs.push(`Statut de qualité : ${statutQualite}.`);

    const doc = documents(l["Document / encart associé"]);
    if (doc.complet) {
      motifs.push("Renvoie au dossier complet : document à rattacher à la main.");
    }

    const remarque = txt(l["Remarque de contrôle"]);
    const servable = motifs.length === 0 && Boolean(cle);
    if (servable) servables += 1;
    else reserves.push(`${txt(l.ID_question)} — ${motifs.join(" ")}`);

    const passage = txt(l["Document / encart associé"]);
    const blocId = passages.get(passage) ?? "";

    // Les captures ne sont produites que pour les épreuves dont le sujet a été
    // découpé ; ailleurs, l'énoncé transcrit se suffit.
    const capture = CAPTURES.has(feuille) ? `question-${numero.padStart(2, "0")}.png` : "";

    sortie.push({
      id_question: txt(l.ID_question),
      epreuve_id: epreuve.id,
      ordre: numero,
      bloc_id: blocId,
      type: TYPES[txt(l["Type Moodle"]).toUpperCase()] ?? "choix_unique",
      enonce_commun: blocId ? passage : "",
      enonce: txt(l["Énoncé exact / version validée"]),
      proposition_a: txt(l["Réponse A"]),
      proposition_b: txt(l["Réponse B"]),
      proposition_c: txt(l["Réponse C"]),
      proposition_d: txt(l["Réponse D"]),
      cle,
      points: "",
      chapitre: txt(l["Chapitre / compétence"]),
      sous_chapitre: txt(l["Notion commune"]),
      notions: txt(l["Sous-notion précise"]) || txt(l["Code notion"]),
      retroaction: txt(l["Feedback général Moodle"]) || txt(l["Correction expliquée - élève"]),
      document_associe: doc.fichiers.join("|"),
      // Capture de la question telle qu'elle est imprimée. Elle vaut surtout
      // pour l'analyse documentaire, dont certains énoncés sont des textes à
      // trous : la mise en page fait partie de la question.
      fichier_image: capture,
      statut_extraction: servable ? "OK" : "À VÉRIFIER",
      // Aucune troncature : un commentaire coupé en plein milieu ferait
      // perdre justement ce qui doit être relu, et il n'y a pas de limite à
      // respecter côté import.
      commentaire: [...motifs, remarque].filter(Boolean).join(" "),
    });
  }

  const feuilleSortie = XLSX.utils.json_to_sheet(sortie, { header: COLONNES });
  const classeur = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(classeur, feuilleSortie, "questions");
  // `writeFile` dépend d'un binding fs que la version ESM n'a pas : on écrit
  // le tampon nous-mêmes. Les deux formats sont produits : le formulaire
  // d'import accepte .xlsx comme .xls, et selon le poste l'un s'ouvre plus
  // volontiers que l'autre.
  for (const bookType of ["xlsx", "xls"]) {
    writeFileSync(
      join(SORTIE, `${epreuve.fichier}.${bookType}`),
      XLSX.write(classeur, { type: "buffer", bookType }),
    );
  }

  bilan.push({ feuille, epreuve: epreuve.id, total: sortie.length, servables, reserves });
}

console.log("épreuve                id               total  servables  relecture");
for (const b of bilan) {
  console.log(
    `${b.feuille.padEnd(22)} ${b.epreuve.padEnd(14)} ${String(b.total).padStart(5)}  ${String(b.servables).padStart(9)}  ${String(b.total - b.servables).padStart(9)}`,
  );
}
console.log(
  `\nTOTAL : ${bilan.reduce((s, b) => s + b.total, 0)} questions, ` +
    `${bilan.reduce((s, b) => s + b.servables, 0)} servables, ` +
    `${bilan.reduce((s, b) => s + (b.total - b.servables), 0)} en relecture.`,
);

writeFileSync(
  join(SORTIE, "questions-en-relecture.txt"),
  bilan
    .flatMap((b) => [`\n=== ${b.feuille} — ${b.reserves.length} question(s) ===`, ...b.reserves])
    .join("\n"),
  "utf8",
);
