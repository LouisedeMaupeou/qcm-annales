import { createClient } from "@supabase/supabase-js";

/**
 * Crée (ou promeut) un compte admin ou contributeur.
 *
 *   node --env-file=.env.local scripts/creer-admin.mjs <email> <motdepasse> [role]
 *
 * Le rôle n'est jamais modifiable depuis l'application : la RLS interdit à un
 * élève de se promouvoir, et le formulaire d'inscription force `eleve`. Passer
 * par ce script est donc le seul chemin.
 */

const [, , email, motDePasse, role = "admin"] = process.argv;

if (!email || !motDePasse) {
  console.error(
    "Usage : node --env-file=.env.local scripts/creer-admin.mjs <email> <motdepasse> [admin|contributeur|responsable_prepa]",
  );
  process.exit(1);
}

if (!["admin", "contributeur", "responsable_prepa"].includes(role)) {
  console.error("Le rôle doit être 'admin', 'contributeur' ou 'responsable_prepa'.");
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

const db = createClient(url, cle, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const { data: existant } = await db
  .from("users")
  .select("id, role")
  .eq("email", email)
  .maybeSingle();

if (existant) {
  const { error } = await db
    .from("users")
    .update({ role, email_verifie: true, suspendu: false })
    .eq("id", existant.id);
  if (error) {
    console.error(`✗ ${error.message}`);
    process.exit(1);
  }
  console.log(`✓ ${email} promu ${role} (était ${existant.role}).`);
  process.exit(0);
}

const { data: cree, error: eAuth } = await db.auth.admin.createUser({
  email,
  password: motDePasse,
  email_confirm: true,
});
if (eAuth) {
  console.error(`✗ ${eAuth.message}`);
  process.exit(1);
}

const { error: eProfil } = await db.from("users").insert({
  id: cree.user.id,
  email,
  role,
  nom: "Compte",
  prenom:
    role === "admin"
      ? "Admin"
      : role === "responsable_prepa"
        ? "Responsable prépa"
        : "Contributeur",
  // Champ obligatoire du §7 ; un compte de back-office n'a pas de parcours
  // mineur, la date sert seulement à satisfaire la contrainte.
  date_naissance: "1990-01-01",
  email_verifie: true,
  autorisation_parentale: "non_requise",
  cgu_acceptees_date: new Date().toISOString(),
});

if (eProfil) {
  await db.auth.admin.deleteUser(cree.user.id);
  console.error(`✗ ${eProfil.message}`);
  process.exit(1);
}

console.log(`✓ Compte ${role} créé : ${email}`);
