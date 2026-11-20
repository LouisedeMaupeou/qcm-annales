import { readFileSync } from "node:fs";

/**
 * Règle l'ouverture de toutes les épreuves d'une session à une heure de Paris.
 *
 *   node scripts/regler-fenetres.mjs "Noël test commerce 1" 2026-11-20T17:00 [--pour-de-vrai]
 *
 * La conversion reprend celle du formulaire : l'heure donnée est celle de
 * Paris, convertie en instant, et non relue dans le fuseau de la machine —
 * c'est ce qui avait décalé ces fenêtres d'une heure, puis de deux.
 */

const POUR_DE_VRAI = process.argv.includes("--pour-de-vrai");
const [, , session, heureParis] = process.argv;

if (!session || !heureParis) {
  console.error('Usage : scripts/regler-fenetres.mjs "<session>" <AAAA-MM-JJTHH:MM> [--pour-de-vrai]');
  process.exit(1);
}

const FUSEAU = "Europe/Paris";

function decalage(instant) {
  const d = new Date(instant);
  return (
    new Date(d.toLocaleString("en-US", { timeZone: FUSEAU })).getTime() -
    new Date(d.toLocaleString("en-US", { timeZone: "UTC" })).getTime()
  );
}

function instantDepuisHeureParis(saisie) {
  const m = saisie.match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})$/);
  if (!m) return null;
  const naif = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]));
  const premier = naif - decalage(naif);
  return new Date(naif - decalage(premier)).toISOString();
}

const ouverture = instantDepuisHeureParis(heureParis);
if (!ouverture) {
  console.error(`Heure illisible : ${heureParis}`);
  process.exit(1);
}

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

const paris = (iso) =>
  iso
    ? new Date(iso).toLocaleString("fr-FR", {
        timeZone: FUSEAU,
        dateStyle: "short",
        timeStyle: "short",
      })
    : "—";

const epreuves = (
  await req(
    "epreuves_cb?select=id,matiere,epreuve_id_externe,statut,fenetre_debut,fenetre_fin,sessions_cb(nom)",
  )
).filter((e) => e.sessions_cb?.nom === session);

if (epreuves.length === 0) {
  console.error(`Aucune épreuve pour la session « ${session} ».`);
  process.exit(1);
}

console.log(`Ouverture demandée : ${heureParis} à Paris = ${ouverture}\n`);

for (const e of epreuves) {
  const finTropTot = e.fenetre_fin && new Date(e.fenetre_fin).getTime() <= new Date(ouverture).getTime();
  console.log(
    `${e.epreuve_id_externe.padEnd(16)} ${paris(e.fenetre_debut)} → ${paris(ouverture)}` +
      `   ferme ${paris(e.fenetre_fin)}${finTropTot ? "   ⚠ la fermeture précède l'ouverture" : ""}` +
      `   statut ${e.statut}`,
  );
}

if (!POUR_DE_VRAI) {
  console.log("\n(essai à blanc — relancer avec --pour-de-vrai)");
  process.exit(0);
}

for (const e of epreuves) {
  await req(`epreuves_cb?id=eq.${e.id}`, "PATCH", { fenetre_debut: ouverture });
}
console.log(`\n${epreuves.length} fenêtre(s) réglée(s).`);

const maintenant = Date.now();
for (const e of await req(
  `epreuves_cb?select=epreuve_id_externe,statut,fenetre_debut,fenetre_fin,sessions_cb(nom)`,
)) {
  if (e.sessions_cb?.nom !== session) continue;
  const debut = new Date(e.fenetre_debut).getTime();
  const fin = e.fenetre_fin ? new Date(e.fenetre_fin).getTime() : null;
  const etat = maintenant < debut ? "à venir" : fin && maintenant > fin ? "fermée" : "OUVERTE";
  console.log(`   ${e.epreuve_id_externe.padEnd(16)} ${etat}  (${paris(e.fenetre_debut)})`);
}
