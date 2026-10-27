/**
 * Prépare l'import des concours blancs : convertit les deux classeurs
 * d'extraction au format Parkours (§3 du module concours blancs) et produit le
 * cahier de relecture des lignes douteuses.
 *
 *   node scripts/preparer-concours-blancs.mjs \
 *        <xlsx-ingenieurs> <xlsx-sesame> <dossier-images> <dossier-sortie>
 *
 * Le dossier d'images est la réunion des deux zips **décompressés** : les noms
 * de fichiers sont résolus par leur nom de base, peu importe l'arborescence.
 *
 * Deux fichiers en sortie :
 *   - import-concours-blancs.csv       → à donner à l'import du back-office
 *   - relecture-concours-blancs.xlsx   → à relire face aux PDF avant l'import
 *
 * Rien n'est écrit en base : ce script ne touche pas au réseau.
 */

import { readdirSync, statSync, mkdirSync, writeFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import * as XLSX from "xlsx";
import { convertir, lireExtractions, versCsv } from "./lib-cb.mjs";

const [, , cheminIngenieurs, cheminSesame, dossierImages, dossierSortie] = process.argv;

if (!cheminIngenieurs || !cheminSesame || !dossierImages || !dossierSortie) {
  console.error(
    "Usage : node scripts/preparer-concours-blancs.mjs <xlsx-ingenieurs> <xlsx-sesame> <dossier-images> <dossier-sortie>",
  );
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Index des images
// ---------------------------------------------------------------------------
function indexerImages(racine) {
  const chemins = new Set();
  const parNom = new Map();

  const parcourir = (dossier) => {
    for (const entree of readdirSync(dossier)) {
      const complet = join(dossier, entree);
      if (statSync(complet).isDirectory()) {
        parcourir(complet);
        continue;
      }
      const relatif = relative(racine, complet).split(sep).join("/");
      chemins.add(relatif);
      // Un même nom de base dans deux dossiers : le premier gagne, et c'est
      // signalé, parce que la référence du classeur deviendrait ambiguë.
      if (parNom.has(entree)) {
        console.warn(`⚠ nom de fichier en double : ${entree} (${relatif} ignoré)`);
      } else {
        parNom.set(entree, relatif);
      }
    }
  };

  parcourir(racine);
  return { chemins, parNom };
}

const images = indexerImages(dossierImages);

// ---------------------------------------------------------------------------
// Conversion
// ---------------------------------------------------------------------------
const extraites = lireExtractions({ cheminIngenieurs, cheminSesame });
const { lignes, signalements } = convertir(extraites, images);

mkdirSync(dossierSortie, { recursive: true });

const cheminCsv = join(dossierSortie, "import-concours-blancs.csv");
writeFileSync(cheminCsv, versCsv(lignes), "utf8");

// ---------------------------------------------------------------------------
// Cahier de relecture
// ---------------------------------------------------------------------------
// Un signalement n'est pas une erreur : c'est un endroit où la machine a
// tranché seule. Le cahier les regroupe par question, pour que la relecture se
// fasse question par question face au PDF, et non motif par motif.
const parQuestion = new Map();
for (const s of signalements) {
  if (!parQuestion.has(s.id)) parQuestion.set(s.id, []);
  parQuestion.get(s.id).push(s);
}

const index = new Map(lignes.map((l) => [l.id_question, l]));

const RATTACHEMENT = "rattachement à confirmer";

const aRelire = [...parQuestion.entries()]
  // Le rattachement d'un document seul ne justifie pas une relecture complète :
  // il a sa propre feuille.
  .filter(([, motifs]) => motifs.some((m) => m.motif !== RATTACHEMENT))
  .map(([id, motifs]) => {
    const l = index.get(id) ?? {};
    const src = l._source ?? {};
    return {
      ID_QUESTION: id,
      EPREUVE_ID: l.epreuve_id ?? "",
      "N° sujet": src.numero ?? "",
      "feuille source": src.feuille ?? "",
      "ligne source": src.ligneFichier ?? "",
      motifs: [...new Set(motifs.map((m) => m.motif))].join(" + "),
      "détail des réserves": motifs
        .filter((m) => m.motif !== RATTACHEMENT)
        .map((m) => `${m.motif} : ${m.detail}`)
        .join("\n"),
      type: l.type ?? "",
      "énoncé extrait": l.enonce ?? "",
      "propositions extraites": ["a", "b", "c", "d", "e", "f"]
        .map((x) => l[`proposition_${x}`])
        .filter(Boolean)
        .map((t, i) => `${"ABCDEF"[i]}. ${t}`)
        .join("\n"),
      "clé retenue": l.cle ?? "",
      image: l.fichier_image ?? "",
      // Colonnes à remplir par le relecteur.
      "VERDICT (OK / CORRIGER)": "",
      "énoncé corrigé": "",
      "propositions corrigées": "",
      "clé corrigée": "",
      "type corrigé": "",
      "commentaire du relecteur": "",
    };
  })
  .sort((a, b) =>
    `${a.EPREUVE_ID}${String(a["N° sujet"]).padStart(8, "0")}`.localeCompare(
      `${b.EPREUVE_ID}${String(b["N° sujet"]).padStart(8, "0")}`,
    ),
  );

const rattachements = signalements
  .filter((s) => s.motif === RATTACHEMENT)
  .map((s) => ({
    ID_QUESTION: s.id,
    EPREUVE_ID: s.epreuve,
    document: s.detail.replace(/^document « (.*?) ».*$/, "$1"),
    "bloc retenu": index.get(s.id)?.bloc_id || "(question isolée)",
    question: "À quelles questions ce document sert-il ?",
    "QUESTIONS COUVERTES (à remplir)": "",
  }));

const lisezMoi = [
  ["CAHIER DE RELECTURE — CONCOURS BLANCS"],
  [],
  [`Questions converties : ${lignes.length}`],
  [`Questions à relire : ${aRelire.length}`],
  [`Rattachements de documents à confirmer : ${rattachements.length}`],
  [],
  ["Feuille « À relire » : une ligne par question sur laquelle la conversion a dû"],
  ["trancher seule. Relire face au PDF du sujet, puis remplir les colonnes VERDICT"],
  ["et, si besoin, les colonnes « corrigé ». Les colonnes de gauche montrent ce que"],
  ["l'import écrira en l'état."],
  [],
  ["Motifs possibles :"],
  ["  à vérifier (source)     — réserve déjà portée par l'extraction (scan dense ou ambigu)"],
  ["  figure à contrôler      — la question dépend d'une image découpée du PDF"],
  ["  type corrigé            — le type déclaré ne colle pas à la clé (voir détail)"],
  ["  clé récupérée           — clé absente de sa colonne, relue dans la rétroaction"],
  ["  clé manquante           — aucune clé trouvée : la question n'est pas corrigeable"],
  ["  clé hors propositions   — la clé désigne une proposition qui n'existe pas"],
  ["  chapitre ajouté         — chapitre absent du référentiel, valeur par défaut posée"],
  ["  image / document absent — fichier référencé mais introuvable dans les zips"],
  ["  ordre illisible         — numéro de question non reconnu"],
  ["  identifiant en double   — deux lignes portent le même ID_QUESTION"],
  [],
  ["Feuille « Documents » : chaque texte ou corpus n'est rattaché qu'à la question"],
  ["qui le cite. Un article de compréhension sert en général plusieurs questions :"],
  ["indiquer lesquelles pour que le document s'affiche sur toutes."],
];

const classeur = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(
  classeur,
  XLSX.utils.aoa_to_sheet(lisezMoi),
  "Lisez-moi",
);
XLSX.utils.book_append_sheet(classeur, XLSX.utils.json_to_sheet(aRelire), "À relire");
XLSX.utils.book_append_sheet(
  classeur,
  XLSX.utils.json_to_sheet(rattachements),
  "Documents",
);

const cheminRelecture = join(dossierSortie, "relecture-concours-blancs.xlsx");
XLSX.writeFile(classeur, cheminRelecture);

// ---------------------------------------------------------------------------
// Rapport
// ---------------------------------------------------------------------------
const compter = (liste, cle) => {
  const m = new Map();
  for (const x of liste) m.set(x[cle], (m.get(x[cle]) ?? 0) + 1);
  return [...m.entries()].sort((a, b) => b[1] - a[1]);
};

console.log(`\n${lignes.length} questions converties → ${cheminCsv}`);
console.log("\nPar épreuve :");
for (const [epreuve, n] of compter(lignes, "epreuve_id")) {
  console.log(`  ${epreuve.padEnd(16)} ${String(n).padStart(3)}`);
}
console.log("\nPar type :");
for (const [type, n] of compter(lignes, "type")) {
  console.log(`  ${type.padEnd(16)} ${String(n).padStart(3)}`);
}
console.log(`\n${signalements.length} signalements, ${aRelire.length} questions à relire :`);
for (const [motif, n] of compter(signalements, "motif")) {
  console.log(`  ${motif.padEnd(24)} ${String(n).padStart(3)}`);
}
console.log(`\nCahier de relecture → ${cheminRelecture}\n`);
