import assert from "node:assert/strict";
import test from "node:test";
import {
  classerChapitre,
  classerChapitres,
  enQuelquesMots,
  moyenne,
  niveauEpreuve,
  prioriser,
  rang,
  SEUILS_PAR_DEFAUT,
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

test("priorités : en dessous de 4 erreurs, un chapitre n'entre pas", () => {
  const classes = classerChapitres([
    chapitre({ chapitre: "Trois erreurs", posees: 10, justes: 7, fausses: 3 }),
  ]);
  assert.deepEqual(prioriser(classes), []);
});

test("priorités : 4 erreurs dans un chapitre par ailleurs maîtrisé n'est pas une priorité", () => {
  const classes = classerChapitres([
    chapitre({ chapitre: "Large", posees: 40, justes: 36, fausses: 4 }),
  ]);
  // 90 % de réussite : l'échec n'est pas confirmé.
  assert.deepEqual(prioriser(classes), []);
});

test("priorités : au plus trois, les plus fautifs d'abord", () => {
  const classes = classerChapitres([
    chapitre({ chapitre: "A", posees: 20, justes: 10, fausses: 10 }),
    chapitre({ chapitre: "B", posees: 20, justes: 12, fausses: 8 }),
    chapitre({ chapitre: "C", posees: 20, justes: 14, fausses: 6 }),
    chapitre({ chapitre: "D", posees: 20, justes: 15, fausses: 5 }),
  ]);
  const top = prioriser(classes);
  assert.equal(top.length, 3);
  assert.deepEqual(
    top.map((p) => p.chapitre),
    ["A", "B", "C"],
  );
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

test("priorités : le seuil d'erreurs est configurable", () => {
  // 50 % de réussite : sous le seuil de maîtrise, donc l'échec est « confirmé ».
  // Seul le nombre d'erreurs décide alors de l'entrée dans le top 3.
  const classes = classerChapitres([
    chapitre({ chapitre: "Deux", posees: 4, justes: 2, fausses: 2 }),
  ]);
  assert.equal(prioriser(classes).length, 0);
  assert.equal(
    prioriser(classes, { ...SEUILS_PAR_DEFAUT, erreursPriorite: 2 }).length,
    1,
  );
});

// ---------------------------------------------------------------------------
// « En quelques mots »
// ---------------------------------------------------------------------------

test("en quelques mots : deux phrases, chiffrées, sans jugement", () => {
  const texte = enQuelquesMots(
    "Camille",
    [
      {
        concours: "Avenir",
        matiere: "Mathématiques",
        noteSur20: 14,
        moyenneGroupe: 11,
        rang: 2,
        participants: 12,
      },
      {
        concours: "Advance",
        matiere: "Anglais",
        noteSur20: 8,
        moyenneGroupe: 10,
        rang: 9,
        participants: 12,
      },
    ],
    [
      {
        chapitre: "Suites",
        matiere: "Mathématiques",
        erreurs: 6,
        tauxReussite: 30,
        action: "Refaire des exercices.",
      },
    ],
  );
  assert.match(texte, /Camille obtient une moyenne de 11\/20/);
  assert.match(texte, /1 au niveau de la moyenne du groupe/);
  assert.match(texte, /Mathématiques \(14\/20\)/);
  assert.match(texte, /Suites/);
  assert.equal(texte.split(". ").length, 2);
});

test("en quelques mots : une session sans copie se dit, elle ne s'invente pas", () => {
  assert.equal(
    enQuelquesMots("Noé", [], []),
    "Noé n'a composé aucune épreuve de cette session.",
  );
});

test("en quelques mots : sans priorité, la seconde phrase reste utile", () => {
  const texte = enQuelquesMots(
    "Lou",
    [
      {
        concours: "SÉSAME",
        matiere: "Français",
        noteSur20: 17,
        moyenneGroupe: 14,
        rang: 1,
        participants: 8,
      },
    ],
    [],
  );
  assert.match(texte, /Aucun chapitre ne ressort comme prioritaire/);
});
