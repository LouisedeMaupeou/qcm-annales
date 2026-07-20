/**
 * Agrégats de la section Pilotage (specs §6.3) et des compteurs Élèves (§6.2).
 *
 * Module pur : reçoit des lignes déjà chargées, rend des indicateurs.
 */

export type SessionKpi = {
  userId: string;
  concoursId: string;
  concoursNom: string;
  epreuveId: string;
  epreuveNom: string;
  scoreNormalise: number;
  termineeLe: string;
};

// ---------------------------------------------------------------------------
// Utilisateurs par usage (§6.3)
// ---------------------------------------------------------------------------
export type UsageEleve = {
  userId: string;
  nbSessions: number;
  scoreMoyen: number;
  /** Écart entre la moyenne des premières et des dernières sessions. */
  progression: number | null;
  derniereActivite: string;
};

/**
 * §6.3 : « classement des élèves par nombre de sessions, avec leur progression
 * (delta de score normalisé entre leurs premières et dernières sessions) ».
 *
 * Le delta compare la première moitié des sessions à la seconde. Sous quatre
 * sessions, on ne le calcule pas : comparer une session à une autre mesure
 * surtout le hasard du tirage.
 */
export function usageParEleve(sessions: SessionKpi[]): UsageEleve[] {
  const groupes = new Map<string, SessionKpi[]>();
  for (const s of sessions) {
    if (!groupes.has(s.userId)) groupes.set(s.userId, []);
    groupes.get(s.userId)!.push(s);
  }

  return [...groupes.entries()]
    .map(([userId, brutes]) => {
      const ordre = [...brutes].sort((a, b) =>
        a.termineeLe.localeCompare(b.termineeLe),
      );
      const scores = ordre.map((s) => s.scoreNormalise);

      return {
        userId,
        nbSessions: ordre.length,
        scoreMoyen: moyenne(scores),
        progression: deltaProgression(scores),
        derniereActivite: ordre[ordre.length - 1].termineeLe,
      };
    })
    .sort((a, b) => b.nbSessions - a.nbSessions || b.scoreMoyen - a.scoreMoyen);
}

export function deltaProgression(scores: number[]): number | null {
  if (scores.length < 4) return null;
  const milieu = Math.floor(scores.length / 2);
  return moyenne(scores.slice(scores.length - milieu)) - moyenne(scores.slice(0, milieu));
}

// ---------------------------------------------------------------------------
// Taux d'annales réalisées (§6.3)
// ---------------------------------------------------------------------------
export type CouvertureConcours = {
  concoursId: string;
  concoursNom: string;
  publiees: number;
  vues: number;
  taux: number;
};

/**
 * §6.3 : « questions publiées vues au moins une fois / questions publiées, par
 * concours » — mesure la profondeur d'usage du stock.
 */
export function couvertureParConcours(
  questions: { questionId: string; concoursId: string; concoursNom: string }[],
  questionsVues: Set<string>,
): CouvertureConcours[] {
  const groupes = new Map<
    string,
    { nom: string; publiees: number; vues: number }
  >();

  for (const q of questions) {
    const e = groupes.get(q.concoursId) ?? {
      nom: q.concoursNom,
      publiees: 0,
      vues: 0,
    };
    e.publiees += 1;
    if (questionsVues.has(q.questionId)) e.vues += 1;
    groupes.set(q.concoursId, e);
  }

  return [...groupes.entries()]
    .map(([concoursId, e]) => ({
      concoursId,
      concoursNom: e.nom,
      publiees: e.publiees,
      vues: e.vues,
      taux: e.publiees > 0 ? e.vues / e.publiees : 0,
    }))
    .sort((a, b) => a.concoursNom.localeCompare(b.concoursNom, "fr"));
}

// ---------------------------------------------------------------------------
// Score moyen par concours et par épreuve (§6.3)
// ---------------------------------------------------------------------------
export type ScoreMoyen = {
  cle: string;
  concoursNom: string;
  epreuveNom: string | null;
  nbSessions: number;
  scoreMoyen: number;
};

