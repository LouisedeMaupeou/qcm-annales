import { readFileSync } from "node:fs";

/**
 * Remet à la ligne les éléments d'un énoncé qui énumère.
 *
 * Le référentiel tient chaque énoncé sur une cellule, et une cellule n'a pas
 * de retour à la ligne : une question qui propose quatre phrases numérotées
 * arrive d'un seul tenant, et l'élève doit la redécouper des yeux avant de
 * pouvoir y répondre — quand le sujet papier les présente l'une sous l'autre.
 *
 * La transformation n'écrit pas le texte, elle y insère des retours : les
 * caractères d'origine sont préservés, apostrophes typographiques comprises.
 *
 * Deux marqueurs seulement, et jamais « 1) » : en mathématiques, un couple de
 * coordonnées « (0 ; 3) et (2 ; 7) » en porte l'apparence sans être une
 * énumération.
 *
 * À lancer avec --pour-de-vrai ; sans l'option, le script montre le résultat.
 */

const POUR_DE_VRAI = process.argv.includes("--pour-de-vrai");

/** Insère un retour à la ligne devant chaque élément d'une énumération. */
export function aerer(texte) {
  if (texte.includes("\n")) return texte;

  // « … ? 1- Après … 2- Les … » → un élément par ligne.
  const numerotee = texte.replace(/\s+([1-9]-\s)/g, "\n$1");
  if (numerotee !== texte && (numerotee.match(/\n[1-9]-\s/g) ?? []).length >= 2) {
    return numerotee;
  }

  // « … : - Elle s'est … - Les enfants … » → idem.
  const tiretee = texte.replace(/\s+-\s(?=[A-ZÀ-ÜÉÈÊ«“"])/g, "\n- ");
  if (tiretee !== texte && (tiretee.match(/\n- /g) ?? []).length >= 2) {
    return tiretee;
  }

  return texte;
}

if (process.argv[1]?.endsWith("aerer-enonces.mjs")) {
  const env = Object.fromEntries(
    readFileSync(".env.local", "utf8")
      .split(/\r?\n/)
      .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
      .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]),
  );

  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const cle = env.SUPABASE_SERVICE_ROLE_KEY;
  const entetes = { apikey: cle, Authorization: `Bearer ${cle}`, "Content-Type": "application/json" };

  const lire = async (c) => {
    const r = await fetch(`${url}/rest/v1/${c}`, { headers: entetes });
    if (!r.ok) throw new Error(`${r.status} ${await r.text()}`);
    return r.json();
  };

  const questions = await lire(
    "questions?select=id,enonce,ordre_epreuve,epreuve_id_externe&epreuve_id_externe=not.is.null&limit=1000",
  );

  const aCorriger = questions
    .map((q) => ({ ...q, nouveau: aerer(String(q.enonce ?? "")) }))
    .filter((q) => q.nouveau !== q.enonce)
    .sort(
      (a, b) =>
        a.epreuve_id_externe.localeCompare(b.epreuve_id_externe) ||
        Number(a.ordre_epreuve) - Number(b.ordre_epreuve),
    );

  console.log(`${aCorriger.length} énoncé(s) à aérer :\n`);
  for (const q of aCorriger) {
    console.log(`── ${q.epreuve_id_externe} Q${q.ordre_epreuve} ──`);
    for (const ligne of q.nouveau.split("\n")) console.log(`   ${ligne}`);
    console.log();
  }

  if (!POUR_DE_VRAI) {
    console.log("(essai à blanc — relancer avec --pour-de-vrai)");
  } else {
    for (const q of aCorriger) {
      const r = await fetch(`${url}/rest/v1/questions?id=eq.${q.id}`, {
        method: "PATCH",
        headers: entetes,
        body: JSON.stringify({ enonce: q.nouveau }),
      });
      if (!r.ok) throw new Error(`${r.status} ${await r.text()}`);
    }
    console.log(`${aCorriger.length} énoncé(s) mis à jour.`);
  }
}
