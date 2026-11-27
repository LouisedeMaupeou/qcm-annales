import assert from "node:assert/strict";
import test from "node:test";
import {
  grouperChapitresParEpreuve,
  classerChapitre,
  classerChapitres,
  enQuelquesMots,
  moyenne,
  niveauEpreuve,
  prioriser,
  rang,
  type StatsChapitre,
} from "./bilan-cb.ts";

// ---------------------------------------------------------------------------
// Seuils (§5.4 : ≥ 75 % / 40-74 % / < 40 %)
// ---------------------------------------------------------------------------

test("classement d'un chapitre : les bornes tombent du bon côté", () => {
  assert.equal(classerChapitre(75), "maitrise");
  assert.equal(classerChapitre(74), "a_consolider");
  assert.equal(classerChapitre(40), "a_consolider");
  assert.equal(classerChapitre(39), "insuffisant");
  assert.equal(classerChapitre(0), "insuffisant");
  assert.equal(classerChapitre(100), "maitrise");
});

test("les seuils sont configurables", () => {
  const stricts = { maitrise: 90, consolider: 60, erreursPriorite: 4 };
  assert.equal(classerChapitre(80, stricts), "a_consolider");
  assert.equal(classerChapitre(80), "maitrise");
});

test("niveau de maîtrise d'une épreuve : les libellés du modèle V10", () => {
  assert.equal(niveauEpreuve(16), "Bonne maîtrise de l'épreuve");
  assert.equal(niveauEpreuve(15), "Bonne maîtrise de l'épreuve"); // 75 %
  assert.equal(niveauEpreuve(10), "En cours d'acquisition, entraînement nécessaire");
  assert.equal(niveauEpreuve(4), "Acquisition à construire, reprise des bases nécessaire");
});

// ---------------------------------------------------------------------------
// Rang et moyenne
// ---------------------------------------------------------------------------

test("rang : le meilleur est premier", () => {
  assert.equal(rang(18, [18, 12, 9, 5]), 1);
  assert.equal(rang(5, [18, 12, 9, 5]), 4);
});

test("rang : deux ex æquo partagent la place et décalent le suivant", () => {
  const notes = [15, 15, 12];
  assert.equal(rang(15, notes), 1);
  assert.equal(rang(12, notes), 3); // et non 2
});

test("moyenne : nulle sur un groupe vide, arrondie au centième sinon", () => {
  assert.equal(moyenne([]), null);
  assert.equal(moyenne([10, 11]), 10.5);
  assert.equal(moyenne([10, 10, 11]), 10.33);
});

// ---------------------------------------------------------------------------
// Chapitres
// ---------------------------------------------------------------------------

const chapitre = (attrs: Partial<StatsChapitre>): StatsChapitre => ({
  chapitre: attrs.chapitre ?? "Suites",
  matiere: attrs.matiere ?? "Mathématiques",
  // L'épreuve suit la matière : un chapitre d'anglais ne doit pas hériter
  // d'un libellé de mathématiques, qui le ferait passer pour prioritaire.
  epreuve: attrs.epreuve ?? `NOËL 26 SÉSAME ${attrs.matiere ?? "Mathématiques"}`,
  posees: attrs.posees ?? 10,
  justes: attrs.justes ?? 5,
  fausses: attrs.fausses ?? 5,
  abstentions: attrs.abstentions ?? 0,
  travailARealiser: attrs.travailARealiser ?? null,
  notions: attrs.notions ?? null,
});

test("une abstention reste au dénominateur : ne rien traiter n'est pas maîtriser", () => {
  const [c] = classerChapitres([
    chapitre({ posees: 10, justes: 2, fausses: 0, abstentions: 8 }),
  ]);
  assert.equal(c.tauxReussite, 20);
  assert.equal(c.niveau, "insuffisant");
});

test("les chapitres sont rendus du plus faible au plus solide", () => {
  const classes = classerChapitres([
    chapitre({ chapitre: "Solide", posees: 10, justes: 9, fausses: 1 }),
    chapitre({ chapitre: "Fragile", posees: 10, justes: 2, fausses: 8 }),
  ]);
  assert.deepEqual(
    classes.map((c) => c.chapitre),
    ["Fragile", "Solide"],
  );
});

test("un chapitre sans question posée ne plante pas et reste insuffisant", () => {
  const [c] = classerChapitres([chapitre({ posees: 0, justes: 0, fausses: 0 })]);
  assert.equal(c.tauxReussite, 0);
});

