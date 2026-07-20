import { createClient } from "@supabase/supabase-js";

/**
 * Renseigne les barèmes relevés sur les sujets officiels.
 *
 *   node --env-file=.env.local scripts/baremes-officiels.mjs
 *
 * Un barème n'est marqué vérifié (`verifie_le`) que si la plateforme sait
 * réellement l'appliquer. Le cas GEIPI Polytech montre pourquoi la nuance
 * compte : sa règle est connue et sourcée, mais inapplicable en l'état — la
 * dater reviendrait à affirmer que les notes affichées sont conformes.
 */

const BAREMES = [
  {
    concours: "Puissance Alpha",
    points_bonne: 1,
    points_mauvaise: -0.5,
    points_abstention: 0,
    regle_speciale:
      "Un exercice comporte 4 affirmations à juger vraies ou fausses. Une réponse annulée ou l'abstention ne rapporte ni ne retire aucun point.",
    source_officielle:
      "Annales Puissance Alpha, épreuve de mathématiques bac général, session du 27 avril 2024, encadré de consignes",
    // La plateforme applique exactement cette règle : on peut la dater.
    verifie: true,
  },
  {
    concours: "GEIPI Polytech",
    // Valeurs laissées telles quelles : voir la réserve ci-dessous.
    regle_speciale:
      "⚠️ Le sujet officiel 2026 contredit le §2 des specs : « Une réponse fausse sera pénalisée par des points négatifs. Pour chaque exercice, le total des points obtenu ne peut être strictement négatif. Aucun point n'est enlevé en l'absence de réponse. » Le plancher par exercice n'est pas exprimable dans le modèle actuel, qui ne plafonne qu'au niveau de la session. Tant que ce plancher n'est pas implémenté, appliquer les points négatifs surpénaliserait les élèves : le barème reste donc sans point négatif et non vérifié.",
    source_officielle:
      "Sujet officiel GEIPI Polytech 2026, épreuve « Mathématiques – QCM (40 points) », encadré de consignes",
    verifie: false,
  },
];

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const cle = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !cle) {
  console.error("NEXT_PUBLIC_SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY requis.");
  process.exit(1);
}

const db = createClient(url, cle, {
  auth: { autoRefreshToken: false, persistSession: false },
});

for (const b of BAREMES) {
  const { data: concours, error: eC } = await db
    .from("concours")
    .select("id")
    .eq("nom", b.concours)
    .single();
  if (eC) {
    console.error(`✗ concours ${b.concours} : ${eC.message}`);
    process.exit(1);
  }

  const maj = {
    regle_speciale: b.regle_speciale,
    source_officielle: b.source_officielle,
    verifie_le: b.verifie ? new Date().toISOString().slice(0, 10) : null,
  };
  if (b.points_bonne !== undefined) {
    maj.points_bonne = b.points_bonne;
    maj.points_mauvaise = b.points_mauvaise;
    maj.points_abstention = b.points_abstention;
  }

  const { error } = await db
    .from("baremes")
    .update(maj)
    .eq("concours_id", concours.id)
    .is("epreuve_id", null);

  if (error) {
    console.error(`✗ barème ${b.concours} : ${error.message}`);
    process.exit(1);
  }

  console.log(
    `✓ ${b.concours.padEnd(18)} ${b.verifie ? "vérifié et daté" : "sourcé, laissé NON vérifié (règle inapplicable en l'état)"}`,
  );
}
