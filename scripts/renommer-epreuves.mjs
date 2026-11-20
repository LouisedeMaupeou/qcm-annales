import { readFileSync } from "node:fs";

/**
 * Applique la nomenclature PÉRIODE ANNÉE à des épreuves déjà importées.
 *
 * Les premiers imports ont repris les codes de séquence du référentiel —
 * `SES-FR-S2`, `SES-ADOC-CB1` — qui ne disent pas de quelle campagne ils
 * viennent. Deux campagnes d'une même matière s'y confondaient, ce qui est
 * arrivé. L'identifiant porte désormais la période : `SES-FR-NOEL26`, affiché
 * « NOËL 26 SÉSAME FRANÇAIS ».
 *
 * Trois tables portent cet identifiant : les questions, les blocs, et les
 * épreuves composées dans une session. Les chemins de stockage des images ne
 * sont pas touchés — ils sont opaques, et les déplacer casserait les
 * références pour rien.
 *
 * À lancer avec --pour-de-vrai ; sans l'option, le script dit ce qu'il ferait.
 */

const POUR_DE_VRAI = process.argv.includes("--pour-de-vrai");

const RENOMMAGES = {
  "SES-MAT-S1": "SES-MAT-NOEL26",
  "SES-DIG-S1": "SES-DIG-NOEL26",
  "SES-FR-S2": "SES-FR-NOEL26",
  "SES-ANG-S2": "SES-ANG-NOEL26",
  "SES-DE-S2": "SES-DE-NOEL26",
  "SES-ES-S2": "SES-ES-NOEL26",
  "SES-ADOC-CB1": "SES-ADOC-NOEL26",
};

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

const TABLES = ["questions", "blocs", "epreuves_cb"];

for (const [ancien, nouveau] of Object.entries(RENOMMAGES)) {
  const compte = {};
  for (const table of TABLES) {
    compte[table] = (
      await req(`${table}?select=id&epreuve_id_externe=eq.${ancien}&limit=1000`)
    ).length;
  }
  const existeDeja = (
    await req(`questions?select=id&epreuve_id_externe=eq.${nouveau}&limit=1`)
  ).length;

  console.log(
    `${ancien.padEnd(15)} → ${nouveau.padEnd(16)} ` +
      TABLES.map((t) => `${t} ${compte[t]}`).join(", ") +
      (existeDeja ? "   ⚠ la cible existe déjà" : ""),
  );

  if (!POUR_DE_VRAI) continue;

  for (const table of TABLES) {
    if (compte[table] === 0) continue;
    await req(`${table}?epreuve_id_externe=eq.${ancien}`, "PATCH", {
      epreuve_id_externe: nouveau,
    });
  }
}

if (!POUR_DE_VRAI) {
  console.log("\n(essai à blanc — relancer avec --pour-de-vrai)");
  process.exit(0);
}

console.log("\nAprès renommage :");
const restantes = await req(
  "questions?select=epreuve_id_externe&epreuve_id_externe=not.is.null&limit=1000",
);
const par = new Map();
for (const q of restantes) {
  par.set(q.epreuve_id_externe, (par.get(q.epreuve_id_externe) ?? 0) + 1);
}
for (const [e, n] of [...par].sort()) console.log(`  ${String(n).padStart(3)}  ${e}`);
