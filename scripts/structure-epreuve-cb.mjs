import { readFileSync } from "node:fs";

/** Comment une épreuve blanche est découpée : ordre, bloc, propositions. */

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

const [epreuve] = await req(
  `epreuves_cb?select=id,matiere,epreuve_id_externe&epreuve_id_externe=eq.${process.argv[2]}&limit=1`,
);
if (!epreuve) {
  console.log("épreuve introuvable");
  process.exit(1);
}
console.log(`${epreuve.epreuve_id_externe} — ${epreuve.matiere}\n`);

const liens = await req(
  `epreuve_cb_questions?select=ordre,questions(id,type,enonce,bloc_id,image_url,reponses_possibles(texte,ordre))` +
    `&epreuve_cb_id=eq.${epreuve.id}&order=ordre`,
);

for (const l of liens.slice(0, Number(process.argv[3] ?? 12))) {
  const q = l.questions;
  const props = (q.reponses_possibles ?? []).sort((a, b) => a.ordre - b.ordre);
  console.log(
    `ordre ${String(l.ordre).padStart(6)}  bloc ${String(q.bloc_id).slice(0, 8)}  ${q.type}` +
      `${q.image_url ? "  [figure]" : ""}`,
  );
  console.log(`   ${q.enonce.slice(0, 150)}`);
  for (const p of props) console.log(`      · ${p.texte.slice(0, 90)}`);
}

const blocs = new Set(liens.map((l) => l.questions.bloc_id));
const entiers = new Set(liens.map((l) => Math.trunc(Number(l.ordre))));
console.log(
  `\n${liens.length} questions · ${blocs.size} bloc(s) · ${entiers.size} numéro(s) entier(s) d'ordre`,
);