export function scoresMoyens(sessions: SessionKpi[]): {
  parConcours: ScoreMoyen[];
  parEpreuve: ScoreMoyen[];
} {
  const agreger = (
    cle: (s: SessionKpi) => string,
    detail: (s: SessionKpi) => { concoursNom: string; epreuveNom: string | null },
  ): ScoreMoyen[] => {
    const groupes = new Map<string, SessionKpi[]>();
    for (const s of sessions) {
      const k = cle(s);
      if (!groupes.has(k)) groupes.set(k, []);
      groupes.get(k)!.push(s);
    }

    return [...groupes.entries()]
      .map(([k, groupe]) => ({
        cle: k,
        ...detail(groupe[0]),
        nbSessions: groupe.length,
        scoreMoyen: moyenne(groupe.map((s) => s.scoreNormalise)),
      }))
      .sort(
        (a, b) =>
          a.concoursNom.localeCompare(b.concoursNom, "fr") ||
          (a.epreuveNom ?? "").localeCompare(b.epreuveNom ?? "", "fr"),
      );
  };

  return {
    parConcours: agreger(
      (s) => s.concoursId,
      (s) => ({ concoursNom: s.concoursNom, epreuveNom: null }),
    ),
    parEpreuve: agreger(
      (s) => `${s.concoursId}:${s.epreuveId}`,
      (s) => ({ concoursNom: s.concoursNom, epreuveNom: s.epreuveNom }),
    ),
  };
}

// ---------------------------------------------------------------------------
// Compteurs transverses (§6.3)
// ---------------------------------------------------------------------------
export type CompteursTransverses = {
  sessions7j: number;
  sessions30j: number;
  inscrits: number;
  ayantJoue: number;
  tauxPremiereSession: number;
  consentants: number;
  tauxConsentement: number;
  actifs30j: number;
};

export function compteursTransverses(
  sessions: SessionKpi[],
  eleves: { id: string; consentMarketing: boolean }[],
  maintenant = new Date(),
): CompteursTransverses {
  const depuis = (jours: number) => {
    const d = new Date(maintenant);
    d.setDate(d.getDate() - jours);
    return d;
  };

  const sessions7j = sessions.filter(
    (s) => new Date(s.termineeLe) >= depuis(7),
  ).length;
  const sessions30j = sessions.filter(
    (s) => new Date(s.termineeLe) >= depuis(30),
  ).length;

  const joueurs = new Set(sessions.map((s) => s.userId));
  const actifs = new Set(
    sessions.filter((s) => new Date(s.termineeLe) >= depuis(30)).map((s) => s.userId),
  );
  const consentants = eleves.filter((e) => e.consentMarketing).length;

  return {
    sessions7j,
    sessions30j,
    inscrits: eleves.length,
    // §6.3 : taux inscription → première session. Compté sur les élèves
    // enregistrés, pas sur l'ensemble des joueurs : un compte supprimé peut
    // laisser des sessions orphelines dans une extraction plus large.
    ayantJoue: eleves.filter((e) => joueurs.has(e.id)).length,
    tauxPremiereSession:
      eleves.length > 0
        ? eleves.filter((e) => joueurs.has(e.id)).length / eleves.length
        : 0,
    consentants,
    tauxConsentement: eleves.length > 0 ? consentants / eleves.length : 0,
    actifs30j: eleves.filter((e) => actifs.has(e.id)).length,
  };
}

function moyenne(valeurs: number[]) {
  return valeurs.length === 0
    ? 0
    : valeurs.reduce((s, v) => s + v, 0) / valeurs.length;
}

// ---------------------------------------------------------------------------
// CSV (§6.3 : « export CSV de chaque tableau »)
// ---------------------------------------------------------------------------
/**
 * Sérialise en CSV pour Excel francophone : séparateur point-virgule, décimales
 * à la virgule, BOM UTF-8 en tête. Sans le BOM, Excel lit les accents en
 * Latin-1 et affiche « ÉlÃ¨ve ».
 */
export function versCsv(
  entetes: string[],
  lignes: (string | number | null)[][],
): string {
  const echapper = (v: string | number | null) => {
    if (v === null || v === undefined) return "";
    const texte =
      typeof v === "number" ? String(v).replace(".", ",") : String(v);
    return /[";\n\r]/.test(texte) ? `"${texte.replace(/"/g, '""')}"` : texte;
  };

  const corps = [entetes, ...lignes]
    .map((ligne) => ligne.map(echapper).join(";"))
    .join("\r\n");

  return `﻿${corps}`;
}
