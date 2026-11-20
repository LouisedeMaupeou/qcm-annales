import { readFileSync } from "node:fs";

/**
 * Ce que recouvre « les épreuves importées d'octobre ».
 *
 * Avant une suppression en masse, distinguer ce qui double un import récent de
 * ce qui est le seul exemplaire d'un sujet — et repérer ce qu'une session de
 * concours blanc ou une copie d'élève retient.
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

const questions = [];
for (let de = 0; ; de += 1000) {
  const page = await req(
    `questions?select=id,epreuve_id_externe,enonce,image_url,created_at,statut` +
      `&epreuve_id_externe=not.is.null&order=created_at&offset=${de}&limit=1000`,
  );
  questions.push(...page);
  if (page.length < 1000) break;
}

const octobre = questions.filter((q) => q.created_at < "2026-11-01");
const novembre = questions.filter((q) => q.created_at >= "2026-11-01");
const epreuvesNovembre = new Set(novembre.map((q) => q.epreuve_id_externe));

// Ce qu'une session ou une copie retient.
const retenues = new Set();
const ids = octobre.map((q) => q.id);
for (let i = 0; i < ids.length; i += 60) {
  const lot = ids.slice(i, i + 60).join(",");
  for (const table of ["epreuve_cb_questions", "passage_reponses", "session_questions"]) {
    for (const l of await req(`${table}?select=question_id&question_id=in.(${lot})`)) {
      retenues.add(l.question_id);
    }
  }
}

const parEpreuve = new Map();
for (const q of octobre) {
  const e = q.epreuve_id_externe;
  if (!parEpreuve.has(e)) {
    parEpreuve.set(e, { n: 0, images: 0, sansEnonce: 0, retenues: 0 });
  }
  const c = parEpreuve.get(e);
  c.n += 1;
  if (q.image_url) c.images += 1;
  if (!String(q.enonce ?? "").trim()) c.sansEnonce += 1;
  if (retenues.has(q.id)) c.retenues += 1;
}

console.log(`${octobre.length} question(s) importée(s) avant novembre.\n`);
console.log("épreuve           total  images  sans énoncé  retenues  doublée en novembre");
for (const [e, c] of [...parEpreuve].sort()) {
  console.log(
    `${e.padEnd(17)} ${String(c.n).padStart(5)}  ${String(c.images).padStart(6)}` +
      `  ${String(c.sansEnonce).padStart(11)}  ${String(c.retenues).padStart(8)}` +
      `  ${epreuvesNovembre.has(e) ? "OUI" : "non"}`,
  );
}

const doublees = [...parEpreuve].filter(([e]) => epreuvesNovembre.has(e));
const seules = [...parEpreuve].filter(([e]) => !epreuvesNovembre.has(e));
const somme = (liste, champ) => liste.reduce((s, [, c]) => s + c[champ], 0);

console.log(
  `\nA. doublées par un import de novembre : ${somme(doublees, "n")} question(s)` +
    ` dans ${doublees.length} épreuve(s), dont ${somme(doublees, "retenues")} retenue(s)`,
);
console.log(
  `B. seul exemplaire du sujet          : ${somme(seules, "n")} question(s)` +
    ` dans ${seules.length} épreuve(s), dont ${somme(seules, "retenues")} retenue(s)`,
);
