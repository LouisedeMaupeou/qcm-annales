import { readFileSync } from "node:fs";

/**
 * Retire les questions d'octobre que l'import de novembre a doublées.
 *
 * Périmètre strict : une question importée avant novembre, dans une épreuve
 * qui a reçu depuis un import texte, et qui n'a elle-même aucun énoncé texte —
 * elle n'existe qu'en image, propositions comprises, et la version lisible du
 * même sujet est désormais en banque.
 *
 * Tout le reste d'octobre est le seul exemplaire de son sujet et n'est pas
 * touché, même sous un identifiant voisin : l'allemand d'octobre, par exemple,
 * est un autre sujet que celui de novembre.
 *
 * Les garde-fous de l'écran de relecture s'appliquent : rien qui soit retenu
 * par une session de concours blanc ou par une copie d'élève.
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
const entetes = { apikey: cle, Authorization: `Bearer ${cle}`, "Content-Type": "application/json" };

async function req(chemin, methode = "GET") {
  const r = await fetch(`${url}/rest/v1/${chemin}`, { method: methode, headers: entetes });
  if (!r.ok) throw new Error(`${r.status} ${await r.text()}`);
  const texte = methode === "GET" ? await r.text() : "";
  return texte ? JSON.parse(texte) : null;
}

const EPREUVES = ["SES-ANG-S2", "SES-DIG-S1", "SES-FR-S2", "SES-MAT-S1"];

const candidates = [];
for (const epreuve of EPREUVES) {
  const qs = await req(
    `questions?select=id,bloc_id,enonce,image_url,created_at,ordre_epreuve&epreuve_id_externe=eq.${epreuve}`,
  );
  const visees = qs.filter(
    (q) => q.created_at < "2026-11-01" && !String(q.enonce ?? "").trim() && q.image_url,
  );
  console.log(
    `${epreuve.padEnd(14)} ${qs.length} question(s) en banque, ${visees.length} d'octobre sans énoncé texte`,
  );
  candidates.push(...visees);
}

// Rien qui soit retenu ailleurs : la base le refuserait, et l'échec tomberait
// au milieu du lot.
const retenues = new Set();
const ids = candidates.map((q) => q.id);
for (let i = 0; i < ids.length; i += 60) {
  const lot = ids.slice(i, i + 60).join(",");
  for (const table of ["epreuve_cb_questions", "passage_reponses", "session_questions"]) {
    for (const l of await req(`${table}?select=question_id&question_id=in.(${lot})`)) {
      retenues.add(l.question_id);
    }
  }
}

const aSupprimer = candidates.filter((q) => !retenues.has(q.id));
console.log(
  `\n${candidates.length} candidate(s), ${retenues.size} retenue(s) et conservée(s), ${aSupprimer.length} à supprimer.`,
);

if (!POUR_DE_VRAI) {
  console.log("\n(essai à blanc — relancer avec --pour-de-vrai)");
  process.exit(0);
}

const blocs = [...new Set(aSupprimer.map((q) => q.bloc_id).filter(Boolean))];

let supprimees = 0;
for (let i = 0; i < aSupprimer.length; i += 60) {
  const lot = aSupprimer.slice(i, i + 60).map((q) => q.id);
  await req(`questions?id=in.(${lot.join(",")})`, "DELETE");
  supprimees += lot.length;
}
console.log(`\n${supprimees} question(s) supprimée(s).`);

let blocsVides = 0;
for (const bloc of blocs) {
  const reste = await req(`questions?select=id&bloc_id=eq.${bloc}&limit=1`);
  if (reste.length === 0) {
    await req(`blocs?id=eq.${bloc}`, "DELETE");
    blocsVides += 1;
  }
}
console.log(`${blocsVides} bloc(s) vidé(s) supprimé(s).`);

for (const epreuve of EPREUVES) {
  const reste = await req(`questions?select=id&epreuve_id_externe=eq.${epreuve}`);
  console.log(`  ${epreuve.padEnd(14)} ${reste.length} question(s) restantes`);
}
