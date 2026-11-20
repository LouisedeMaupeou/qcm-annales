import { readFileSync } from "node:fs";

/**
 * Repère les énoncés qui énumèrent sans passer à la ligne.
 *
 * Le référentiel tient chaque énoncé sur une cellule, et une cellule n'a pas
 * de retour à la ligne : une question qui propose quatre phrases numérotées
 * arrive donc d'un seul tenant, et l'élève doit la redécouper des yeux avant
 * de pouvoir y répondre. Le sujet papier, lui, les présente l'une sous
 * l'autre.
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

/** Marqueurs d'énumération rencontrés dans les sujets SÉSAME. */
const MARQUEURS = [
  { nom: "numéros « 1- »", re: /(?<=\S\s)\d-\s/g },
  { nom: "numéros « 1) »", re: /(?<=\S\s)\d\)\s/g },
  { nom: "tirets « - »", re: /(?<=\S\s)-\s(?=[A-ZÀ-ÜÉÈ«“"])/g },
  { nom: "puces", re: /[•·]\s/g },
];

const questions = await req(
  "questions?select=id,enonce,ordre_epreuve,epreuve_id_externe&epreuve_id_externe=not.is.null&limit=1000",
);

const touchees = [];
for (const q of questions) {
  const texte = String(q.enonce ?? "");
  if (texte.includes("\n")) continue; // déjà mis en forme

  for (const m of MARQUEURS) {
    const n = (texte.match(m.re) ?? []).length;
    if (n >= 2) {
      touchees.push({ ...q, marqueur: m.nom, points: n });
      break;
    }
  }
}

touchees.sort(
  (a, b) =>
    a.epreuve_id_externe.localeCompare(b.epreuve_id_externe) ||
    Number(a.ordre_epreuve) - Number(b.ordre_epreuve),
);

console.log(`${touchees.length} énoncé(s) énumèrent sans passer à la ligne :\n`);
for (const q of touchees) {
  console.log(`${q.epreuve_id_externe} Q${q.ordre_epreuve} — ${q.points} éléments (${q.marqueur})`);
  console.log(`   ${q.enonce}\n`);
}
