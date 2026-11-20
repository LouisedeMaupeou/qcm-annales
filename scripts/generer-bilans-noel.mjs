import { readFileSync } from "node:fs";

/**
 * Crée les bilans manquants d'une session.
 *
 * Même effet que le bouton « Générer les bilans » du back-office : la ligne
 * est créée vide, les chiffres se recalculent à la lecture depuis les copies
 * et les évaluations orales (§5.4, « les chiffres sont calculés »).
 */

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8").split(/\r?\n/).filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]),
);
const url = env.NEXT_PUBLIC_SUPABASE_URL, cle = env.SUPABASE_SERVICE_ROLE_KEY;
const entetes = { apikey: cle, Authorization: `Bearer ${cle}`, "Content-Type": "application/json" };
const req = async (c, m = "GET", corps = null) => {
  const r = await fetch(`${url}/rest/v1/${c}`, { method: m, headers: entetes, ...(corps ? { body: JSON.stringify(corps) } : {}) });
  if (!r.ok) throw new Error(`${r.status} ${await r.text()}`);
  const t = m === "GET" ? await r.text() : "";
  return t ? JSON.parse(t) : null;
};

const [session] = await req(`sessions_cb?select=id,nom&nom=eq.${encodeURIComponent(process.argv[2])}`);
if (!session) { console.error("session introuvable"); process.exit(1); }

// Les élèves de la session : ceux des cohortes convoquées à ses épreuves.
const epreuves = await req(`epreuves_cb?select=id&session_cb_id=eq.${session.id}`);
const liens = await req(`epreuve_cb_cohortes?select=cohorte_id&epreuve_cb_id=in.(${epreuves.map((e) => e.id).join(",")})`);
const cohortes = [...new Set(liens.map((l) => l.cohorte_id))];
const eleves = await req(`users?select=id,prenom,nom&cohorte_id=in.(${cohortes.join(",")})&order=nom`);

const existants = await req(`bilans?select=user_id&session_cb_id=eq.${session.id}`);
const deja = new Set(existants.map((b) => b.user_id));
const aCreer = eleves.filter((e) => !deja.has(e.id));

console.log(`${session.nom} : ${eleves.length} élève(s), ${existants.length} bilan(s) existant(s), ${aCreer.length} à créer.`);
for (const e of aCreer) console.log(`   + ${e.prenom} ${e.nom}`);

if (aCreer.length > 0) {
  await req("bilans", "POST", aCreer.map((e) => ({ session_cb_id: session.id, user_id: e.id })));
  console.log(`\n${aCreer.length} bilan(s) créé(s).`);
}

const apres = await req(`bilans?select=id,statut,user_id,users!bilans_user_id_fkey(prenom,nom)&session_cb_id=eq.${session.id}`);
console.log("\nBilans de la session :");
for (const b of apres) console.log(`   ${b.users.prenom} ${b.users.nom} — ${b.statut} — /admin/prepa/bilans/${b.id}`);
