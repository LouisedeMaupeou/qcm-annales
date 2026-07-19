import { createClient } from "@supabase/supabase-js";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { lireFeuille } from "./lire-xlsx.mjs";

/**
 * Seed de l'annale ACCÈS 2025 depuis le fichier POC (§12, étape 4).
 *
 *   node --env-file=.env.local scripts/seed-acces-2025.mjs
 *
 * Idempotent : l'annale existante est supprimée puis recréée (cascade sur
 * blocs, questions et propositions).
 *
 * Décisions de modélisation, tirées de l'analyse du fichier :
 *
 *  - Un `groupe_id` du POC = UNE question de type vrai_faux, dont les 4 lignes
 *    deviennent les 4 `reponses_possibles`. Le scoring « tout ou rien » du §2.3
 *    s'applique à la question entière.
 *  - Les groupes MATH-11 à MATH-15 forment un problème chaîné (« [Suite du
 *    problème M. Dupont] ») : ils sont réunis dans UN bloc de 5 questions,
 *    servi entier et dans l'ordre (§2.2). Les autres groupes sont des blocs
 *    d'une seule question.
 *  - `confiance_extraction` reste NULL : le POC ne produit pas d'indice
 *    numérique, seulement OK / À VÉRIFIER. Publier avec un score inventé
 *    fausserait la règle du seuil à 90 % du §6.1.
 *  - Les questions marquées « À VÉRIFIER » entrent en file de relecture
 *    (statut a_verifier), les autres sont publiées. Aucune n'est marquée
 *    auto_publiee : elles ne viennent pas d'une extraction automatique notée.
 *  - Aucune explication n'est importée : le corrigé officiel n'en contient
 *    aucune (§10.2).
 */

