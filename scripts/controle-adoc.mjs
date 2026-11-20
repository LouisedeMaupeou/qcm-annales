import { readFileSync } from "node:fs";

/** État des questions d'analyse documentaire après import. */

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

const blocs = await req(
  "blocs?select=id,bloc_id_externe,epreuve_id_externe,enonce_commun&epreuve_id_externe=eq.SES-ADOC-CB1&order=bloc_id_externe",
);
console.log(`blocs SES-ADOC-CB1 : ${blocs.length}\n`);

let avecImage = 0;
let sansDocument = 0;
const parStatut = new Map();

for (const b of blocs) {
  const [questions, documents] = await Promise.all([
    req(`questions?select=id,type,statut,statut_extraction,image_url,ordre_epreuve&bloc_id=eq.${b.id}`),
    req(`bloc_documents?select=titre,fichier_url&bloc_id=eq.${b.id}`),
  ]);
  for (const q of questions) {
    parStatut.set(q.statut, (parStatut.get(q.statut) ?? 0) + 1);
    if (q.image_url) avecImage += 1;
    if (documents.length === 0) sansDocument += 1;
    if (Number(q.ordre_epreuve) <= 3 || Number(q.ordre_epreuve) >= 19) {
      console.log(
        `  Q${String(q.ordre_epreuve).padStart(2)} ${q.type.padEnd(15)} ${q.statut.padEnd(10)}` +
          ` capture ${q.image_url ? "oui" : "NON"}  documents ${documents.length}`,
      );
    }
  }
}

console.log(`\ncaptures rattachées : ${avecImage}/20`);
console.log(`questions sans document : ${sansDocument}`);
console.log("statuts :", [...parStatut].map(([s, n]) => `${s} ${n}`).join(", "));

