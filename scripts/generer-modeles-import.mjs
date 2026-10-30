/**
 * Génère les modèles d'import vierges, avec leur nomenclature.
 *
 *   node scripts/generer-modeles-import.mjs <dossier-de-sortie>
 *
 * Deux fichiers : la liste d'une cohorte et les questions d'épreuves
 * blanches. Chacun porte les en-têtes exacts que l'import attend, une
 * deuxième ligne qui explique quoi mettre dans chaque colonne, puis un
 * exemple rempli.
 *
 * La ligne de nomenclature n'est pas un commentaire décoratif : l'import la
 * reconnaît et l'ignore, pour qu'on puisse la laisser en place en remplissant
 * le fichier.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import * as XLSX from "xlsx";

const SORTIE = process.argv[2];
if (!SORTIE) {
  console.error("Usage : node scripts/generer-modeles-import.mjs <dossier-de-sortie>");
  process.exit(1);
}
mkdirSync(SORTIE, { recursive: true });

/** Construit une feuille à partir d'un tableau de lignes. */
function feuille(lignes, largeurs) {
  const f = XLSX.utils.aoa_to_sheet(lignes);
  f["!cols"] = largeurs.map((w) => ({ wch: w }));
  return f;
}

const ecrire = (classeur, nom) => {
  const chemin = join(SORTIE, nom);
  writeFileSync(chemin, XLSX.write(classeur, { type: "buffer", bookType: "xlsx" }));
  console.log(`  ${chemin}`);
};

// ---------------------------------------------------------------------------
// 1. Liste d'une cohorte
// ---------------------------------------------------------------------------
const COHORTE = [
  ["nom", "prenom", "email", "email_parent", "telephone_parent", "ville", "etablissement"],
  [
    "OBLIGATOIRE — nom de famille de l'élève",
    "OBLIGATOIRE — prénom",
    "OBLIGATOIRE — adresse de l'élève, une seule, unique dans le fichier",
    "Adresse d'un parent. Le bilan de session y est envoyé en plus de l'élève. Laisser vide si aucune.",
    "Téléphone d'un parent, format libre (06 12 34 56 78).",
    "Ville de l'élève. Facultatif.",
    "Lycée ou établissement d'origine. Facultatif.",
  ],
  [
    "Durand",
    "Camille",
    "camille.durand@exemple.fr",
    "parent.durand@exemple.fr",
    "06 12 34 56 78",
    "Paris",
    "Lycée de la Trinité",
  ],
];

const LISEZ_MOI_COHORTE = [
  ["MODÈLE D'IMPORT — LISTE D'UNE COHORTE"],
  [],
  ["Où l'importer : back-office → Prépa → ouvrir la cohorte → import de la liste."],
  [],
  ["Une ligne = un élève, à partir de la ligne 3. La ligne 2 explique chaque"],
  ["colonne : laissez-la en place, l'import la reconnaît et l'ignore."],
  [],
  ["La feuille « Exemple » montre une ligne remplie. L'import ne lit que la"],
  ["première feuille, « Élèves » : rien de ce qui est à côté ne sera importé."],
  [],
  ["Trois colonnes sont obligatoires : nom, prenom, email. Les autres peuvent"],
  ["rester vides."],
  [],
  ["Ce que fait l'import :"],
  ["  · un compte existant avec cette adresse est rattaché à la cohorte, jamais recréé ;"],
  ["  · un compte absent est créé, puis invité par email à choisir son mot de passe."],
  ["    Aucun mot de passe n'est transmis ni connu de l'administration."],
  [],
  ["Analysez d'abord : le bouton « Analyser » produit le même rapport que"],
  ["l'import, sans rien écrire. Les lignes en anomalie sont écartées, les autres"],
  ["passent."],
  [],
  ["⚠ Ce fichier contient des données personnelles de mineurs. Il ne doit pas"],
  ["être déposé dans un dépôt de code ni partagé hors de l'équipe pédagogique."],
];

const LARGEURS_COHORTE = [18, 16, 34, 34, 22, 16, 26];

const classeurCohorte = XLSX.utils.book_new();
// Feuille 1 : celle que l'import lit. En-têtes et nomenclature seulement —
// l'exemple vit à côté, pour qu'on ne risque pas de l'importer par oubli.
XLSX.utils.book_append_sheet(
  classeurCohorte,
  feuille(COHORTE.slice(0, 2), LARGEURS_COHORTE),
  "Élèves",
);
XLSX.utils.book_append_sheet(
  classeurCohorte,
  feuille([COHORTE[0], COHORTE[2]], LARGEURS_COHORTE),
  "Exemple",
);
XLSX.utils.book_append_sheet(classeurCohorte, feuille(LISEZ_MOI_COHORTE, [100]), "Lisez-moi");

