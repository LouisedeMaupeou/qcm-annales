import { execSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * Lecteur XLSX minimal, sans dépendance.
 *
 * Suffisant pour le fichier POC, qui est produit par nos soins : chaînes en
 * ligne (`<is><t>`), pas de sharedStrings, pas de formules. Il n'est
 * volontairement PAS conçu pour des fichiers téléversés par des utilisateurs —
 * l'import en masse du §6.1 aura besoin d'un vrai parseur, cf. étape 5.
 */

const decoder = (s) =>
  s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&amp;/g, "&");

function indexColonne(reference) {
  const lettres = /^([A-Z]+)/.exec(reference)[1];
  let n = 0;
  for (const c of lettres) n = n * 26 + (c.charCodeAt(0) - 64);
  return n - 1;
}

/** Renvoie les lignes de la feuille `numero` sous forme d'objets clés/valeurs. */
export function lireFeuille(cheminXlsx, numero = 1) {
  const dossier = mkdtempSync(join(tmpdir(), "xlsx-"));
  try {
    const archive = join(dossier, "classeur.zip");
    writeFileSync(archive, readFileSync(cheminXlsx));
    execSync(
      `powershell -NoProfile -Command "Expand-Archive -LiteralPath '${archive}' -DestinationPath '${dossier}' -Force"`,
      { stdio: "ignore" },
    );

    const xml = readFileSync(
      join(dossier, "xl", "worksheets", `sheet${numero}.xml`),
      "utf8",
    );

    const lignes = [];
    for (const [, , contenu] of xml.matchAll(/<row([^>]*)>(.*?)<\/row>/gs)) {
      const cellules = [];
      for (const [, attrs, valeur] of contenu.matchAll(
        /<c([^>]*)>(.*?)<\/c>/gs,
      )) {
        const ref = /r="([A-Z]+\d+)"/.exec(attrs)?.[1];
        if (!ref) continue;
        const textes = [...valeur.matchAll(/<t[^>]*>(.*?)<\/t>/gs)]
          .map((m) => m[1])
          .join("");
        const brut = /<v>(.*?)<\/v>/s.exec(valeur)?.[1];
        cellules[indexColonne(ref)] = decoder(textes || brut || "");
      }
      lignes.push(cellules);
    }

    const [entete, ...reste] = lignes;
    return reste
      .filter((l) => l.some((c) => c && c.trim()))
      .map((l) => Object.fromEntries(entete.map((c, i) => [c, l[i] ?? ""])));
  } finally {
    rmSync(dossier, { recursive: true, force: true });
  }
}
