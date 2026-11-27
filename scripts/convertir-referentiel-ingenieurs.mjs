import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import * as XLSX from "xlsx";

/**
 * Référentiel des concours blancs ingénieurs → fichier d'import Parkours (§3).
 *
 *   node scripts/convertir-referentiel-ingenieurs.mjs <referentiel.csv> <dossier-sortie> \
 *        [ÉPREUVE…] [--sujet ÉPREUVE=premiere-derniere …]
 *
 * Sans liste d'épreuves, toutes sont converties ; sinon seulement celles
 * nommées par leur identifiant (AV-NSI-NOEL26…).
 *
 * `--sujet AV-PHY-NOEL26=2-17` sert les pages 2 à 17 du sujet comme dossier
 * de l'épreuve, affiché à côté des questions pendant toute la composition
 * (images `AV-PHY-NOEL26-page-02.png`…, fournies dans le zip d'import). Les
 * sujets scientifiques en ont besoin : leurs formules, leurs données et leurs
 * figures sont des images dans le PDF, que la transcription a perdues. Une
 * question dont le texte a perdu ses formules renvoie alors au sujet, page
 * citée, et ses propositions deviennent les lettres A à D.
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
const options = process.argv.slice(4);
const SUJETS = new Map();
for (let i = 0; i < options.length; i++) {
  if (options[i] !== "--sujet") continue;
  const [id, plage] = String(options[i + 1] ?? "").split("=");
  const [premiere, derniere] = (plage ?? "").split("-").map(Number);
  if (!id || !premiere || !derniere) {
    console.error(`--sujet ${options[i + 1]} : attendu ÉPREUVE=premiere-derniere`);
    process.exit(1);
  }
  SUJETS.set(id.toUpperCase(), Array.from({ length: derniere - premiere + 1 }, (_, k) => premiere + k));
  options.splice(i, 2);
  i -= 1;
}
const RETENUES = new Set(options.map((x) => x.toUpperCase()));
const pageSujet = (epreuveId, n) => `${epreuveId}-page-${String(n).padStart(2, "0")}.png`;
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

/**
 * Clés vérifiées sur le sujet (27/11/2026). Le référentiel marquait « À
 * REVOIR » toute question dont il n'avait pas pu lire les formules ; chaque
 * question de ces épreuves a été refaite à partir du PDF. Le doute levé, le
 * statut ne bloque plus.
 */
const CLES_VERIFIEES = new Set([`AV-PHY-${PERIODE}`, `PA-PHY-${PERIODE}`]);

/**
 * Clés fausses dans le référentiel, et pourquoi. L'auteur ne voyait pas la
 * figure du pendule : l'axe y y est orienté vers le bas. Les retours par
 * proposition, écrits pour la mauvaise clé, sont écartés ; la correction est
 * réécrite.
 */
const CLES_CORRIGEES = {
  "AVE-PC-14": ["A", "L'axe y est orienté vers le bas (figure) : le poids, vertical descendant, s'écrit Px = 0 ; Py = +mg."],
  "AVE-PC-15": ["B", "La tension est dirigée de S vers O. Avec S en (−l sin α ; l cos α) et y vers le bas : Tx = T sin α = T cos(π/2 − α) et Ty = −T cos α = −T sin(π/2 − α)."],
  "AVE-PC-16": ["D", "Entre la position initiale et la verticale de O, l'acrobate descend de l − l cos α : W(P) = mgl(1 − cos α), positif car le poids est moteur."],
  "AVE-PC-19": ["C", "Mouvement circulaire uniforme : a = v²/l, donc v = √(a·l) = √(10 × 4,9) = 7 m·s⁻¹."],
};

/**
 * Le sujet Avenir numérote deux questions « 33 » : le référentiel a décalé la
 * suite d'un rang. L'élève doit retrouver la question sur la page, sous le
 * numéro du sujet.
 */
const NUMERO_DU_SUJET = {
  "AVE-PC-34": "33 (la seconde)",
  "AVE-PC-35": "34",
  "AVE-PC-36": "35",
  "AVE-PC-37": "36",
  "AVE-PC-38": "37",
  "AVE-PC-39": "38",
  "AVE-PC-40": "39",
};

