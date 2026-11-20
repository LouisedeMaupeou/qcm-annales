import { strict as assert } from "node:assert";
import { test } from "node:test";
import { grouperParExercice } from "./groupes-passage.ts";

const q = (id: string, ordre: number, blocId: string) => ({ id, ordre, blocId });

test("un exercice Puissance Alpha tient en un seul groupe", () => {
  // Forme réelle de PA-MAT-TOUS26 : dix exercices, quatre propositions à
  // juger vraies ou fausses, numérotées 1.01 à 1.04.
  const groupes = grouperParExercice([
    q("a", 1.01, "ex1"),
    q("b", 1.02, "ex1"),
    q("c", 1.03, "ex1"),
    q("d", 1.04, "ex1"),
    q("e", 2.01, "ex2"),
    q("f", 2.02, "ex2"),
  ]);

  assert.equal(groupes.length, 2);
  assert.deepEqual(
    groupes[0].map((x) => x.id),
    ["a", "b", "c", "d"],
  );
  assert.deepEqual(
    groupes[1].map((x) => x.id),
    ["e", "f"],
  );
});

test("des questions indépendantes restent un groupe chacune", () => {
  const groupes = grouperParExercice([
    q("a", 1, "b1"),
    q("b", 2, "b2"),
    q("c", 3, "b3"),
  ]);
  assert.equal(groupes.length, 3);
  assert.ok(groupes.every((g) => g.length === 1));
});

test("deux exercices différents ne fusionnent pas sous le même numéro", () => {
  // Deux blocs peuvent numéroter leurs sous-questions à partir de 1 : sans le
  // bloc dans la clé, les sujets se mélangeraient.
  const groupes = grouperParExercice([
    q("a", 1.01, "texte-7"),
    q("b", 1.01, "texte-8"),
  ]);
  assert.equal(groupes.length, 2);
});

test("l'ordre du sujet est conservé, y compris quand les lignes arrivent mêlées", () => {
  const groupes = grouperParExercice([
    q("a", 1.01, "ex1"),
    q("b", 2.01, "ex2"),
    q("c", 1.02, "ex1"),
  ]);

  // Le groupe de l'exercice 1 reste en tête : c'est sa première sous-question
  // qui fixe sa place, pas la dernière.
  assert.deepEqual(
    groupes.map((g) => g.map((x) => x.id)),
    [["a", "c"], ["b"]],
  );
});

test("une liste vide ne produit aucun groupe", () => {
  assert.deepEqual(grouperParExercice([]), []);
});

test("la partie entière groupe, la décimale ordonne", () => {
  // 10.01 et 10.1 appartiennent au même exercice : seule la partie entière
  // compte, et une décimale à un chiffre ne doit pas créer un groupe à part.
  const groupes = grouperParExercice([q("a", 10.01, "ex"), q("b", 10.1, "ex")]);
  assert.equal(groupes.length, 1);
  assert.equal(groupes[0].length, 2);
});