// ---------------------------------------------------------------------------
// Priorités (§5.4 : « 4 erreurs ou plus, si confirmé », top 3)
// ---------------------------------------------------------------------------

test("priorités : seuls les chapitres de maths et de français entrent", () => {
  const classes = classerChapitres([
    chapitre({ chapitre: "Anglais raté", matiere: "ANG", posees: 10, justes: 0, fausses: 10 }),
    chapitre({ chapitre: "Suites", matiere: "MAT", posees: 10, justes: 5, fausses: 5 }),
  ]);
  // L'anglais peut être plus mauvais : ce n'est pas lui qui fera admettre.
  assert.deepEqual(
    prioriser(classes).map((p) => p.chapitre),
    ["Suites"],
  );
});

test("priorités : le tiers le moins réussi de chaque matière, pas un nombre fixe", () => {
  const maths = ["A", "B", "C", "D", "E", "F"].map((nom, i) =>
    chapitre({
      chapitre: nom,
      matiere: "MAT",
      posees: 10,
      justes: i + 2,
      fausses: 8 - i,
    }),
  );
  const retenus = prioriser(classerChapitres(maths)).map((p) => p.chapitre);
  // Six chapitres : le tiers en fait deux, les deux moins bien réussis.
  assert.deepEqual(retenus, ["A", "B"]);
});

test("priorités : chaque matière est jugée chez elle", () => {
  const classes = classerChapitres([
    chapitre({ chapitre: "Maths faible", matiere: "MAT", posees: 10, justes: 3, fausses: 7 }),
    chapitre({ chapitre: "Maths fort", matiere: "MAT", posees: 10, justes: 9, fausses: 1 }),
    chapitre({ chapitre: "Français faible", matiere: "FR", posees: 10, justes: 4, fausses: 6 }),
    chapitre({ chapitre: "Français fort", matiere: "FR", posees: 10, justes: 10, fausses: 0 }),
  ]);
  // Un chapitre faible en français sort, même s'il réussit mieux qu'un
  // chapitre de maths : on ne compare pas les matières entre elles.
  assert.deepEqual(
    prioriser(classes).map((p) => p.chapitre),
    ["Maths faible", "Français faible"],
  );
});

test("priorités : une abstention compte, même sans erreur", () => {
  // L'élève n'a rien traité : zéro erreur, mais tout à reprendre.
  const classes = classerChapitres([
    chapitre({ chapitre: "Géométrie", matiere: "MAT", posees: 4, justes: 0, fausses: 0, abstentions: 4 }),
  ]);
  assert.deepEqual(
    prioriser(classes).map((p) => p.chapitre),
    ["Géométrie"],
  );
});

test("priorités : un chapitre entièrement réussi n'est jamais à retravailler", () => {
  // Élève excellent partout : le tiers de queue existe quand même, mais on ne
  // demande pas de reprendre ce qui est juste.
  const classes = classerChapitres([
    chapitre({ chapitre: "Parfait", matiere: "MAT", posees: 10, justes: 10, fausses: 0 }),
    chapitre({ chapitre: "Presque", matiere: "MAT", posees: 10, justes: 10, fausses: 0 }),
  ]);
  assert.deepEqual(prioriser(classes), []);
});

test("priorités : l'action vient du référentiel quand il en fournit une", () => {
  const classes = classerChapitres([
    chapitre({
      chapitre: "Suites",
      posees: 10,
      justes: 2,
      fausses: 8,
      travailARealiser: "Refaire 5 exercices de récurrence.",
    }),
  ]);
  assert.equal(prioriser(classes)[0].action, "Refaire 5 exercices de récurrence.");
});

test("priorités : sans action au référentiel, une consigne par défaut est posée", () => {
  const classes = classerChapitres([
    chapitre({ chapitre: "Suites", posees: 10, justes: 2, fausses: 8 }),
  ]);
  assert.match(prioriser(classes)[0].action, /Reprendre « Suites »/);
});

// ---------------------------------------------------------------------------
// « En quelques mots »
// ---------------------------------------------------------------------------

const point = (libelle: string, justes: number, fausses: number) => ({
  libelle,
  domaine: libelle,
  posees: justes + fausses,
  justes,
  fausses,
  abstentions: 0,
});

