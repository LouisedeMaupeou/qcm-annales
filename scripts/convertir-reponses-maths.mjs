import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import * as XLSX from "xlsx";

/**
 * Mathématiques de Noël (Avenir, Advance, Puissance Alpha, GEIPI) → fichier
 * d'import Parkours (§3).
 *
 *   node scripts/convertir-reponses-maths.mjs <reponses.xlsx> <dossier-sortie>
 *
 * Les sujets sont des scans : leurs questions sont servies en images,
 * découpées par `decouper-questions-pdf.py` (mode « titres » pour Avenir et
 * Advance, une image par question ; mode « exercices » pour Puissance Alpha et
 * GEIPI, une image par exercice, affichée en tête de sa première affirmation).
 * Le classeur de la responsable des prépas donne, pour chaque question, la
 * bonne réponse, le chapitre et la notion ou méthode à reprendre — ce que le
 * bilan restitue.
 *
 * Advance annonce « la ou les bonnes réponses » : toutes ses questions sont à
 * choix multiple, y compris celles qui n'ont qu'une bonne réponse, pour ne
 * rien dévoiler.
 */

const SOURCE = process.argv[2];
const SORTIE = process.argv[3];
if (!SOURCE || !SORTIE) {
  console.error("Usage : convertir-reponses-maths.mjs <reponses.xlsx> <dossier-sortie>");
  process.exit(1);
}
const PERIODE = process.env.PERIODE ?? "NOEL26";

const COLONNES = [
  "id_question", "epreuve_id", "ordre", "bloc_id", "type", "enonce_commun", "enonce",
  "proposition_a", "proposition_b", "proposition_c", "proposition_d", "proposition_e",
  "cle", "points", "chapitre", "sous_chapitre", "notions", "travail_a_realiser", "methode",
  "auto_correction", "retroaction", "fichier_image", "statut_extraction", "commentaire",
];

const txt = (v) => String(v ?? "").replace(/\s+/g, " ").trim();
const ROMAINS = { I: 1, II: 2, III: 3, IV: 4, V: 5, VI: 6, VII: 7, VIII: 8 };
const classeur = XLSX.read(readFileSync(SOURCE), { type: "buffer" });
const lignesDe = (feuille) =>
  XLSX.utils.sheet_to_json(classeur.Sheets[feuille], { header: 1, defval: "", raw: false });

/**
 * Ce que le bilan restitue : le chapitre est à la fois le domaine et l'unité
 * d'analyse ; la notion ou méthode à reprendre devient « à reprendre ».
 */
const pedagogie = (chapitre, notion) => ({
  chapitre: txt(chapitre) || "Mathématiques",
  sous_chapitre: txt(chapitre) || "Mathématiques",
  notions: "",
  travail_a_realiser: txt(notion),
  methode: "",
});

const sortie = [];
const ligne = (champs) =>
  sortie.push({
    enonce_commun: "",
    proposition_a: "", proposition_b: "", proposition_c: "", proposition_d: "", proposition_e: "",
    points: "",
    auto_correction: "OUI",
    fichier_image: "",
    statut_extraction: "OK",
    commentaire: "Clé et chapitre : classeur « Réponses et références chapitres » (Noël 2026).",
    ...champs,
  });

// --- Avenir et Advance : une question, une image -----------------------------
for (const [feuille, prefixe, propositions, type] of [
  ["AVENIR", `AV-MAT-${PERIODE}`, ["A", "B", "C", "D"], "choix_unique"],
  ["ADVANCE", `ADV-MAT-${PERIODE}`, ["A", "B", "C", "D", "E"], "choix_multiple"],
]) {
  for (const l of lignesDe(feuille).slice(1)) {
    const cellules = l.map(txt);
    // La première colonne de la feuille Avenir est vide : on cherche le numéro.
    const i = cellules.findIndex((c) => /^\d+$/.test(c));
    if (i < 0) continue;
    const [numero, reponse, chapitre, notion] = cellules.slice(i, i + 4);
    const n = Number(numero);
    const cle = reponse.toUpperCase().split(/[\s,;/]+/).filter(Boolean).join(";");
    ligne({
      id_question: `${prefixe}-Q${String(n).padStart(2, "0")}`,
      epreuve_id: prefixe,
      ordre: String(n),
      bloc_id: "",
      type,
      enonce: `Question ${n} du sujet.`,
      ...Object.fromEntries(propositions.map((x) => [`proposition_${x.toLowerCase()}`, x])),
      cle,
      ...pedagogie(chapitre, notion),
      retroaction: `Bonne${cle.includes(";") ? "s" : ""} réponse${cle.includes(";") ? "s" : ""} : ${cle.replace(/;/g, ", ")}.`,
      fichier_image: `${prefixe}-${String(n).padStart(2, "0")}.png`,
    });
  }
}

