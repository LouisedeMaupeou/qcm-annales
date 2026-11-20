import { lirePages } from "./lire-pdf.mjs";
import { writeFileSync } from "node:fs";

const [, , chemin, sortie] = process.argv;
const pages = await lirePages(chemin);
writeFileSync(
  sortie,
  pages.map((p, i) => `\n===== PAGE ${i + 1} =====\n${p}`).join("\n"),
  "utf8",
);
console.log(`${pages.length} pages → ${sortie}`);
