/**
 * Grilles d'évaluation des oraux (module concours blancs, §5.5).
 *
 * Module pur. La note d'oral entre dans le bilan au même titre qu'une note
 * d'écrit : elle doit se recalculer et se vérifier sans base.
 */

export type Critere = {
  libelle: string;
  /** Poids relatif du critère. Deux critères à 1 et 3 pèsent 25 % et 75 %. */
  ponderation: number;
  /** Note maximale du critère : 5 par défaut sur les grilles Parkours. */
  echelle: number;
};

/** Grille par défaut de l'oral de motivation, reprise du §5.5. */
export const GRILLE_MOTIVATION: Critere[] = [
  { libelle: "Structuration du propos", ponderation: 1, echelle: 5 },
  { libelle: "Connaissance de l'école et du projet", ponderation: 1, echelle: 5 },
  { libelle: "Argumentation", ponderation: 1, echelle: 5 },
  { libelle: "Expression et posture", ponderation: 1, echelle: 5 },
  { libelle: "Anglais, le cas échéant", ponderation: 1, echelle: 5 },
];

export type NotesCriteres = Record<string, number | null>;

/**
 * Note globale sur 20, moyenne des critères pondérée par leur poids.
 *
 * Un critère non noté est écarté du calcul plutôt que compté zéro : la grille
 * de motivation porte un critère « Anglais, le cas échéant » qui ne
 * s'applique pas à tous les oraux, et le laisser à zéro punirait l'élève pour
 * une question qu'on ne lui a pas posée.
 *
 * Rend null si rien n'est noté : une grille vide n'est pas un zéro.
 */
export function noteGlobale(
  criteres: Critere[],
  notes: NotesCriteres,
): number | null {
  let points = 0;
  let poidsTotal = 0;

  criteres.forEach((critere, index) => {
    const note = notes[String(index)] ?? notes[critere.libelle];
    if (note === null || note === undefined || Number.isNaN(note)) return;
    if (critere.echelle <= 0 || critere.ponderation <= 0) return;

    // Chaque critère est ramené à sa part de 20, au prorata de sa pondération.
    points += (note / critere.echelle) * critere.ponderation;
    poidsTotal += critere.ponderation;
  });

  if (poidsTotal === 0) return null;
  return Math.round((points / poidsTotal) * 20 * 100) / 100;
}

/** Une note hors échelle est refusée plutôt que tronquée en silence. */
export function validerNote(critere: Critere, note: number): string | null {
  if (!Number.isFinite(note)) return "note illisible";
  if (note < 0) return "une note négative n'a pas de sens";
  if (note > critere.echelle) return `le maximum est ${critere.echelle}`;
  return null;
}

/** Une grille sans critère pondéré ne peut rien noter : on le dit à la saisie. */
export function grilleUtilisable(criteres: Critere[]): boolean {
  return criteres.some((c) => c.ponderation > 0 && c.echelle > 0);
}
