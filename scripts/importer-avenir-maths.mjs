// Import des QCM de mathématiques du Concours Avenir (sujets A 2026, A 2025, B 2025),
// transcrits visuellement depuis les PDF officiels (poppler + relecture humaine assistée).
//
//   node --env-file=.env.local scripts/importer-avenir-maths.mjs
//
// Les questions sont insérées en file de RELECTURE (statut « a_verifier »,
// statut_extraction « a_verifier ») : elles n'apparaissent PAS dans l'entraînement
// tant qu'un humain ne les a pas validées via /admin/relecture. Idempotent : les
// blocs de maths A/B existants sont supprimés puis recréés.
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

const DOSSIER =
  "C:\\Users\\paul\\AppData\\Local\\Temp\\claude\\C--Users-paul-OneDrive-Documents-claude-site\\957c4ac5-e39c-4dc8-88e1-40b88e0b2e90\\scratchpad";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const cle = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !cle) {
  console.error("NEXT_PUBLIC_SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY requis.");
  process.exit(1);
}
const db = createClient(url, cle, { auth: { persistSession: false } });

const lire = (f) => JSON.parse(readFileSync(`${DOSSIER}\\${f}`, "utf8"));
const corriges = lire("corriges.json");
const LETTRE = { A: 0, B: 1, C: 2, D: 3 };

// Une seule épreuve « Mathématiques » (pas de distinction A/B, pas d'année
// affichée) : les trois sujets y sont regroupés.
const EPREUVE = "Mathématiques";
const SUJETS = [
  { fichier: "A2026.json", cle: "A2026", annee: 2026 },
  { fichier: "A2025.json", cle: "A2025", annee: 2025 },
  { fichier: "B2025.json", cle: "B2025", annee: 2025 },
];

const verifier = (e, ctx) => {
  if (e) {
    console.error(`✗ ${ctx} : ${e.message}`);
    process.exit(1);
  }
};

// --- Concours & épreuves ----------------------------------------------------
const { data: concours, error: eC } = await db
  .from("concours").select("id").eq("nom", "Avenir").single();
verifier(eC, "concours Avenir introuvable");

let { data: epreuves } = await db
  .from("epreuves").select("id, nom").eq("concours_id", concours.id);

// Épreuve « Mathématiques » : récupérée, sinon on renomme l'ancienne
// « Mathématiques A », sinon on la crée. On absorbe ensuite « Mathématiques B ».
let math = epreuves.find((e) => e.nom === EPREUVE);
if (!math) {
  const a = epreuves.find((e) => e.nom === "Mathématiques A");
  if (a) {
    await db.from("epreuves").update({ nom: EPREUVE }).eq("id", a.id);
    math = { id: a.id, nom: EPREUVE };
  } else {
    const { data, error } = await db.from("epreuves")
      .insert({ concours_id: concours.id, nom: EPREUVE, ordre_affichage: 2 })
      .select("id, nom").single();
    verifier(error, "création épreuve Mathématiques");
    math = data;
  }
}
const epreuveMathId = math.id;

// --- Nettoyage idempotent : blocs des anciennes épreuves de maths -----------
const { data: mathEpreuves } = await db
  .from("epreuves").select("id, nom").eq("concours_id", concours.id)
  .in("nom", [EPREUVE, "Mathématiques A", "Mathématiques B"]);
const { data: anciens } = await db
  .from("blocs").select("id").in("epreuve_id", mathEpreuves.map((e) => e.id));
if (anciens?.length) {
  await db.from("blocs").delete().in("id", anciens.map((b) => b.id));
  console.log(`Nettoyage : ${anciens.length} bloc(s) de maths supprimé(s).`);
}

// --- Import -----------------------------------------------------------------
let totalQ = 0, totalFig = 0;
const ordreParAnnale = new Map(); // 2025 est partagée par A2025 et B2025

for (const sujet of SUJETS) {
  const questions = lire(sujet.fichier);
  const corrige = corriges[sujet.cle].trim().split(/\s+/);
  if (corrige.length !== 60 || questions.length !== 60) {
    console.error(`✗ ${sujet.cle} : ${questions.length} questions / ${corrige.length} réponses (attendu 60/60)`);
    process.exit(1);
  }
  // Annale (concours + année) : réutilisée si elle existe (créée par l'anglais).
  let { data: annale } = await db
    .from("annales").select("id")
    .eq("concours_id", concours.id).eq("annee", sujet.annee).maybeSingle();
  if (!annale) {
    const { data, error } = await db.from("annales")
      .insert({ concours_id: concours.id, annee: sujet.annee, statut: "publie", format_source: "deux_documents" })
      .select("id").single();
    verifier(error, `annale ${sujet.annee}`);
    annale = data;
  }

  for (const q of questions) {
    // Les questions qui s'appuient sur une figure non importée sont écartées.
    if (q.figure) { totalFig++; continue; }
    const idx = LETTRE[corrige[q.n - 1]];
    if (idx === undefined) { console.error(`✗ ${sujet.cle} Q${q.n} : réponse « ${corrige[q.n - 1]} » invalide`); process.exit(1); }

    const ordre = ordreParAnnale.get(annale.id) ?? 0;
    ordreParAnnale.set(annale.id, ordre + 1);
    const { data: bloc, error: eB } = await db.from("blocs")
      .insert({ annale_id: annale.id, epreuve_id: epreuveMathId, enonce_commun: null, ordre, statut: "brouillon" })
      .select("id").single();
    verifier(eB, `bloc ${sujet.cle} Q${q.n}`);

    const note = `Concours Avenir — Mathématiques — Question ${q.n}. `
      + `Transcrite depuis le sujet officiel (notation : ^ exposant, _ indice). À relire.`
      + (q.figure ? " ⚠ FIGURE REQUISE : cette question s'appuie sur un schéma/graphique à ajouter (image) ou à écarter." : "");

    const { data: question, error: eQ } = await db.from("questions")
      .insert({
        bloc_id: bloc.id, type: "choix_unique", enonce: q.e, chapitre: q.chap,
        explication: null, explication_origine: null, explication_relue: false,
        statut: "a_verifier", statut_extraction: "a_verifier",
        commentaire_extraction: note, confiance_extraction: null,
        auto_publiee: false, origine: "extraite", ordre_dans_bloc: 0,
      })
      .select("id").single();
    verifier(eQ, `question ${sujet.cle} Q${q.n}`);

    const { error: eR } = await db.from("reponses_possibles").insert(
      q.p.map((texte, i) => ({ question_id: question.id, texte, est_correcte: i === idx, ordre: i + 1 })),
    );
    verifier(eR, `réponses ${sujet.cle} Q${q.n}`);

    totalQ++;
  }
  console.log(`✓ ${sujet.cle} (année ${sujet.annee}) importé sous « ${EPREUVE} ».`);
}

// --- Suppression des coquilles A/B désormais vides -------------------------
const { data: vides } = await db.from("epreuves").select("id, nom")
  .eq("concours_id", concours.id).in("nom", ["Mathématiques A", "Mathématiques B"]);
for (const e of vides ?? []) {
  const { count } = await db.from("blocs")
    .select("id", { count: "exact", head: true }).eq("epreuve_id", e.id);
  if (!count) {
    await db.from("epreuves").delete().eq("id", e.id);
    console.log(`Épreuve vide « ${e.nom} » supprimée.`);
  }
}

console.log(`\n✓ Terminé — ${totalQ} questions sous l'épreuve unique « ${EPREUVE} », en file de relecture (${totalFig} questions à figure écartées).`);
console.log("  Ni mention A/B, ni année dans les libellés. Validation dans /admin/relecture.");
