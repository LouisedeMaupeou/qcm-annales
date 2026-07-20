import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "node:fs";
import { basename } from "node:path";
import { lirePages, diagnostiquer } from "./lire-pdf.mjs";

/**
 * Import de l'annale Advance 2026.
 *
 *   node --env-file=.env.local scripts/importer-advance-2026.mjs <dossier-des-pdf>
 *
 * Idempotent : l'annale existante est supprimée puis recréée (cascade).
 *
 * Ce que fait ce script, et ce qu'il ne fait pas
 * ----------------------------------------------
 * Les trois PDF fournis par Advance ne sont pas de même nature :
 *
 *  - **Anglais** : texte véritable. 3 tests de 30 questions à choix unique,
 *    4 propositions, avec une page ANSWER KEY complète. Entièrement importable.
 *  - **Mathématiques (spécialité et complémentaires)** : les pages sont des
 *    images. Ni les énoncés ni les corrigés ne sont extractibles sans OCR, et
 *    l'OCR de notation mathématique est précisément le cas dégradé documenté au
 *    §10.4. Les PDF sont archivés et rattachés à l'annale pour la relecture,
 *    mais aucune question n'en est tirée.
 *
 * Défaut du sujet source (§10.5)
 * ------------------------------
 * Les trois tests d'anglais numérotent deux questions « 22 » et n'ont pas de
 * « 23 ». Le corrigé, lui, compte bien 30 entrées. Les questions 1 à 21 et 24 à
 * 30 s'alignent donc sur leur propre numéro sans ambiguïté ; seules les deux
 * homonymes « 22 » sont incertaines — on ignore laquelle prend l'entrée 22 et
 * laquelle prend l'entrée 23. Elles partent en file de relecture plutôt que
 * d'être publiées avec une réponse devinée.
 */

const ANNEE = 2026;
const NOM_CONCOURS = "Advance";

const FICHIERS = {
  anglais: "ADVANCE-POST-BAC-ANNALES-ANGLAIS-2026.pdf",
  maths: "ADVANCE-POST-BAC-ANNALES-MATHS-2026.pdf",
  mathsCompl: "ADVANCE-POST-BAC-ANNALES-MATHS-COMPL-2026.pdf",
};

const EPREUVES = {
  anglais: "Anglais",
  maths: "Mathématiques — spécialité",
  mathsCompl: "Mathématiques complémentaires",
};

const dossier = process.argv[2];
if (!dossier) {
  console.error(
    "Usage : node --env-file=.env.local scripts/importer-advance-2026.mjs <dossier-des-pdf>",
  );
  process.exit(1);
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const cle = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !cle) {
  console.error("NEXT_PUBLIC_SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY requis.");
  process.exit(1);
}

