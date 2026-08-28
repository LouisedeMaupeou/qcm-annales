// Parse l'anglais des CAHIERS d'entraînement ACCÈS (format « ■■ Question N » + A/B/C/D,
// items jugés Vrai/Faux, corrigé en « Tableau des bonnes réponses »).
// Sortie JSON : { grammaire:[{n,enonce,items,sol}], compregen:[{n,enonce,items,sol,passage}] }
import { lirePages } from "./lire-pdf.mjs";
import { writeFileSync } from "node:fs";

const [, , pdf, sortie] = process.argv;
const pages = await lirePages(pdf);
const L = pages.join("\n").split("\n").map((l) => l.replace(/\s+$/, ""));

const idxAll = (re) => L.map((l, i) => (re.test(l) ? i : -1)).filter((i) => i >= 0);
const iPart1 = idxAll(/PART\s*I\s*:\s*GRAMMAR/i);
const iPart2 = idxAll(/PART\s*II\s*:\s*READING/i);
const iTable = idxAll(/Tableau des bonnes/i).filter((i) => !/\.{4,}/.test(L[i - 1] || "") && !/\.{4,}/.test(L[i + 1] || ""));

// Un cahier peut contenir plusieurs sujets ; on traite chaque bloc anglais
// (de PART I jusqu'au tableau de réponses qui suit).
const grammaire = [], compregen = [];
for (const p1 of iPart1) {
  const tbl = iTable.find((t) => t > p1);
  const p2 = iPart2.find((x) => x > p1 && (!tbl || x < tbl));
  const finGram = p2 ?? tbl ?? L.length;

  // Corrigé (table après cette section anglais)
  const corr = {};
  if (tbl != null) {
    for (let i = tbl; i < Math.min(tbl + 60, L.length); i++) {
      for (const m of L[i].matchAll(/(\d{1,3})\s*([VF]{4})/g)) corr[Number(m[1])] = m[2];
      if (/PART\s*I\s*:/i.test(L[i]) && i > tbl + 2) break;
    }
  }

  const parseBloc = (deb, fin, estCompre) => {
    // Découpe en questions sur « ■■ » suivi de « Question N ».
    const seg = L.slice(deb, fin);
    let passage = [];
    let cur = null;
    const flush = () => { if (cur) { (estCompre ? compregen : grammaire).push(cur); cur = null; } };
    for (let k = 0; k < seg.length; k++) {
      const l = seg[k].trim();
      const mq = l.match(/^Question\s+(\d{1,3})$/);
      if (mq) {
        flush();
        cur = { n: Number(mq[1]), buf: [], passage: estCompre ? passage.join(" ").replace(/\s+/g, " ").trim() : undefined };
        continue;
      }
      if (/^■+$/.test(l) || l === "" ) continue;
      if (/^Anglais$/i.test(l) || /^\d{1,3}$/.test(l) || /PART\s*(I|II)\s*:/i.test(l)) continue;
      const toks = l.split(/\s+/);
      if (toks.length >= 2 && toks.every((t) => t.length === 1)) continue; // barre verticale
      if (cur) cur.buf.push(l);
      else if (estCompre) passage.push(l); // texte du passage avant les questions
    }
    flush();
  };

  parseBloc(p1 + 1, finGram, false);
  if (p2 != null) parseBloc(p2 + 1, tbl ?? L.length, true);

  // Extraction des 4 items A/B/C/D + affectation du corrigé
  const finir = (arr) => {
    for (const q of arr) {
      if (q._done) continue;
      const txt = (q.buf || []).join(" ").replace(/\s+/g, " ").trim();
      const items = [];
      const re = /([A-D])\)\s*([\s\S]*?)(?=\s[A-D]\)\s|$)/g;
      let m;
      while ((m = re.exec(txt))) items.push(m[2].trim());
      q.enonce = q.passage
        ? `${q.passage}\n\nD'après le texte, indiquez pour chaque proposition si elle est correcte (Vrai) ou incorrecte (Faux).`
        : "Indiquez pour chaque proposition si elle est correcte (Vrai) ou incorrecte (Faux).";
      q.items = items;
      q.sol = corr[q.n] || null;
      delete q.buf; delete q.passage;
      q._done = true;
    }
  };
  finir(grammaire); finir(compregen);
}

const okG = grammaire.filter((q) => q.items.length === 4 && /^[VF]{4}$/.test(q.sol || ""));
const okC = compregen.filter((q) => q.items.length === 4 && /^[VF]{4}$/.test(q.sol || ""));
const koG = grammaire.filter((q) => !(q.items.length === 4 && /^[VF]{4}$/.test(q.sol || "")));
const out = { grammaire: okG, compregen: okC };
if (sortie) writeFileSync(sortie, JSON.stringify(out, null, 1), "utf8");
console.log(`PART I: ${iPart1.length} bloc(s) | PART II: ${iPart2.length}`);
console.log(`Grammaire OK: ${okG.length} | Compréhension OK: ${okC.length} | Grammaire KO: ${koG.length}`);
console.log("\n--- 2 grammaire ---");
for (const g of okG.slice(0, 2)) console.log(`Q${g.n} [${g.sol}] items=${JSON.stringify(g.items)}`);
if (koG.length) console.log("KO:", koG.map((q) => `${q.n}(${q.items.length}i,${q.sol})`).slice(0, 20).join(" "));
