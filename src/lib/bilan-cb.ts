/**
 * Calculs du bilan de session (module concours blancs, §5.4).
 *
 * Module pur : rangs, moyennes, classement des chapitres, priorités. Comme la
 * correction, ce sont des chiffres qui partent chez des parents — ils doivent
 * se vérifier sans base de données.
 *
 * Les libellés sont ceux des modèles Parkours V10 fournis : « Bonne maîtrise
 * de l'épreuve », « En cours d'acquisition, entraînement nécessaire ». Ils ne
 * sont pas décoratifs, ils figurent tels quels sur le document envoyé.
 */

export type SeuilsChapitre = {
  /** ≥ ce taux : maîtrisé. Défaut 75 %. */
  maitrise: number;
  /** ≥ ce taux : à consolider. En dessous : insuffisant. Défaut 40 %. */
  consolider: number;
  /** Erreurs minimales pour entrer dans le top 3 des priorités. Défaut 4. */
  erreursPriorite: number;
};

export const SEUILS_PAR_DEFAUT: SeuilsChapitre = {
  maitrise: 75,
  consolider: 40,
  erreursPriorite: 4,
};

export type NiveauChapitre = "maitrise" | "a_consolider" | "insuffisant";

export const LIBELLE_CHAPITRE: Record<NiveauChapitre, string> = {
  maitrise: "Maîtrisé",
  a_consolider: "À consolider",
  insuffisant: "Insuffisant",
};

/** §5.4 : seuils validés — ≥ 75 % / 40-74 % / < 40 % de réussite. */
export function classerChapitre(
  tauxReussite: number,
  seuils: SeuilsChapitre = SEUILS_PAR_DEFAUT,
): NiveauChapitre {
  if (tauxReussite >= seuils.maitrise) return "maitrise";
  if (tauxReussite >= seuils.consolider) return "a_consolider";
  return "insuffisant";
}

/**
 * Niveau de maîtrise d'une épreuve, dans les termes du modèle V10.
 *
 * Les mêmes seuils que les chapitres, appliqués à la note sur 20 : un élève à
 * 15/20 est à 75 % de réussite. Garder un seul jeu de seuils évite qu'un
 * chapitre soit « maîtrisé » dans une épreuve déclarée « à travailler ».
 */
export function niveauEpreuve(
  noteSur20: number,
  seuils: SeuilsChapitre = SEUILS_PAR_DEFAUT,
): string {
  const taux = (noteSur20 / 20) * 100;
  switch (classerChapitre(taux, seuils)) {
    case "maitrise":
      return "Bonne maîtrise de l'épreuve";
    case "a_consolider":
      return "En cours d'acquisition, entraînement nécessaire";
    default:
      return "Acquisition à construire, reprise des bases nécessaire";
  }
}

/**
 * Rang d'une note parmi celles du groupe, en classement « olympique » : deux
 * ex æquo partagent le même rang, le suivant est décalé d'autant.
 *
 * Le périmètre est celui du §10.2 : les participants Parkours de la session,
 * c'est-à-dire les élèves des cohortes assignées ayant remis.
 */
export function rang(noteEleve: number, notesDuGroupe: number[]): number {
  return notesDuGroupe.filter((n) => n > noteEleve).length + 1;
}

export function moyenne(notes: number[]): number | null {
  if (notes.length === 0) return null;
  return Math.round((notes.reduce((s, n) => s + n, 0) / notes.length) * 100) / 100;
}

// ---------------------------------------------------------------------------
// Analyse par chapitre
// ---------------------------------------------------------------------------

export type StatsChapitre = {
  chapitre: string;
  matiere: string;
  /** Questions du chapitre réellement traitées par l'élève, abstentions comprises. */
  posees: number;
  justes: number;
  fausses: number;
  abstentions: number;
  /** Action ciblée, reprise de la colonne « Travail à réaliser » du référentiel. */
  travailARealiser: string | null;
  notions: string | null;
};

export type ChapitreClasse = StatsChapitre & {
  tauxReussite: number;
  niveau: NiveauChapitre;
};