// ---------------------------------------------------------------------------
// 2. Questions d'épreuves blanches
// ---------------------------------------------------------------------------
const QUESTIONS = [
  [
    "id_question", "epreuve_id", "ordre", "type", "bloc_id", "enonce_commun", "enonce",
    "proposition_a", "proposition_b", "proposition_c", "proposition_d", "proposition_e",
    "proposition_f", "cle", "points", "chapitre", "sous_chapitre", "notions",
    "travail_a_realiser", "auto_correction", "retroaction", "fichier_image",
    "document_associe", "statut_extraction",
  ],
  [
    "OBLIGATOIRE — identifiant unique et stable. Sert de clé de mise à jour : réimporter le même id corrige la question au lieu d'en créer une.",
    "OBLIGATOIRE — identifiant de l'épreuve. Forme <CONCOURS>-<MATIÈRE>-<SESSION> : AV, GE, PA, ADV, SES, ACC pour le concours ; MAT, ANG, SCI, PHY, NSI, SI, SVT, EC, DIG, FR, DE, ES, ADOC, SYN, LOG pour la matière. Exemple : AV-MAT-TOUS26.",
    "OBLIGATOIRE — position dans l'épreuve, tri numérique. 12 = question 12 ; 12.2 = deuxième sous-question de la question 12. La partie entière regroupe les sous-questions pour la notation.",
    "OBLIGATOIRE — choix_unique | choix_multiple | vrai_faux | redaction",
    "Identifiant d'exercice, pour les questions liées (affirmations d'un même exercice, cases d'une question à trous). Vide = question isolée.",
    "Énoncé partagé par tout le bloc, à ne remplir que sur sa première ligne.",
    "Énoncé propre à la question. Peut rester vide si l'énoncé est porté par l'image.",
    "Texte de la proposition A. Vide si les propositions sont dans l'image.",
    "Proposition B.", "Proposition C.", "Proposition D.",
    "Proposition E, si l'épreuve en compte cinq.", "Proposition F, si besoin.",
    "La bonne réponse. choix_unique : une lettre (B). choix_multiple : lettres séparées par un point-virgule (A;C). vrai_faux : VRAI ou FAUX. redaction : laisser vide.",
    "Pondération de la question. 1 par défaut. Le barème (+3/−1…) se règle sur l'épreuve, pas ici.",
    "OBLIGATOIRE — chapitre du référentiel. Alimente l'analyse par chapitre du bilan.",
    "Sous-chapitre. Facultatif.",
    "Notions évaluées. Facultatif.",
    "Action à proposer à l'élève s'il échoue sur ce chapitre. Reprise telle quelle dans « À travailler en priorité » du bilan.",
    "OUI | NON. NON envoie la question en correction manuelle (rédaction, synthèse). Vide = OUI.",
    "Explication affichée à la correction.",
    "Nom du fichier image dans le zip joint. Exemple : AV-MAT-TOUS26-Q02.png",
    "Document support, séparés par « | » s'il y en a plusieurs. Exemple : corpus-adoc/adoc-18.jpg",
    "OK = prête à publier. Toute autre valeur, ou vide, envoie la question en file de relecture.",
  ],
  [
    "AV-MAT-TOUS26-1", "AV-MAT-TOUS26", "1", "choix_unique", "", "",
    "Soit (Uₙ) une suite géométrique telle que U₁ = 3 et U₂ = 9. Déterminer la raison de (Uₙ).",
    "-6", "3", "12", "6", "", "", "B", "1", "Suites", "Suite géométrique",
    "Raison q = u₂/u₁",
    "Refaire trois exercices sur la raison d'une suite géométrique.",
    "OUI", "Bonne réponse : B. q = U₂/U₁ = 9/3 = 3.", "", "", "OK",
  ],
  [
    "PA-MAT-TOUS26-1-A", "PA-MAT-TOUS26", "1.01", "vrai_faux", "PA-MAT-TOUS26-EX01",
    "Exercice fondamental — Les bases du calcul",
    "(2x − 1)² × (4x + 1) = 16x³ + 4x² − 4x − 1",
    "", "", "", "", "", "", "FAUX", "1", "Calcul littéral", "Identités remarquables",
    "Développement", "Développer pas à pas un produit de polynômes.", "OUI",
    "Développer (2x−1)² puis multiplier par (4x+1) : le résultat diffère.", "", "", "OK",
  ],
];

const LISEZ_MOI_QUESTIONS = [
  ["MODÈLE D'IMPORT — QUESTIONS D'ÉPREUVES BLANCHES"],
  [],
  ["Où l'importer : back-office → Prépa → Import de questions."],
  [],
  ["Une ligne = une question, à partir de la ligne 3. La ligne 2 explique chaque"],
  ["colonne : laissez-la en place, l'import la reconnaît et l'ignore."],
  [],
  ["La feuille « Exemple » montre deux lignes remplies, dont une sous-question"],
  ["de bloc. L'import ne lit que la première feuille, « Questions »."],
  [],
  ["Enregistrer en .xlsx, ou en CSV UTF-8 séparé par des points-virgules."],
  [],
  ["Images : les joindre dans un zip au moment de l'import. La colonne"],
  ["fichier_image porte le nom du fichier, pas son chemin complet."],
  [],
  ["Mise à jour : réimporter un id_question déjà connu met la question à jour."],
  ["Une question déjà relue et publiée garde son statut, seul son contenu change."],
  [],
  ["Analysez d'abord : le bouton « Analyser » produit le même rapport que"],
  ["l'import, sans rien écrire."],
  [],
  ["Ce qui bloque une ligne : identifiant manquant ou en double, type inconnu,"],
  ["chapitre vide, clé incohérente avec le type ou désignant une proposition"],
  ["absente, image référencée mais absente du zip."],
];

const LARGEURS_QUESTIONS = [22, 18, 8, 15, 22, 28, 46, 18, 18, 18, 18, 14, 14, 10, 8, 22, 20, 20, 32, 16, 40, 24, 24, 18];

const classeurQuestions = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(
  classeurQuestions,
  feuille(QUESTIONS.slice(0, 2), LARGEURS_QUESTIONS),
  "Questions",
);
XLSX.utils.book_append_sheet(
  classeurQuestions,
  feuille([QUESTIONS[0], QUESTIONS[2], QUESTIONS[3]], LARGEURS_QUESTIONS),
  "Exemple",
);
XLSX.utils.book_append_sheet(classeurQuestions, feuille(LISEZ_MOI_QUESTIONS, [100]), "Lisez-moi");

console.log("Modèles générés :");
ecrire(classeurCohorte, "modele-cohorte-eleves.xlsx");
ecrire(classeurQuestions, "modele-questions-concours-blancs.xlsx");
