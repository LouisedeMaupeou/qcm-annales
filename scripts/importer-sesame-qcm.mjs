// Import des QCM SÉSAME « Enjeux contemporains » et « Français » (choix unique).
// Les corrigés n'étaient PAS fournis : les réponses ont été DÉTERMINÉES automatiquement
// et doivent être vérifiées en relecture. Certaines (actualité) sont marquées peu fiables.
//   node --env-file=.env.local scripts/importer-sesame-qcm.mjs
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

const DOSSIER =
  "C:\\Users\\paul\\AppData\\Local\\Temp\\claude\\C--Users-paul-OneDrive-Documents-claude-site\\957c4ac5-e39c-4dc8-88e1-40b88e0b2e90\\scratchpad";
const lire = (f) => JSON.parse(readFileSync(`${DOSSIER}\\${f}`, "utf8"));
const ANNEE = 2026;

const EPREUVES = [
  { nom: "Enjeux contemporains", fichier: "sesEnjeux.json", chap: "Enjeux contemporains" },
  { nom: "Français", fichier: "sesFrancais.json", chap: "Français — langue et culture" },
];

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const verifier = (e, ctx) => { if (e) { console.error(`✗ ${ctx} : ${e.message}`); process.exit(1); } };

const { data: concours, error: eC } = await db.from("concours").select("id").eq("nom", "SÉSAME").single();
verifier(eC, "concours SÉSAME");

// Annale 2026 (concours blanc 2025-2026)
let { data: annale } = await db.from("annales").select("id").eq("concours_id", concours.id).eq("annee", ANNEE).maybeSingle();
if (!annale) {
  const { data, error } = await db.from("annales")
    .insert({ concours_id: concours.id, annee: ANNEE, statut: "publie", format_source: "un_document" }).select("id").single();
  verifier(error, "annale 2026");
  annale = data;
}

// Ordre de départ pour les nouvelles épreuves
const { data: epExist } = await db.from("epreuves").select("ordre_affichage").eq("concours_id", concours.id);
let ordreEp = Math.max(0, ...(epExist ?? []).map((e) => e.ordre_affichage ?? 0));

let grandTotal = 0;
for (const spec of EPREUVES) {
  // Get-or-create épreuve
  let { data: ep } = await db.from("epreuves").select("id").eq("concours_id", concours.id).eq("nom", spec.nom).maybeSingle();
  if (!ep) {
    const { data, error } = await db.from("epreuves")
      .insert({ concours_id: concours.id, nom: spec.nom, ordre_affichage: ++ordreEp }).select("id").single();
    verifier(error, `épreuve ${spec.nom}`);
    ep = data;
  }

  // Idempotence : supprimer les blocs a_verifier de cette épreuve/annale
  const { data: bl } = await db.from("blocs").select("id").eq("epreuve_id", ep.id).eq("annale_id", annale.id);
  const ids = (bl ?? []).map((b) => b.id);
  if (ids.length) {
    const aSup = [];
    for (let i = 0; i < ids.length; i += 200) {
      const { data: qs } = await db.from("questions").select("bloc_id").in("bloc_id", ids.slice(i, i + 200)).eq("statut", "a_verifier");
      (qs ?? []).forEach((q) => aSup.push(q.bloc_id));
    }
    for (let i = 0; i < aSup.length; i += 100) {
      const { error } = await db.from("blocs").delete().in("id", aSup.slice(i, i + 100));
      verifier(error, `nettoyage ${spec.nom}`);
    }
    if (aSup.length) console.log(`Nettoyage ${spec.nom} : ${aSup.length} bloc(s) supprimé(s).`);
  }

  const questions = lire(spec.fichier);
  let ordre = 0, total = 0;
  for (const q of questions) {
    const sol = "ABCD".indexOf(q.sol);
    if (sol < 0 || q.items.length !== 4) { console.warn(`  ⚠ ${spec.nom} Q${q.n} ignorée (sol/items)`); continue; }

    const { data: bloc, error: eB } = await db.from("blocs")
      .insert({ annale_id: annale.id, epreuve_id: ep.id, enonce_commun: null, ordre: ordre++, statut: "brouillon" }).select("id").single();
    verifier(eB, `bloc ${spec.nom} Q${q.n}`);

    let note = `Concours blanc SÉSAME — ${spec.nom} — Question ${q.n}. `
      + `RÉPONSE DÉTERMINÉE AUTOMATIQUEMENT (aucun corrigé officiel fourni) — À VÉRIFIER.`;
    if (q.fiable === false) note += ` ⚠ Question d'actualité : réponse incertaine, à confirmer en priorité.`;

    const { data: question, error: eQ } = await db.from("questions")
      .insert({ bloc_id: bloc.id, type: "choix_unique", enonce: q.e, chapitre: spec.chap,
        explication: null, explication_origine: null, explication_relue: false,
        statut: "a_verifier", statut_extraction: "a_verifier", commentaire_extraction: note,
        confiance_extraction: null, auto_publiee: false, origine: "extraite", ordre_dans_bloc: 0 }).select("id").single();
    verifier(eQ, `question ${spec.nom} Q${q.n}`);

    const { error: eR } = await db.from("reponses_possibles").insert(
      q.items.map((texte, i) => ({ question_id: question.id, texte, est_correcte: i === sol, ordre: i + 1 })));
    verifier(eR, `réponses ${spec.nom} Q${q.n}`);
    total++; grandTotal++;
  }
  console.log(`✓ ${spec.nom} : ${total} questions importées (annale ${ANNEE}, choix unique).`);
}
console.log(`\n✓ Terminé — ${grandTotal} questions SÉSAME en relecture.`);
