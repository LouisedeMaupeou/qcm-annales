import { createClient } from "@supabase/supabase-js";
import { writeFileSync } from "node:fs";

/**
 * Exporte toutes les questions publiées (contenu + réponses) en JSON, pour une
 * relecture humaine. node --env-file=.env.local scripts/exporter-questions-relecture.mjs <sortie.json>
 */

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);

const { data, error } = await db
  .from("questions")
  .select(
    "id, type, enonce, chapitre, explication, explication_relue, ordre_dans_bloc, blocs!inner(enonce_commun, ordre, annales!inner(annee, concours!inner(nom)), epreuves!inner(nom)), reponses_possibles(texte, est_correcte, ordre)",
  )
  .eq("statut", "publie");

if (error) {
  console.error(error.message);
  process.exit(1);
}

const questions = data.map((q) => {
  const bloc = q.blocs;
  return {
    concours: bloc.annales.concours.nom,
    annee: bloc.annales.annee,
    epreuve: bloc.epreuves.nom,
    chapitre: q.chapitre,
    type: q.type,
    blocOrdre: bloc.ordre,
    ordreDansBloc: q.ordre_dans_bloc,
    enonceCommun: bloc.enonce_commun,
    enonce: q.enonce,
    explication: q.explication_relue ? q.explication : null,
    propositions: [...(q.reponses_possibles ?? [])]
      .sort((a, b) => a.ordre - b.ordre)
      .map((r) => ({ texte: r.texte, correcte: r.est_correcte })),
  };
});

// Tri stable pour une lecture ordonnée.
questions.sort(
  (a, b) =>
    a.concours.localeCompare(b.concours, "fr") ||
    a.epreuve.localeCompare(b.epreuve, "fr") ||
    a.annee - b.annee ||
    a.blocOrdre - b.blocOrdre ||
    a.ordreDansBloc - b.ordreDansBloc,
);

writeFileSync(process.argv[2], JSON.stringify(questions, null, 1), "utf8");
console.log(`${questions.length} questions exportées vers ${process.argv[2]}`);
