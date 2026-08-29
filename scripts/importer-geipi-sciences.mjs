// Import de QCM Vrai/Faux INÉDITS (dérivés) pour les épreuves de sciences GEIPI Polytech.
// Les épreuves de sciences GEIPI (NSI, PC, SI, SVT) sont des problèmes rédigés à réponse
// libre, incompatibles avec le format QCM de la plateforme. À la demande de l'utilisateur,
// on crée donc des questions d'entraînement INÉDITES (Vrai/Faux) inspirées des thèmes de
// chaque annale, en file de relecture. Modèle identique aux autres imports (bloc = thème,
// 1 affirmation = 1 question choix_unique Vrai/Faux).
//   node --env-file=.env.local scripts/importer-geipi-sciences.mjs
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

const DOSSIER =
  "C:\\Users\\paul\\AppData\\Local\\Temp\\claude\\C--Users-paul-OneDrive-Documents-claude-site\\957c4ac5-e39c-4dc8-88e1-40b88e0b2e90\\scratchpad";
const lire = (f) => JSON.parse(readFileSync(`${DOSSIER}\\${f}`, "utf8"));

const SOURCES = [
  { epreuve: "Physique-Chimie", file: "gpPC.json" },
  { epreuve: "SVT", file: "gpSVT.json" },
  { epreuve: "NSI", file: "gpNSI.json" },
  { epreuve: "Sciences de l'ingénieur", file: "gpSI.json" },
];

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const verifier = (e, ctx) => { if (e) { console.error(`✗ ${ctx} : ${e.message}`); process.exit(1); } };

const { data: concours, error: eC } = await db.from("concours").select("id").eq("nom", "GEIPI Polytech").single();
verifier(eC, "concours GEIPI Polytech");

const { data: epExist } = await db.from("epreuves").select("ordre_affichage").eq("concours_id", concours.id);
let ordreEp = Math.max(0, ...(epExist ?? []).map((e) => e.ordre_affichage ?? 0));

// Cache annales par année.
const annaleId = {};
async function getAnnale(annee) {
  if (annaleId[annee]) return annaleId[annee];
  let { data: a } = await db.from("annales").select("id").eq("concours_id", concours.id).eq("annee", annee).maybeSingle();
  if (!a) {
    const { data, error } = await db.from("annales")
      .insert({ concours_id: concours.id, annee, statut: "publie", format_source: "un_document" }).select("id").single();
    verifier(error, `annale ${annee}`);
    a = data;
  }
  annaleId[annee] = a.id;
  return a.id;
}

let grandTotal = 0;
for (const src of SOURCES) {
  let { data: ep } = await db.from("epreuves").select("id")
    .eq("concours_id", concours.id).eq("nom", src.epreuve).maybeSingle();
  if (!ep) {
    const { data, error } = await db.from("epreuves")
      .insert({ concours_id: concours.id, nom: src.epreuve, ordre_affichage: ++ordreEp }).select("id").single();
    verifier(error, `épreuve ${src.epreuve}`);
    ep = data;
  }

  // Idempotence : supprimer les blocs a_verifier de cette épreuve.
  const { data: bl } = await db.from("blocs").select("id").eq("epreuve_id", ep.id);
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
    if (aSup.length) console.log(`Nettoyage ${src.epreuve} : ${aSup.length} bloc(s) supprimé(s).`);
  }

  const blocs = lire(src.file);
  let ordreBloc = 0, total = 0;
  for (const b of blocs) {
    const items = (b.items ?? []).filter((it) => /^[VF]$/.test(it.sol));
    if (!items.length) continue;
    const annale = await getAnnale(b.annee);
    const enonceCommun = `Question d'entraînement inédite, inspirée de l'épreuve GEIPI Polytech ${src.epreuve} ${b.annee}. `
      + `Pour chaque affirmation, indiquez si elle est vraie (V) ou fausse (F).`;
    const { data: bloc, error: eB } = await db.from("blocs")
      .insert({ annale_id: annale, epreuve_id: ep.id, enonce_commun: enonceCommun, ordre: ordreBloc++, statut: "brouillon" })
      .select("id").single();
    verifier(eB, `bloc ${src.epreuve} ${b.annee}`);

    let ordreQ = 0;
    for (const it of items) {
      const note = `GEIPI Polytech — ${src.epreuve} — Question INÉDITE (dérivée), inspirée de l'annale ${b.annee} `
        + `(${b.chap}). Rédigée pour l'entraînement, à relire.`;
      const { data: question, error: eQ } = await db.from("questions")
        .insert({ bloc_id: bloc.id, type: "choix_unique", enonce: it.e, chapitre: b.chap,
          explication: null, explication_origine: null, explication_relue: false,
          statut: "a_verifier", statut_extraction: "a_verifier", commentaire_extraction: note,
          confiance_extraction: null, auto_publiee: false, origine: "manuelle", ordre_dans_bloc: ordreQ++ })
        .select("id").single();
      verifier(eQ, `question ${src.epreuve} ${b.annee}`);
      const { error: eR } = await db.from("reponses_possibles").insert([
        { question_id: question.id, texte: "Vrai", est_correcte: it.sol === "V", ordre: 1 },
        { question_id: question.id, texte: "Faux", est_correcte: it.sol === "F", ordre: 2 },
      ]);
      verifier(eR, `réponses ${src.epreuve} ${b.annee}`);
      total++; grandTotal++;
    }
  }
  console.log(`✓ ${src.epreuve} : ${total} questions inédites importées.`);
}
console.log(`\n✓ Terminé — ${grandTotal} questions inédites GEIPI (sciences) en relecture.`);
