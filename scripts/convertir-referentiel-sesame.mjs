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

/**
 * Période de la campagne, qui entre dans l'identifiant des épreuves.
 *
 * La nomenclature retenue est PÉRIODE ANNÉE CONCOURS MATIÈRE — « NOËL 26
 * SÉSAME FRANÇAIS » — et l'identifiant la porte : `SES-FR-NOEL26`. Sans elle,
 * deux campagnes d'une même matière partageaient un identifiant et se
 * retrouvaient mélangées dans la banque, ce qui est arrivé.
 */
const PERIODE = process.env.PERIODE ?? "NOEL26";

const MATIERES = {
  "FRANÇAIS": { code: "FR", fichier: "francais" },
  "ANGLAIS": { code: "ANG", fichier: "anglais" },
  "MATHÉMATIQUES": { code: "MAT", fichier: "mathematiques" },
  "COMPÉTENCES DIGITALES": { code: "DIG", fichier: "competences-digitales" },
  "ANALYSE DOCUMENTAIRE": { code: "ADOC", fichier: "analyse-documentaire" },
  "ALLEMAND": { code: "DE", fichier: "lv2-allemand" },
  "ESPAGNOL": { code: "ES", fichier: "lv2-espagnol" },
};

const EPREUVES = Object.fromEntries(
  Object.entries(MATIERES).map(([feuille, m]) => [
    feuille,
    {
      id: `SES-${m.code}-${PERIODE}`,
      fichier: `SES-${m.code}-${PERIODE}-${m.fichier}`,
    },
  ]),
);

/**
 * Épreuves dont le sujet est découpé en une capture par question.
 *
 * Aucune pour l'instant. L'analyse documentaire en a eu, le temps que sa
 * transcription soit complète ; elles faisaient double emploi avec les
 * propositions servies en texte cliquable, et l'élève lisait deux fois la
 * même chose sans pouvoir cliquer sur la version imprimée.
 *
 * Une capture ne se justifie que lorsqu'un énoncé ne peut pas se transcrire —
 * une figure, un tableau. Et comme elle porte aussi les propositions, il faut
 * alors l'amputer de celles-ci, ce que les blancs du sujet ne permettent pas
 * de faire au jugé : ce sera un découpage à la main.
 */
const CAPTURES = new Set();

/**
 * Passages que le référentiel désigne sans les porter.
 *
 * Certaines cellules « Document / encart associé » ne contiennent qu'une
 * référence — « Texte commun Q5-Q6 » — là où d'autres portent le passage en
 * entier. Sans le texte, les deux questions seraient posées à l'élève sans ce
 * sur quoi elles portent : « Selon le texte, la lecture est aujourd'hui… ».
 * Le passage est donc relevé dans le sujet et fourni ici, à l'identique.
 */
const PASSAGES_SUPPLEES = {
  "FRANÇAIS": {
    "Texte commun Q5-Q6":
      "Pendant longtemps, la lecture a été perçue comme l’activité culturelle par " +
      "excellence, symbole d’instruction, de distinction sociale et de plaisir " +
      "intellectuel. Aujourd’hui encore, elle demeure largement admirée ; mais elle " +
      "semble aussi concurrencée par des pratiques numériques de plus en plus " +
      "envahissantes. Beaucoup de jeunes lisent différemment, par fragments, sur des " +
      "écrans, dans un univers où les images, les vidéos et les flux d’informations " +
      "rapides dominent. Pourtant, les études montrent que la lecture prolongée " +
      "développe une attention plus profonde, une capacité d’analyse et une " +
      "sensibilité particulière au langage. L’enjeu n’est donc pas d’opposer lecture " +
      "« traditionnelle » et pratiques numériques, mais de comprendre comment elles " +
      "peuvent coexister sans que l’une n’appauvrisse l’autre.",
  },
};

/**
 * Énoncés dont la mise en page a été aplatie par le référentiel.
 *
 * Un algorithme se lit sur plusieurs lignes : l'indentation d'une boucle est
 * ce qui permet de voir combien de fois elle tourne. Recopié sur une seule
 * ligne — « N ← 0 POUR i DE 1 À 4 FAIRE N ← N + 3 FIN POUR » — il reste exact
 * mais demande à l'élève de le remettre en forme de tête avant de pouvoir y
 * répondre, ce que le sujet papier ne lui demandait pas.
 *
 * Le texte est repris du sujet, saut de ligne compris ; l'affichage respecte
 * les retours (`whitespace-pre-line`).
 */
const ENONCES_STRUCTURES = {
  "SES-SQ1-DIG-Q06":
    "Après exécution de l’algorithme suivant, quelle valeur sera affichée ?\n" +
    "N ← 0\n" +
    "POUR i DE 1 À 4 FAIRE\n" +
    "    N ← N + 3\n" +
    "FIN POUR",
  // Texte à trous : seul le visuel du sujet le portait, et la consigne
  // annonce déjà les repères X, Y et Z.
  "SES-CB1-AD-Q19":
    "Complétez la conclusion ci-dessous avec les termes appropriés (X, Y et Z) dans le texte de synthèse." +
    "\n" +
    "« En définitive, la modernité repose largement sur l’idée que X est émancipateur par le temps " +
    "qu’il permet de libérer grâce aux gains de productivité. Or, cette idée semble largement Y par " +
    "la sensation qu’éprouvent un grand nombre de nos contemporains de « manquer de temps », voire " +
    "d’être « pressé par le temps ». C’est la raison pour laquelle des initiatives en faveur d’un Z " +
    "entre « rapidité » et « lenteur » sont apparues. L’objectif est de redevenir « maître de son " +
    "temps de vie », source de « liberté individuelle » et de sérénité. »",
  "SES-SQ1-DIG-Q19":
    "Quelle valeur sera affichée par cet algorithme ?\n" +
    "resultat ← 1\n" +
    "POUR i DE 1 À 3 FAIRE\n" +
    "    resultat ← resultat × 2\n" +
    "FIN POUR",
};

