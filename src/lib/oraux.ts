/**
 * Oraux blancs : référentiel des grilles et notation (module concours
 * blancs, §5.5).
 *
 * Les grilles sont reprises de « Entretiens blancs — grille d'évaluation.xlsx »,
 * onglets Référentiel et Paramètres : intitulés, maxima, indicateurs
 * observables et pondérations, mot pour mot. C'est la grille que le jury a en
 * main, elle ne se reformule pas ici.
 *
 * Référentiel et calcul tiennent dans le même fichier, sans aucun import :
 * c'est ce qui rend le module chargeable tel quel par le lanceur de tests. Ces
 * notes partent dans un bilan envoyé aux familles, elles doivent se vérifier
 * isolément.
 */

export type FiliereOrale = "commerce" | "ingenieur";

export type CritereOral = {
  libelle: string;
  /** Points maximum du critère. La somme fait 20 sur chaque épreuve. */
  maximum: number;
  /** Ce que le jury doit observer pour attribuer les points. */
  indicateur: string;
};

export type EpreuveOraleReferentiel = {
  /** Clé stable, utilisée en base et dans les URL. */
  cle: string;
  nom: string;
  /** Poids dans la note globale d'oral. 0 = évalué mais hors moyenne. */
  ponderation: number;
  ordre: number;
  /** Contexte saisi par le jury en tête de grille (sujet, école visée…). */
  contexte: string;
  criteres: CritereOral[];
};

const COLLECTIF: CritereOral[] = [
  { libelle: "Prise de parole", maximum: 3, indicateur: "Interventions claires, audibles, utiles et proportionnées." },
  { libelle: "Écoute active", maximum: 3, indicateur: "Laisse la place, reformule, prend en compte les interventions." },
  { libelle: "Coopération", maximum: 3, indicateur: "Aide le groupe, intègre les personnes moins à l'aise." },
  { libelle: "Argumentation", maximum: 3, indicateur: "Apporte des arguments pertinents et structurés." },
  { libelle: "Leadership positif", maximum: 3, indicateur: "Fait avancer le groupe sans monopoliser la parole." },
  { libelle: "Gestion du désaccord", maximum: 2, indicateur: "Exprime et traite les désaccords avec respect." },
  { libelle: "Initiative", maximum: 2, indicateur: "Propose des idées et fait preuve de créativité pragmatique." },
  { libelle: "Temps et synthèse", maximum: 1, indicateur: "Contribue à respecter le temps et les objectifs." },
];

const PERSONNALITE: CritereOral[] = [
  { libelle: "Pitch personnel", maximum: 3, indicateur: "Présentation construite, naturelle et mémorable." },
  { libelle: "Exemples vécus", maximum: 3, indicateur: "Réalisations et expériences illustrées concrètement (STAR)." },
  { libelle: "Motivation", maximum: 3, indicateur: "Motivations précises, personnelles et convaincantes." },
  { libelle: "Connaissance école", maximum: 3, indicateur: "Connaît les cours, associations, valeurs et spécificités." },
  { libelle: "Projet", maximum: 3, indicateur: "Projet d'études ou professionnel cohérent et réfléchi." },
  { libelle: "Introspection", maximum: 2, indicateur: "Prend du recul sur ses qualités, limites et apprentissages." },
  { libelle: "Communication", maximum: 2, indicateur: "Expression, regard, aisance et posture authentique." },
  { libelle: "Réactivité", maximum: 1, indicateur: "Répond avec précision et maîtrise aux relances." },
];

const IMAGE: CritereOral[] = [
  { libelle: "Observation", maximum: 3, indicateur: "Décrit précisément les éléments visibles sans extrapoler." },
  { libelle: "Interprétation", maximum: 3, indicateur: "Identifie l'idée centrale et propose une lecture argumentée." },
  { libelle: "Structure", maximum: 3, indicateur: "Présentation organisée, problématique et transitions." },
  { libelle: "Actualité", maximum: 3, indicateur: "Crée des liens pertinents avec des faits d'actualité." },
  { libelle: "Culture générale", maximum: 3, indicateur: "Mobilise références historiques, économiques ou culturelles." },
  { libelle: "Esprit critique", maximum: 2, indicateur: "Nuance, distingue faits et opinions, questionne le support." },
  { libelle: "Expression", maximum: 2, indicateur: "Exposé compréhensible, précis et accessible." },
  { libelle: "Questions du jury", maximum: 1, indicateur: "Sait prolonger la réflexion lors des questions." },
];

const ANGLAIS: CritereOral[] = [
  { libelle: "Compréhension", maximum: 3, indicateur: "Comprend questions, consignes et relances du jury." },
  { libelle: "Expression", maximum: 3, indicateur: "Expose ses idées clairement, avec phrases compréhensibles." },
  { libelle: "Fluidité", maximum: 3, indicateur: "Maintient un échange avec un débit naturel." },
  { libelle: "Grammaire", maximum: 3, indicateur: "Emploie des structures grammaticales suffisamment correctes." },
  { libelle: "Vocabulaire", maximum: 3, indicateur: "Lexique pertinent, varié et adapté aux sujets." },
  { libelle: "Prononciation", maximum: 2, indicateur: "Prononciation intelligible, accentuation et intonation." },
  { libelle: "Interaction", maximum: 2, indicateur: "Dialogue, reformule, demande des précisions." },
  { libelle: "Structure", maximum: 1, indicateur: "Réponses organisées avec connecteurs et exemples." },
];