test("en quelques mots : résultat, acquis, priorités maths et français d'abord", () => {
  const texte = enQuelquesMots("Camille", [
    {
      concours: "SÉSAME", matiere: "Anglais", noteSur20: 8, moyenneGroupe: 10, rang: 9, participants: 12,
      nbQuestions: 40, nbAbstentions: 2,
      forces: [point("Communication", 5, 0)],
      ameliorations: [point("Grammaire", 2, 13)],
    },
    {
      concours: "SÉSAME", matiere: "Mathématiques", noteSur20: 14, moyenneGroupe: 11, rang: 2, participants: 12,
      nbQuestions: 20, nbAbstentions: 0,
      forces: [],
      ameliorations: [point("Aires et distances", 0, 4)],
    },
  ]);
  assert.match(texte, /Camille obtient une moyenne de 11\/20 sur 2 épreuves, dont 1 au niveau/);
  assert.match(texte, /meilleur résultat est en Mathématiques \(14\/20\)/);
  assert.match(texte, /Points solides : Communication \(Anglais\)/);
  // Les maths passent devant l'anglais, même avec moins de fautes.
  assert.match(texte, /À reprendre en priorité : Aires et distances \(Mathématiques, 4 fautes\) et Grammaire/);
  assert.doesNotMatch(texte, /sans réponse/);
});

