/**
 * Import des questions de concours blancs en ligne de commande.
 *
 *   node --env-file=.env.local scripts/importer-concours-blancs.mjs \
 *        <fichier.csv|xlsx> [zip-images...] [--simulation]
 *
 * Même chemin de code que le back-office (Prépa → Import concours blancs) :
 * le parseur et l'écriture sont les modules partagés `src/lib/import-cb.ts` et
 * `src/lib/import-cb-ecriture.ts`. Ce script n'ajoute que la lecture des
 * fichiers sur disque et l'affichage du rapport — il n'y a donc pas deux
 * implémentations de l'import qui peuvent diverger.
 *
 * `--simulation` lit tout et n'écrit rien : même rapport, aucune écriture,
 * aucun téléversement. C'est le passage obligé avant un import réel.
 */

import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { analyserFichierCb, verifierImages } from "../src/lib/import-cb.ts";
import { ecrireQuestionsCb } from "../src/lib/import-cb-ecriture.ts";
import { decoderEpreuveId, PREFIXES_CONNUS } from "../src/lib/epreuves-cb.ts";
import { indexerParNom, lireZip } from "../src/lib/zip.ts";

const arguments_ = process.argv.slice(2);
const simulation = arguments_.includes("--simulation");
const fichiers = arguments_.filter((a) => !a.startsWith("--"));
const [cheminQuestions, ...cheminsZips] = fichiers;

if (!cheminQuestions) {
  console.error(
    "Usage : node --env-file=.env.local scripts/importer-concours-blancs.mjs <fichier.csv|xlsx> [zip-images...] [--simulation]",
  );
  process.exit(1);
}

const octets = (chemin) => {
  const b = readFileSync(chemin);
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
};

// ---------------------------------------------------------------------------
// Analyse
// ---------------------------------------------------------------------------
const rapport = analyserFichierCb(octets(cheminQuestions));
const anomalies = [...rapport.anomalies];

const entrees = [];
for (const zip of cheminsZips) entrees.push(...lireZip(octets(zip)));
const parNom = indexerParNom(entrees);

const controle = verifierImages(rapport.questions, new Set(parNom.keys()));
anomalies.push(...controle.anomalies);

const epreuvesDecodees = new Map();
for (const id of rapport.epreuves) {
  const decodee = decoderEpreuveId(id);
  epreuvesDecodees.set(id, decodee);
  if (!decodee) {
    anomalies.push({
      ligne: null,
      gravite: "bloquante",
      message:
        `Épreuve « ${id} » non reconnue. Concours attendu parmi ${PREFIXES_CONNUS.concours.join(", ")}, ` +
        `matière parmi ${PREFIXES_CONNUS.matieres.join(", ")}.`,
    });
  }
}

const retenues = rapport.questions.filter((q) => epreuvesDecodees.get(q.epreuveIdExterne));
const enRelecture = retenues.filter(
  (q) => q.statutExtraction !== "ok" || controle.manquantes.has(q.idExterne),
);

console.log(`\nFichier      : ${cheminQuestions}`);
console.log(`Images       : ${entrees.length} dans ${cheminsZips.length} zip(s)`);
console.log(`Lignes lues  : ${rapport.lignes}`);
console.log(`Retenues     : ${retenues.length} (${rapport.ignorees} ligne(s) écartée(s))`);
console.log(`Blocs        : ${new Set(retenues.map((q) => q.blocCle)).size}`);
console.log(`Épreuves     : ${rapport.epreuves.join(", ")}`);
console.log(`Prêtes       : ${retenues.length - enRelecture.length}`);
console.log(`En relecture : ${enRelecture.length}`);
console.log(`Manuelles    : ${retenues.filter((q) => !q.autoCorrection).length}`);

const afficher = (gravite) => {
  const liste = anomalies.filter((a) => a.gravite === gravite);
  if (liste.length === 0) return;
  console.log(`\n${liste.length} ${gravite}(s) :`);
  for (const a of liste.slice(0, 30)) {
    console.log(`  ${a.ligne === null ? "   " : `L${a.ligne}`} ${a.message}`);
  }
  if (liste.length > 30) console.log(`  … et ${liste.length - 30} autre(s).`);
};
afficher("bloquante");
afficher("avertissement");

if (simulation) {
  console.log("\n— simulation : rien n'a été écrit ni téléversé.\n");
  process.exit(0);
}

if (retenues.length === 0) {
  console.error("\nAucune question importable. Rien à faire.\n");
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Écriture
// ---------------------------------------------------------------------------
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const cle = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !cle) {
  console.error("NEXT_PUBLIC_SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY requis.");
  process.exit(1);
}

const db = createClient(url, cle, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const resultat = await ecrireQuestionsCb(
  db,
  retenues,
  parNom,
  controle.manquantes,
  epreuvesDecodees,
);

console.log(
  `\n✓ ${resultat.creees} question(s) créée(s), ${resultat.misesAJour} mise(s) à jour, ` +
    `${resultat.imagesTeleversees} image(s) téléversée(s).`,
);
for (const a of resultat.anomalies) {
  console.log(`  [${a.gravite}] ${a.message}`);
}
console.log();
