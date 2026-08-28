// Import des questions d'anglais ACCÈS (Vrai/Faux à 4 items) en file de relecture.
//   node --env-file=.env.local scripts/importer-acces-anglais.mjs
// Idempotent : les blocs de l'épreuve « Anglais » d'ACCÈS sont supprimés puis recréés.
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

const DOSSIER =
  "C:\\Users\\paul\\AppData\\Local\\Temp\\claude\\C--Users-paul-OneDrive-Documents-claude-site\\957c4ac5-e39c-4dc8-88e1-40b88e0b2e90\\scratchpad";
const lire = (f) => JSON.parse(readFileSync(`${DOSSIER}\\${f}`, "utf8"));

// 2025 = annale officielle (grammaire) ; 2021-2024 = cahiers (grammaire + compréhension).
const SUJETS = [
  { fichier: "angC2021.json", annee: 2021 },
  { fichier: "angC2022.json", annee: 2022 },
  { fichier: "angC2023.json", annee: 2023 },
  { fichier: "angC2024.json", annee: 2024 },
  { fichier: "ang2025.json", annee: 2025 },
];

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const cle = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !cle) { console.error("Clés Supabase requises."); process.exit(1); }
const db = createClient(url, cle, { auth: { persistSession: false } });
const verifier = (e, ctx) => { if (e) { console.error(`✗ ${ctx} : ${e.message}`); process.exit(1); } };

const { data: concours } = await db.from("concours").select("id").eq("nom", "ACCÈS").single();
const { data: ep } = await db.from("epreuves").select("id, nom").eq("concours_id", concours.id);
const epAnglais = ep.find((e) => /anglais/i.test(e.nom));
if (!epAnglais) { console.error("Épreuve Anglais ACCÈS absente."); process.exit(1); }

// Nettoyage idempotent : on supprime UNIQUEMENT les questions importées
// automatiquement (statut a_verifier), en lots pour ne pas dépasser la limite
// d'URL de PostgREST. On préserve les questions publiées/jouées (référencées par
// des sessions), qu'on ne peut pas supprimer sans casser l'historique.
{
  const { data: blocs } = await db.from("blocs").select("id").eq("epreuve_id", epAnglais.id);
  const blIds = (blocs ?? []).map((b) => b.id);
  const aSupprimer = [];
  for (let i = 0; i < blIds.length; i += 200) {
    const { data: qs } = await db.from("questions")
      .select("bloc_id, statut").in("bloc_id", blIds.slice(i, i + 200)).eq("statut", "a_verifier");
    (qs ?? []).forEach((q) => aSupprimer.push(q.bloc_id));
  }
  for (let i = 0; i < aSupprimer.length; i += 100) {
    const { error } = await db.from("blocs").delete().in("id", aSupprimer.slice(i, i + 100));
    verifier(error, "suppression blocs anglais");
  }
  console.log(`Nettoyage : ${aSupprimer.length} bloc(s) d'anglais (a_verifier) supprimé(s).`);
}

const ordreParAnnale = new Map();
let total = 0;
for (const sujet of SUJETS) {
  const { grammaire } = lire(sujet.fichier);
  let { data: annale } = await db.from("annales").select("id")
    .eq("concours_id", concours.id).eq("annee", sujet.annee).maybeSingle();
  if (!annale) {
    const { data, error } = await db.from("annales")
      .insert({ concours_id: concours.id, annee: sujet.annee, statut: "publie", format_source: "un_document" })
      .select("id").single();
    verifier(error, `annale ${sujet.annee}`);
    annale = data;
  }

  const { compregen } = lire(sujet.fichier);
  const lots = [
    { arr: grammaire ?? [], chap: "Anglais — grammaire et vocabulaire" },
    { arr: compregen ?? [], chap: "Anglais — compréhension écrite" },
  ];
  let nAn = 0;
  for (const { arr, chap } of lots) {
    for (const q of arr) {
      if (!/^[VF]{4}$/.test(q.sol) || q.items.length !== 4) continue;
      const ordre = ordreParAnnale.get(annale.id) ?? 0;
      ordreParAnnale.set(annale.id, ordre + 1);
      const { data: bloc, error: eB } = await db.from("blocs")
        .insert({ annale_id: annale.id, epreuve_id: epAnglais.id, enonce_commun: null, ordre, statut: "brouillon" })
        .select("id").single();
      verifier(eB, `bloc ${sujet.annee} Q${q.n}`);

      const note = `Concours ACCÈS — Anglais — Question ${q.n} (${sujet.annee}). `
        + `Importée automatiquement depuis le PDF officiel (Vrai/Faux). À relire.`;
      const { data: question, error: eQ } = await db.from("questions")
        .insert({
          bloc_id: bloc.id, type: "vrai_faux", enonce: q.enonce, chapitre: chap,
          explication: null, explication_origine: null, explication_relue: false,
          statut: "a_verifier", statut_extraction: "a_verifier",
          commentaire_extraction: note, confiance_extraction: null,
          auto_publiee: false, origine: "extraite", ordre_dans_bloc: 0,
        }).select("id").single();
      verifier(eQ, `question ${sujet.annee} Q${q.n}`);

      const { error: eR } = await db.from("reponses_possibles").insert(
        q.items.map((texte, i) => ({ question_id: question.id, texte, est_correcte: q.sol[i] === "V", ordre: i + 1 })),
      );
      verifier(eR, `réponses ${sujet.annee} Q${q.n}`);
      total++; nAn++;
    }
  }
  console.log(`✓ Anglais ${sujet.annee} : ${nAn} questions importées.`);
}
console.log(`\n✓ Terminé — ${total} questions d'anglais en relecture (type Vrai/Faux).`);
