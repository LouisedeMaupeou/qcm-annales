import { createClient } from "@supabase/supabase-js";

/**
 * Réinitialise le mot de passe d'un compte (par email).
 *
 *   node --env-file=.env.local scripts/reinit-mdp.mjs <email> <nouveau_motdepasse>
 *
 * Utilise la clé service_role (admin.updateUserById). Le mot de passe est passé
 * en argument par l'utilisateur — il n'est jamais stocké dans le dépôt.
 */
const [, , email, motDePasse] = process.argv;

if (!email || !motDePasse) {
  console.error("Usage : node --env-file=.env.local scripts/reinit-mdp.mjs <email> <motdepasse>");
  process.exit(1);
}
if (motDePasse.length < 8) {
  console.error("Le mot de passe doit faire au moins 8 caractères.");
  process.exit(1);
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const cle = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !cle) {
  console.error("NEXT_PUBLIC_SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY requis.");
  process.exit(1);
}

const db = createClient(url, cle, { auth: { autoRefreshToken: false, persistSession: false } });

// L'id du profil users est identique à l'uid auth.
const { data: profil, error: eProfil } = await db
  .from("users").select("id, role").eq("email", email).maybeSingle();
if (eProfil) { console.error(`✗ ${eProfil.message}`); process.exit(1); }
if (!profil) { console.error(`✗ Aucun compte avec l'email ${email}.`); process.exit(1); }

const { error } = await db.auth.admin.updateUserById(profil.id, { password: motDePasse });
if (error) { console.error(`✗ ${error.message}`); process.exit(1); }

console.log(`✓ Mot de passe réinitialisé pour ${email} (rôle ${profil.role}).`);
