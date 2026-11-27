import { readFileSync } from "node:fs";
import * as XLSX from "xlsx";

/**
 * Enrichit les questions SÉSAME déjà en base avec ce que le bilan restitue :
 * la révision ciblée, la méthode de résolution et le retour propre à chaque
 * proposition (l'erreur commise par l'élève qui l'a cochée).
 *
 * Pourquoi pas un réimport : la session a eu lieu. L'import complet réécrit
 * les énoncés depuis le fichier — et défait donc ce qui a été corrigé en
 * relecture depuis. Ce script ne touche qu'à trois colonnes, ne supprime rien,
 * et ne change ni une clé, ni un statut, ni une copie.
 *
 * Le retour d'une proposition n'est posé que si son texte en base est celui
 * du référentiel : une proposition réécrite (onglet « POINTS À CORRIGER », ou
 * en relecture) ne correspond plus à ce que le retour décrit.
 *
 * Il vérifie aussi, au passage, que chaque réponse cochée dans une copie
 * désigne une proposition qui existe encore.
 *
 *   node --env-file=.env.local scripts/enrichir-referentiel-sesame.mjs <referentiel.xlsx>           (simulation)
 *   node --env-file=.env.local scripts/enrichir-referentiel-sesame.mjs <referentiel.xlsx> --ecrire
 */

const SOURCE = process.argv[2];
const ECRIRE = process.argv.includes("--ecrire");
if (!SOURCE) {
  console.error("Usage : enrichir-referentiel-sesame.mjs <referentiel.xlsx> [--ecrire]");
  process.exit(1);
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const cle = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !cle) {
  console.error("NEXT_PUBLIC_SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY manquent (--env-file=.env.local).");
  process.exit(1);
}
const entetes = { apikey: cle, Authorization: `Bearer ${cle}`, "Content-Type": "application/json" };

async function lire(chemin) {
  const r = await fetch(`${url}/rest/v1/${chemin}`, { headers: entetes });
  if (!r.ok) throw new Error(`${r.status} ${await r.text()}`);
  return r.json();
}

async function modifier(table, id, valeurs) {
  const r = await fetch(`${url}/rest/v1/${table}?id=eq.${id}`, {
    method: "PATCH",
    headers: { ...entetes, Prefer: "return=minimal" },
    body: JSON.stringify(valeurs),
  });
  if (!r.ok) throw new Error(`${table} ${id} : ${r.status} ${await r.text()}`);
}

/** Lectures par lots : une URL PostgREST trop longue est refusée. */
async function lireParLots(ids, chemin) {
  const sortie = [];
  for (let i = 0; i < ids.length; i += 80) {
    const lot = ids.slice(i, i + 80).map((x) => `"${x}"`).join(",");
    sortie.push(...(await lire(chemin(lot))));
  }
  return sortie;
}

const txt = (v) => String(v ?? "").replace(/\s+/g, " ").trim();
const vide = (v) => (v ? v : null);

// --- Le référentiel ----------------------------------------------------------
const classeur = XLSX.read(readFileSync(SOURCE), { type: "buffer" });
const referentiel = new Map();
for (const feuille of classeur.SheetNames) {
  const lignes = XLSX.utils.sheet_to_json(classeur.Sheets[feuille], { defval: "", raw: false });
  if (!lignes.length || !("ID_question" in lignes[0])) continue;
  for (const l of lignes) {
    const id = txt(l.ID_question);
    if (!id) continue;
    referentiel.set(id, {
      travail: vide(txt(l["Révision ciblée + exercice de transfert"])),
      methode: vide(txt(l["Méthode de résolution (étapes)"])),
      propositions: ["A", "B", "C", "D"].map((x, rang) => ({
        ordre: rang + 1,
        texte: txt(l[`Réponse ${x}`]),
        retroaction: vide(txt(l[`Feedback réponse ${x}`])),
      })),
    });
  }
}
console.log(`Référentiel : ${referentiel.size} questions.`);

