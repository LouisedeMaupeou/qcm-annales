import { readFileSync } from "node:fs";

/**
 * Vide la file de relecture, sur décision explicite.
 *
 * Reprend les garde-fous de l'action du back-office : rien qui soit retenu par
 * une copie d'élève, et les blocs vidés partent avec — c'est leur présence qui
 * faisait apparaître des épreuves sans une seule question.
 *
 * À lancer avec --pour-de-vrai ; sans l'option, le script dit ce qu'il ferait.
 */

const POUR_DE_VRAI = process.argv.includes("--pour-de-vrai");

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split(/\r?\n/)
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]),
);

const url = env.NEXT_PUBLIC_SUPABASE_URL;
const cle = env.SUPABASE_SERVICE_ROLE_KEY;

async function req(chemin, options = {}) {
  const r = await fetch(`${url}/rest/v1/${chemin}`, {
    headers: {
      apikey: cle,
      Authorization: `Bearer ${cle}`,
      "Content-Type": "application/json",
      ...(options.headers ?? {}),
    },
    method: options.method ?? "GET",
  });
  if (!r.ok) throw new Error(`${r.status} ${await r.text()}`);
  const texte = await r.text();
  return { corps: texte ? JSON.parse(texte) : null, intervalle: r.headers.get("content-range") };
}

const STATUTS = "statut=in.(brouillon,a_verifier,depubliee)";

const { corps: questions } = await req(
  `questions?select=id,bloc_id,statut&${STATUTS}&order=created_at.asc&limit=1000`,
);
console.log(`File de relecture : ${questions.length} question(s).`);

// Ce qu'une copie d'élève retient ne se supprime pas.
const retenues = new Set();
const composees = new Set();
for (let i = 0; i < questions.length; i += 100) {
  const lot = questions.slice(i, i + 100).map((q) => q.id);
  for (const table of ["session_questions", "passage_reponses"]) {
    const { corps } = await req(`${table}?select=question_id&question_id=in.(${lot.join(",")})`);
    for (const l of corps) retenues.add(l.question_id);
  }
  // Une question placée dans une épreuve blanche n'est pas une copie d'élève :
  // c'est un lien de composition, qui se défait.
  const { corps } = await req(
    `epreuve_cb_questions?select=question_id&question_id=in.(${lot.join(",")})`,
  );
  for (const l of corps) if (!retenues.has(l.question_id)) composees.add(l.question_id);
}

const aSupprimer = questions.filter((q) => !retenues.has(q.id));
console.log(`  ${composees.size} placée(s) dans une épreuve blanche : le lien sera défait.`);
const blocs = [...new Set(aSupprimer.map((q) => q.bloc_id).filter(Boolean))];

console.log(`  ${retenues.size} retenue(s) par une copie d'élève, conservée(s).`);
console.log(`  ${aSupprimer.length} à supprimer, touchant ${blocs.length} bloc(s).`);

if (!POUR_DE_VRAI) {
  console.log("\n(essai à blanc — relancer avec --pour-de-vrai)");
  process.exit(0);
}

let liensDefaits = 0;
const aDelier = [...composees];
for (let i = 0; i < aDelier.length; i += 100) {
  const lot = aDelier.slice(i, i + 100);
  await req(`epreuve_cb_questions?question_id=in.(${lot.join(",")})`, { method: "DELETE" });
  liensDefaits += lot.length;
}
if (liensDefaits) console.log(`\n${liensDefaits} lien(s) épreuve↔question défait(s).`);

let supprimees = 0;
for (let i = 0; i < aSupprimer.length; i += 100) {
  const lot = aSupprimer.slice(i, i + 100).map((q) => q.id);
  await req(`questions?id=in.(${lot.join(",")})`, { method: "DELETE" });
  supprimees += lot.length;
}
console.log(`\n${supprimees} question(s) supprimée(s).`);

let blocsVides = 0;
for (const bloc of blocs) {
  const { intervalle } = await req(`questions?select=id&bloc_id=eq.${bloc}&limit=1`, {
    headers: { Prefer: "count=exact" },
  });
  if (Number(intervalle?.split("/")[1] ?? 0) === 0) {
    await req(`blocs?id=eq.${bloc}`, { method: "DELETE" });
    blocsVides += 1;
  }
}
console.log(`${blocsVides} bloc(s) vidé(s) supprimé(s).`);

const { intervalle } = await req(`questions?select=id&${STATUTS}&limit=1`, {
  headers: { Prefer: "count=exact" },
});
console.log(`\nIl reste ${Number(intervalle?.split("/")[1] ?? 0)} question(s) en file.`);
