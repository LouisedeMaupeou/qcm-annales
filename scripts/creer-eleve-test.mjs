import { createClient } from "@supabase/supabase-js";
import { createHash, randomBytes } from "node:crypto";

/**
 * Crée un compte élève de test reproduisant le parcours d'inscription (§5.1),
 * sans dépendre de l'envoi d'email (Resend refuse les adresses de test en mode
 * bac à sable). Confirme directement l'adresse pour rendre le compte actif.
 *
 *   node --env-file=.env.local scripts/creer-eleve-test.mjs
 */

const EMAIL = "camille.durand.test@example.com";
const PARENT = "parent.durand.test@example.com";
const MDP = "MotDePasse17";
const DDN = "2009-01-01"; // 17 ans en 2026 → parcours « mineur 15-17 »

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

// Repartir propre si le compte de test existe déjà.
const { data: liste } = await db.auth.admin.listUsers();
const existant = liste?.users?.find((u) => u.email === EMAIL);
if (existant) {
  await db.auth.admin.deleteUser(existant.id);
  console.log("Ancien compte de test supprimé.");
}

const { data: cree, error: eAuth } = await db.auth.admin.createUser({
  email: EMAIL,
  password: MDP,
  email_confirm: true, // adresse confirmée : on court-circuite le lien email
});
if (eAuth) {
  console.error("createUser:", eAuth.message);
  process.exit(1);
}
const id = cree.user.id;
const maintenant = new Date().toISOString();

const { error: eProfil } = await db.from("users").insert({
  id,
  email: EMAIL,
  role: "eleve",
  nom: "Durand",
  prenom: "Camille",
  date_naissance: DDN,
  ville: "Lyon",
  etablissement: "Lycée Ampère",
  email_parent: PARENT,
  consent_marketing: false,
  cgu_acceptees_date: maintenant,
  email_verifie: true, // → le trigger calculer_actif rend le compte actif
  autorisation_parentale: "non_requise", // 15-17 : parent informé, non bloquant
});
if (eProfil) {
  await db.auth.admin.deleteUser(id);
  console.error("profil:", eProfil.message);
  process.exit(1);
}

// Deux concours visés.
const { data: concours } = await db
  .from("concours")
  .select("id, nom")
  .in("nom", ["ACCÈS", "Puissance Alpha"]);
await db.from("user_concours_vises").insert(
  (concours ?? []).map((c) => ({ user_id: id, concours_id: c.id })),
);

// Accès parent (§5.1) : créé pour un mineur.
const jeton = randomBytes(32).toString("base64url");
await db.from("parent_access").insert({
  user_id: id,
  email_parent: PARENT,
  token_hash: createHash("sha256").update(jeton).digest("hex"),
});

const { data: verif } = await db
  .from("users")
  .select("prenom, nom, actif, autorisation_parentale, email_verifie")
  .eq("id", id)
  .single();

console.log("\n✓ Compte élève de test créé");
console.log(`  ${EMAIL} / ${MDP}`);
console.log(`  ${JSON.stringify(verif)}`);
