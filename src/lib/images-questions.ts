import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Sert la figure d'une question (module concours blancs, §3).
 *
 * Le bucket `concours-blancs` est privé, comme celui des annales : les sujets
 * sont des œuvres dont les droits ne sont pas tous sécurisés, et une figure
 * d'épreuve blanche ne doit pas circuler avant que les élèves aient composé.
 * On sert donc une URL signée à durée courte, jamais une URL publique.
 *
 * `questions.image_url` stocke un chemin dans le bucket
 * (« AV-MAT-TOUS26/AV-MAT-TOUS26-Q32.png »), pas une URL : si le bucket change
 * de nom ou de politique, rien n'est à réécrire en base.
 */

const BUCKET = "concours-blancs";

/** Une heure : le temps d'une relecture, pas celui d'un partage. */
const VALIDITE_SECONDES = 3600;

export async function urlSigneeFigure(
  chemin: string | null | undefined,
  secondes: number = VALIDITE_SECONDES,
): Promise<string | null> {
  if (!chemin) return null;

  const { data, error } = await createAdminClient()
    .storage.from(BUCKET)
    .createSignedUrl(chemin, secondes);

  if (error) {
    // Une figure manquante ne doit pas faire tomber l'écran de relecture :
    // c'est précisément une anomalie que le relecteur doit pouvoir constater.
    console.error(`Figure « ${chemin} » introuvable : ${error.message}`);
    return null;
  }

  return data?.signedUrl ?? null;
}

/**
 * Signe plusieurs figures en une fois.
 *
 * Une épreuve blanche peut compter soixante questions illustrées : les signer
 * une par une, c'est autant d'allers-retours réseau avant que l'élève voie sa
 * première question. Et la durée est paramétrable parce qu'un GEIPI dure trois
 * heures : une URL d'une heure casserait les figures en plein milieu de
 * l'épreuve.
 */
export async function urlsSigneesFigures(
  chemins: string[],
  secondes: number = VALIDITE_SECONDES,
): Promise<Map<string, string>> {
  const uniques = [...new Set(chemins.filter(Boolean))];
  if (uniques.length === 0) return new Map();

  const { data, error } = await createAdminClient()
    .storage.from(BUCKET)
    .createSignedUrls(uniques, secondes);

  if (error) {
    console.error(`Signature des figures impossible : ${error.message}`);
    return new Map();
  }

  const urls = new Map<string, string>();
  for (const entree of data ?? []) {
    if (entree.signedUrl && entree.path) urls.set(entree.path, entree.signedUrl);
  }
  return urls;
}