// --- La base -----------------------------------------------------------------
const questions = await lireParLots(
  [...referentiel.keys()],
  (lot) => `questions?select=id,id_question_externe,travail_a_realiser,methode&id_question_externe=in.(${lot})`,
);
const absentes = [...referentiel.keys()].filter(
  (id) => !questions.some((q) => q.id_question_externe === id),
);
console.log(`En base : ${questions.length} questions trouvées, ${absentes.length} absentes.`);
for (const id of absentes) console.log(`   absente : ${id}`);

const idsQuestions = questions.map((q) => q.id);
const propositions = await lireParLots(
  idsQuestions,
  (lot) => `reponses_possibles?select=id,question_id,ordre,texte,retroaction&question_id=in.(${lot})`,
);

// --- Contrôle des copies -----------------------------------------------------
const reponses = await lireParLots(
  idsQuestions,
  (lot) => `passage_reponses?select=question_id,reponse&question_id=in.(${lot})`,
);
const idsPropositions = new Set(propositions.map((p) => p.id));
let cochees = 0;
let orphelines = 0;
for (const r of reponses) {
  const choisies = [r.reponse?.reponseId, ...(r.reponse?.reponseIds ?? [])].filter(Boolean);
  cochees += choisies.length;
  orphelines += choisies.filter((id) => !idsPropositions.has(id)).length;
}
console.log(
  `Copies : ${reponses.length} réponse(s) enregistrée(s), ${cochees} proposition(s) cochée(s), ` +
    `${orphelines} qui ne désigne(nt) plus aucune proposition.`,
);
if (orphelines > 0) {
  console.log(
    "   ⚠ Des copies pointent vers des propositions disparues : un réimport les a recréées.\n" +
      "     Le bilan ne pourra pas dire l'erreur commise sur ces réponses. Ne rien écrire avant d'en parler.",
  );
}

// --- Ce qui change -----------------------------------------------------------
const majQuestions = [];
const majPropositions = [];
const ecartees = [];
for (const q of questions) {
  const ref = referentiel.get(q.id_question_externe);
  if (ref.travail !== q.travail_a_realiser || ref.methode !== q.methode) {
    majQuestions.push({ id: q.id, valeurs: { travail_a_realiser: ref.travail, methode: ref.methode } });
  }
  for (const p of propositions.filter((x) => x.question_id === q.id)) {
    const attendue = ref.propositions.find((x) => x.ordre === p.ordre);
    if (!attendue?.retroaction) continue;
    if (txt(p.texte) !== attendue.texte) {
      ecartees.push(`${q.id_question_externe} rang ${p.ordre} : « ${txt(p.texte)} » ≠ « ${attendue.texte} »`);
      continue;
    }
    if (p.retroaction !== attendue.retroaction) {
      majPropositions.push({ id: p.id, valeurs: { retroaction: attendue.retroaction } });
    }
  }
}

console.log(`\nÀ écrire : ${majQuestions.length} question(s) (révision, méthode), ${majPropositions.length} retour(s) de proposition.`);
console.log(`Retours écartés (texte de la proposition différent du référentiel) : ${ecartees.length}`);
for (const e of ecartees) console.log(`   ${e}`);

if (!ECRIRE) {
  console.log("\nSimulation : rien n'a été écrit. Relancer avec --ecrire pour appliquer.");
  process.exit(0);
}

const taches = [
  ...majQuestions.map((m) => () => modifier("questions", m.id, m.valeurs)),
  ...majPropositions.map((m) => () => modifier("reponses_possibles", m.id, m.valeurs)),
];
let faites = 0;
const ouvriers = Array.from({ length: 8 }, async () => {
  while (taches.length) {
    await taches.shift()();
    faites += 1;
  }
});
await Promise.all(ouvriers);
console.log(`\nÉcrit : ${faites} mise(s) à jour.`);
