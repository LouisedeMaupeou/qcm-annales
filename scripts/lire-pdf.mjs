import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { readFileSync } from "node:fs";

/**
 * Extraction du texte d'un PDF, page par page.
 *
 * pdfjs rend des fragments positionnés, sans notion de ligne : on les regroupe
 * par ordonnée puis on les ordonne par abscisse pour reconstituer les lignes.
 *
 * ⚠️ Ne fonctionne que sur un PDF dont le texte est réellement du texte. Un PDF
 * scanné ou dont les pages sont des images (cas des annales de mathématiques
 * Advance) ne rend que ses en-têtes : `diagnostiquer()` permet de le détecter
 * avant de perdre du temps.
 */

export async function lirePages(chemin) {
  const doc = await getDocument({
    data: new Uint8Array(readFileSync(chemin)),
    useSystemFonts: true,
  }).promise;

  const pages = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const contenu = await page.getTextContent();

    const lignes = new Map();
    for (const item of contenu.items) {
      if (!("str" in item)) continue;
      const y = Math.round(item.transform[5]);
      if (!lignes.has(y)) lignes.set(y, []);
      lignes.get(y).push({ x: item.transform[4], s: item.str });
    }

    pages.push(
      [...lignes.entries()]
        .sort((a, b) => b[0] - a[0])
        .map(([, frags]) =>
          frags
            .sort((a, b) => a.x - b.x)
            .map((f) => f.s)
            .join("")
            .replace(/\s+/g, " ")
            .trim(),
        )
        .filter(Boolean)
        .join("\n"),
    );
  }

  return pages;
}

/** Estime si un PDF est exploitable en texte ou s'il faudra de l'OCR. */
export async function diagnostiquer(chemin) {
  const pages = await lirePages(chemin);
  const caracteres = pages.reduce((s, p) => s + p.length, 0);
  return {
    pages: pages.length,
    caracteres,
    caracteresParPage: Math.round(caracteres / Math.max(1, pages.length)),
    // Un PDF de texte tourne autour du millier de caractères par page ; un PDF
    // d'images n'en rend qu'une centaine, soit ses seuls en-têtes.
    exploitableEnTexte: caracteres / Math.max(1, pages.length) > 400,
  };
}
