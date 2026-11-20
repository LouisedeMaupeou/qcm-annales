import { analyserFichierCb, verifierImages } from "../src/lib/import-cb.ts";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

/**
 * Passe les fichiers produits dans l'analyseur du back-office.
 *
 * C'est le seul contrôle qui vaille : la conversion a beau paraître correcte,
 * ce qui compte est ce que dira l'import au moment où Paul déposera le fichier.
 * On vérifie donc avec le code même de l'application, pas avec une relecture.
 */

const dossier = process.argv[2];
const dossierImages = process.argv[3];

const images = new Set(readdirSync(dossierImages).filter((n) => n.endsWith(".png")));

let total = 0;
let servables = 0;
let bloquantes = 0;

for (const nom of readdirSync(dossier).filter((n) => n.endsWith(process.argv[4] ?? ".xlsx")).sort()) {
  const donnees = readFileSync(join(dossier, nom));
  const rapport = analyserFichierCb(
    donnees.buffer.slice(donnees.byteOffset, donnees.byteOffset + donnees.byteLength),
  );

  const graves = rapport.anomalies.filter((a) => a.gravite === "bloquante");
  const avertissements = rapport.anomalies.filter((a) => a.gravite !== "bloquante");
  const manquantes = verifierImages(rapport.questions, images);

  const ok = rapport.questions.filter((q) => q.statutExtraction === "ok").length;
  total += rapport.questions.length;
  servables += ok;
  bloquantes += graves.length;

  console.log(
    `\n${nom}\n  ${rapport.questions.length} questions lues, ${ok} servables` +
      `, ${graves.length} anomalie(s) bloquante(s), ${avertissements.length} avertissement(s)`,
  );
  for (const a of graves.slice(0, 6)) console.log(`    ✗ ligne ${a.ligne} : ${a.message}`);
  for (const a of avertissements.slice(0, 4)) console.log(`    ⚠ ligne ${a.ligne} : ${a.message}`);
  const sansImage = manquantes.anomalies ?? [];
  for (const a of sansImage.slice(0, 4)) console.log(`    ⚠ image : ${a.message}`);
}

console.log(
  `\n════ ${total} questions au total, ${servables} servables, ${bloquantes} anomalie(s) bloquante(s) ════`,
);
