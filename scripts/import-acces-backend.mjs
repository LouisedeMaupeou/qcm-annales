import { createClient } from "@supabase/supabase-js";
import * as XLSX from "xlsx";
import * as fs from "node:fs";

XLSX.set_fs(fs);

/**
 * Import du gabarit « qcm-acces-2021-2025-backend » (§6.1).
 *
 *   node --env-file=.env.local scripts/import-acces-backend.mjs <fichier.xlsx> [annees]
 *   ex. ... import-acces-backend.mjs fichier.xlsx 2021,2022,2023,2024
 *
 * Sans liste d'années, toutes les années du fichier sont importées.
 *
 * 1 exercice = 1 bloc contenant 1 question vrai/faux à 4 propositions (items
 * a-d). Contenu saisi et reformulé à la main → origine « manuelle », publié
 * directement (pas d'extraction automatique à relire). Idempotent par
 * (année, épreuve) : les blocs existants de ce couple sont supprimés avant
 * réinsertion, SAUF ceux dont une question a déjà été jouée — on ne détruit pas
 * d'historique de session (l'appelant est prévenu si cela bloque un import).
 */

const CONCOURS = "ACCÈS";
const [, , chemin, anneesArg] = process.argv;
const filtreAnnees = anneesArg ? new Set(anneesArg.split(",").map((a) => a.trim())) : null;

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const cle = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !cle || !chemin) {
  console.error("Usage : node --env-file=.env.local scripts/import-acces-backend.mjs <fichier.xlsx> [annees]");
  process.exit(1);
}

const db = createClient(url, cle, { auth: { persistSession: false } });
const n = (v) => String(v ?? "").trim();
const verifier = (e, ctx) => {
  if (e) {
    console.error(`✗ ${ctx} : ${e.message}`);
    process.exit(1);
  }
};

const lignes = XLSX.utils.sheet_to_json(XLSX.readFile(chemin).Sheets["Saisie"], {
  defval: "",
  raw: false,
});

// Regroupement (année, exercice) en préservant l'ordre d'apparition.
const exercices = new Map();
for (const l of lignes) {
  const annee = n(l.annee);
  if (filtreAnnees && !filtreAnnees.has(annee)) continue;
  const cle = `${annee}‖${n(l.exercice)}`;
  if (!exercices.has(cle)) exercices.set(cle, { annee, items: [] });
  exercices.get(cle).items.push(l);
}

if (exercices.size === 0) {
  console.error("Aucun exercice pour les années demandées.");
  process.exit(1);
}

const { data: concours, error: eC } = await db
  .from("concours").select("id").eq("nom", CONCOURS).single();
verifier(eC, "concours ACCÈS");

const anneesConcernees = [...new Set([...exercices.values()].map((x) => x.annee))].sort();
const EPREUVE = "Raisonnement logique et mathématiques";

// Épreuve (une seule pour ce fichier), créée si absente.
let { data: epreuve } = await db
  .from("epreuves").select("id").eq("concours_id", concours.id).eq("nom", EPREUVE).maybeSingle();
if (!epreuve) {
  const { data, error } = await db
    .from("epreuves")
    .insert({ concours_id: concours.id, nom: EPREUVE, ordre_affichage: 1 })
    .select("id").single();
  verifier(error, "création épreuve");
  epreuve = data;
}

let totalBlocs = 0;
let totalQuestions = 0;

for (const annee of anneesConcernees) {
  // Annale de l'année, créée si absente.
  let { data: annale } = await db
    .from("annales").select("id").eq("concours_id", concours.id).eq("annee", Number(annee)).maybeSingle();
  if (!annale) {
    const { data, error } = await db
      .from("annales")
      .insert({ concours_id: concours.id, annee: Number(annee), statut: "publie", format_source: "un_document" })
      .select("id").single();
    verifier(error, `création annale ${annee}`);
    annale = data;
  }

  // Idempotence : blocs existants de cette année+épreuve, sauf ceux déjà joués.
  const { data: blocsExistants } = await db
    .from("blocs").select("id, questions(id, session_questions(id))")
    .eq("annale_id", annale.id).eq("epreuve_id", epreuve.id);

  const aSupprimer = [];
  const proteges = [];
  for (const b of blocsExistants ?? []) {
    const joue = (b.questions ?? []).some((q) => (q.session_questions ?? []).length > 0);
    (joue ? proteges : aSupprimer).push(b.id);
  }
  if (proteges.length > 0) {
    console.error(
      `✗ ${annee} : ${proteges.length} bloc(s) déjà joué(s) en session. Import interrompu pour ne pas détruire d'historique.\n` +
      `  Traite ces sessions d'abord, ou importe une autre année.`,
    );
    process.exit(1);
  }
  if (aSupprimer.length > 0) {
    const { error } = await db.from("blocs").delete().in("id", aSupprimer);
    verifier(error, `nettoyage ${annee}`);
    console.log(`  ${annee} : ${aSupprimer.length} bloc(s) existant(s) remplacé(s)`);
  }

  // Insertion.
  const exos = [...exercices.values()].filter((x) => x.annee === annee);
  for (const [ordre, exo] of exos.entries()) {
    const tete = exo.items[0];
    const { data: bloc, error: eB } = await db
      .from("blocs")
      .insert({ annale_id: annale.id, epreuve_id: epreuve.id, enonce_commun: null, ordre, statut: "publie" })
      .select("id").single();
    verifier(eB, `bloc ${annee} #${ordre}`);

    const { data: question, error: eQ } = await db
      .from("questions")
      .insert({
        bloc_id: bloc.id,
        type: "vrai_faux",
        enonce: n(tete.contexte) || n(tete.exercice),
        chapitre: n(tete.chapitre),
        statut: "publie",
        statut_extraction: "manuel",
        origine: "manuelle",
        auto_publiee: false,
        ordre_dans_bloc: 0,
      })
      .select("id").single();
    verifier(eQ, `question ${annee} #${ordre}`);

    const items = [...exo.items].sort((a, b) => n(a.item).localeCompare(n(b.item)));
    const { error: eR } = await db.from("reponses_possibles").insert(
      items.map((it, i) => ({
        question_id: question.id,
        texte: n(it.affirmation),
        est_correcte: n(it.reponse).toUpperCase() === "VRAI",
        ordre: i + 1,
      })),
    );
    verifier(eR, `propositions ${annee} #${ordre}`);

    totalBlocs += 1;
    totalQuestions += 1;
  }
}

console.log(`\n✓ Import ACCÈS terminé : années ${anneesConcernees.join(", ")}`);
console.log(`  ${totalBlocs} exercices (blocs), ${totalQuestions} questions vrai/faux, ${totalQuestions * 4} propositions.`);
