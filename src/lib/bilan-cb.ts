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
  nbQuestions: number;
  nbAbstentions: number;
  /** Acquis et points à reprendre de l'épreuve, tels que le tableau les montre. */
  forces: PointAnalyse[];
  ameliorations: PointAnalyse[];
};

/** Maths et français passent devant : ils pèsent le plus, et se rattrapent par le fond. */
const MATIERE_PRIORITAIRE = /MATH|FRAN[CÇ]AIS/i;

/**
 * Pré-remplit « En quelques mots » à partir du tableau du bilan.
 *
 * Trois ou quatre phrases, chiffrées, sans jugement : le résultat d'ensemble,
 * ce qui est solide, ce qu'il faut reprendre en priorité — maths et français
 * d'abord, comme la prépa l'a demandé —, et, s'il y a lieu, les questions
 * laissées sans réponse. Les mots sont ceux du tableau, pour que la famille
 * retrouve dans la suite du bilan ce que ce paragraphe annonce.
 *
 * Un point de départ pour la responsable, qui le réécrit si elle veut : le
 * texte qu'elle enregistre remplace celui-ci.
 */
export function enQuelquesMots(prenom: string, epreuves: ResumeEpreuve[]): string {
  if (epreuves.length === 0) {
    return `${prenom} n'a composé aucune épreuve de cette session.`;
  }
  const v = (n: number) => n.toString().replace(".", ",");
  const liste = (mots: string[]) =>
    mots.length > 1 ? `${mots.slice(0, -1).join(", ")} et ${mots[mots.length - 1]}` : (mots[0] ?? "");

  const moyenneEleve = moyenne(epreuves.map((e) => e.noteSur20)) ?? 0;
  const meilleure = [...epreuves].sort((a, b) => b.noteSur20 - a.noteSur20)[0];
  const auDessus = epreuves.filter(
    (e) => e.moyenneGroupe !== null && e.noteSur20 >= e.moyenneGroupe,
  ).length;
  const phrases = [
    `${prenom} obtient une moyenne de ${v(moyenneEleve)}/20 sur ${epreuves.length} épreuve` +
      `${epreuves.length > 1 ? "s" : ""}, dont ${auDessus} au niveau de la moyenne du groupe ou ` +
      `au-dessus ; son meilleur résultat est en ${meilleure.matiere} (${v(meilleure.noteSur20)}/20).`,
  ];

  const forces = epreuves
    .flatMap((e) => e.forces.map((p) => ({ p, matiere: e.matiere })))
    .sort((a, b) => b.p.justes - a.p.justes || a.p.fausses - b.p.fausses)
    .slice(0, 3);
  if (forces.length > 0) {
    phrases.push(
      `Points solides : ${liste(forces.map((f) => `${f.p.libelle} (${f.matiere})`))}.`,
    );
  }

  const aReprendre = epreuves
    .flatMap((e) => e.ameliorations.map((p) => ({ p, matiere: e.matiere })))
    .sort(
      (a, b) =>
        Number(MATIERE_PRIORITAIRE.test(b.matiere)) - Number(MATIERE_PRIORITAIRE.test(a.matiere)) ||
        b.p.fausses - a.p.fausses,
    )
    .slice(0, 3);
  phrases.push(
    aReprendre.length > 0
      ? `À reprendre en priorité : ${liste(
          aReprendre.map((a) => `${a.p.libelle} (${a.matiere}, ${a.p.fausses} fautes)`),
        )} — le plan de travail détaille chaque erreur.`
      : "Aucun point n'est faux plus de deux fois : le travail peut porter sur la régularité et la méthode.",
  );

  const attendues = epreuves.reduce((s, e) => s + e.nbQuestions, 0);
  const sansReponse = epreuves.reduce((s, e) => s + e.nbAbstentions, 0);
  if (attendues > 0 && sansReponse / attendues >= 0.25) {
    phrases.push(
      `${sansReponse} questions sur ${attendues} sont restées sans réponse : refaire les épreuves ` +
        `en entier, en ligne, permet de travailler le rythme.`,
    );
  }

  return phrases.join(" ");
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

// ---------------------------------------------------------------------------
// Analyse V11 : domaine › chapitre › notion › erreur › amélioration
// ---------------------------------------------------------------------------
//
// Retours de la responsable des prépas sur les bilans de Noël 2026. Le
// tableau doit dire, épreuve par épreuve, ce qui est acquis et ce qui ne l'est
// pas ; la suite du bilan devient un plan de travail, qui nomme pour chaque
// faute la notion, l'erreur commise et comment ne plus la refaire.
//
// La hiérarchie est celle du référentiel SÉSAME :
//   domaine  = « Chapitre / compétence » (colonne `questions.chapitre`)
//   chapitre = « Notion commune »        (colonne `questions.sous_chapitre`)
//   notion   = « Sous-notion précise »   (colonne `questions.notions`)

/** Une réponse de copie, avec ce que le référentiel dit de la question. */
export type ReponseAnalysee = {
  /** Épreuve telle qu'on la nomme aux familles. */
  epreuve: string;
  /** Code matière de l'identifiant d'épreuve : FR, ANG, MAT, DE… */
  matiere: string;
  /** Numéro de la question dans l'épreuve. */
  numero: number;
  domaine: string;
  chapitre: string | null;
  notion: string | null;
  statut: "correcte" | "incorrecte" | "abstention" | "a_corriger";
  /** Retour propre à la proposition cochée, quand elle est fausse. */
  retourReponse: string | null;
  methode: string | null;
  travail: string | null;
};

/** Un point du tableau : un chapitre, ou un domaine entier en langues. */
export type PointAnalyse = {
  libelle: string;
  domaine: string;
  posees: number;
  justes: number;
  fausses: number;
  abstentions: number;
};

/** « Faux plus de 2 fois » : le seuil des points d'amélioration. */
export const SEUIL_AMELIORATION = 2;
/** Au plus quatre forces par épreuve. */
export const FORCES_MAX = 4;

/**
 * Les épreuves de langue s'analysent par domaine, pas par chapitre.
 *
 * Leurs questions de grammaire portent sur des notions bien plus nombreuses
 * et diverses que les chapitres du programme : découpées, elles dépassent
 * rarement le seuil une à une, alors que l'élève en accumule dix. Par domaine
 * — Grammaire, Lexique, Compréhension, Civilisation —, « Grammaire » apparaît
 * dès trois fautes toutes notions confondues, et chaque type de question
 * montre son nombre de fautes.
 */
const LANGUES = /^(FR|FRA|ANG|EN|DE|ALL|ES|ESP|IT|LV\d?)$/i;
export const estLangue = (matiere: string) => LANGUES.test(matiere.trim());

function unite(r: ReponseAnalysee): { cle: string; libelle: string } {
  if (estLangue(r.matiere) || !r.chapitre) return { cle: r.domaine, libelle: r.domaine };
  return { cle: `${r.domaine}›${r.chapitre}`, libelle: r.chapitre };
}

/** Compte les réponses d'une épreuve par point (chapitre, ou domaine en langues). */
export function pointsDeLEpreuve(reponses: ReponseAnalysee[]): PointAnalyse[] {
  const points = new Map<string, PointAnalyse>();
  for (const r of reponses) {
    if (r.statut === "a_corriger") continue;
    const { cle, libelle } = unite(r);
    const p =
      points.get(cle) ??
      ({ libelle, domaine: r.domaine, posees: 0, justes: 0, fausses: 0, abstentions: 0 } satisfies PointAnalyse);
    p.posees += 1;
    if (r.statut === "correcte") p.justes += 1;
    else if (r.statut === "incorrecte") p.fausses += 1;
    else p.abstentions += 1;
    points.set(cle, p);
  }
  return [...points.values()];
}

/**
 * Forces et points d'amélioration d'une épreuve.
 *
 * Amélioration : faux plus de deux fois, le plus fautif d'abord.
 * Forces : au plus quatre, parmi les points majoritairement réussis, ceux qui
 * comptent le moins de fautes — à fautes égales, le plus de réussites. Un
 * point à peine tenté (une réponse juste sur cinq, le reste sans réponse)
 * n'est pas une force : il faut plus de réussites que d'échecs et
 * d'abstentions réunis.
 */
export function forcesEtAmeliorations(points: PointAnalyse[]): {
  forces: PointAnalyse[];
  ameliorations: PointAnalyse[];
} {
  const ameliorations = points
    .filter((p) => p.fausses > SEUIL_AMELIORATION)
    .sort((a, b) => b.fausses - a.fausses || a.libelle.localeCompare(b.libelle, "fr"));
  const forces = points
    .filter((p) => p.justes > p.fausses + p.abstentions && p.fausses <= SEUIL_AMELIORATION)
    .sort(
      (a, b) =>
        a.fausses - b.fausses || b.justes - a.justes || a.libelle.localeCompare(b.libelle, "fr"),
    )
    .slice(0, FORCES_MAX);
  return { forces, ameliorations };
}

/**
 * L'erreur commise, sans son habillage.
 *
 * Le retour du référentiel s'écrit « À corriger — <l'erreur>. Méthode de
 * vérification : <…> » ou « Réponse non retenue — <l'erreur>. Règle à
 * appliquer : <…> ». Le bilan affiche la méthode à part : on n'en garde ici
 * que l'erreur elle-même.
 */
export function erreurCommise(retour: string | null): string | null {
  if (!retour?.trim()) return null;
  let texte = retour.trim();
  const tiret = texte.indexOf(" — ");
  if (tiret >= 0 && tiret < 40) texte = texte.slice(tiret + 3);
  texte = texte.split(/\s*(?:Méthode de vérification|Règle à appliquer)\s*:/i)[0].trim();
  return texte || null;
}

export type FauteDetaillee = {
  numero: number;
  /** Chapitre de la faute, quand le point regroupe tout un domaine (langues). */
  chapitre: string | null;
  notion: string | null;
  erreur: string | null;
  amelioration: string | null;
  methode: string | null;
};

/** Un point d'amélioration du tableau, et ce qu'il faut en retenir. */
export type PointDuPlan = {
  libelle: string;
  domaine: string;
  fautes: number;
  /** Au plus `FAUTES_DETAILLEES_MAX`, de chapitres et de notions différents d'abord. */
  detail: FauteDetaillee[];
  /** Fautes non détaillées ici, à retrouver dans la copie corrigée. */
  autres: number;
  /**
   * Toutes les fautes du point, exemples compris : l'écran les déplie à la
   * demande. Aucune faute ne doit disparaître du bilan, même quand le plan
   * n'en montre que deux.
   */
  toutes: FauteDetaillee[];
};

export type PlanEpreuve = {
  epreuve: string;
  /** Les `POINTS_DU_PLAN_MAX` points les plus fautifs, illustrés. */
  points: PointDuPlan[];
  /** Les points d'amélioration suivants, moins fautifs. */
  autresPoints: PointDuPlan[];
};

/** Le plan s'en tient aux trois points les plus fautifs de chaque épreuve. */
export const POINTS_DU_PLAN_MAX = 3;

/**
 * Deux fautes détaillées par point : au-delà, le bilan devient un catalogue
 * — vingt pages pour un élève en difficulté, que personne ne lit. La copie
 * corrigée, consultable en ligne, porte toutes les autres.
 */
export const FAUTES_DETAILLEES_MAX = 2;

/**
 * La suite du bilan : un plan de travail.
 *
 * Il reprend, épreuve par épreuve, les points d'amélioration du tableau
 * (faux plus de deux fois), le plus fautif d'abord. Chacun est illustré par
 * des fautes de la copie : la notion, l'erreur commise, ce qu'il faut
 * reprendre et la méthode. Une abstention n'a pas d'erreur à expliquer : elle
 * compte dans le tableau, pas ici.
 */
export function planDeTravail(reponses: ReponseAnalysee[]): PlanEpreuve[] {
  const parEpreuve = new Map<string, ReponseAnalysee[]>();
  for (const r of reponses) {
    parEpreuve.set(r.epreuve, [...(parEpreuve.get(r.epreuve) ?? []), r]);
  }

  const plans: PlanEpreuve[] = [];
  for (const [epreuve, siennes] of parEpreuve) {
    const { ameliorations } = forcesEtAmeliorations(pointsDeLEpreuve(siennes));
    if (ameliorations.length === 0) continue;

    const points = ameliorations.map((p) => {
      const fautes = siennes
        .filter((r) => r.statut === "incorrecte" && unite(r).libelle === p.libelle && r.domaine === p.domaine)
        .sort((a, b) => a.numero - b.numero);

      // Varier les exemples : un chapitre, puis une notion, pas encore vus.
      const retenues: ReponseAnalysee[] = [];
      const chapitresVus = new Set<string>();
      const notionsVues = new Set<string>();
      const passes: ((f: ReponseAnalysee) => boolean)[] = [
        (f) => !chapitresVus.has(f.chapitre ?? "") && !notionsVues.has(f.notion ?? `#${f.numero}`),
        (f) => !notionsVues.has(f.notion ?? `#${f.numero}`),
        () => true,
      ];
      for (const accepte of passes) {
        for (const f of fautes) {
          if (retenues.length >= FAUTES_DETAILLEES_MAX) break;
          if (retenues.includes(f) || !accepte(f)) continue;
          retenues.push(f);
          chapitresVus.add(f.chapitre ?? "");
          notionsVues.add(f.notion ?? `#${f.numero}`);
        }
      }

      const regroupe = estLangue(siennes[0]?.matiere ?? "");
      const detailler = (f: ReponseAnalysee): FauteDetaillee => ({
        numero: f.numero,
        chapitre: regroupe ? f.chapitre : null,
        notion: f.notion,
        erreur: erreurCommise(f.retourReponse),
        amelioration: f.travail,
        methode: f.methode,
      });
      return {
        libelle: p.libelle,
        domaine: p.domaine,
        fautes: p.fausses,
        detail: retenues.sort((a, b) => a.numero - b.numero).map(detailler),
        autres: fautes.length - retenues.length,
        toutes: fautes.map(detailler),
      };
    });
    plans.push({
      epreuve,
      points: points.slice(0, POINTS_DU_PLAN_MAX),
      autresPoints: points.slice(POINTS_DU_PLAN_MAX),
    });
  }
  return plans;
}
