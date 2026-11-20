import { readFileSync } from "node:fs";

/** Ce qu'une suppression en masse détruirait, et ce qu'elle épargnerait. */

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
  "questions?select=id,statut,created_at,epreuve_id_externe,blocs(epreuve_id_externe,annales(annee,concours(nom)))" +
    "&statut=in.(brouillon,a_verifier,depubliee)&order=created_at.asc&limit=1000",
);

const ids = questions.map((q) => q.id);
const lots = [];
for (let i = 0; i < ids.length; i += 100) lots.push(ids.slice(i, i + 100));

const retenues = new Set();
for (const lot of lots) {
  const filtre = `in.(${lot.join(",")})`;
  for (const table of ["session_questions", "passage_reponses"]) {
    const lignes = await req(`${table}?select=question_id&question_id=${filtre}`);
    for (const l of lignes) retenues.add(l.question_id);
  }
}

const origine = (q) => {
  const externe = q.blocs?.epreuve_id_externe ?? q.epreuve_id_externe;
  return externe
    ? `concours blanc · ${String(externe).split("-").slice(0, 2).join("-")}`
    : `${q.blocs?.annales?.concours?.nom ?? "?"} ${q.blocs?.annales?.annee ?? ""}`.trim();
};

console.log("── Les 6 questions dépubliées (elles ont été publiées, puis retirées) ──");
for (const q of questions.filter((x) => x.statut === "depubliee")) {
  console.log(
    `  ${origine(q).padEnd(32)} arrivée ${String(q.created_at).slice(0, 10)}` +
      `${retenues.has(q.id) ? "   ⟵ déjà servie à un élève" : ""}`,
  );
}

console.log("\n── Répartition ──");
const compte = { aVerifier: 0, depubliee: 0, protegees: 0 };
for (const q of questions) {
  if (q.statut === "depubliee") compte.depubliee += 1;
  else compte.aVerifier += 1;
  if (retenues.has(q.id)) compte.protegees += 1;
}
console.log(`  réserve d'extraction (a_verifier) : ${compte.aVerifier}`);
console.log(`  dépubliées après signalement      : ${compte.depubliee}`);
console.log(`  protégées par une copie d'élève   : ${compte.protegees} (jamais supprimées)`);
console.log(`  → supprimables aujourd'hui        : ${questions.length - compte.protegees}`);
