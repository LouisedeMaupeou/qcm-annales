import { readFileSync } from "node:fs";

/**
 * Retire toutes les questions importées avant novembre, liens compris.
 *
 * Décision explicite de la prépa, prise en connaissance des conséquences : la
 * session « Toussaint test » perd les épreuves composées à partir de ces
 * questions, et les copies qui s'y rapportent disparaissent. Ces copies
 * appartiennent à des comptes de test — deux fixtures et le compte de la
 * responsable — et aucun élève réel n'y figure ; c'est ce qui rend
 * l'opération acceptable, et c'est vérifié avant d'agir, pas supposé.
 *
 * L'ordre compte : les trois tables qui retiennent une question sont en
 * `on delete restrict`, il faut donc défaire les liens avant de supprimer.
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

const questions = [];
for (let de = 0; ; de += 1000) {
  const page = await req(
    `questions?select=id,bloc_id,epreuve_id_externe&epreuve_id_externe=not.is.null` +
      `&created_at=lt.2026-11-01&offset=${de}&limit=1000`,
  );
  questions.push(...page);
  if (page.length < 1000) break;
}

const ids = questions.map((q) => q.id);
const blocs = [...new Set(questions.map((q) => q.bloc_id).filter(Boolean))];
console.log(`${questions.length} question(s) d'octobre, dans ${blocs.length} bloc(s).`);

// Garde-fou : aucune copie d'un compte qui ne soit pas un compte de test.
const suspects = new Set();
for (let i = 0; i < ids.length; i += 60) {
  const lot = ids.slice(i, i + 60).join(",");
  for (const l of await req(
    `passage_reponses?select=passages(users(email))&question_id=in.(${lot})`,
  )) {
    const email = l.passages?.users?.email ?? "";
    if (!email.endsWith("@example.test") && !email.includes("pauldemaupeou")) {
      suspects.add(email || "(inconnu)");
    }
  }
}
if (suspects.size > 0) {
  console.error(
    `\n⛔ Des copies appartiennent à des comptes qui ne sont pas des comptes de test : ${[...suspects].join(", ")}.`,
  );
  console.error("Rien n'a été supprimé.");
  process.exit(1);
}
console.log("Contrôle : aucune copie hors comptes de test.");

if (!POUR_DE_VRAI) {
  console.log("\n(essai à blanc — relancer avec --pour-de-vrai)");
  process.exit(0);
}

let reponses = 0;
let liens = 0;
for (let i = 0; i < ids.length; i += 60) {
  const lot = ids.slice(i, i + 60).join(",");
  const avantR = (await req(`passage_reponses?select=question_id&question_id=in.(${lot})`)).length;
  const avantL = (await req(`epreuve_cb_questions?select=question_id&question_id=in.(${lot})`)).length;
  await req(`passage_reponses?question_id=in.(${lot})`, "DELETE");
  await req(`epreuve_cb_questions?question_id=in.(${lot})`, "DELETE");
  await req(`session_questions?question_id=in.(${lot})`, "DELETE");
  reponses += avantR;
  liens += avantL;
}
console.log(`\n${reponses} réponse(s) d'élève et ${liens} lien(s) de composition défaits.`);

let supprimees = 0;
for (let i = 0; i < ids.length; i += 60) {
  const lot = ids.slice(i, i + 60).join(",");
  await req(`questions?id=in.(${lot})`, "DELETE");
  supprimees += Math.min(60, ids.length - i);
}
console.log(`${supprimees} question(s) supprimée(s).`);

let blocsVides = 0;
for (const bloc of blocs) {
  const reste = await req(`questions?select=id&bloc_id=eq.${bloc}&limit=1`);
  if (reste.length === 0) {
    await req(`blocs?id=eq.${bloc}`, "DELETE");
    blocsVides += 1;
  }
}
console.log(`${blocsVides} bloc(s) vidé(s) supprimé(s).`);

const restantes = await req(
  "questions?select=id&epreuve_id_externe=not.is.null&created_at=lt.2026-11-01&limit=1",
);
console.log(`\nQuestions d'octobre restantes : ${restantes.length}`);