export function classerChapitres(
  stats: StatsChapitre[],
  seuils: SeuilsChapitre = SEUILS_PAR_DEFAUT,
): ChapitreClasse[] {
  return stats
    .map((s) => {
      // Une abstention n'est pas une erreur de compréhension, mais elle n'est
      // pas une réussite non plus : elle reste au dénominateur. Un élève qui
      // ne traite rien n'est pas « maîtrisé » par défaut.
      const taux = s.posees > 0 ? Math.round((s.justes / s.posees) * 100) : 0;
      return { ...s, tauxReussite: taux, niveau: classerChapitre(taux, seuils) };
    })
    .sort((a, b) => a.tauxReussite - b.tauxReussite || a.chapitre.localeCompare(b.chapitre));
}

export type Priorite = {
  chapitre: string;
  matiere: string;
  erreurs: number;
  tauxReussite: number;
  action: string;
};

/**
 * « À travailler en priorité » : top 3 des chapitres.
 *
 * La règle du modèle est « 4 erreurs ou plus, si confirmé ». « Confirmé » est
 * entendu ici comme : l'échec n'est pas un accident isolé, donc le chapitre
 * est aussi sous le seuil de maîtrise. Un élève qui rate 4 questions sur 40
 * dans un chapitre par ailleurs réussi n'a pas à le voir en priorité.
 */
export function prioriser(
  chapitres: ChapitreClasse[],
  seuils: SeuilsChapitre = SEUILS_PAR_DEFAUT,
): Priorite[] {
  return chapitres
    .filter((c) => c.fausses >= seuils.erreursPriorite && c.niveau !== "maitrise")
    .sort((a, b) => b.fausses - a.fausses || a.tauxReussite - b.tauxReussite)
    .slice(0, 3)
    .map((c) => ({
      chapitre: c.chapitre,
      matiere: c.matiere,
      erreurs: c.fausses,
      tauxReussite: c.tauxReussite,
      action:
        c.travailARealiser?.trim() ||
        `Reprendre « ${c.chapitre} » et refaire les questions manquées.`,
    }));
}

// ---------------------------------------------------------------------------
// « En quelques mots »
// ---------------------------------------------------------------------------

export type ResumeEpreuve = {
  concours: string;
  matiere: string;
  noteSur20: number;
  moyenneGroupe: number | null;
  rang: number;
  participants: number;
};

/**
 * Pré-remplit l'encadré « En quelques mots » — deux phrases, pas plus (§5.4).
 *
 * Ce texte est fait pour être réécrit : il donne à la responsable un point de
 * départ factuel, jamais un jugement. D'où des constats chiffrés plutôt que
 * des adjectifs.
 */
export function enQuelquesMots(
  prenom: string,
  epreuves: ResumeEpreuve[],
  priorites: Priorite[],
): string {
  if (epreuves.length === 0) {
    return `${prenom} n'a composé aucune épreuve de cette session.`;
  }

  const notes = epreuves.map((e) => e.noteSur20);
  const moyenneEleve = moyenne(notes) ?? 0;
  const meilleure = [...epreuves].sort((a, b) => b.noteSur20 - a.noteSur20)[0];
  const auDessus = epreuves.filter(
    (e) => e.moyenneGroupe !== null && e.noteSur20 >= e.moyenneGroupe,
  ).length;

  const phrase1 =
    `${prenom} obtient une moyenne de ${moyenneEleve.toString().replace(".", ",")}/20 sur ` +
    `${epreuves.length} épreuve${epreuves.length > 1 ? "s" : ""}, dont ${auDessus} ` +
    `au niveau de la moyenne du groupe ou au-dessus, avec un point haut en ` +
    `${meilleure.matiere} (${meilleure.noteSur20.toString().replace(".", ",")}/20).`;

  const phrase2 =
    priorites.length > 0
      ? `Les chapitres à reprendre en priorité sont ${priorites
          .map((p) => p.chapitre)
          .join(", ")}.`
      : `Aucun chapitre ne ressort comme prioritaire : le travail peut porter sur la régularité et la méthode.`;

  return `${phrase1} ${phrase2}`;
}
