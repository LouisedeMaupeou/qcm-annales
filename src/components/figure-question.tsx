/**
 * Figure d'une question, telle que le relecteur et l'élève doivent la voir.
 *
 * Image non optimisée et balise native : l'URL est signée et expire au bout
 * d'une heure. La faire passer par le pipeline d'images de Next la mettrait en
 * cache derrière une URL qui, elle, ne ment pas sur sa péremption — on servirait
 * une figure morte sans le savoir.
 */
export function FigureQuestion({
  url,
  chemin,
  legende,
}: {
  url: string | null;
  /** Chemin en base, affiché quand le fichier manque : c'est l'anomalie à voir. */
  chemin: string | null;
  legende?: string;
}) {
  if (!chemin) return null;

  if (!url) {
    return (
      <p
        role="alert"
        className="mb-4 rounded-carte border-2 border-negatif bg-negatif/5 p-4 text-sm text-negatif"
      >
        Figure introuvable dans le stockage : <code>{chemin}</code>. La question
        n&apos;est pas jouable tant que l&apos;image n&apos;est pas rattachée.
      </p>
    );
  }

  return (
    <figure className="mb-4">
      {/* eslint-disable-next-line @next/next/no-img-element -- URL signée temporaire, cf. en-tête */}
      <img
        src={url}
        alt={legende ?? "Figure de la question"}
        className="w-full rounded-carte border border-ligne bg-white"
      />
      {legende && (
        <figcaption className="mt-1.5 text-[0.82rem] opacity-70">{legende}</figcaption>
      )}
    </figure>
  );
}