test("en quelques mots : signale les questions laissées sans réponse", () => {
  const texte = enQuelquesMots("Lou", [
    {
      concours: "SÉSAME", matiere: "Mathématiques", noteSur20: 1, moyenneGroupe: 3, rang: 2, participants: 2,
      nbQuestions: 20, nbAbstentions: 19, forces: [], ameliorations: [],
    },
  ]);
  assert.match(texte, /Aucun point n'est faux plus de deux fois/);
  assert.match(texte, /19 questions sur 20 sont restées sans réponse/);
});

test("en quelques mots : une session sans copie se dit, elle ne s'invente pas", () => {
  assert.equal(
    enQuelquesMots("Noé", [], []),
    "Noé n'a composé aucune épreuve de cette session.",
  );
});

test("le détail par chapitre se range sous son épreuve", () => {
  const groupes = grouperChapitresParEpreuve(
    classerChapitres([
      chapitre({ chapitre: "Grammaire", epreuve: "NOËL 26 SÉSAME FRANÇAIS", justes: 8 }),
      chapitre({ chapitre: "Grammaire", epreuve: "NOËL 26 SÉSAME LV2 ALLEMAND", justes: 2 }),
      chapitre({ chapitre: "Lexique", epreuve: "NOËL 26 SÉSAME LV2 ALLEMAND", justes: 5 }),
    ]),
  );

  assert.deepEqual(
    groupes.map((g) => g.epreuve),
    ["NOËL 26 SÉSAME FRANÇAIS", "NOËL 26 SÉSAME LV2 ALLEMAND"],
  );
  // Deux chapitres du même nom ne se confondent plus.
  assert.deepEqual(groupes[0].chapitres.map((c) => c.chapitre), ["Grammaire"]);
  // Dans un groupe, le taux le plus faible reste en tête.
  assert.deepEqual(
    groupes[1].chapitres.map((c) => c.chapitre),
    ["Grammaire", "Lexique"],
  );
});

test("un chapitre sans épreuve connue n'est pas perdu", () => {
  const groupes = grouperChapitresParEpreuve(
    classerChapitres([chapitre({ chapitre: "Suites", epreuve: "" })]),
  );
  assert.equal(groupes.length, 1);
  assert.equal(groupes[0].epreuve, "Autres");
});

// ---------------------------------------------------------------------------
// Analyse V11
// ---------------------------------------------------------------------------

import {
  erreurCommise,
  forcesEtAmeliorations,
  constatsEpreuve,
  planDeTravail,
  pointsDeLEpreuve,
  type ReponseAnalysee,
} from "./bilan-cb.ts";

let numero = 0;
function rep(
  matiere: string,
  domaine: string,
  chapitre: string | null,
  statut: ReponseAnalysee["statut"],
  extra: Partial<ReponseAnalysee> = {},
): ReponseAnalysee {
  numero += 1;
  return {
    epreuve: `SÉSAME ${matiere}`,
    matiere,
    numero,
    domaine,
    chapitre,
    notion: null,
    statut,
    retourReponse: null,
    methode: null,
    travail: null,
    ...extra,
  };
}
const n = (k: number, f: () => ReponseAnalysee) => Array.from({ length: k }, f);

test("hors langues, un point est un chapitre ; faux plus de deux fois = amélioration", () => {
  const points = pointsDeLEpreuve([
    ...n(3, () => rep("MAT", "Géométrie", "Aires et distances", "incorrecte")),
    ...n(2, () => rep("MAT", "Algèbre", "Inéquations", "incorrecte")),
    ...n(3, () => rep("MAT", "Statistiques", "Dispersion", "correcte")),
  ]);
  const { ameliorations, forces } = forcesEtAmeliorations(points);
  assert.deepEqual(ameliorations.map((p) => [p.libelle, p.fausses]), [["Aires et distances", 3]]);
  assert.deepEqual(forces.map((p) => p.libelle), ["Dispersion"]);
});

test("un thème de moins de trois questions n'est ni acquis ni à reprendre", () => {
  const points = pointsDeLEpreuve([
    ...n(2, () => rep("MAT", "Arithmétique", "Parité", "correcte")),
    rep("MAT", "Algèbre", "Inéquations", "correcte"),
  ]);
  const { ameliorations, forces } = forcesEtAmeliorations(points);
  assert.deepEqual(forces, []);
  assert.deepEqual(ameliorations, []);
});

test("acquis : trois réussites au moins, et 75 % du thème", () => {
  const points = pointsDeLEpreuve([
    // 3 sur 4 : acquis.
    ...n(3, () => rep("FR", "Lexique", null, "correcte")),
    rep("FR", "Lexique", null, "incorrecte"),
    // 3 sur 5 : 60 %, pas acquis.
    ...n(3, () => rep("FR", "Orthographe", null, "correcte")),
    ...n(2, () => rep("FR", "Orthographe", null, "abstention")),
  ]);
  assert.deepEqual(forcesEtAmeliorations(points).forces.map((p) => p.libelle), ["Lexique"]);
});

test("en langues, la grammaire se compte toutes notions confondues, dès trois fautes", () => {
  const points = pointsDeLEpreuve([
    rep("FR", "Grammaire", "Accord du participe passé", "incorrecte"),
    rep("FR", "Grammaire", "Pronoms et déterminants", "incorrecte"),
    rep("FR", "Grammaire", "Construction de la phrase", "incorrecte"),
    ...n(2, () => rep("FR", "Lexique", "Sens précis", "incorrecte")),
  ]);
  const { ameliorations } = forcesEtAmeliorations(points);
  assert.deepEqual(ameliorations.map((p) => [p.libelle, p.fausses]), [["Grammaire", 3]]);
  // Le lexique garde son nombre de fautes, sous le seuil.
  assert.equal(points.find((p) => p.libelle === "Lexique")?.fausses, 2);
});

test("au plus quatre forces, les moins fautives d'abord, et jamais un point à peine tenté", () => {
  const points = pointsDeLEpreuve([
    ...["A", "B", "C", "D", "E"].flatMap((c, i) => [
      ...n(4, () => rep("DIG", "Outils", c, "correcte")),
      ...n(i % 2, () => rep("DIG", "Outils", c, "incorrecte")),
    ]),
    // Une réussite sur cinq, le reste sans réponse : pas une force.
    rep("DIG", "Outils", "F", "correcte"),
    ...n(4, () => rep("DIG", "Outils", "F", "abstention")),
  ]);
  const { forces } = forcesEtAmeliorations(points);
  assert.deepEqual(forces.map((p) => p.libelle), ["A", "C", "E", "B"]);
});

test("l'erreur commise est extraite du retour, sans préfixe ni méthode", () => {
  assert.equal(
    erreurCommise("À corriger — Oublie toutes les solutions x<−1. Méthode de vérification : Factoriser."),
    "Oublie toutes les solutions x<−1.",
  );
  assert.equal(
    erreurCommise("Réponse non retenue — « cenan » suppose un sujet pluriel. Règle à appliquer : Identifier le noyau."),
    "« cenan » suppose un sujet pluriel.",
  );
  assert.equal(erreurCommise(null), null);
});

test("le plan reprend les points d'amélioration, deux fautes variées chacun", () => {
  const plan = planDeTravail([
    // Sous le seuil : pas dans le plan.
    ...n(2, () => rep("FR", "Lexique", "Sens précis", "incorrecte", { notion: "disgrâce" })),
    ...[
      ["Accord du participe passé", "avec avoir"],
      ["Accord du participe passé", "avec avoir"],
      ["Accord du participe passé", "pronominaux"],
      ["Pronoms et déterminants", "leur / leurs"],
    ].map(([chapitre, notion]) =>
      rep("FR", "Grammaire", chapitre, "incorrecte", {
        notion,
        retourReponse: "À corriger — Mauvais accord. Méthode de vérification : chercher le COD.",
        travail: "Refaire 5 phrases",
        methode: "Repérer l'auxiliaire puis le COD",
      }),
    ),
    rep("FR", "Grammaire", "Accord du participe passé", "correcte"),
  ]);
  assert.equal(plan.length, 1);
  const [grammaire] = plan[0].points;
  assert.deepEqual([grammaire.libelle, grammaire.fautes, grammaire.autres], ["Grammaire", 4, 2]);
  // Deux chapitres différents plutôt que deux fois le même.
  assert.deepEqual(
    grammaire.detail.map((f) => f.chapitre).sort(),
    ["Accord du participe passé", "Pronoms et déterminants"],
  );
  assert.equal(grammaire.detail[0].erreur, "Mauvais accord.");
  assert.equal(grammaire.detail[0].methode, "Repérer l'auxiliaire puis le COD");
});

test("le plan garde les trois points les plus fautifs, et ne perd aucune faute", () => {
  const plan = planDeTravail(
    [5, 4, 3, 3].flatMap((k, i) =>
      n(k, () => rep("MAT", "Géométrie", `Chapitre ${i + 1}`, "incorrecte")),
    ),
  );
  const [maths] = plan;
  assert.deepEqual(maths.points.map((p) => [p.libelle, p.fautes]), [
    ["Chapitre 1", 5],
    ["Chapitre 2", 4],
    ["Chapitre 3", 3],
  ]);
  assert.deepEqual(maths.autresPoints.map((p) => p.libelle), ["Chapitre 4"]);
  // Deux exemples par point, mais toutes les fautes restent dans le bilan.
  assert.equal(maths.points[0].detail.length, 2);
  const toutes = [...maths.points, ...maths.autresPoints].flatMap((p) => p.toutes);
  assert.equal(toutes.length, 15);
});

test("chaque épreuve a son analyse, même sans point faux plus de deux fois", () => {
  const plan = planDeTravail([
    // Français : deux fautes isolées, aucun point au-dessus du seuil.
    ...n(5, () => rep("FR", "Lexique", null, "correcte")),
    rep("FR", "Lexique", null, "incorrecte", { notion: "disgrâce" }),
    rep("FR", "Orthographe", null, "incorrecte", { notion: "accents" }),
    // Mathématiques : rien de traité.
    ...n(4, () => rep("MAT", "Géométrie", "Aires", "abstention")),
  ]);
  assert.equal(plan.length, 2);
  const [francais, maths] = plan;
  assert.equal(francais.nature, "a_surveiller");
  assert.deepEqual(francais.points.map((p) => [p.libelle, p.fautes]), [
    ["Lexique", 1],
    ["Orthographe", 1],
  ]);
  assert.deepEqual([maths.points.length, maths.abstentions, maths.posees], [0, 4, 4]);
});

test("les constats d'une épreuve : non traitée, sans faute, sans réponse", () => {
  const base = { epreuve: "E", nature: "a_surveiller" as const, points: [], autresPoints: [] };
  assert.match(
    constatsEpreuve({ ...base, posees: 40, justes: 0, fausses: 0, abstentions: 40 })[0],
    /Épreuve non traitée : aucune réponse sur les 40 questions/,
  );
  assert.deepEqual(constatsEpreuve({ ...base, posees: 20, justes: 20, fausses: 0, abstentions: 0 }), [
    "Aucune faute sur cette épreuve.",
  ]);
  assert.deepEqual(constatsEpreuve({ ...base, posees: 20, justes: 1, fausses: 0, abstentions: 19 }), [
    "Aucune faute parmi tes réponses, mais 19 questions sur 20 sont restées sans réponse : refaire " +
      "l'épreuve en ligne permet de travailler le rythme et de voir le corrigé de chacune.",
  ]);
  const espagnol = constatsEpreuve({ ...base, posees: 40, justes: 9, fausses: 3, abstentions: 28 });
  assert.match(espagnol[0], /Aucun point n'est faux plus de deux fois/);
  assert.match(espagnol[1], /28 questions sur 40 sont restées sans réponse/);
});

