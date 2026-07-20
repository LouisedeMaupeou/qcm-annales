/**
 * Règles de notation (specs §2.3 à §2.5).
 *
 * Module pur, sans accès base ni réseau : c'est le cœur métier, et il doit
 * rester lisible et vérifiable isolément.
 */

export type Bareme = {
  pointsBonne: number;
  pointsMauvaise: number;
  pointsAbstention: number;
};

export type StatutReponse = "correcte" | "incorrecte" | "abstention";

/** Ce que le client renvoie, selon le type de question. */
export type ReponseEleve =
  | { type: "abstention" }
  | { type: "choix_unique"; reponseId: string | null }
  | { type: "vrai_faux"; jugements: Record<string, boolean> };

export type Proposition = { id: string; estCorrecte: boolean };

/**
 * §2.3 : « Scoring vrai/faux tout ou rien » — une question à 4 propositions est
 * correcte uniquement si les 4 jugements sont exacts ; 3/4 = incorrecte. Une
 * question laissée entièrement vide = abstention ; partiellement remplie =
 * incorrecte.
 */
export function evaluer(
  reponse: ReponseEleve,
  propositions: Proposition[],
): StatutReponse {
  if (reponse.type === "abstention") return "abstention";

  if (reponse.type === "choix_unique") {
    if (!reponse.reponseId) return "abstention";
    const choisie = propositions.find((p) => p.id === reponse.reponseId);
    // Un identifiant inconnu n'est pas une bonne réponse : on ne récompense
    // pas une requête forgée.
    return choisie?.estCorrecte ? "correcte" : "incorrecte";
  }

  const jugements = reponse.jugements ?? {};
  const rendus = propositions.filter((p) => p.id in jugements);

  if (rendus.length === 0) return "abstention";
  if (rendus.length < propositions.length) return "incorrecte";

  const tousExacts = propositions.every(
    (p) => jugements[p.id] === p.estCorrecte,
  );
  return tousExacts ? "correcte" : "incorrecte";
}

/** §2.4 : chaque réponse rapporte les points du barème, négatifs compris. */
export function pointsDe(statut: StatutReponse, bareme: Bareme): number {
  switch (statut) {
    case "correcte":
      return bareme.pointsBonne;
    case "incorrecte":
      return bareme.pointsMauvaise;
    case "abstention":
      return bareme.pointsAbstention;
  }
}

/**
 * §2.5 : la correction affiche le coût évité par une abstention — « une
 * mauvaise réponse aurait coûté −1 ». Renvoie l'écart positif entre
 * l'abstention et l'erreur, ou 0 quand s'abstenir n'apporte rien.
 */
export function coutEvite(bareme: Bareme): number {
  const ecart = bareme.pointsAbstention - bareme.pointsMauvaise;
  return ecart > 0 ? ecart : 0;
}

export type TotauxSession = {
  points: number;
  pointsMax: number;
  scoreNormalise: number;
  nbQuestions: number;
  nbCorrectes: number;
  nbAbstentions: number;
  tauxBonnesReponses: number;
};

/**
 * §2.4 : affichage en fin de session des points bruts et du taux de bonnes
 * réponses ; pour le tableau de bord, score normalisé = points obtenus /
 * points maximum, plancher 0, afin de comparer des concours aux barèmes
 * différents.
 */
export function totaliser(
  statuts: StatutReponse[],
  bareme: Bareme,
): TotauxSession {
  const points = statuts.reduce((s, st) => s + pointsDe(st, bareme), 0);
  const pointsMax = statuts.length * bareme.pointsBonne;
  const nbCorrectes = statuts.filter((s) => s === "correcte").length;

  return {
    points: arrondir(points),
    pointsMax: arrondir(pointsMax),
    // Plancher à 0 : avec des points négatifs, un total négatif existe, mais un
    // score normalisé négatif n'aurait pas de sens sur une courbe de progression.
    scoreNormalise:
      pointsMax > 0 ? Math.min(1, Math.max(0, points / pointsMax)) : 0,
    nbQuestions: statuts.length,
    nbCorrectes,
    nbAbstentions: statuts.filter((s) => s === "abstention").length,
    tauxBonnesReponses: statuts.length > 0 ? nbCorrectes / statuts.length : 0,
  };
}

/** Les barèmes ont deux décimales (Advance : −0,5), les flottants dérivent. */
function arrondir(n: number) {
  return Math.round(n * 100) / 100;
}

/** Formatage français des points, sans décimale inutile. */
export function formaterPoints(n: number): string {
  const arrondi = arrondir(n);
  const texte = Number.isInteger(arrondi)
    ? String(arrondi)
    : arrondi.toFixed(2).replace(/0$/, "").replace(".", ",");
  return arrondi > 0 ? `+${texte}` : texte;
}
