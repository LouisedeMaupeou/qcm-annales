import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import * as XLSX from "xlsx";

/**
 * Référentiel des concours blancs ingénieurs → fichier d'import Parkours (§3).
 *
 *   node scripts/convertir-referentiel-ingenieurs.mjs <referentiel.csv> <dossier-sortie> [ÉPREUVE…]
 *
 * Sans liste d'épreuves, toutes sont converties ; sinon seulement celles
 * nommées par leur identifiant (AV-NSI-NOEL26…).
 *
 * Comme pour SÉSAME, la conversion traduit, elle ne réécrit pas. Trois règles :
 *
 * 1. Seule une question « CONCORDANT / DOCUMENTÉ » entre servable. « À
 *    REVOIR », un écart avec le corrigé officiel, une clé absente ou des
 *    propositions perdues à la transcription la mettent en relecture, avec le
 *    motif du référentiel. Les sujets scientifiques en ont beaucoup : leurs
 *    formules sont des images dans le PDF, absentes de la transcription.
 * 2. Trois formes de questions : QCM (une lettre), affirmation vrai/faux
 *    (Puissance Alpha, réponse V ou F), et problème rédigé (GEIPI, réponse en
 *    clair) — ce dernier part en correction manuelle avec la réponse attendue.
 * 3. Les affirmations et sous-questions d'un même exercice forment un bloc :
 *    tirées ensemble, notées ensemble (barème Puissance Alpha, plancher GEIPI).
 */

const SOURCE = process.argv[2];
const SORTIE = process.argv[3];
const RETENUES = new Set(process.argv.slice(4).map((x) => x.toUpperCase()));
if (!SOURCE || !SORTIE) {
  console.error("Usage : convertir-referentiel-ingenieurs.mjs <referentiel.csv> <dossier-sortie> [ÉPREUVE…]");
  process.exit(1);
}

const PERIODE = process.env.PERIODE ?? "NOEL26";

/** Épreuve du référentiel → identifiant de la nomenclature (`epreuves-cb.ts`). */
const EPREUVES = {
  "Advance anglais": `ADV-ANG-${PERIODE}`,
  "Avenir anglais": `AV-ANG-${PERIODE}`,
  "Avenir NSI": `AV-NSI-${PERIODE}`,
  "Avenir PC": `AV-PHY-${PERIODE}`,
  "Avenir SI": `AV-SI-${PERIODE}`,
  "Avenir SVT": `AV-SVT-${PERIODE}`,
  "Geipi PC": `GE-PHY-${PERIODE}`,
  "Puissance Alpha PC": `PA-PHY-${PERIODE}`,
};

const COLONNES = [
  "id_question", "epreuve_id", "ordre", "bloc_id", "type", "enonce_commun", "enonce",
  "proposition_a", "proposition_b", "proposition_c", "proposition_d", "proposition_e",
  "cle", "points", "chapitre", "sous_chapitre", "notions", "travail_a_realiser", "methode",
  "auto_correction", "retroaction",
  "retroaction_a", "retroaction_b", "retroaction_c", "retroaction_d", "retroaction_e",
  "fichier_image", "document_associe", "statut_extraction", "commentaire",
];

const txt = (v) => String(v ?? "").replace(/\s+/g, " ").trim();
const ROMAINS = { I: 1, II: 2, III: 3, IV: 4, V: 5, VI: 6 };

/**
 * Le retour d'une proposition, sans son habillage : « La proposition A ne
 * satisfait pas la règle ciblée. » ouvre chaque retour faux et n'apprend
 * rien ; la méthode, répétée à la fin de chacun, a sa propre colonne.
 */
function retourPropre(brut) {
  return txt(brut)
    .replace(/^La proposition [A-E] ne satisfait pas la règle ciblée\.\s*/i, "")
    .replace(/\s*Méthode\s*:.*$/i, "")
    .trim();
}

const lignes = (() => {
  // Lu comme texte UTF-8, sans le BOM : en octets, SheetJS prendrait le CSV
  // pour du Latin-1 et l'en-tête « ID question » porterait le BOM.
  const texte = readFileSync(SOURCE, "utf8").replace(/^\uFEFF/, "");
  const classeur = XLSX.read(texte, { type: "string", FS: ";", raw: false });
  return XLSX.utils.sheet_to_json(classeur.Sheets[classeur.SheetNames[0]], { defval: "", raw: false });
})();

const sortie = [];
const parEpreuve = new Map();
const reserves = [];

