import { diagnostiquer } from "./lire-pdf.mjs";
import { readdirSync } from "node:fs";
import { join } from "node:path";

const dossier = process.argv[2];
for (const nom of readdirSync(dossier).filter((n) => n.endsWith(".pdf")).sort()) {
  try {
    const d = await diagnostiquer(join(dossier, nom));
    console.log(
      `${nom.padEnd(24)} ${String(d.pages).padStart(3)} p.  ${String(d.caracteresParPage).padStart(5)} car./p.  ${d.exploitableEnTexte ? "TEXTE" : "IMAGE → OCR"}`,
    );
  } catch (e) {
    console.log(`${nom.padEnd(24)} ILLISIBLE : ${e.message}`);
  }
}