/** La dernière question du sujet Avenir, absente du référentiel à cause du décalage. */
const QUESTIONS_AJOUTEES = [
  {
    depuis: "AVE-PC-40",
    "ID question": "AVE-PC-41",
    "N° question": "41",
    "Page du PDF": "16",
    numeroSujet: "40",
    "Énoncé / propositions transcrits": "40- L’expression de l’intensité du courant dans le circuit lors de sa décharge est alors : A) B) C) D)",
    "Réponse de référence": "C",
    correction:
      "Réponse C. Pendant la décharge, i = C·dUC/dt' = −(E/R')·e^(−t'/R'C) : le courant circule en sens inverse de celui de la charge, d'où le signe moins.",
  },
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

for (const ajout of QUESTIONS_AJOUTEES) {
  const modele = lignes.find((l) => txt(l["ID question"]) === ajout.depuis);
  if (!modele) continue;
  const { depuis: _depuis, numeroSujet, correction, ...champs } = ajout;
  void _depuis;
  lignes.push({
    ...modele,
    ...champs,
    "Contrôle / statut": "CONCORDANT / DOCUMENTÉ",
    "Feedback général élève": correction,
    ...Object.fromEntries(["A", "B", "C", "D", "E"].map((x) => [`Feedback réponse ${x}`, ""])),
    __numeroSujet: numeroSujet,
  });
}

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
  const correctionCle = CLES_CORRIGEES[id];
  const reponse = correctionCle ? correctionCle[0] : txt(l["Réponse de référence"]);
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

  // Avec le sujet en dossier, une formule perdue n'empêche plus de servir la
  // question : l'élève la lit sur la page. Restent les doutes sur la clé.
  const pages = SUJETS.get(epreuveId);
  const formulesPerdues =
    txt(l["Formules / schémas"]).startsWith("OUI") ||
    (type === "choix_unique" && nbPropositions < 2);
  const renvoiAuSujet = Boolean(pages) && formulesPerdues && type !== "redaction";

  // Ce qui empêche de servir la question telle quelle.
  const motifs = [];
  if (statut !== "CONCORDANT / DOCUMENTÉ" && !CLES_VERIFIEES.has(epreuveId)) {
    motifs.push(`Référentiel : ${statut}.`);
  }
  if (!reponse) motifs.push("Pas de réponse de référence.");
  if (!pages && type === "choix_unique" && nbPropositions < 2) {
    motifs.push("Propositions perdues à la transcription (formules du PDF) : à compléter.");
  }
  if (!pages && txt(l["Formules / schémas"]).startsWith("OUI")) {
    motifs.push("Formules ou figures à contrôler sur le PDF.");
  }
  const point = txt(l["Point à contrôler"]);
  if (point && !CLES_VERIFIEES.has(epreuveId)) motifs.push(point);
  const servable = motifs.length === 0;
  if (!servable) reserves.push(`${id} — ${motifs.join(" ")}`);

  // Une question QCM dont les propositions ont disparu garde quatre cases à
  // compléter en relecture : l'import refuse une question sans propositions.
  // Une question renvoyée au sujet se répond par sa lettre, autant de lettres
  // que le sujet propose (quatre au moins).
  const lettres = ["A", "B", "C", "D", "E"].slice(0, Math.max(4, nbPropositions));
  const propositionsServies = renvoiAuSujet
    ? ["A", "B", "C", "D", "E"].map((x) => (lettres.includes(x) ? x : ""))
    : type === "choix_unique" && nbPropositions < 2
      ? ["(à compléter)", "(à compléter)", "(à compléter)", "(à compléter)", ""]
      : propositions;
  const page = txt(l["Page du PDF"]);
  // Le début de l'énoncé, avant les propositions et sans son numéro, guide
  // l'élève ; les formules qu'il a perdues sont sur la page citée.
  const numeroSujet = l.__numeroSujet ?? NUMERO_DU_SUJET[id] ?? numero;
  // La transcription recopie les propositions à la suite de l'énoncé : elles
  // ont leurs propres colonnes, et l'écran les affiche déjà en boutons.
  const amorce = txt(l["Énoncé / propositions transcrits"])
    .split(/\s+A[.)]\s/)[0]
    .replace(/^\d+\s*[-–.)]\s*/, "");
  const ouEstCe = `${page ? `page ${page}` : "le sujet"}`;
  const enonce = !renvoiAuSujet
    ? nbPropositions >= 2
      ? amorce
      : txt(l["Énoncé / propositions transcrits"])
    : type === "vrai_faux"
      ? // L'affirmation transcrite a perdu ses valeurs, et emporte souvent le
        // texte de l'affirmation suivante : on la lit sur le sujet.
        `Exercice ${exercice}, affirmation ${sous} — dans le sujet, ${ouEstCe}. Vraie ou fausse ?`
      : `Question ${numeroSujet} du sujet, ${ouEstCe} — ${amorce} (formules et propositions dans le sujet)`;

  const retours = correctionCle
    ? ["", "", "", "", ""]
    : type === "vrai_faux"
      ? [txt(l["Feedback Vrai"]), txt(l["Feedback Faux"]), "", "", ""]
      : ["A", "B", "C", "D", "E"].map((x) => retourPropre(l[`Feedback réponse ${x}`]));

  const correction = correctionCle
    ? `Réponse ${correctionCle[0]}. ${correctionCle[1]}`
    : txt(l["Feedback général élève"]);
  const ligne = {
    id_question: id,
    epreuve_id: epreuveId,
    ordre,
    bloc_id: blocId,
    type,
    enonce_commun: "",
    enonce,
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
    // La réponse attendue d'un problème rédigé, sauf si la correction la
    // donne déjà.
    retroaction:
      redigee && !correction.includes(reponse)
        ? `Réponse attendue : ${reponse}. ${correction}`.trim()
        : correction,
    retroaction_a: retours[0],
    retroaction_b: retours[1],
    retroaction_c: retours[2],
    retroaction_d: retours[3],
    retroaction_e: retours[4],
    fichier_image: "",
    document_associe: pages ? pages.map((n) => pageSujet(epreuveId, n)).join("|") : "",
    statut_extraction: servable ? "OK" : "À VÉRIFIER",
    commentaire: [
      ...motifs,
      CLES_VERIFIEES.has(epreuveId) ? "Clé vérifiée sur le sujet le 27/11/2026." : "",
      correctionCle ? `Clé corrigée (référentiel : ${txt(l["Réponse de référence"])}).` : "",
    ]
      .filter(Boolean)
      .join(" "),
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