const db = createClient(url, cle, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const verifier = (erreur, contexte) => {
  if (erreur) {
    console.error(`✗ ${contexte} : ${erreur.message}`);
    process.exit(1);
  }
};

const chemin = (cle) => `${dossier}\\${FICHIERS[cle]}`;

for (const c of Object.keys(FICHIERS)) {
  if (!existsSync(chemin(c))) {
    console.error(`✗ Fichier introuvable : ${chemin(c)}`);
    process.exit(1);
  }
}

// ---------------------------------------------------------------------------
// 1. Diagnostic des sources
// ---------------------------------------------------------------------------
console.log("Diagnostic des PDF sources :");
const diagnostics = {};
for (const c of Object.keys(FICHIERS)) {
  diagnostics[c] = await diagnostiquer(chemin(c));
  const d = diagnostics[c];
  console.log(
    `  ${FICHIERS[c].padEnd(46)} ${String(d.pages).padStart(3)} pages · ` +
      `${String(d.caracteresParPage).padStart(4)} car./page · ` +
      (d.exploitableEnTexte ? "texte exploitable" : "IMAGES — OCR nécessaire"),
  );
}

if (!diagnostics.anglais.exploitableEnTexte) {
  console.error("✗ Le PDF d'anglais n'est pas exploitable en texte : arrêt.");
  process.exit(1);
}

// ---------------------------------------------------------------------------
// 2. Extraction et analyse de l'anglais
// ---------------------------------------------------------------------------
const pages = await lirePages(chemin("anglais"));
const texte = pages.map((p, i) => `===== PAGE ${i + 1} =====\n${p}`).join("\n");

const iCorrige = texte.indexOf("ANSWER KEY");
if (iCorrige === -1) {
  console.error("✗ Page ANSWER KEY introuvable : import impossible sans corrigé.");
  process.exit(1);
}

// --- Corrigé : trois colonnes, une par test --------------------------------
const corrige = { 1: {}, 2: {}, 3: {} };
for (const ligne of texte.slice(iCorrige).split("\n")) {
  const paires = [...ligne.matchAll(/(\d+)\.\s*([A-D])\b/g)];
  if (paires.length !== 3) continue;
  paires.forEach((p, i) => {
    corrige[i + 1][Number(p[1])] = p[2].toLowerCase();
  });
}

// --- Questions --------------------------------------------------------------
const avant = texte.slice(0, iCorrige);
const questions = [];

for (const n of [1, 2, 3]) {
  const debut = avant.indexOf(`ANGLAIS - TEST ${n}`);
  const fin = n < 3 ? avant.indexOf(`ANGLAIS - TEST ${n + 1}`) : avant.length;

  const lignes = avant
    .slice(debut, fin)
    .split("\n")
    .filter(
      (l) =>
        !/^===== PAGE \d+ =====$/.test(l) &&
        !/^ANNALES CONCOURS ADVANCE$/.test(l) &&
        !/^ANGLAIS - TEST \d+$/.test(l) &&
        l.trim() !== "",
    );

  let section = "Grammar";
  let courante = null;

  const cloturer = () => {
    if (!courante) return;
    courante.enonce = courante.enonce.join(" ").replace(/\s+/g, " ").trim();
    questions.push(courante);
    courante = null;
  };

  for (const ligne of lignes) {
    const brut = ligne.trim();

    if (/^(Grammar|Vocabulary|Reading Comprehension)$/.test(brut)) {
      cloturer();
      section = brut;
      continue;
    }

    // Le numéro doit être suivi d'une espace : sans cette contrainte,
    // « 0.325mm long, … » au fil d'un passage était lu comme une question.
    const entete = brut.match(/^(\d{1,2})\.(?:\s+(.*))?$/);
    if (entete && Number(entete[1]) >= 1 && Number(entete[1]) <= 30) {
      cloturer();
      courante = {
        test: n,
        numero: Number(entete[1]),
        section,
        enonce: entete[2] ? [entete[2]] : [],
        propositions: [],
      };
      continue;
    }

    const option = brut.match(/^([a-d])\)\s*(.*)$/);
    if (option && courante) {
      courante.propositions.push({ lettre: option[1], texte: option[2].trim() });
      continue;
    }

    if (courante) {
      if (courante.propositions.length > 0) {
        courante.propositions.at(-1).texte += ` ${brut}`;
      } else {
        courante.enonce.push(brut);
      }
    }
  }
  cloturer();
}

// --- Contrôles --------------------------------------------------------------
for (const n of [1, 2, 3]) {
  const duTest = questions.filter((q) => q.test === n);
  const occurrences = new Map();
  for (const q of duTest) occurrences.set(q.numero, (occurrences.get(q.numero) ?? 0) + 1);

  for (const q of duTest) {
    const reserves = [];

    if (q.propositions.length !== 4) {
      reserves.push(
        `le sujet source ne donne que ${q.propositions.length} propositions au lieu de 4`,
      );
    }
    if (!q.enonce) reserves.push("énoncé vide à l'extraction");

    if (occurrences.get(q.numero) > 1) {
      reserves.push(
        `le sujet source numérote deux questions « ${q.numero} » et n'a pas de « ${q.numero + 1} » : ` +
          `on ignore laquelle des deux prend l'entrée ${q.numero} du corrigé et laquelle prend l'entrée ${q.numero + 1}`,
      );
    }

    q.reponse = corrige[q.test][q.numero] ?? null;
    if (!q.reponse) reserves.push("aucune entrée correspondante au corrigé");
    else if (!q.propositions.some((p) => p.lettre === q.reponse)) {
      reserves.push(
        `le corrigé indique « ${q.reponse.toUpperCase()} » mais cette proposition n'existe pas`,
      );
    }

    q.reserves = reserves;
    q.publiable = reserves.length === 0;
  }
}

const publiables = questions.filter((q) => q.publiable).length;
console.log(
  `\nAnglais : ${questions.length} questions extraites — ${publiables} publiables, ` +
    `${questions.length - publiables} en relecture.`,
);

if (publiables === 0) {
  console.error("✗ Aucune question publiable : arrêt.");
  process.exit(1);
}

// ---------------------------------------------------------------------------
// 3. Concours, épreuves, annale
// ---------------------------------------------------------------------------
const { data: concours, error: eConcours } = await db
  .from("concours")
  .select("id")
  .eq("nom", NOM_CONCOURS)
  .single();
verifier(eConcours, `concours ${NOM_CONCOURS} introuvable`);

