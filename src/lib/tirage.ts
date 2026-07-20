/**
 * Tirage d'une session (specs §5.3.3).
 *
 * Module pur : il reçoit les blocs éligibles et l'historique de l'élève, et
 * rend la liste des blocs retenus. Les accès base restent dans l'appelant.
 */

export type BlocTirable = {
  id: string;
  /** Nombre de questions publiées du bloc. Un bloc est pris entier ou pas. */
  taille: number;
  /** Nombre de fois que l'élève a déjà vu des questions de ce bloc. */
  vues: number;
};

export type ResultatTirage = {
  blocs: BlocTirable[];
  nbQuestions: number;
  /** Vrai quand le pool ne permet pas d'atteindre la taille demandée (§5.3.3). */
  reduite: boolean;
};

/**
 * Tirage pondéré anti-répétition, au niveau bloc.
 *
 * Deux règles des specs se combinent mal et il faut choisir :
 *
 *  - « un bloc est tiré entier ou pas du tout » (§2.2) ;
 *  - « session de 10 questions, 20 pour SÉSAME » (§2.6).
 *
 * Avec des blocs de tailles inégales, on ne peut pas toujours atteindre
 * exactement la cible. On ne retient donc que les blocs qui tiennent dans la
 * place restante : la session peut être un peu plus courte que la cible, jamais
 * plus longue, et jamais amputée d'une partie de bloc. Servir un problème
 * chaîné à moitié serait pire qu'une session de 9 questions.
 */
export function tirerSession(
  candidats: BlocTirable[],
  tailleCible: number,
  aleatoire: () => number = Math.random,
): ResultatTirage {
  const disponibles = candidats.filter((b) => b.taille > 0);
  const total = disponibles.reduce((s, b) => s + b.taille, 0);

  const ordonnes = ordonnerParPriorite(disponibles, aleatoire);

  const retenus: BlocTirable[] = [];
  let cumul = 0;

  for (const bloc of ordonnes) {
    if (cumul >= tailleCible) break;
    if (cumul + bloc.taille > tailleCible) continue; // ne rentre pas : on passe
    retenus.push(bloc);
    cumul += bloc.taille;
  }

  return {
    blocs: retenus,
    nbQuestions: cumul,
    // La session n'est « réduite » que si le stock lui-même est insuffisant.
    // Si le pool est assez grand mais que les tailles ne tombent pas juste,
    // l'élève n'a pas à être averti de notre arithmétique.
    reduite: cumul < tailleCible && total < tailleCible,
  };
}

/**
 * Les blocs jamais vus passent devant, puis les moins vus. À nombre de vues
 * égal, l'ordre est aléatoire — sans quoi un élève rejouerait toujours la même
 * session dans le même ordre.
 */
function ordonnerParPriorite(
  blocs: BlocTirable[],
  aleatoire: () => number,
): BlocTirable[] {
  return [...blocs]
    .map((bloc) => ({
      bloc,
      // Poids décroissant avec le nombre de vues, jamais nul : un bloc déjà vu
      // reste tirable, il est seulement moins probable (§5.3.3).
      cle: (1 + bloc.vues) * (0.35 + aleatoire()),
    }))
    .sort((a, b) => a.cle - b.cle)
    .map((x) => x.bloc);
}
