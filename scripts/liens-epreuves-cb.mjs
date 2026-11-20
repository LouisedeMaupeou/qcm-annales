import { readFileSync } from "node:fs";

/** Quelles questions de la file sont déjà placées dans une épreuve blanche. */

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

const questions = await req(
  "questions?select=id&statut=in.(brouillon,a_verifier,depubliee)&limit=1000",
);

const liens = [];
for (let i = 0; i < questions.length; i += 100) {
  const lot = questions.slice(i, i + 100).map((q) => q.id);
  liens.push(
    ...(await req(
      `epreuve_cb_questions?select=question_id,epreuve_cb_id,epreuves_cb(matiere,epreuve_id_externe,sessions_cb(nom))` +
        `&question_id=in.(${lot.join(",")})`,
    )),
  );
}

console.log(`${liens.length} question(s) de la file sont placées dans une épreuve blanche.\n`);

const parEpreuve = new Map();
for (const l of liens) {
  const e = l.epreuves_cb;
  const nom = `${e?.sessions_cb?.nom ?? "?"} › ${e?.matiere ?? e?.epreuve_id_externe ?? l.epreuve_cb_id}`;
  parEpreuve.set(nom, (parEpreuve.get(nom) ?? 0) + 1);
}
for (const [nom, n] of [...parEpreuve].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${String(n).padStart(3)}  ${nom}`);
}
