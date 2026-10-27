// Pas de `server-only` ici, contrairement au reste de src/lib : ce module ne
// touche ni aux secrets ni à la base — il transforme un fichier en données.
// Le garde vit sur `supabase/admin.ts`, qui détient la clé service_role. Ce
// choix est ce qui permet à `scripts/importer-concours-blancs.mjs` de rejouer
// exactement le même import que le back-office au lieu d'en recopier la logique.

import { inflateRawSync } from "node:zlib";

/**
 * Lecteur de zip minimal.
 *
 * L'import des concours blancs est accompagné d'un zip d'images (§3 : « image
 * présente dans le zip si référencée »). Plutôt que d'ajouter une dépendance
 * pour cela, on lit le format directement : un zip est un catalogue en fin de
 * fichier et des entrées compressées en deflate brut, que zlib sait défaire.
 *
 * Portée volontairement étroite : pas de ZIP64, pas de chiffrement, pas de
 * méthode de compression autre que « stocké » et « deflate ». Un zip produit
 * par l'Explorateur Windows, macOS ou 7-Zip entre dans ce cadre ; tout le
 * reste est rejeté explicitement plutôt que lu de travers.
 */

const SIGNATURE_FIN = 0x06054b50;
const SIGNATURE_CATALOGUE = 0x02014b50;
const SIGNATURE_ENTREE = 0x04034b50;
const TAILLE_MAX_ENTREE = 20 * 1024 * 1024;

export type EntreeZip = { nom: string; contenu: Buffer };

export class ZipIllisible extends Error {}

function trouverFinDuCatalogue(buffer: Buffer): number {
  // Le commentaire final peut aller jusqu'à 65 535 octets : on remonte depuis
  // la fin, pas plus loin que nécessaire.
  const debut = Math.max(0, buffer.length - 65_557);
  for (let i = buffer.length - 22; i >= debut; i--) {
    if (buffer.readUInt32LE(i) === SIGNATURE_FIN) return i;
  }
  throw new ZipIllisible("Ce fichier n'est pas un zip (catalogue introuvable).");
}

/** Rend les entrées du zip, dossiers exclus. */
export function lireZip(donnees: ArrayBuffer): EntreeZip[] {
  const buffer = Buffer.from(donnees);
  const fin = trouverFinDuCatalogue(buffer);

  const nombre = buffer.readUInt16LE(fin + 10);
  let position = buffer.readUInt32LE(fin + 16);

  const entrees: EntreeZip[] = [];

  for (let i = 0; i < nombre; i++) {
    if (buffer.readUInt32LE(position) !== SIGNATURE_CATALOGUE) {
      throw new ZipIllisible("Catalogue du zip incohérent.");
    }

    const methode = buffer.readUInt16LE(position + 10);
    const tailleCompressee = buffer.readUInt32LE(position + 20);
    const tailleReelle = buffer.readUInt32LE(position + 24);
    const longueurNom = buffer.readUInt16LE(position + 28);
    const longueurExtra = buffer.readUInt16LE(position + 30);
    const longueurCommentaire = buffer.readUInt16LE(position + 32);
    const offsetEntree = buffer.readUInt32LE(position + 42);
    const nom = buffer.toString("utf8", position + 46, position + 46 + longueurNom);

    position += 46 + longueurNom + longueurExtra + longueurCommentaire;

    if (nom.endsWith("/")) continue; // dossier
    // Les zips de macOS embarquent leurs métadonnées : elles n'intéressent
    // personne et porteraient des noms en doublon.
    if (nom.startsWith("__MACOSX/") || nom.split("/").pop()?.startsWith("._")) continue;

    if (tailleReelle > TAILLE_MAX_ENTREE) {
      throw new ZipIllisible(`« ${nom} » dépasse 20 Mo : archive refusée.`);
    }
    if (methode !== 0 && methode !== 8) {
      throw new ZipIllisible(
        `« ${nom} » utilise une compression non gérée (méthode ${methode}).`,
      );
    }

    if (buffer.readUInt32LE(offsetEntree) !== SIGNATURE_ENTREE) {
      throw new ZipIllisible(`Entrée « ${nom} » illisible.`);
    }
    const nomLocal = buffer.readUInt16LE(offsetEntree + 26);
    const extraLocal = buffer.readUInt16LE(offsetEntree + 28);
    const debutDonnees = offsetEntree + 30 + nomLocal + extraLocal;
    const brut = buffer.subarray(debutDonnees, debutDonnees + tailleCompressee);

    entrees.push({
      nom,
      contenu: methode === 0 ? Buffer.from(brut) : inflateRawSync(brut),
    });
  }

  return entrees;
}

/**
 * Index des entrées par nom de base, pour résoudre une référence quelle que
 * soit l'arborescence du zip (« AV-Q02.png » comme « figures/AV-Q02.png »).
 */
export function indexerParNom(entrees: EntreeZip[]) {
  const index = new Map<string, EntreeZip>();
  for (const entree of entrees) {
    const base = entree.nom.split("/").pop();
    if (base && !index.has(base)) index.set(base, entree);
  }
  return index;
}