const ANNEE = 2025;
const NOM_CONCOURS = "ACCÈS";
const BLOC_CHAINE = {
  // §10.3 : problème en 5 volets partageant le contexte et la figure de Q11.
  groupes: [
    "ACCES2025-MATH-11",
    "ACCES2025-MATH-12",
    "ACCES2025-MATH-13",
    "ACCES2025-MATH-14",
    "ACCES2025-MATH-15",
  ],
  enonceCommun:
    "Problème en cinq volets : le terrain de Monsieur Dupont. Les questions qui suivent partagent le même contexte et doivent être traitées dans l'ordre.",
};

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const cle = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !cle) {
  console.error(
    "NEXT_PUBLIC_SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY sont requis.\n" +
      "Lance : node --env-file=.env.local scripts/seed-acces-2025.mjs",
  );
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

const ici = dirname(fileURLToPath(import.meta.url));
const lignes = lireFeuille(
  join(ici, "..", "docs", "import-acces-2025-poc.xlsx"),
  2,
);

// --- Regroupement par groupe_id, dans l'ordre d'apparition -----------------
const groupes = new Map();
for (const l of lignes) {
  if (!groupes.has(l.groupe_id)) groupes.set(l.groupe_id, []);
  groupes.get(l.groupe_id).push(l);
}

const anomalies = [...groupes.entries()].filter(([, items]) => items.length !== 4);
if (anomalies.length) {
  console.error(
    `✗ ${anomalies.length} groupe(s) n'ont pas 4 propositions : ${anomalies
      .map(([g, i]) => `${g} (${i.length})`)
      .join(", ")}`,
  );
  process.exit(1);
}

console.log(`Fichier POC : ${lignes.length} propositions, ${groupes.size} questions.`);

// --- Concours et épreuves ---------------------------------------------------
const { data: concours, error: eConcours } = await db
  .from("concours")
  .select("id")
  .eq("nom", NOM_CONCOURS)
  .single();
verifier(eConcours, `concours ${NOM_CONCOURS} introuvable`);

const nomsEpreuves = [...new Set(lignes.map((l) => l.epreuve))];
const epreuves = new Map();
for (const [i, nom] of nomsEpreuves.entries()) {
  const { data, error } = await db
    .from("epreuves")
    .upsert(
      { concours_id: concours.id, nom, ordre_affichage: i + 1 },
      { onConflict: "concours_id,nom" },
    )
    .select("id")
    .single();
  verifier(error, `épreuve ${nom}`);
  epreuves.set(nom, data.id);
}
console.log(`Épreuves : ${nomsEpreuves.join(" · ")}`);

// --- Annale (recréée à blanc) ----------------------------------------------
await db
  .from("annales")
  .delete()
  .eq("concours_id", concours.id)
  .eq("annee", ANNEE);

const { data: annale, error: eAnnale } = await db
  .from("annales")
  .insert({
    concours_id: concours.id,
    annee: ANNEE,
    statut: "publie",
    // §6.1 : le POC part du sujet et du corrigé officiels, deux documents.
    format_source: "deux_documents",
  })
  .select("id")
  .single();
verifier(eAnnale, "création de l'annale");

// --- Blocs ------------------------------------------------------------------
/** Un bloc par groupe, sauf le problème chaîné qui les réunit. */
const plan = [];
const vus = new Set();
for (const [groupeId, items] of groupes) {
  if (vus.has(groupeId)) continue;

  if (BLOC_CHAINE.groupes.includes(groupeId)) {
    if (vus.has(BLOC_CHAINE.groupes[0])) continue;
    const membres = BLOC_CHAINE.groupes.filter((g) => groupes.has(g));
    membres.forEach((g) => vus.add(g));
    plan.push({
      epreuve: items[0].epreuve,
      enonceCommun: BLOC_CHAINE.enonceCommun,
      groupes: membres.map((g) => groupes.get(g)),
    });
  } else {
    vus.add(groupeId);
    plan.push({
      epreuve: items[0].epreuve,
      enonceCommun: null,
      groupes: [items],
    });
  }
}

const aVerifier = (items) =>
  items.some((i) => i.statut_extraction.trim().toUpperCase() !== "OK");

let nbQuestions = 0;
let nbPubliees = 0;
let nbRelecture = 0;

for (const [ordre, bloc] of plan.entries()) {
  // Un bloc étant tiré entier ou pas du tout (§2.2), il n'est publié que si
  // toutes ses questions le sont : une seule question douteuse retiendrait
  // sinon un bloc incomplet en session.
  const blocDouteux = bloc.groupes.some(aVerifier);

  const { data: ligneBloc, error: eBloc } = await db
    .from("blocs")
    .insert({
      annale_id: annale.id,
      epreuve_id: epreuves.get(bloc.epreuve),
      enonce_commun: bloc.enonceCommun,
      ordre,
      statut: blocDouteux ? "brouillon" : "publie",
    })
    .select("id")
    .single();
  verifier(eBloc, `bloc ${ordre}`);

  for (const [rang, items] of bloc.groupes.entries()) {
    const tete = items[0];
    const douteux = aVerifier(items);
    const commentaires = [...new Set(items.map((i) => i.commentaire).filter(Boolean))];

    const { data: question, error: eQuestion } = await db
      .from("questions")
      .insert({
        bloc_id: ligneBloc.id,
        type: "vrai_faux",
        enonce: tete.enonce_commun,
        chapitre: tete.chapitre_propose,
        explication: null,
        explication_origine: null,
        explication_relue: false,
        statut: douteux ? "a_verifier" : "publie",
        statut_extraction: douteux ? "a_verifier" : "ok",
        commentaire_extraction: commentaires.join(" ") || null,
        confiance_extraction: null,
        auto_publiee: false,
        origine: "extraite",
        ordre_dans_bloc: rang,
      })
      .select("id")
      .single();
    verifier(eQuestion, `question ${tete.groupe_id}`);

    const { error: eReponses } = await db.from("reponses_possibles").insert(
      items.map((item, i) => ({
        question_id: question.id,
        texte: item.proposition,
        est_correcte: item.bonne_reponse.trim().toUpperCase() === "VRAI",
        ordre: Number(item.item) || i + 1,
      })),
    );
    verifier(eReponses, `propositions de ${tete.groupe_id}`);

    nbQuestions += 1;
    if (douteux) nbRelecture += 1;
    else nbPubliees += 1;
  }
}

console.log(
  [
    "",
    `✓ Annale ${NOM_CONCOURS} ${ANNEE} importée`,
    `  ${plan.length} blocs (dont 1 problème chaîné de ${BLOC_CHAINE.groupes.length} questions)`,
    `  ${nbQuestions} questions — ${nbPubliees} publiées, ${nbRelecture} en file de relecture`,
    `  ${nbQuestions * 4} propositions`,
    "",
    "  Aucune explication : le corrigé officiel n'en fournit pas (§10.2).",
  ].join("\n"),
);
