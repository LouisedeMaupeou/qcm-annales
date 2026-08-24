import * as XLSX from "xlsx";
import * as fs from "node:fs";

XLSX.set_fs(fs);

const classeur = XLSX.readFile(process.argv[2]);
console.log("Feuilles :", classeur.SheetNames.join(" | "));

for (const nom of classeur.SheetNames) {
  const lignes = XLSX.utils.sheet_to_json(classeur.Sheets[nom], {
    defval: "",
    raw: false,
  });
  console.log(`\n===== ${nom} : ${lignes.length} lignes =====`);
  if (lignes.length === 0) continue;
  console.log("Colonnes :", Object.keys(lignes[0]).join(" | "));
  console.log("\n2 premières lignes :");
  for (const l of lignes.slice(0, 2)) {
    console.log(JSON.stringify(l, null, 1));
  }
}
