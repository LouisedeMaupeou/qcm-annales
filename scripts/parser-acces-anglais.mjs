// Parse les questions d'anglais (Vrai/Faux, 4 items) d'un cahier/annale ACCÈS.
// Sortie : JSON { grammaire: [{n, enonce, items:[...], sol}], compregen, anomalies }
import { lirePages } from "./lire-pdf.mjs";
import { writeFileSync } from "node:fs";

const [, , pdf, sortie] = process.argv;
const pages = await lirePages(pdf);
const lignes = pages.join("\n").split("\n").map((l) => l.replace(/\s+$/, ""));

// Bruit : barre latérale verticale (tokens d'un seul caractère), n° de page, tirets.
const estBruit = (l) => {
  const s = l.trim();
  if (s === "") return true;
  if (/^\d{1,3}$/.test(s)) return true;
  if (/^[-–—\s]+$/.test(s)) return true;
  const toks = s.split(/\s+/);
  if (toks.length >= 2 && toks.every((t) => t.length === 1)) return true;
  return false;
};

// Bornes de la section anglais : de la dernière consigne « 4 items » avant le
// corrigé d'anglais, jusqu'à l'en-tête « Question Solution » de ce corrigé.
const iCorr = lignes.findIndex((l) => /^Question\s+Solution/i.test(l.trim()));
let iStart = -1;
for (let i = 0; i < (iCorr > 0 ? iCorr : lignes.length); i++) {
  if (/Chaque question comporte 4 items/i.test(lignes[i])) iStart = i;
}
const secQ = lignes.slice(iStart, iCorr > 0 ? iCorr : undefined);

// Corrigé : lignes « N FFVF [N FFVF …] » ou « NFFVF » collé (2 colonnes).
const corr = {};
for (const l of lignes.slice(iCorr > 0 ? iCorr : lignes.length)) {
  const s = l.trim();
  if (/^Question\s+66$|Solution/i.test(s)) continue;
  for (const m of s.matchAll(/(\d{1,3})\s*([VF]{4})/g)) corr[Number(m[1])] = [m[2]];
  // compréhension : « 66 FFFF VVFV FVVF FVVV FFVV »
  const mc = s.match(/^(\d{1,3})\s+((?:[VF]{4}\s+){2,}[VF]{4})$/);
  if (mc) corr[Number(mc[1])] = mc[2].trim().split(/\s+/);
}

// Découpage en questions
const questions = [];
let cur = null;
for (const raw of secQ) {
  const mq = raw.trim().match(/^Question\s+(\d{1,3})$/);
  if (mq) { if (cur) questions.push(cur); cur = { n: Number(mq[1]), lignes: [], vf: false, items: [] }; continue; }
  if (!cur) continue;
  if (/^VRAI\s+FAUX$/.test(raw.trim())) { cur.vf = true; continue; }
  if (estBruit(raw)) continue;
  const t = raw.trim().replace(/-\s*$/, "");
  if (cur.vf) cur.items.push(t); else cur.lignes.push(t);
}
if (cur) questions.push(cur);

// Items sur plusieurs lignes : chaque item est en général une phrase complète.
// Si on n'a pas exactement 4 lignes, on rejoint et on recoupe par phrase.
const en4items = (lignesItems) => {
  if (lignesItems.length === 4) return lignesItems;
  const joint = lignesItems.join(" ").replace(/\s+/g, " ").trim();
  const phrases = joint.split(/(?<=[.?!])\s+(?=[A-Z"“'])/).map((s) => s.trim()).filter(Boolean);
  return phrases.length === 4 ? phrases : lignesItems;
};

const grammaire = [], compregen = [], anomalies = [];
for (const q of questions) {
  const enonce = q.lignes.join(" ").replace(/\s+/g, " ").trim();
  const sol = corr[q.n];
  const items = en4items(q.items);
  const rec = { n: q.n, enonce, items, sol: sol ? sol.join(" ") : null };
  if (sol && sol.length === 1 && items.length === 4 && /^[VF]{4}$/.test(sol[0])) grammaire.push(rec);
  else if (sol && sol.length > 1) compregen.push(rec);
  else anomalies.push(rec);
}

const out = { grammaire, compregen, anomalies, nbCorrige: Object.keys(corr).length };
if (sortie) writeFileSync(sortie, JSON.stringify(out, null, 1), "utf8");
console.log(`slice ${iStart}→${iCorr} | corrigé ${out.nbCorrige} entrées`);
console.log(`Grammaire: ${grammaire.length} | Compréhension: ${compregen.length} | Anomalies: ${anomalies.length}`);
console.log("\n--- 3 premières grammaire ---");
for (const g of grammaire.slice(0, 3)) console.log(`Q${g.n} [${g.sol}] ${g.enonce}\n   ${JSON.stringify(g.items)}`);
if (anomalies.length) console.log("\nanomalies:", anomalies.map((a) => `${a.n}(${a.items.length}i,${a.sol})`).join(" "));
