/**
 * Ce qui forme un exercice, à l'écran comme au barème (module concours
 * blancs, §4.3).
 *
 * Un sujet ne pose pas toujours des questions indépendantes. Puissance Alpha
 * numérote des exercices de quatre propositions à juger vraies ou fausses ;
 * l'analyse documentaire SÉSAME pose des questions à trous dont les parties
 * se tiennent. Ces ensembles sont déjà l'unité de notation — la règle
 * `tout_ou_rien_par_question` de la correction regroupe par partie entière de
 * l'ordre — et ils doivent donc être l'unité d'affichage. Les découper en
 * écrans séparés demandait à l'élève de retenir ce qu'il venait de lire, et
 * lui cachait que son barème les liait.
 *
 * La clé de regroupement est le couple (bloc, partie entière de l'ordre) :
 * le bloc dit l'exercice, la partie entière dit la question à trous à
 * l'intérieur de l'exercice. L'ordre d'arrivée est conservé, c'est celui du
 * sujet.
 *
 * Module pur : aucun accès base, aucune dépendance React, testable isolément.
 */

export type ElementGroupable = { id: string; ordre: number; blocId: string };

export function grouperParExercice<T extends ElementGroupable>(elements: T[]): T[][] {
  const groupes: T[][] = [];
  const index = new Map<string, number>();

  for (const e of elements) {
    const cle = `${e.blocId}#${Math.trunc(e.ordre)}`;
    const place = index.get(cle);
    if (place === undefined) {
      index.set(cle, groupes.length);
      groupes.push([e]);
    } else {
      groupes[place].push(e);
    }
  }

  return groupes;
}
