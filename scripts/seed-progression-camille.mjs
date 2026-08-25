import { createClient } from "@supabase/supabase-js";

/**
 * Génère 3 sessions par matière pour le compte de test Camille, afin de vérifier
 * le tracé de la courbe de progression (§5.4 : courbe visible dès 2 sessions,
 * tendance dès 3). Données de démonstration, non jouées à la main.
 *
 *   node --env-file=.env.local scripts/seed-progression-camille.mjs
 */

const EMAIL = "camille.durand.test@example.com";
const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);

const { data: eleve } = await db.from("users").select("id").eq("email", EMAIL).single();
if (!eleve) {
  console.error("Compte Camille introuvable.");
  process.exit(1);
}

// Matières déjà jouées par Camille (un couple concours × épreuve par concours).
const { data: existantes } = await db
  .from("sessions")
  .select("concours_id, epreuve_id, concours(nom, taille_session), epreuves(nom)")
  .eq("user_id", eleve.id);

const matieres = [
  ...new Map(
    (existantes ?? []).map((s) => [
      `${s.concours_id}:${s.epreuve_id}`,
      {
        concours_id: s.concours_id,
        epreuve_id: s.epreuve_id,
        concoursNom: s.concours?.nom,
        taille: s.concours?.taille_session ?? 10,
        epreuveNom: s.epreuves?.nom,
      },
    ]),
  ).values(),
];

// On repart propre pour un tracé lisible.
await db.from("session_questions").delete().in(
  "session_id",
  ((await db.from("sessions").select("id").eq("user_id", eleve.id)).data ?? []).map((s) => s.id),
);
await db.from("sessions").delete().eq("user_id", eleve.id);

// Trois scores croissants par matière → courbe montante + tendance « en progrès ».
const PALIERS = [0.35, 0.55, 0.75];
const jourISO = (ilYaJours) => {
  const d = new Date();
  d.setDate(d.getDate() - ilYaJours);
  return d.toISOString();
};

let creees = 0;
for (const m of matieres) {
  for (const [i, score] of PALIERS.entries()) {
    const nb = m.taille;
    const correctes = Math.round(score * nb);
    const quand = jourISO((PALIERS.length - i) * 7); // 21, 14, 7 jours

    const { error } = await db.from("sessions").insert({
      user_id: eleve.id,
      concours_id: m.concours_id,
      epreuve_id: m.epreuve_id,
      mode: "entrainement",
      points: correctes,
      points_max: nb,
      score_normalise: score,
      nb_questions: nb,
      nb_correctes: correctes,
      nb_abstentions: 0,
      started_at: quand,
      completed_at: quand,
    });
    if (error) {
      console.error(`✗ ${m.concoursNom} session ${i + 1} : ${error.message}`);
      process.exit(1);
    }
    creees += 1;
  }
}

console.log(`✓ ${creees} sessions générées sur ${matieres.length} matières (3 chacune, scores 35 % → 75 %).`);
console.log("  Matières : " + matieres.map((m) => m.concoursNom).join(", "));
