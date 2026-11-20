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
  /**
   * Épreuve d'où viennent ces questions, telle qu'on la nomme aux familles.
   *
   * Un même chapitre — « Grammaire », « Lecture de dossier » — peut être
   * travaillé par deux épreuves ; sans elle, le détail par chapitre mêlait
   * des matières sans le dire.
   */
  epreuve: string;
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
 * Les matières que la prépa veut voir travaillées d'abord.
 *
 * Maths et français portent le plus de coefficients et se rattrapent le mieux
 * par un travail de fond : la prépa demande qu'elles passent devant. Une
 * matière se reconnaît à son code d'épreuve — MAT, FR — ou à son intitulé,
 * selon ce que la statistique porte.
 */
const MATIERES_PRIORITAIRES = /^(MAT|FR)$|MATH|FRAN[CÇ]AIS/i;

function estPrioritaire(c: { matiere: string; epreuve?: string }): boolean {
  return (
    MATIERES_PRIORITAIRES.test(c.matiere.trim()) ||
    MATIERES_PRIORITAIRES.test(c.epreuve ?? "")
  );
}

/** Les matières prioritaires présentes, dans l'ordre maths puis français. */
export function matieresATravailler(chapitres: ChapitreClasse[]): string[] {
  const noms = new Set<string>();
  for (const c of chapitres.filter(estPrioritaire)) {
    const texte = `${c.matiere} ${c.epreuve ?? ""}`;
    if (/^MAT$|MATH/i.test(c.matiere.trim()) || /MATH/i.test(texte)) {
      noms.add("mathématiques");
    }
    if (/^FR$/i.test(c.matiere.trim()) || /FRAN[CÇ]AIS/i.test(texte)) {
      noms.add("français");
    }
  }
  return ["mathématiques", "français"].filter((n) => noms.has(n));
}

/**
 * « À travailler en priorité » : le tiers le moins réussi, en maths et en
 * français.
 *
 * La règle précédente retenait les trois chapitres les plus ratés, toutes
 * matières confondues : un élève pouvait n'y voir que de l'anglais, alors que
 * ce sont les maths et le français qui le feront admettre. On raisonne donc
 * matière par matière, et sur une part plutôt qu'un nombre fixe — trois
 * chapitres sur six, ce n'est pas la même chose que trois sur trente.
 *
 * Un chapitre entièrement réussi n'y figure jamais, même s'il tombe dans le
 * tiers de queue d'un élève excellent : on ne demande pas de retravailler ce
 * qui est juste. On ne s'arrête pas au nombre d'erreurs, en revanche — un
 * élève qui s'abstient sur tout un chapitre n'en fait aucune, et c'est
 * pourtant là qu'il a le plus à reprendre.
 */
export function prioriser(chapitres: ChapitreClasse[]): Priorite[] {
  const parMatiere = new Map<string, ChapitreClasse[]>();
  for (const c of chapitres.filter(estPrioritaire)) {
    const cle = c.epreuve?.trim() || c.matiere;
    if (!parMatiere.has(cle)) parMatiere.set(cle, []);
    parMatiere.get(cle)!.push(c);
  }

  const retenus: ChapitreClasse[] = [];
  for (const liste of parMatiere.values()) {
    const classes = [...liste].sort(
      (a, b) => a.tauxReussite - b.tauxReussite || b.fausses - a.fausses,
    );
    const combien = Math.max(1, Math.ceil(classes.length / 3));
    retenus.push(...classes.slice(0, combien).filter((c) => c.justes < c.posees));
  }

  return retenus
    .sort((a, b) => a.tauxReussite - b.tauxReussite || b.fausses - a.fausses)
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
  matieres: string[] = [],
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

  // On nomme d'abord les matières, puis les chapitres : un parent retient
  // « les maths et le français » mieux qu'une liste de chapitres, et c'est
  // sur ces deux matières que la prépa veut voir porter l'effort.
  const liste = (mots: string[]) =>
    mots.length > 1
      ? `${mots.slice(0, -1).join(", ")} et ${mots[mots.length - 1]}`
      : (mots[0] ?? "");

  const phrase2 =
    matieres.length > 0
      ? `L'effort doit porter en priorité sur ${liste(matieres)}.`
      : "";

  const phrase3 =
    priorites.length > 0
      ? `Les chapitres à reprendre sont ${liste(priorites.map((p) => p.chapitre))}.`
      : "Aucun chapitre ne ressort comme prioritaire : le travail peut porter sur la régularité et la méthode.";

  return [phrase1, phrase2, phrase3].filter(Boolean).join(" ");
}

/**
 * Regroupe le détail par chapitre sous son épreuve.
 *
 * Un même intitulé de chapitre peut venir de deux épreuves — « Grammaire »
 * existe en français comme en allemand — et la table les mêlait sans le dire,
 * si bien qu'un parent y lisait deux lignes contradictoires sur ce qu'il
 * croyait être la même matière.
 *
 * L'ordre des chapitres est conservé à l'intérieur d'un groupe : le plus
 * faible taux de réussite d'abord, qui est l'ordre utile.
 */
export function grouperChapitresParEpreuve(
  chapitres: ChapitreClasse[],
): { epreuve: string; chapitres: ChapitreClasse[] }[] {
  const groupes = new Map<string, ChapitreClasse[]>();

  for (const c of chapitres) {
    const cle = c.epreuve?.trim() || "Autres";
    if (!groupes.has(cle)) groupes.set(cle, []);
    groupes.get(cle)!.push(c);
  }

  return [...groupes.entries()]
    .map(([epreuve, liste]) => ({ epreuve, chapitres: liste }))
    .sort((a, b) => a.epreuve.localeCompare(b.epreuve, "fr"));
}