/**
 * Puissance Alpha, exercices 13 à 16 (maths complémentaires) : le classeur ne
 * donne pas leurs réponses. Établies le 27/11/2026 en résolvant le sujet ; à
 * valider par le professeur. Le calcul de chacune, pour la relecture :
 *   13a F — f′ = (e⁵ˣ − 3e³ˣ − 2e²ˣ)/(e²ˣ − 1)², pas « + 3e³ˣ ».
 *   13b V — numérateur e²ˣ(eˣ + 1)²(eˣ − 2), dénominateur (eˣ − 1)²(eˣ + 1)².
 *   13c V — f′(x) = 0 ⇔ eˣ = 2.
 *   13d F — f(x) = −1 ⇔ e³ˣ + e²ˣ = 0 : aucune solution.
 *   14a V — y = −x² − 25 est paire.
 *   14b F — m = 9 : (x + 5)² = 0, un seul point (tangence).
 *   14c F — une solution ⇔ (m + 1)² = 100 ⇔ m = 9 ou m = −11.
 *   14d V — sur ]−11 ; 9[, (m + 1)² < 100 : discriminant négatif.
 *   15a F — Γ₁ tend vers +∞ en 0 : c'est g (f tend vers −∞).
 *   15b V — f(√e) = √e + 1/√e + ½e⁻¹.
 *   15c V — g′ = (3x³ − x − 2)/x = (x − 1)(3x² + 3x + 2)/x et f′ = g/x³.
 *   15d V — g′(x) = −1 ⇔ x³ = 2/3 : une seule solution positive.
 *   16a V — [n(n − 1) + 20]/((n + 4)(n + 5)).
 *   16b V — 5n/((n + 5)(n + 4)) dans les deux ordres.
 *   16c F — E = 10(n² − 8n + 10)/((n + 4)(n + 5)).
 *   16d V — n ≥ 1 est toujours vrai (n non nul) : l'implication l'est aussi.
 */
const REPONSES_ETABLIES = {
  13: "FVVF",
  14: "VFFV",
  15: "FVVV",
  16: "VVFV",
};

// --- Vrai/faux par exercice : Puissance Alpha et QCM GEIPI ---------------------
function affirmation({ prefixe, exercice, lettre, rang, reponse, chapitre, notion, poids = "", commentaire }) {
  const bloc = `${prefixe}-EX${String(exercice).padStart(2, "0")}`;
  const vrai = /^V/i.test(reponse);
  ligne({
    id_question: `${bloc}${lettre.toLowerCase()}`,
    epreuve_id: prefixe,
    ordre: `${exercice}.${rang}`,
    bloc_id: bloc,
    type: "vrai_faux",
    enonce:
      rang === 1
        ? `Exercice ${exercice}, affirmation ${lettre} : vraie ou fausse ?`
        : `Affirmation ${lettre} : vraie ou fausse ?`,
    cle: vrai ? "VRAI" : "FAUX",
    points: poids,
    ...pedagogie(chapitre, notion),
    retroaction: `L'affirmation ${lettre} est ${vrai ? "vraie" : "fausse"}.`,
    // L'exercice entier s'affiche une fois, en tête de sa première affirmation.
    fichier_image: rang === 1 ? `${bloc}.png` : "",
    ...(commentaire ? { commentaire } : {}),
  });
}

{
  const prefixe = `PA-MAT-${PERIODE}`;
  let exercice = 0;
  let rang = 0;
  for (const l of lignesDe("PUISSANCE ALPHA").slice(1)) {
    const [ex, lettre, reponse, chapitre, notion] = l.map(txt);
    if (/^Exercice\s+(\d+)/i.test(ex)) {
      exercice = Number(ex.match(/(\d+)/)[1]);
      rang = 0;
    }
    if (!lettre) continue;
    rang += 1;
    const etablie = !reponse && REPONSES_ETABLIES[exercice]?.[rang - 1];
    if (!reponse && !etablie) continue;
    affirmation({
      prefixe, exercice, lettre: lettre.toUpperCase(), rang, reponse: reponse || etablie, chapitre, notion,
      ...(etablie
        ? { commentaire: "Réponse absente du classeur, établie le 27/11/2026 en résolvant le sujet : à valider." }
        : {}),
    });
  }
}

const GE = `GE-MAT-${PERIODE}`;
{
  // Feuille à deux tableaux côte à côte : le QCM à gauche, la spécialité à droite.
  let exercice = 0;
  let rang = 0;
  for (const l of lignesDe("GEIPI POLYTECH").slice(1)) {
    const c = l.map(txt);
    if (/^Exercice\s+([IVX]+)/i.test(c[1])) {
      exercice = ROMAINS[c[1].match(/([IVX]+)/)[1]];
      rang = 0;
    }
    if (!c[2] || !c[3]) continue;
    rang += 1;
    // 40 points pour 24 affirmations, comme sur le sujet.
    affirmation({
      prefixe: GE, exercice, lettre: c[2].toUpperCase(), rang, reponse: c[3],
      chapitre: c[4], notion: c[5], poids: "1.67",
    });
  }
}

