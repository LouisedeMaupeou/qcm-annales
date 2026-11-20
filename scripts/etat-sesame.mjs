import { readFileSync } from "node:fs";

/** État des sept épreuves SÉSAME après import. */

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split(/\r?\n/)
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]),
);

const url = env.NEXT_PUBLIC_SUPABASE_URL;
const cle = env.SUPABASE_SERVICE_ROLE_KEY;

async function req(chemin) {
  const r = await fetch(`${url}/rest/v1/${chemin}`, {
    headers: { apikey: cle, Authorization: `Bearer ${cle}` },
  });
  if (!r.ok) throw new Error(`${r.status} ${await r.text()}`);
  return r.json();
}
async function compter(chemin) {
  const r = await fetch(`${url}/rest/v1/${chemin}&limit=1`, {
    headers: { apikey: cle, Authorization: `Bearer ${cle}`, Prefer: "count=exact" },
  });
  return Number(r.headers.get("content-range")?.split("/")[1] ?? 0);
}

const EPREUVES = [
  "SES-MAT-S1",
  "SES-DIG-S1",
  "SES-FR-S2",
  "SES-ANG-S2",
  "SES-DE-S2",
  "SES-ES-S2",
  "SES-ADOC-CB1",
];

console.log("épreuve         total  publiées  relecture  avec figure");
for (const e of EPREUVES) {
  const total = await compter(`questions?select=id&epreuve_id_externe=eq.${e}`);
  const publiees = await compter(`questions?select=id&epreuve_id_externe=eq.${e}&statut=eq.publie`);
  const figures = await compter(
    `questions?select=id&epreuve_id_externe=eq.${e}&image_url=not.is.null`,
  );
  console.log(
    `${e.padEnd(15)} ${String(total).padStart(5)}  ${String(publiees).padStart(8)}` +
      `  ${String(total - publiees).padStart(9)}  ${String(figures).padStart(11)}`,
  );
}

// L'algorithme doit avoir gardé ses lignes : c'est ce qui le rend lisible.
const [bloc] = await req("blocs?select=id&bloc_id_externe=eq.SES-SQ1-DIG-Q06");
const [q] = await req(`questions?select=enonce&bloc_id=eq.${bloc.id}`);
const lignes = q.enonce.split(/\r?\n/);
console.log(`\nalgorithme de la question 6 : ${lignes.length} ligne(s)`);
for (const l of lignes) console.log(`   ${l}`);

console.log(`\nfile de relecture, toutes origines : ${await compter("questions?select=id&statut=in.(brouillon,a_verifier,depubliee)")}`);
console.log(`questions publiées, toutes origines : ${await compter("questions?select=id&statut=eq.publie")}`);
