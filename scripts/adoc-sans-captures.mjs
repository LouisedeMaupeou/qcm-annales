import { readFileSync } from "node:fs";

/**
 * Retire les captures des questions d'analyse documentaire.
 *
 * Elles avaient été produites parce que la mise en page fait partie de
 * l'énoncé dans cette épreuve. Mais une capture porte la question *et* ses
 * propositions, lesquelles sont désormais servies en texte cliquable juste en
 * dessous : l'élève lisait deux fois la même chose, et ne pouvait cliquer que
 * sur l'une des deux.
 *
 * Les recouper pour n'en garder que l'énoncé n'est pas possible de façon
 * fiable : mesuré sur les vingt captures, l'interligne d'un énoncé fait 11 px
 * et l'espace avant « (A) » 16 px, mais les espaces entre propositions font
 * 15, 11 et 15 — aucun seuil ne sépare les deux sans couper des énoncés au
 * hasard. On retire donc les captures, après s'être assuré que la
 * transcription porte bien tout.
 *
 * Une seule question ne le permettait pas : la 19 est un texte à trous dont
 * seul le visuel portait le passage. Il est transcrit ici, avec les repères
 * X, Y et Z que sa consigne annonce déjà.
 *
 * À lancer avec --pour-de-vrai ; sans l'option, le script dit ce qu'il ferait.
 */

const POUR_DE_VRAI = process.argv.includes("--pour-de-vrai");

const EPREUVE = "SES-ADOC-NOEL26";

const ENONCE_Q19 =
  "Complétez la conclusion ci-dessous avec les termes appropriés (X, Y et Z) dans le texte de synthèse.\n" +
  "« En définitive, la modernité repose largement sur l’idée que X est émancipateur par le temps " +
  "qu’il permet de libérer grâce aux gains de productivité. Or, cette idée semble largement Y par " +
  "la sensation qu’éprouvent un grand nombre de nos contemporains de « manquer de temps », voire " +
  "d’être « pressé par le temps ». C’est la raison pour laquelle des initiatives en faveur d’un Z " +
  "entre « rapidité » et « lenteur » sont apparues. L’objectif est de redevenir « maître de son " +
  "temps de vie », source de « liberté individuelle » et de sérénité. »";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split(/\r?\n/)
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]),
);

const url = env.NEXT_PUBLIC_SUPABASE_URL;
const cle = env.SUPABASE_SERVICE_ROLE_KEY;
const entetes = { apikey: cle, Authorization: `Bearer ${cle}`, "Content-Type": "application/json" };

async function req(chemin, methode = "GET", corps = null) {
  const r = await fetch(`${url}/rest/v1/${chemin}`, {
    method: methode,
    headers: entetes,
    ...(corps ? { body: JSON.stringify(corps) } : {}),
  });
  if (!r.ok) throw new Error(`${r.status} ${await r.text()}`);
  const texte = methode === "GET" ? await r.text() : "";
  return texte ? JSON.parse(texte) : null;
}

const questions = await req(
  `questions?select=id,ordre_epreuve,enonce,image_url&epreuve_id_externe=eq.${EPREUVE}&order=ordre_epreuve`,
);

const avecCapture = questions.filter((q) => q.image_url);
const sansEnonce = questions.filter((q) => !String(q.enonce ?? "").trim());

console.log(`${questions.length} question(s), ${avecCapture.length} avec capture.`);
if (sansEnonce.length > 0) {
  console.error(
    `⛔ ${sansEnonce.length} question(s) sans énoncé texte : retirer leur capture les viderait.`,
  );
  process.exit(1);
}
console.log("Contrôle : toutes les questions portent un énoncé texte.");

const q19 = questions.find((q) => Number(q.ordre_epreuve) === 19);
console.log(`\nQuestion 19 — énoncé actuel (${q19.enonce.length} car.) :\n   ${q19.enonce}`);
console.log(`\nQuestion 19 — énoncé complété (${ENONCE_Q19.length} car.) :`);
for (const l of ENONCE_Q19.split("\n")) console.log(`   ${l}`);

if (!POUR_DE_VRAI) {
  console.log("\n(essai à blanc — relancer avec --pour-de-vrai)");
  process.exit(0);
}

await req(`questions?id=eq.${q19.id}`, "PATCH", { enonce: ENONCE_Q19 });
console.log("\nQuestion 19 : passage transcrit.");

for (const q of avecCapture) {
  await req(`questions?id=eq.${q.id}`, "PATCH", { image_url: null });
}
console.log(`${avecCapture.length} capture(s) détachée(s).`);

const reste = await req(
  `questions?select=id&epreuve_id_externe=eq.${EPREUVE}&image_url=not.is.null`,
);
console.log(`Questions portant encore une capture : ${reste.length}`);