/**
 * Spécialité GEIPI : problèmes rédigés, corrigés à la main. Énoncés relevés sur
 * le sujet (page 4), réponses attendues établies le 27/11/2026 (la colonne
 * réponse du classeur renvoie à une photo). Points : 20 et 10, comme sur le
 * sujet, répartis par sous-question.
 */
const SPECIALITE = [
  ["1", "I-1-a", "Donner h(0). Le détail des calculs n'est pas attendu.", "h(0) = (1/f(0) − 1)·e⁰ = 2 − 1 = 1.", 2],
  ["1", "I-1-b", "Montrer que, pour tout nombre réel x, h′(x) = 0. Détailler les calculs.",
    "h′(x) = −f′(x)/f(x)²·e^(−x) − (1/f(x) − 1)·e^(−x) ; avec f′ = f² − f : −(f² − f)/f² = −1 + 1/f, d'où h′(x) = e^(−x)(−1 + 1/f − 1/f + 1) = 0.", 6],
  ["1", "I-1-c", "Que peut-on en déduire pour la fonction h ? Aucune justification n'est attendue.",
    "h est constante sur ℝ, égale à h(0) = 1.", 2],
  ["1", "I-1-d", "En déduire que, pour tout nombre réel x, f(x) = 1/(e^x + 1). Justifier la réponse.",
    "(1/f(x) − 1)·e^(−x) = 1, donc 1/f(x) = 1 + e^x, d'où f(x) = 1/(e^x + 1).", 5],
  ["1", "I-2", "Montrer que la fonction f définie par f(x) = 1/(e^x + 1) est bien solution du problème 𝒫.",
    "f est dérivable et ne s'annule pas sur ℝ (e^x + 1 > 0), f(0) = 1/2, et f′(x) = −e^x/(e^x + 1)² = f(x)² − f(x).", 5],
  ["2", "II-1", "Donner P_M(T), P_M(T̄), P_M̄(T) et P_M̄(T̄).", "P_M(T) = 9/10 ; P_M(T̄) = 1/10 ; P_M̄(T) = 1/5 ; P_M̄(T̄) = 4/5.", 4],
  ["2", "II-2", "Montrer que P(T) = 3/8. Justifier et détailler le calcul.",
    "Probabilités totales : P(T) = P(M)·P_M(T) + P(M̄)·P_M̄(T) = 1/4 × 9/10 + 3/4 × 1/5 = 9/40 + 6/40 = 3/8.", 3],
  ["2", "II-3", "Calculer P_T(M). Justifier et détailler le calcul.", "P_T(M) = P(M ∩ T)/P(T) = (9/40)/(3/8) = 3/5.", 3],
];
{
  const pedagogieSpe = new Map();
  for (const l of lignesDe("GEIPI POLYTECH").slice(1)) {
    const c = l.map(txt);
    const question = c[9]?.replace(/^([IV]+)-?(\d)([a-d])?$/i, (_, r, n, s) => `${r}-${n}${s ? `-${s}` : ""}`);
    if (question) pedagogieSpe.set(question, { chapitre: c[11], notion: c[12] });
  }
  const rangs = {};
  for (const [exercice, code, enonce, attendu, points] of SPECIALITE) {
    rangs[exercice] = (rangs[exercice] ?? 0) + 1;
    const bloc = `${GE}-SPE${exercice}`;
    const p = pedagogieSpe.get(code) ?? { chapitre: "", notion: "" };
    ligne({
      id_question: `${GE}-SPE-${code}`,
      epreuve_id: GE,
      ordre: `${8 + Number(exercice)}.${rangs[exercice]}`,
      bloc_id: bloc,
      type: "redaction",
      enonce: `${code} — ${enonce}`,
      cle: "",
      points: String(points),
      ...pedagogie(p.chapitre, p.notion),
      auto_correction: "NON",
      retroaction: `Réponse attendue : ${attendu}`,
      fichier_image: rangs[exercice] === 1 ? `${GE}-EX0${exercice}-2.png` : "",
      commentaire: "Réponse attendue établie le 27/11/2026 (le classeur renvoie à une photo) : à valider.",
    });
  }
}

mkdirSync(SORTIE, { recursive: true });
const sortieXlsx = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(sortieXlsx, XLSX.utils.json_to_sheet(sortie, { header: COLONNES }), "questions");
const fichier = join(SORTIE, `MATHS-${PERIODE}.xlsx`);
writeFileSync(fichier, XLSX.write(sortieXlsx, { type: "buffer", bookType: "xlsx" }));

const parEpreuve = {};
for (const l of sortie) {
  const e = (parEpreuve[l.epreuve_id] ??= {});
  e[l.type] = (e[l.type] ?? 0) + 1;
}
for (const [id, types] of Object.entries(parEpreuve)) console.log(id.padEnd(16), JSON.stringify(types));
console.log(`\nTOTAL : ${sortie.length} questions → ${fichier}`);