const epreuves = {};
for (const [cle, nom] of Object.entries(EPREUVES)) {
  const { data, error } = await db
    .from("epreuves")
    .upsert(
      { concours_id: concours.id, nom, ordre_affichage: Object.keys(epreuves).length + 1 },
      { onConflict: "concours_id,nom" },
    )
    .select("id")
    .single();
  verifier(error, `épreuve ${nom}`);
  epreuves[cle] = data.id;
}

await db.from("annales").delete().eq("concours_id", concours.id).eq("annee", ANNEE);

const { data: annale, error: eAnnale } = await db
  .from("annales")
  .insert({
    concours_id: concours.id,
    annee: ANNEE,
    statut: "publie",
    // Sujets et corrigés réunis dans un même document, par épreuve.
    format_source: "un_document",
  })
  .select("id")
  .single();
verifier(eAnnale, "création de l'annale");

// ---------------------------------------------------------------------------
// 4. Archivage des PDF sources (§6.1) — y compris les maths non exploitées,
//    pour que la transcription manuelle puisse s'appuyer dessus.
// ---------------------------------------------------------------------------
for (const c of Object.keys(FICHIERS)) {
  // Blob et non Buffer : le client HTTP de Node refuse un Buffer brut comme
  // corps de requête et échoue sur un « fetch failed » peu bavard.
  const fichier = new Blob([readFileSync(chemin(c))], { type: "application/pdf" });
  const destination = `${concours.id}/${ANNEE}/${basename(FICHIERS[c])}`;

  const { error: eUpload } = await db.storage
    .from("annales")
    .upload(destination, fichier, { contentType: "application/pdf", upsert: true });
  verifier(eUpload, `téléversement ${FICHIERS[c]}`);

  const { error: eDoc } = await db
    .from("annale_documents")
    .insert({ annale_id: annale.id, type: "complet", fichier_url: destination });
  verifier(eDoc, `rattachement ${FICHIERS[c]}`);

  console.log(`  ✓ archivé : ${FICHIERS[c]}`);
}

// ---------------------------------------------------------------------------
// 5. Questions d'anglais
// ---------------------------------------------------------------------------
// Chaque question est autonome : un bloc d'une question, sans énoncé commun.
// Les passages de compréhension sont inclus dans l'énoncé de leur question.
let ordre = 0;
let nbPubliees = 0;
let nbRelecture = 0;

for (const q of questions) {
  const { data: bloc, error: eBloc } = await db
    .from("blocs")
    .insert({
      annale_id: annale.id,
      epreuve_id: epreuves.anglais,
      enonce_commun: null,
      ordre: ordre++,
      statut: "brouillon", // le trigger le recalculera depuis ses questions
    })
    .select("id")
    .single();
  verifier(eBloc, `bloc test ${q.test} question ${q.numero}`);

  const { data: question, error: eQuestion } = await db
    .from("questions")
    .insert({
      bloc_id: bloc.id,
      type: "choix_unique",
      enonce: q.enonce,
      chapitre: q.section,
      explication: null,
      explication_origine: null,
      explication_relue: false,
      statut: q.publiable ? "publie" : "a_verifier",
      statut_extraction: q.publiable ? "ok" : "a_verifier",
      commentaire_extraction: q.reserves.length
        ? `Test ${q.test}, question ${q.numero}. ${q.reserves.join(" ")}`
        : `Test ${q.test}, question ${q.numero}.`,
      // Extraction déterministe d'un PDF textuel, sans modèle de confiance :
      // laisser NULL plutôt qu'inventer un score (§6.1).
      confiance_extraction: null,
      auto_publiee: false,
      origine: "extraite",
      ordre_dans_bloc: 0,
    })
    .select("id")
    .single();
  verifier(eQuestion, `question test ${q.test} n°${q.numero}`);

  const { error: eReponses } = await db.from("reponses_possibles").insert(
    q.propositions.map((p, i) => ({
      question_id: question.id,
      texte: p.texte,
      est_correcte: p.lettre === q.reponse,
      ordre: i + 1,
    })),
  );
  verifier(eReponses, `propositions test ${q.test} n°${q.numero}`);

  if (q.publiable) nbPubliees++;
  else nbRelecture++;
}

console.log(
  [
    "",
    `✓ Annale ${NOM_CONCOURS} ${ANNEE} importée`,
    `  ${nbPubliees} questions publiées · ${nbRelecture} en file de relecture`,
    `  3 PDF sources archivés`,
    "",
    "  Mathématiques : aucune question importée — les pages des deux PDF sont",
    "  des images. Leur transcription demande une relecture humaine ou un OCR,",
    "  hors périmètre V1 (§3). Les PDF sont rattachés à l'annale.",
  ].join("\n"),
);
