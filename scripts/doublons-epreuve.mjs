import { readFileSync } from "node:fs";

/**
 * Doublons dans la banque d'une épreuve blanche.
 *
 * Deux imports successifs d'un même sujet ne se recouvrent que si les clés de
 * bloc coïncident. Changer la façon de nommer un bloc — par exemple en
 * regroupant deux questions qui partageaient un texte — laisse l'ancienne
 * version en place à côté de la nouvelle. Ce script montre les générations.
 */

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

const epreuve = process.argv[2];

const blocs = await req(
  `blocs?select=id,bloc_id_externe,created_at&epreuve_id_externe=eq.${epreuve}&order=created_at`,
);
console.log(`${epreuve} : ${blocs.length} bloc(s)\n`);

const parJour = new Map();
for (const b of blocs) {
  const jour = String(b.created_at).slice(0, 16).replace("T", " ");
  if (!parJour.has(jour)) parJour.set(jour, []);
  parJour.get(jour).push(b.bloc_id_externe);
}
console.log("création des blocs :");
for (const [jour, cles] of parJour) {
  console.log(`  ${jour}  ${String(cles.length).padStart(3)} bloc(s)  ex. ${cles.slice(0, 3).join(", ")}`);
}

// Les énoncés identiques signalent le même sujet importé deux fois.
const questions = [];
for (let i = 0; i < blocs.length; i += 40) {
  const lot = blocs.slice(i, i + 40).map((b) => b.id);
  questions.push(
    ...(await req(
      `questions?select=id,enonce,statut,ordre_epreuve,bloc_id&bloc_id=in.(${lot.join(",")})`,
    )),
  );
}
console.log(`\n${questions.length} question(s) dans ces blocs`);

const parEnonce = new Map();
for (const q of questions) {
  const cle = q.enonce.slice(0, 90);
  if (!parEnonce.has(cle)) parEnonce.set(cle, []);
  parEnonce.get(cle).push(q);
}
const doublons = [...parEnonce.values()].filter((g) => g.length > 1);
console.log(`énoncés en double : ${doublons.length}`);
for (const g of doublons.slice(0, 4)) {
  console.log(`  « ${g[0].enonce.slice(0, 70)}… » ×${g.length} (statuts : ${g.map((q) => q.statut).join(", ")})`);
}
