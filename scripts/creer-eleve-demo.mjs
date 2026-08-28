import { createClient } from "@supabase/supabase-js";

/**
 * Crée un élève de démonstration complet (coordonnées, parent, concours visés,
 * quelques sessions) pour vérifier l'affichage du back-office. À supprimer après.
 *   node --env-file=.env.local scripts/creer-eleve-demo.mjs
 */

const EMAIL = "eleve.demo@example.com";
const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

const liste = await db.auth.admin.listUsers();
const dejaLa = liste.data?.users?.find((u) => u.email === EMAIL);
if (dejaLa) await db.auth.admin.deleteUser(dejaLa.id);

const { data: cree, error } = await db.auth.admin.createUser({
  email: EMAIL,
  password: "motdepasse123",
  email_confirm: true,
});
if (error) { console.error(error.message); process.exit(1); }
const id = cree.user.id;

await db.from("users").insert({
  id,
  email: EMAIL,
  role: "eleve",
  prenom: "Léa",
  nom: "Martin",
  date_naissance: "2009-05-14",
  ville: "Bordeaux",
  etablissement: "Lycée Montaigne",
  email_parent: "parent.martin@example.com",
  telephone_parent: "06 11 22 33 44",
  consent_marketing: true,
  consent_marketing_date: new Date().toISOString(),
  cgu_acceptees_date: new Date().toISOString(),
  email_verifie: true,
  autorisation_parentale: "non_requise",
});

const { data: concours } = await db
  .from("concours").select("id, nom, taille_session").in("nom", ["ACCÈS", "Puissance Alpha"]);
await db.from("user_concours_vises").insert(
  (concours ?? []).map((c) => ({ user_id: id, concours_id: c.id })),
);

// Quelques sessions terminées, pour la progression.
const acces = concours.find((c) => c.nom === "ACCÈS");
const { data: epreuve } = await db
  .from("epreuves").select("id").eq("concours_id", acces.id).limit(1).maybeSingle();

if (epreuve) {
  for (const [i, score] of [0.4, 0.55, 0.7].entries()) {
    const quand = new Date();
    quand.setDate(quand.getDate() - (3 - i) * 6);
    const nb = acces.taille_session;
    await db.from("sessions").insert({
      user_id: id, concours_id: acces.id, epreuve_id: epreuve.id, mode: "entrainement",
      points: Math.round(score * nb), points_max: nb, score_normalise: score,
      nb_questions: nb, nb_correctes: Math.round(score * nb), nb_abstentions: 0,
      started_at: quand.toISOString(), completed_at: quand.toISOString(),
    });
  }
}

console.log(`✓ Élève de démo créé : ${EMAIL} (Léa Martin, Bordeaux, parent + tél, 2 concours, 3 sessions).`);
