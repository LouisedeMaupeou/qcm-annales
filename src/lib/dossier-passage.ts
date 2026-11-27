/**
 * Le dossier documentaire d'une épreuve, rassemblé une fois pour toutes
 * (module concours blancs, §4.3).
 *
 * Deux façons d'accompagner des questions coexistent dans la banque.
 *
 * Un passage propre à un exercice vit dans `enonceCommun` : les sujets de
 * langues posent deux ou trois questions sur un texte, puis passent à un
 * autre. Celui-là suit l'exercice, et change avec lui.
 *
 * Un dossier documentaire, lui, est un tout : l'analyse documentaire SÉSAME
 * donne neuf textes et treize encarts, et chaque question en cite quelques-uns.
 * Les faire défiler au rythme des questions reviendrait à retirer le dossier
 * des mains du candidat entre deux questions, alors qu'il l'a posé à côté de
 * lui pour toute l'épreuve. On le présente donc en entier, dans l'ordre du
 * sujet, et il ne bouge plus.
 *
 * Module pur : aucun accès base, aucune dépendance React, testable isolément.
 */

export type PieceDossier = { titre: string | null; url: string | null };

export type PorteurDeDossier = {
  enonceCommun: string | null;
  documents: PieceDossier[];
};

export type Dossier = {
  /** Passages propres à l'exercice affiché. */
  passages: string[];
  /** Pièces du dossier, communes à toute l'épreuve. */
  pieces: PieceDossier[];
};

/** Rang de tri : les textes par numéro, puis les encarts par lettre. */
function rang(titre: string | null): [number, number, string] {
  const t = (titre ?? "").toLowerCase();
  const texte = t.match(/texte[ _-]?(\d+)/);
  if (texte) return [0, Number(texte[1]), ""];
  const encart = t.match(/encart[ _-]?([a-z])/);
  if (encart) return [1, 0, encart[1]];
  const page = t.match(/page[ _-]?(\d+)/);
  if (page) return [1, Number(page[1]), ""];
  return [2, 0, t];
}

/**
 * Rassemble les pièces citées par l'ensemble des questions, sans doublon.
 *
 * Une même pièce est citée par plusieurs questions — le Texte 7 revient sept
 * fois dans le sujet de Noël — et porte alors la même URL signée : c'est elle
 * qui sert de clé, le titre ne servant qu'à l'ordre.
 */
export function rassemblerDossier(questions: PorteurDeDossier[]): PieceDossier[] {
  const pieces = new Map<string, PieceDossier>();

  for (const q of questions) {
    for (const d of q.documents) {
      const cle = d.url ?? d.titre ?? "";
      if (cle && !pieces.has(cle)) pieces.set(cle, d);
    }
  }

  return [...pieces.values()].sort((a, b) => {
    const [ga, na, la] = rang(a.titre);
    const [gb, nb, lb] = rang(b.titre);
    return ga - gb || na - nb || la.localeCompare(lb);
  });
}

/** « texte-7.png » → « Texte 7 » ; « encart-C.png » → « Encart C ». */
export function libellePiece(titre: string | null): string | null {
  if (!titre) return null;
  const sansExtension = titre.replace(/\.[a-z0-9]+$/i, "");
  const texte = sansExtension.match(/^texte[ _-]?(\d+)$/i);
  if (texte) return `Texte ${texte[1]}`;
  const encart = sansExtension.match(/^encart[ _-]?([a-z])$/i);
  if (encart) return `Encart ${encart[1].toUpperCase()}`;
  // Une page de sujet servie en dossier : « AV-PHY-NOEL26-page-03 » → « Page 3 ».
  const page = sansExtension.match(/(?:^|-)page[ _-]?(\d+)$/i);
  if (page) return `Page ${Number(page[1])}`;
  return sansExtension;
}