/**
 * Remet à la ligne les éléments d'un énoncé qui énumère.
 *
 * Une cellule de tableur n'a pas de retour à la ligne : une question qui
 * propose quatre phrases numérotées en arrive d'un seul tenant, et l'élève
 * doit la redécouper des yeux avant de pouvoir y répondre — quand le sujet
 * papier les présente l'une sous l'autre. On insère les retours sans réécrire
 * le texte, apostrophes typographiques comprises.
 *
 * Deux marqueurs seulement, et jamais « 1) » : en mathématiques, un couple de
 * coordonnées « (0 ; 3) et (2 ; 7) » en a l'apparence sans être une
 * énumération.
 */
function aerer(texte) {
  if (texte.includes("\n")) return texte;

  const numerotee = texte.replace(/\s+([1-9]-\s)/g, "\n$1");
  if ((numerotee.match(/\n[1-9]-\s/g) ?? []).length >= 2) return numerotee;

  const tiretee = texte.replace(/\s+-\s(?=[A-ZÀ-ÜÉÈÊ«“"])/g, "\n- ");
  if ((tiretee.match(/\n- /g) ?? []).length >= 2) return tiretee;

  return texte;
}

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
  "cle", "points", "chapitre", "sous_chapitre", "notions", "travail_a_realiser", "methode",
  "retroaction", "retroaction_a", "retroaction_b", "retroaction_c", "retroaction_d",
  "fichier_image", "document_associe", "statut_extraction", "commentaire",
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
  if (!defaut) return { applique: null, cle: null, reecrite: null };

  const c = defaut.correction;
  const citation = /[«"]\s*([^»"]+?)\s*[»"]/;
  const applique = [];
  let cle = defaut.prevue.replace(/AUCUNE/i, "").trim().toUpperCase();
  let reecrite = null;

  const proposition = c.match(/Remplacer\s+([A-F])\s+par\s*[«"]\s*([^»"]+?)\s*[»"]/i);
  if (proposition) {
    const lettre = proposition[1].toUpperCase();
    ligne[`Réponse ${lettre}`] = proposition[2];
    applique.push(`proposition ${lettre} réécrite`);
    reecrite = lettre;
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

  return {
    applique: applique.length ? applique.join(" et ") : null,
    cle: cle || null,
    reecrite,
  };
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
  const suppleements = PASSAGES_SUPPLEES[feuille] ?? {};
  if (feuille !== "ANALYSE DOCUMENTAIRE") {
    for (const l of lignes) {
      const doc = txt(l["Document / encart associé"]);
      if (!doc || passages.has(doc)) continue;
      // Soit la cellule porte le passage, soit elle le désigne et il est fourni.
      const texte = doc.length > 120 ? doc : suppleements[doc];
      if (texte) passages.set(doc, { bloc: `${epreuve.id}-B${passages.size + 1}`, texte });
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

    const passage = passages.get(txt(l["Document / encart associé"]));
    const blocId = passage?.bloc ?? "";

    // Les captures ne sont produites que pour les épreuves dont le sujet a été
    // découpé ; ailleurs, l'énoncé transcrit se suffit.
    const capture = CAPTURES.has(feuille) ? `question-${numero.padStart(2, "0")}.png` : "";

    sortie.push({
      id_question: txt(l.ID_question),
      epreuve_id: epreuve.id,
      ordre: numero,
      bloc_id: blocId,
      type: TYPES[txt(l["Type Moodle"]).toUpperCase()] ?? "choix_unique",
      enonce_commun: passage?.texte ?? "",
      // `txt` écrase les sauts de ligne ; un énoncé structuré les garde, et
      // une énumération les retrouve.
      enonce:
        ENONCES_STRUCTURES[txt(l.ID_question)] ??
        aerer(txt(l["Énoncé exact / version validée"])),
      proposition_a: txt(l["Réponse A"]),
      proposition_b: txt(l["Réponse B"]),
      proposition_c: txt(l["Réponse C"]),
      proposition_d: txt(l["Réponse D"]),
      cle,
      points: "",
      chapitre: txt(l["Chapitre / compétence"]),
      sous_chapitre: txt(l["Notion commune"]),
      notions: txt(l["Sous-notion précise"]) || txt(l["Code notion"]),
      // Ce que le bilan restitue à l'élève : comment s'y prendre, et quoi
      // refaire pour ne plus commettre l'erreur.
      travail_a_realiser: txt(l["Révision ciblée + exercice de transfert"]),
      methode: txt(l["Méthode de résolution (étapes)"]),
      retroaction: txt(l["Feedback général Moodle"]) || txt(l["Correction expliquée - élève"]),
      // Le retour d'une proposition réécrite parlait de l'ancien texte : il
      // ne la décrit plus, on ne le garde pas.
      ...Object.fromEntries(
        ["A", "B", "C", "D"].map((x) => [
          `retroaction_${x.toLowerCase()}`,
          correction.reecrite === x ? "" : txt(l[`Feedback réponse ${x}`]),
        ]),
      ),
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
