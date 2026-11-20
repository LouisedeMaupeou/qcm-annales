import { readFileSync } from "node:fs";

/** Ce qui retient les questions d'octobre, et à quoi cela appartient. */

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

const questions = [];
for (let de = 0; ; de += 1000) {
  const page = await req(
    `questions?select=id,epreuve_id_externe,created_at&epreuve_id_externe=not.is.null` +
      `&created_at=lt.2026-11-01&order=created_at&offset=${de}&limit=1000`,
  );
  questions.push(...page);
  if (page.length < 1000) break;
}
console.log(`${questions.length} question(s) d'octobre encore en banque.\n`);

const ids = questions.map((q) => q.id);
const composition = [];
const reponses = [];
const entrainement = [];

for (let i = 0; i < ids.length; i += 60) {
  const lot = ids.slice(i, i + 60).join(",");
  composition.push(
    ...(await req(
      `epreuve_cb_questions?select=question_id,epreuves_cb(matiere,sessions_cb(nom))&question_id=in.(${lot})`,
    )),
  );
  reponses.push(
    ...(await req(
      `passage_reponses?select=question_id,passages(statut,users(prenom,nom,email))&question_id=in.(${lot})`,
    )),
  );
  entrainement.push(
    ...(await req(`session_questions?select=question_id&question_id=in.(${lot})`)),
  );
}

console.log(`liens de composition (épreuve blanche) : ${composition.length}`);
const parSession = new Map();
for (const l of composition) {
  const nom = `${l.epreuves_cb?.sessions_cb?.nom ?? "?"} › ${l.epreuves_cb?.matiere ?? "?"}`;
  parSession.set(nom, (parSession.get(nom) ?? 0) + 1);
}
for (const [nom, n] of [...parSession].sort((a, b) => b[1] - a[1])) {
  console.log(`   ${String(n).padStart(3)}  ${nom}`);
}

console.log(`\nréponses d'élèves : ${reponses.length}`);
const parEleve = new Map();
for (const l of reponses) {
  const u = l.passages?.users;
  const nom = u ? `${u.prenom} ${u.nom} <${u.email}>` : "?";
  parEleve.set(nom, (parEleve.get(nom) ?? 0) + 1);
}
for (const [nom, n] of [...parEleve].sort((a, b) => b[1] - a[1]).slice(0, 12)) {
  console.log(`   ${String(n).padStart(4)}  ${nom}`);
}

console.log(`\nliens d'entraînement libre : ${entrainement.length}`);
