// Import des QCM de SCIENCES Puissance Alpha (filière générale), séparés par matière :
// NSI, SVT, Physique-Chimie. Modèle identique aux QCM maths PA (option B) :
//   1 exercice = 1 bloc (enonce_commun = contexte) ; 1 affirmation = 1 question
//   choix_unique Vrai/Faux. Tout est mis en file de relecture (a_verifier).
// Les affirmations dépendant d'une figure/code non reproductible ont été écartées en amont.
//   node --env-file=.env.local scripts/importer-pa-sciences.mjs
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

const DOSSIER =
  "C:\\Users\\paul\\AppData\\Local\\Temp\\claude\\C--Users-paul-OneDrive-Documents-claude-site\\957c4ac5-e39c-4dc8-88e1-40b88e0b2e90\\scratchpad";
const lire = (f) => JSON.parse(readFileSync(`${DOSSIER}\\${f}`, "utf8"));

// Une épreuve distincte par matière (comme les maths : suffixe « (générale) »).
const SOURCES = [
  { epreuve: "NSI – QCM (générale)", annee: 2025, file: "paNSI2025.json" },
  { epreuve: "SVT – QCM (générale)", annee: 2025, file: "paSVT2025.json" },
  { epreuve: "Physique-Chimie – QCM (générale)", annee: 2025, file: "paPhys2025.json" },
  { epreuve: "NSI – QCM (générale)", annee: 2022, file: "paNSI2022.json" },
  { epreuve: "SVT – QCM (générale)", annee: 2022, file: "paSVT2022.json" },
  { epreuve: "Physique-Chimie – QCM (générale)", annee: 2022, file: "paPhys2022.json" },
];

const INSTRUCTION = "Pour chaque affirmation, indiquez si elle est vraie (V) ou fausse (F).";

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const verifier = (e, ctx) => { if (e) { console.error(`✗ ${ctx} : ${e.message}`); process.exit(1); } };

const { data: concours, error: eC } = await db.from("concours").select("id").eq("nom", "Puissance Alpha").single();
verifier(eC, "concours Puissance Alpha");

const { data: epExist } = await db.from("epreuves").select("ordre_affichage").eq("concours_id", concours.id);
let ordreEp = Math.max(0, ...(epExist ?? []).map((e) => e.ordre_affichage ?? 0));

let grandTotal = 0;
for (const src of SOURCES) {
  // Annale
  let { data: annale } = await db.from("annales").select("id")
    .eq("concours_id", concours.id).eq("annee", src.annee).maybeSingle();
  if (!annale) {
    const { data, error } = await db.from("annales")
      .insert({ concours_id: concours.id, annee: src.annee, statut: "publie", format_source: "un_document" }).select("id").single();
    verifier(error, `annale ${src.annee}`);
    annale = data;
  }

  // Épreuve (get-or-create)
  let { data: ep } = await db.from("epreuves").select("id")
    .eq("concours_id", concours.id).eq("nom", src.epreuve).maybeSingle();
  if (!ep) {
    const { data, error } = await db.from("epreuves")
      .insert({ concours_id: concours.id, nom: src.epreuve, ordre_affichage: ++ordreEp }).select("id").single();
    verifier(error, `épreuve ${src.epreuve}`);
    ep = data;
  }

  // Idempotence : supprimer les blocs a_verifier de cette épreuve/annale.
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
      verifier(error, `nettoyage ${src.epreuve}`);
    }
    if (aSup.length) console.log(`Nettoyage ${src.epreuve} ${src.annee} : ${aSup.length} bloc(s) supprimé(s).`);
  }

  const exercices = lire(src.file);
  let ordreBloc = 0, total = 0;
  for (const ex of exercices) {
    const items = (ex.items ?? []).filter((it) => /^[VF]$/.test(it.sol));
    if (!items.length) continue;
    const enonceCommun = ex.contexte && ex.contexte.trim()
      ? `${ex.contexte.trim()}\n\n${INSTRUCTION}` : INSTRUCTION;
    const { data: bloc, error: eB } = await db.from("blocs")
      .insert({ annale_id: annale.id, epreuve_id: ep.id, enonce_commun: enonceCommun, ordre: ordreBloc++, statut: "brouillon" })
      .select("id").single();
    verifier(eB, `bloc ${src.epreuve} ex${ex.ex}`);

    let ordreQ = 0;
    for (const it of items) {
      const note = `Puissance Alpha — ${src.epreuve.replace(/ –.*/, "")} — Sciences appliquées ${src.annee} (générale), `
        + `exercice ${ex.ex} (${ex.titre}), affirmation ${it.l}. Transcrite depuis le PDF officiel (Vrai/Faux). À relire.`;
      const { data: question, error: eQ } = await db.from("questions")
        .insert({ bloc_id: bloc.id, type: "choix_unique", enonce: it.e, chapitre: ex.chap,
          explication: null, explication_origine: null, explication_relue: false,
          statut: "a_verifier", statut_extraction: "a_verifier", commentaire_extraction: note,
          confiance_extraction: null, auto_publiee: false, origine: "extraite", ordre_dans_bloc: ordreQ++ })
        .select("id").single();
      verifier(eQ, `question ${src.epreuve} ex${ex.ex}${it.l}`);
      const { error: eR } = await db.from("reponses_possibles").insert([
        { question_id: question.id, texte: "Vrai", est_correcte: it.sol === "V", ordre: 1 },
        { question_id: question.id, texte: "Faux", est_correcte: it.sol === "F", ordre: 2 },
      ]);
      verifier(eR, `réponses ${src.epreuve} ex${ex.ex}${it.l}`);
      total++; grandTotal++;
    }
  }
  console.log(`✓ ${src.epreuve} ${src.annee} : ${total} affirmations importées.`);
}
console.log(`\n✓ Terminé — ${grandTotal} questions de sciences PA en relecture.`);
