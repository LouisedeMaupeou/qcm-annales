import { createClient } from "@supabase/supabase-js";

/**
 * Retire le préfixe d'échafaudage « Série A – Exercice 1 : » des chapeaux de
 * bloc, en gardant la phrase qui suit. Aperçu par défaut ; écrit avec --apply.
 *
 *   node --env-file=.env.local scripts/nettoyer-prefixe-exercice.mjs [--apply]
 */

const APPLIQUER = process.argv.includes("--apply");

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);

// « Série A – » facultatif, puis « Exercice N : », insensible à la casse.
const PREFIXE =
  /^\s*(?:s[ée]rie\s+[a-z]\s*[–-]\s*)?exercice\s*n?[°º]?\s*\d+\s*[:.\-–]\s*/i;

const { data, error } = await db
  .from("blocs")
  .select("id, enonce_commun")
  .not("enonce_commun", "is", null);

if (error) {
  console.error(error.message);
  process.exit(1);
}

const changements = [];
for (const b of data) {
  if (!PREFIXE.test(b.enonce_commun)) continue;
  const apres = b.enonce_commun.replace(PREFIXE, "").trim();
  changements.push({ id: b.id, avant: b.enonce_commun, apres: apres || null });
}

console.log(`${changements.length} chapeau(x) concerné(s).\n`);
for (const c of changements) {
  console.log(`  « ${c.avant} »`);
  console.log(`→ ${c.apres === null ? "(vide → supprimé)" : "« " + c.apres + " »"}\n`);
}

if (!APPLIQUER) {
  console.log("APERÇU — rien n'a été écrit. Relance avec --apply pour appliquer.");
  process.exit(0);
}

let n = 0;
for (const c of changements) {
  const { error: e } = await db
    .from("blocs")
    .update({ enonce_commun: c.apres })
    .eq("id", c.id);
  if (e) {
    console.error(`✗ ${c.id} : ${e.message}`);
    process.exit(1);
  }
  n += 1;
}
console.log(`✓ ${n} chapeau(x) mis à jour.`);
