import assert from "node:assert/strict";
import test from "node:test";
import {
  grouperChapitresParEpreuve,
  matieresATravailler,
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

test("matières à travailler : maths avant français, et rien d'autre", () => {
  const classes = classerChapitres([
    chapitre({ chapitre: "X", matiere: "FR", posees: 10, justes: 4, fausses: 6 }),
    chapitre({ chapitre: "Y", matiere: "ANG", posees: 10, justes: 1, fausses: 9 }),
    chapitre({ chapitre: "Z", matiere: "MAT", posees: 10, justes: 3, fausses: 7 }),
  ]);
  assert.deepEqual(matieresATravailler(classes), ["mathématiques", "français"]);
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
