import * as XLSX from "xlsx";
import * as fs from "node:fs";

XLSX.set_fs(fs);

const classeur = XLSX.readFile(process.argv[2]);

console.log("========== NOTICE ==========");
for (const l of XLSX.utils.sheet_to_json(classeur.Sheets["Notice"], {
  defval: "",
  raw: false,
  header: 1,
})) {
  if (l[0]) console.log("  " + l[0]);
}

const lignes = XLSX.utils.sheet_to_json(classeur.Sheets["Saisie"], {
  defval: "",
  raw: false,
});
const n = (v) => String(v ?? "").trim();

console.log("\n========== SAISIE ==========");
console.log("Lignes (propositions) :", lignes.length);

const compter = (f) => {
  const m = {};
  for (const l of lignes) m[f(l)] = (m[f(l)] ?? 0) + 1;
  return m;
};

console.log("Par année :", JSON.stringify(compter((l) => n(l.annee))));
console.log("Par épreuve :", JSON.stringify(compter((l) => n(l.epreuve))));
console.log("Réponses :", JSON.stringify(compter((l) => n(l.reponse).toUpperCase())));
console.log("Items :", JSON.stringify(compter((l) => n(l.item).toLowerCase())));

// Regroupement en exercices : clé (année + exercice).
const parExo = new Map();
for (const l of lignes) {
  const cle = `${n(l.annee)} ‖ ${n(l.exercice)}`;
  if (!parExo.has(cle)) parExo.set(cle, []);
  parExo.get(cle).push(l);
}
const tailles = {};
for (const items of parExo.values()) tailles[items.length] = (tailles[items.length] ?? 0) + 1;

console.log("\nExercices (blocs) distincts :", parExo.size);
console.log("Distribution du nombre d'items par exercice :", JSON.stringify(tailles));

// Contrôles de complétude.
const anomalies = [];
let sansAffirmation = 0;
let sansChapitre = 0;
let reponseInvalide = 0;
for (const [i, l] of lignes.entries()) {
  const ligne = i + 2;
  if (!n(l.affirmation)) sansAffirmation++;
  if (!n(l.chapitre)) sansChapitre++;
  if (!["VRAI", "FAUX"].includes(n(l.reponse).toUpperCase())) {
    reponseInvalide++;
    if (anomalies.length < 8) anomalies.push(`L${ligne}: réponse « ${n(l.reponse)} »`);
  }
}
console.log("\nPropositions sans affirmation :", sansAffirmation);
console.log("Propositions sans chapitre :", sansChapitre);
console.log("Réponses non VRAI/FAUX :", reponseInvalide);
if (anomalies.length) console.log(anomalies.join("\n"));

// Chaque exercice porte-t-il un contexte (sur sa 1re ligne) ?
let exoAvecContexte = 0;
for (const items of parExo.values()) {
  if (items.some((it) => n(it.contexte))) exoAvecContexte++;
}
console.log(`\nExercices avec un contexte : ${exoAvecContexte} / ${parExo.size}`);

// Collision avec l'existant : l'annale ACCÈS 2025 est déjà en base (POC).
console.log("\nAnnées présentes dans le fichier :", Object.keys(compter((l) => n(l.annee))).join(", "));
