// Import des QCM Sciences & Physique du Concours Avenir, transcrits visuellement
// depuis les PDF officiels (poppler + relecture assistée).
//
//   node --env-file=.env.local scripts/importer-avenir-sciences.mjs
//
// Épreuves : « Physique » (Physique B) et « Sciences » (les 4 disciplines au choix :
// Physique, NSI, SI, SVT — regroupées, sans distinction A/B ni année dans les libellés).
// Questions insérées en file de relecture (a_verifier). Idempotent : les blocs des
// épreuves « Physique » et « Sciences » sont supprimés puis recréés.
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

const DOSSIER =
  "C:\\Users\\paul\\AppData\\Local\\Temp\\claude\\C--Users-paul-OneDrive-Documents-claude-site\\957c4ac5-e39c-4dc8-88e1-40b88e0b2e90\\scratchpad";
const lire = (f) => JSON.parse(readFileSync(`${DOSSIER}\\${f}`, "utf8"));
const corriges = lire("corriges-sciences.json");
const LETTRE = { A: 0, B: 1, C: 2, D: 3 };

// 4 épreuves distinctes par discipline (toute la physique — Physique B + physique
// de Sciences A — regroupée sous « Physique »). Les questions à figure non importée
// sont écartées.
const SUJETS = [
  { fichier: "PhysiqueB2425.json", cle: "PhysiqueB2425", epreuve: "Physique", annee: 2025 },
  { fichier: "Physique2526.json", cle: "Physique2526", epreuve: "Physique", annee: 2026 },
  { fichier: "PhysiqueA2425.json", cle: "PhysiqueA2425", epreuve: "Physique", annee: 2025 },
  { fichier: "NSI2526.json", cle: "NSI2526", epreuve: "NSI", annee: 2026 },
  { fichier: "NSI2425.json", cle: "NSI2425", epreuve: "NSI", annee: 2025 },
  { fichier: "SI2526.json", cle: "SI2526", epreuve: "SI", annee: 2026 },
  { fichier: "SI2425.json", cle: "SI2425", epreuve: "SI", annee: 2025 },
  { fichier: "SVT2526.json", cle: "SVT2526", epreuve: "SVT", annee: 2026 },
  { fichier: "SVT2425.json", cle: "SVT2425", epreuve: "SVT", annee: 2025 },
];
const ORDRE_EPREUVE = { Physique: 3, NSI: 4, SI: 5, SVT: 6 };

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const cle = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !cle) { console.error("Clés Supabase requises."); process.exit(1); }
const db = createClient(url, cle, { auth: { persistSession: false } });
const verifier = (e, ctx) => { if (e) { console.error(`✗ ${ctx} : ${e.message}`); process.exit(1); } };

const { data: concours } = await db.from("concours").select("id").eq("nom", "Avenir").single();
let { data: epreuves } = await db.from("epreuves").select("id, nom").eq("concours_id", concours.id);

// Récupère l'épreuve par son nom, la crée si nécessaire.
const epreuveId = async (nom) => {
  let e = epreuves.find((x) => x.nom === nom);
  if (!e) {
    const { data, error } = await db.from("epreuves")
      .insert({ concours_id: concours.id, nom, ordre_affichage: ORDRE_EPREUVE[nom] ?? 9 })
      .select("id, nom").single();
    verifier(error, `création épreuve ${nom}`);
    e = data;
    epreuves.push(e);
  }
  return e.id;
};

// Nettoyage idempotent : blocs des 4 épreuves cibles + ancienne épreuve « Sciences ».
const idsCibles = [];
for (const nom of ["Physique", "NSI", "SI", "SVT", "Sciences"]) {
  const e = epreuves.find((x) => x.nom === nom);
  if (e) idsCibles.push(e.id);
}
if (idsCibles.length) {
  const { data: anciens } = await db.from("blocs").select("id").in("epreuve_id", idsCibles);
  if (anciens?.length) {
    await db.from("blocs").delete().in("id", anciens.map((b) => b.id));
    console.log(`Nettoyage : ${anciens.length} bloc(s) supprimé(s).`);
  }
}

const ordreParAnnale = new Map();
let totalQ = 0, totalFig = 0;

for (const sujet of SUJETS) {
  const questions = lire(sujet.fichier);
  const corrige = corriges[sujet.cle].trim().split(/\s+/);
  if (questions.length !== corrige.length) {
    console.error(`✗ ${sujet.cle} : ${questions.length} questions / ${corrige.length} réponses`);
    process.exit(1);
  }
  const epId = await epreuveId(sujet.epreuve);

  let { data: annale } = await db.from("annales").select("id")
    .eq("concours_id", concours.id).eq("annee", sujet.annee).maybeSingle();
  if (!annale) {
    const { data, error } = await db.from("annales")
      .insert({ concours_id: concours.id, annee: sujet.annee, statut: "publie", format_source: "deux_documents" })
      .select("id").single();
    verifier(error, `annale ${sujet.annee}`);
    annale = data;
  }

  for (const q of questions) {
    // Les questions s'appuyant sur une figure non importée sont écartées.
    if (q.figure) { totalFig++; continue; }
    const idx = LETTRE[corrige[q.n - 1]];
    if (idx === undefined) { console.error(`✗ ${sujet.cle} Q${q.n} : réponse invalide`); process.exit(1); }

    const ordre = ordreParAnnale.get(annale.id) ?? 0;
    ordreParAnnale.set(annale.id, ordre + 1);
    const { data: bloc, error: eB } = await db.from("blocs")
      .insert({ annale_id: annale.id, epreuve_id: epId, enonce_commun: null, ordre, statut: "brouillon" })
      .select("id").single();
    verifier(eB, `bloc ${sujet.cle} Q${q.n}`);

    const note = `Concours Avenir — ${sujet.epreuve} — Question ${q.n}. `
      + `Transcrite depuis le sujet officiel (notation : ^ exposant, _ indice). À relire.`
      + (q.figure ? " ⚠ FIGURE REQUISE : cette question s'appuie sur un schéma/graphique à ajouter (image) ou à écarter." : "");

    const { data: question, error: eQ } = await db.from("questions")
      .insert({
        bloc_id: bloc.id, type: "choix_unique", enonce: q.e, chapitre: q.chap,
        explication: null, explication_origine: null, explication_relue: false,
        statut: "a_verifier", statut_extraction: "a_verifier",
        commentaire_extraction: note, confiance_extraction: null,
        auto_publiee: false, origine: "extraite", ordre_dans_bloc: 0,
      }).select("id").single();
    verifier(eQ, `question ${sujet.cle} Q${q.n}`);

    const { error: eR } = await db.from("reponses_possibles").insert(
      q.p.map((texte, i) => ({ question_id: question.id, texte, est_correcte: i === idx, ordre: i + 1 })),
    );
    verifier(eR, `réponses ${sujet.cle} Q${q.n}`);

    totalQ++;
  }
  console.log(`✓ ${sujet.cle} → « ${sujet.epreuve} ».`);
}

// Suppression de l'ancienne épreuve « Sciences » désormais vide.
const sci = epreuves.find((x) => x.nom === "Sciences");
if (sci) {
  const { count } = await db.from("blocs").select("id", { count: "exact", head: true }).eq("epreuve_id", sci.id);
  if (!count) {
    await db.from("epreuves").delete().eq("id", sci.id);
    console.log("Épreuve « Sciences » (vide) supprimée.");
  }
}

console.log(`\n✓ Terminé — ${totalQ} questions en relecture sous 4 épreuves (Physique, NSI, SI, SVT). ${totalFig} questions à figure écartées.`);