for (const l of lignes) {
  const id = txt(l["ID question"]);
  const epreuveId = EPREUVES[txt(l["Épreuve"])];
  if (!id || !epreuveId) continue;
  if (RETENUES.size && !RETENUES.has(epreuveId)) continue;

  const numero = txt(l["N° question"]);
  const sous = txt(l["Sous-question"]);
  const statut = txt(l["Contrôle / statut"]);
  const reponse = txt(l["Réponse de référence"]);
  const propositions = ["A", "B", "C", "D", "E"].map((x) => txt(l[`Proposition ${x}`]));
  const nbPropositions = propositions.filter(Boolean).length;

  // Forme de la question.
  const vraiFaux = /^[VF]$/i.test(reponse);
  const redigee = !vraiFaux && !/^[A-E]$/i.test(reponse) && nbPropositions === 0 && Boolean(reponse);
  const type = vraiFaux ? "vrai_faux" : redigee ? "redaction" : "choix_unique";

  // Position et exercice : « 1 » ; « 1.2 » pour l'affirmation b de
  // l'exercice 1 ; « 2.3 » pour la question II-3 de GEIPI.
  const exercice = ROMAINS[numero] ?? Number(numero);
  const rangSous = /^[a-z]$/i.test(sous) ? sous.toLowerCase().charCodeAt(0) - 96 : Number(sous) || 0;
  const ordre = rangSous ? `${exercice}.${rangSous}` : String(exercice);
  const blocId = rangSous ? `${epreuveId}-EX${String(exercice).padStart(2, "0")}` : "";

  // Ce qui empêche de servir la question telle quelle.
  const motifs = [];
  if (statut !== "CONCORDANT / DOCUMENTÉ") motifs.push(`Référentiel : ${statut}.`);
  if (!reponse) motifs.push("Pas de réponse de référence.");
  if (type === "choix_unique" && nbPropositions < 2) {
    motifs.push("Propositions perdues à la transcription (formules du PDF) : à compléter.");
  }
  if (txt(l["Formules / schémas"]).startsWith("OUI")) {
    motifs.push("Formules ou figures à contrôler sur le PDF.");
  }
  const point = txt(l["Point à contrôler"]);
  if (point) motifs.push(point);
  const servable = motifs.length === 0;
  if (!servable) reserves.push(`${id} — ${motifs.join(" ")}`);

  // Une question QCM dont les propositions ont disparu garde quatre cases à
  // compléter en relecture : l'import refuse une question sans propositions.
  const propositionsServies =
    type === "choix_unique" && nbPropositions < 2
      ? ["(à compléter)", "(à compléter)", "(à compléter)", "(à compléter)", ""]
      : propositions;

  const retours =
    type === "vrai_faux"
      ? [txt(l["Feedback Vrai"]), txt(l["Feedback Faux"]), "", "", ""]
      : ["A", "B", "C", "D", "E"].map((x) => retourPropre(l[`Feedback réponse ${x}`]));

  const correction = txt(l["Feedback général élève"]);
  const ligne = {
    id_question: id,
    epreuve_id: epreuveId,
    ordre,
    bloc_id: blocId,
    type,
    enonce_commun: "",
    enonce: txt(l["Énoncé / propositions transcrits"]),
    proposition_a: type === "vrai_faux" ? "" : propositionsServies[0],
    proposition_b: type === "vrai_faux" ? "" : propositionsServies[1],
    proposition_c: type === "vrai_faux" ? "" : propositionsServies[2],
    proposition_d: type === "vrai_faux" ? "" : propositionsServies[3],
    proposition_e: type === "vrai_faux" ? "" : propositionsServies[4],
    cle: vraiFaux ? (/^V$/i.test(reponse) ? "VRAI" : "FAUX") : redigee ? "" : reponse.toUpperCase(),
    points: "",
    // Hiérarchie du bilan : le thème du référentiel est le domaine ; la
    // notion précise, le chapitre. En sciences, les deux coïncident.
    chapitre: txt(l["Thème / chapitre"]) || txt(l["Épreuve"]),
    sous_chapitre: txt(l["Notion précise"]),
    notions: txt(l["Compétence évaluée"]),
    travail_a_realiser: txt(l["Révision ciblée"]),
    methode: txt(l["Point méthode"]),
    auto_correction: redigee ? "NON" : "OUI",
    retroaction: redigee ? `Réponse attendue : ${reponse}. ${correction}`.trim() : correction,
    retroaction_a: retours[0],
    retroaction_b: retours[1],
    retroaction_c: retours[2],
    retroaction_d: retours[3],
    retroaction_e: retours[4],
    fichier_image: "",
    document_associe: "",
    statut_extraction: servable ? "OK" : "À VÉRIFIER",
    commentaire: motifs.join(" "),
  };
  sortie.push(ligne);
  const e = parEpreuve.get(epreuveId) ?? { total: 0, servables: 0, types: {} };
  e.total += 1;
  if (servable) e.servables += 1;
  e.types[type] = (e.types[type] ?? 0) + 1;
  parEpreuve.set(epreuveId, e);
}

mkdirSync(SORTIE, { recursive: true });
const classeur = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(classeur, XLSX.utils.json_to_sheet(sortie, { header: COLONNES }), "questions");
const nom = `INGENIEURS-${PERIODE}${RETENUES.size ? `-${[...RETENUES].join("-")}` : ""}`;
writeFileSync(join(SORTIE, `${nom}.xlsx`), XLSX.write(classeur, { type: "buffer", bookType: "xlsx" }));
writeFileSync(join(SORTIE, `${nom}-relecture.txt`), reserves.join("\n"), "utf8");

console.log("épreuve            total  servables  relecture  types");
for (const [id, e] of parEpreuve) {
  console.log(
    `${id.padEnd(18)} ${String(e.total).padStart(5)}  ${String(e.servables).padStart(9)}  ${String(e.total - e.servables).padStart(9)}  ${JSON.stringify(e.types)}`,
  );
}
console.log(`\nTOTAL : ${sortie.length} questions → ${join(SORTIE, `${nom}.xlsx`)}`);
