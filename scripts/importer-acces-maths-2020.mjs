// Import des maths NOUVELLES du cahier ACCÈS 2021 (= concours 2020, absent de la base).
// Raisonnement mathématique Q6-10 (Vrai/Faux). Le problème Q11-15 dépend d'une figure → écarté.
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

const DOSSIER =
  "C:\\Users\\paul\\AppData\\Local\\Temp\\claude\\C--Users-paul-OneDrive-Documents-claude-site\\957c4ac5-e39c-4dc8-88e1-40b88e0b2e90\\scratchpad";
const questions = JSON.parse(readFileSync(`${DOSSIER}\\accMaths2020.json`, "utf8"));
const ANNEE = 2020;

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const verifier = (e, ctx) => { if (e) { console.error(`✗ ${ctx} : ${e.message}`); process.exit(1); } };

const { data: c } = await db.from("concours").select("id").eq("nom", "ACCÈS").single();
const { data: ep } = await db.from("epreuves").select("id, nom").eq("concours_id", c.id);
const epMath = ep.find((e) => /math/i.test(e.nom));

let { data: annale } = await db.from("annales").select("id").eq("concours_id", c.id).eq("annee", ANNEE).maybeSingle();
if (!annale) {
  const { data, error } = await db.from("annales")
    .insert({ concours_id: c.id, annee: ANNEE, statut: "publie", format_source: "un_document" }).select("id").single();
  verifier(error, "annale 2020");
  annale = data;
}

// Idempotence : supprimer les blocs a_verifier de cette annale dans l'épreuve maths.
const { data: bl } = await db.from("blocs").select("id").eq("epreuve_id", epMath.id).eq("annale_id", annale.id);
const ids = (bl ?? []).map((b) => b.id);
if (ids.length) {
  const { data: qs } = await db.from("questions").select("bloc_id").in("bloc_id", ids).eq("statut", "a_verifier");
  const del = [...new Set((qs ?? []).map((q) => q.bloc_id))];
  if (del.length) { await db.from("blocs").delete().in("id", del); console.log(`Nettoyage : ${del.length} bloc(s) supprimé(s).`); }
}

let ordre = 0, total = 0;
for (const q of questions) {
  if (!/^[VF]{4}$/.test(q.sol) || q.items.length !== 4) continue;
  const { data: bloc, error: eB } = await db.from("blocs")
    .insert({ annale_id: annale.id, epreuve_id: epMath.id, enonce_commun: null, ordre: ordre++, statut: "brouillon" }).select("id").single();
  verifier(eB, `bloc Q${q.n}`);
  const note = `Concours ACCÈS — Raisonnement mathématique — Question ${q.n} (session 2020). Transcrite depuis le cahier officiel (Vrai/Faux). À relire.`;
  const { data: question, error: eQ } = await db.from("questions")
    .insert({ bloc_id: bloc.id, type: "vrai_faux", enonce: q.e, chapitre: q.chap, explication: null, explication_origine: null,
      explication_relue: false, statut: "a_verifier", statut_extraction: "a_verifier", commentaire_extraction: note,
      confiance_extraction: null, auto_publiee: false, origine: "extraite", ordre_dans_bloc: 0 }).select("id").single();
  verifier(eQ, `question Q${q.n}`);
  const { error: eR } = await db.from("reponses_possibles").insert(
    q.items.map((texte, i) => ({ question_id: question.id, texte, est_correcte: q.sol[i] === "V", ordre: i + 1 })));
  verifier(eR, `réponses Q${q.n}`);
  total++;
}
console.log(`✓ ${total} questions de maths (session 2020) importées en relecture.`);
