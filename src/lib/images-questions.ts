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
): Promise<string | null> {
  if (!chemin) return null;

  const { data, error } = await createAdminClient()
    .storage.from(BUCKET)
    .createSignedUrl(chemin, VALIDITE_SECONDES);

  if (error) {
    // Une figure manquante ne doit pas faire tomber l'écran de relecture :
    // c'est précisément une anomalie que le relecteur doit pouvoir constater.
    console.error(`Figure « ${chemin} » introuvable : ${error.message}`);
    return null;
  }

  return data?.signedUrl ?? null;
}