/**
 * Épreuves par filière.
 *
 * Commerce : les quatre oraux, avec les poids du profil actif de l'onglet
 * Paramètres (IÉSEG post-bac) — personnalité 40 %, image 30 %, anglais 30 %,
 * collectif 0 %. Le collectif est bien passé et noté : c'est un atelier
 * d'entraînement que l'IÉSEG n'annonce pas dans ses oraux, d'où un poids nul
 * dans la moyenne et une note qui reste affichée.
 *
 * Ingénieur : l'oral de personnalité seul, donc 100 %.
 */
export const ORAUX_PAR_FILIERE: Record<FiliereOrale, EpreuveOraleReferentiel[]> = {
  commerce: [
    {
      cle: "collectif",
      nom: "Oral collectif",
      ponderation: 0,
      ordre: 1,
      contexte: "Sujet, groupe ou rôle",
      criteres: COLLECTIF,
    },
    {
      cle: "personnalite",
      nom: "Oral de personnalité",
      ponderation: 0.4,
      ordre: 2,
      contexte: "École(s) visée(s)",
      criteres: PERSONNALITE,
    },
    {
      cle: "image",
      nom: "Oral sur une image",
      ponderation: 0.3,
      ordre: 3,
      contexte: "Référence du visuel",
      criteres: IMAGE,
    },
    {
      cle: "anglais",
      nom: "Oral d'anglais",
      ponderation: 0.3,
      ordre: 4,
      contexte: "Thème ou support anglais",
      criteres: ANGLAIS,
    },
  ],
  ingenieur: [
    {
      cle: "personnalite",
      nom: "Oral de personnalité",
      ponderation: 1,
      ordre: 1,
      contexte: "École(s) visée(s)",
      criteres: PERSONNALITE,
    },
  ],
};

/** Somme des maxima d'une grille : 20 sur chacune des quatre. */
export function maximumGrille(criteres: CritereOral[]): number {
  return criteres.reduce((s, c) => s + c.maximum, 0);
}

export type NotesCriteres = Record<string, number | null>;

/**
 * Note d'une épreuve orale, sur 20.
 *
 * Les critères portent des maxima inégaux (3, 2 ou 1) dont la somme fait
 * déjà 20 : la note est donc le total des points, pas une moyenne. Un critère
 * non noté compte zéro — contrairement aux grilles génériques, celles-ci sont
 * conçues pour être remplies entièrement, et une case vide est un oubli, pas
 * une dispense. C'est `complete()` qui permet de distinguer les deux.
 */
export function noteEpreuveOrale(
  criteres: CritereOral[],
  notes: NotesCriteres,
): number {
  const total = criteres.reduce((somme, critere, index) => {
    const note = notes[String(index)];
    if (note === null || note === undefined || Number.isNaN(note)) return somme;
    return somme + Math.min(note, critere.maximum);
  }, 0);
  return Math.round(total * 100) / 100;
}

/** Tous les critères sont notés : la grille peut être validée. */
export function grilleComplete(
  criteres: CritereOral[],
  notes: NotesCriteres,
): boolean {
  return criteres.every((_, i) => {
    const n = notes[String(i)];
    return n !== null && n !== undefined && !Number.isNaN(n);
  });
}

/** Une note hors barème est refusée plutôt que tronquée en silence. */
export function validerNoteCritere(critere: CritereOral, note: number): string | null {
  if (!Number.isFinite(note)) return "note illisible";
  if (note < 0) return "une note négative n'a pas de sens";
  if (note > critere.maximum) return `le maximum est ${critere.maximum}`;
  // La grille impose le pas de 0,5 : une note à 1,3 ne vient d'aucune case.
  if (Math.round(note * 2) !== note * 2) return "les notes vont par pas de 0,5";
  return null;
}

export type NoteOrale = {
  cle: string;
  nom: string;
  ponderation: number;
  note: number | null;
  maximum: number;
};

/**
 * Note globale des oraux, moyenne pondérée des épreuves notées.
 *
 * Une épreuve de poids nul — l'oral collectif côté commerce — est évaluée et
 * affichée mais n'entre pas dans la moyenne : c'est la règle de l'onglet
 * Paramètres de la grille, où l'IÉSEG ne compte pas le collectif.
 *
 * Une épreuve pondérée mais pas encore notée est écartée du calcul plutôt que
 * comptée zéro, et `complet` dit si toutes celles qui pèsent sont là. Le
 * bilan n'affiche la note globale que lorsqu'elle est complète — c'est la
 * règle annoncée en tête de la grille.
 */
export function noteGlobaleOraux(notes: NoteOrale[]): {
  note: number | null;
  complet: boolean;
} {
  const pesantes = notes.filter((n) => n.ponderation > 0);
  const notees = pesantes.filter((n) => n.note !== null);

  if (notees.length === 0) return { note: null, complet: false };

  const poids = notees.reduce((s, n) => s + n.ponderation, 0);
  const points = notees.reduce((s, n) => s + (n.note as number) * n.ponderation, 0);

  return {
    note: Math.round((points / poids) * 100) / 100,
    complet: notees.length === pesantes.length,
  };
}

/** Grille d'une épreuve, prête à afficher : critères et maximum total. */
export function grilleDe(epreuve: EpreuveOraleReferentiel) {
  return { criteres: epreuve.criteres, maximum: maximumGrille(epreuve.criteres) };
}
