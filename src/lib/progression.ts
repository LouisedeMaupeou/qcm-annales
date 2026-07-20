/**
 * Agrégats du tableau de bord élève (specs §5.4) et de l'espace parent (§5.1).
 *
 * Module pur : il reçoit des sessions déjà chargées et rend les statistiques.
 */

export type SessionJouee = {
  id: string;
  concoursId: string;
  concoursNom: string;
  epreuveId: string;
  epreuveNom: string;
  scoreNormalise: number;
  points: number;
  pointsMax: number;
  nbQuestions: number;
  nbCorrectes: number;
  termineeLe: string;
};

export type Tendance = "hausse" | "baisse" | "stable" | "insuffisant";

export type LigneMatiere = {
  epreuveId: string;
  epreuveNom: string;
  concoursNom: string;
  nbSessions: number;
  scoreMoyen: number;
  dernierScore: number;
  tendance: Tendance;
  /** Écart entre la moyenne des premières et des dernières sessions. */
  delta: number;
};

/** Seuil sous lequel une variation n'est pas jugée significative. */
const SEUIL_TENDANCE = 0.05;

/**
 * §5.4 : « nombre de sessions, score moyen, dernier, tendance », par matière.
 *
 * La tendance compare la moyenne de la première moitié des sessions à celle de
 * la seconde. Sous trois sessions, on ne conclut pas : deux points ne font pas
 * une tendance, et annoncer une baisse à un élève qui a joué deux fois serait
 * décourageant autant qu'infondé.
 */
export function parMatiere(sessions: SessionJouee[]): LigneMatiere[] {
  const groupes = new Map<string, SessionJouee[]>();
  for (const s of sessions) {
    if (!groupes.has(s.epreuveId)) groupes.set(s.epreuveId, []);
    groupes.get(s.epreuveId)!.push(s);
  }

  return [...groupes.values()]
    .map((groupe) => {
      // Du plus ancien au plus récent.
      const ordre = [...groupe].sort((a, b) =>
        a.termineeLe.localeCompare(b.termineeLe),
      );
      const scores = ordre.map((s) => s.scoreNormalise);
      const { tendance, delta } = calculerTendance(scores);

      return {
        epreuveId: ordre[0].epreuveId,
        epreuveNom: ordre[0].epreuveNom,
        concoursNom: ordre[0].concoursNom,
        nbSessions: ordre.length,
        scoreMoyen: moyenne(scores),
        dernierScore: scores[scores.length - 1],
        tendance,
        delta,
      };
    })
    .sort((a, b) => a.epreuveNom.localeCompare(b.epreuveNom, "fr"));
}

export function calculerTendance(scores: number[]): {
  tendance: Tendance;
  delta: number;
} {
  if (scores.length < 3) return { tendance: "insuffisant", delta: 0 };

  const milieu = Math.floor(scores.length / 2);
  const debut = moyenne(scores.slice(0, milieu));
  const fin = moyenne(scores.slice(scores.length - milieu));
  const delta = fin - debut;

  if (Math.abs(delta) < SEUIL_TENDANCE) return { tendance: "stable", delta };
  return { tendance: delta > 0 ? "hausse" : "baisse", delta };
}

/**
 * Points de la courbe d'évolution (§5.4, multi-courbes par matière).
 *
 * Les sessions n'étant pas synchronisées entre matières, chaque série a ses
 * propres abscisses : on indexe par numéro de session *de cette matière*, ce
 * qui répond à « est-ce que je progresse ? » plutôt qu'à « quel jour ? ».
 */
export type PointCourbe = { index: number } & Record<string, number | null>;

export function courbesParMatiere(sessions: SessionJouee[]): {
  points: PointCourbe[];
  series: { cle: string; nom: string }[];
} {
  const groupes = new Map<string, SessionJouee[]>();
  for (const s of sessions) {
    if (!groupes.has(s.epreuveId)) groupes.set(s.epreuveId, []);
    groupes.get(s.epreuveId)!.push(s);
  }

  const series = [...groupes.entries()]
    .map(([cle, groupe]) => ({ cle, nom: groupe[0].epreuveNom }))
    .sort((a, b) => a.nom.localeCompare(b.nom, "fr"));

  const longueurMax = Math.max(0, ...[...groupes.values()].map((g) => g.length));

  const points: PointCourbe[] = [];
  for (let i = 0; i < longueurMax; i++) {
    const point: PointCourbe = { index: i + 1 };
    for (const { cle } of series) {
      const ordre = [...groupes.get(cle)!].sort((a, b) =>
        a.termineeLe.localeCompare(b.termineeLe),
      );
      // null plutôt que 0 : une matière moins jouée ne doit pas voir sa courbe
      // plonger vers zéro faute de données.
      point[cle] = ordre[i] ? Math.round(ordre[i].scoreNormalise * 100) : null;
    }
    points.push(point);
  }

  return { points, series };
}

export type ChapitreFaible = {
  chapitre: string;
  rates: number;
  total: number;
  taux: number;
};

/**
 * §5.4 : chapitres à retravailler. Classés par nombre d'erreurs, puis par taux
 * d'échec — un chapitre raté 4 fois sur 5 passe devant un chapitre raté 4 fois
 * sur 20.
 */
export function chapitresARetravailler(
  reponses: { chapitre: string; statut: string }[],
  limite = 8,
): ChapitreFaible[] {
  const compteur = new Map<string, { rates: number; total: number }>();

  for (const r of reponses) {
    const entree = compteur.get(r.chapitre) ?? { rates: 0, total: 0 };
    entree.total += 1;
    if (r.statut !== "correcte") entree.rates += 1;
    compteur.set(r.chapitre, entree);
  }

  return [...compteur.entries()]
    .filter(([, v]) => v.rates > 0)
    .map(([chapitre, v]) => ({
      chapitre,
      rates: v.rates,
      total: v.total,
      taux: v.rates / v.total,
    }))
    .sort((a, b) => b.rates - a.rates || b.taux - a.taux)
    .slice(0, limite);
}

/** Régularité : nombre de semaines distinctes jouées sur la période. */
export function regularite(sessions: SessionJouee[], semaines = 8) {
  const limite = new Date();
  limite.setDate(limite.getDate() - semaines * 7);

  const recentes = sessions.filter((s) => new Date(s.termineeLe) >= limite);
  const clesSemaine = new Set(recentes.map((s) => cleSemaine(new Date(s.termineeLe))));

  return {
    sessionsRecentes: recentes.length,
    semainesJouees: clesSemaine.size,
    semainesObservees: semaines,
  };
}

function cleSemaine(d: Date) {
  const copie = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const jour = copie.getUTCDay() || 7;
  copie.setUTCDate(copie.getUTCDate() + 4 - jour);
  const debutAnnee = new Date(Date.UTC(copie.getUTCFullYear(), 0, 1));
  const semaine = Math.ceil(((copie.getTime() - debutAnnee.getTime()) / 86400000 + 1) / 7);
  return `${copie.getUTCFullYear()}-S${semaine}`;
}

function moyenne(valeurs: number[]) {
  return valeurs.length === 0
    ? 0
    : valeurs.reduce((s, v) => s + v, 0) / valeurs.length;
}
