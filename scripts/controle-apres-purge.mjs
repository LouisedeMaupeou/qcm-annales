import { readFileSync } from "node:fs";

/** Contrôle d'après-suppression : ce qui devait rester est-il resté. */

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split(/\r?\n/)
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]),
);

const url = env.NEXT_PUBLIC_SUPABASE_URL;
const cle = env.SUPABASE_SERVICE_ROLE_KEY;

async function compter(chemin) {
  const r = await fetch(`${url}/rest/v1/${chemin}&limit=1`, {
    headers: { apikey: cle, Authorization: `Bearer ${cle}`, Prefer: "count=exact" },
  });
  if (!r.ok) throw new Error(`${r.status} ${await r.text()}`);
  return Number(r.headers.get("content-range")?.split("/")[1] ?? 0);
}

async function req(chemin) {
  const r = await fetch(`${url}/rest/v1/${chemin}`, {
    headers: { apikey: cle, Authorization: `Bearer ${cle}` },
  });
  if (!r.ok) throw new Error(`${r.status} ${await r.text()}`);
  return r.json();
}

console.log(`questions publiées          : ${await compter("questions?select=id&statut=eq.publie")}`);
console.log(`questions en relecture       : ${await compter("questions?select=id&statut=in.(brouillon,a_verifier,depubliee)")}`);
console.log(`signalements non traités     : ${await compter("signalements?select=id&traite=eq.false")}`);
console.log(`réponses d'élèves conservées : ${await compter("passage_reponses?select=question_id")}`);

console.log("\nÉpreuves des sessions de concours blanc :");
const epreuves = await req(
  "epreuves_cb?select=id,matiere,epreuve_id_externe,sessions_cb(nom)&order=epreuve_id_externe",
);
for (const e of epreuves) {
  const n = await compter(`epreuve_cb_questions?select=question_id&epreuve_cb_id=eq.${e.id}`);
  console.log(
    `  ${String(n).padStart(3)} question(s)  ${e.sessions_cb?.nom ?? "?"} › ${e.matiere} (${e.epreuve_id_externe})`,
  );
}
