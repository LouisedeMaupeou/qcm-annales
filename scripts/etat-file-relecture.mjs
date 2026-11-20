import { readFileSync } from "node:fs";

/**
 * État de la file de relecture, par origine.
 *
 * Avant toute suppression en masse, il faut savoir ce qu'on s'apprête à
 * perdre : la file mélange des imports de concours blancs tout neufs et des
 * annales relues depuis des mois.
 */

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split(/\r?\n/)
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]),
);

const url = env.NEXT_PUBLIC_SUPABASE_URL;
const cle = env.SUPABASE_SERVICE_ROLE_KEY;

async function req(chemin, entetes = {}) {
  const r = await fetch(`${url}/rest/v1/${chemin}`, {
    headers: { apikey: cle, Authorization: `Bearer ${cle}`, ...entetes },
  });
  if (!r.ok) throw new Error(`${r.status} ${await r.text()}`);
  return { corps: await r.json(), intervalle: r.headers.get("content-range") };
}

const STATUTS = "statut=in.(brouillon,a_verifier,depubliee)";

// Compte exact : une réponse PostgREST plafonne à 1000 lignes, un count non.
const { intervalle } = await req(`questions?select=id&${STATUTS}&limit=1`, {
  Prefer: "count=exact",
});
const total = Number(intervalle?.split("/")[1] ?? 0);
console.log(`File de relecture : ${total} question(s)\n`);

// Pagination explicite, sinon on ne verrait que les 1000 premières.
const toutes = [];
for (let de = 0; de < total; de += 1000) {
  const { corps } = await req(
    `questions?select=id,statut,created_at,epreuve_id_externe,blocs(epreuve_id_externe,annales(annee,concours(nom)))&${STATUTS}&order=created_at.asc&offset=${de}&limit=1000`,
  );
  toutes.push(...corps);
}

const parOrigine = new Map();
for (const q of toutes) {
  const externe = q.blocs?.epreuve_id_externe ?? q.epreuve_id_externe;
  const origine = externe
    ? `concours blanc · ${String(externe).split("-").slice(0, 2).join("-")}`
    : `${q.blocs?.annales?.concours?.nom ?? "?"} ${q.blocs?.annales?.annee ?? ""}`.trim();
  if (!parOrigine.has(origine)) parOrigine.set(origine, { n: 0, plusAncienne: q.created_at, plusRecente: q.created_at });
  const e = parOrigine.get(origine);
  e.n += 1;
  if (q.created_at < e.plusAncienne) e.plusAncienne = q.created_at;
  if (q.created_at > e.plusRecente) e.plusRecente = q.created_at;
}

const jour = (d) => (d ? String(d).slice(0, 10) : "?");
console.log("origine                                     nb   de         à");
for (const [origine, e] of [...parOrigine.entries()].sort((a, b) => b[1].n - a[1].n)) {
  console.log(
    `${origine.padEnd(42)} ${String(e.n).padStart(4)}   ${jour(e.plusAncienne)} ${jour(e.plusRecente)}`,
  );
}

const parStatut = new Map();
for (const q of toutes) parStatut.set(q.statut, (parStatut.get(q.statut) ?? 0) + 1);
console.log("\npar statut :", [...parStatut].map(([s, n]) => `${s} ${n}`).join(", "));
console.log(`\n⚠ L'écran /admin/relecture lit sans pagination : il n'en montre que 1000 au plus.`);
