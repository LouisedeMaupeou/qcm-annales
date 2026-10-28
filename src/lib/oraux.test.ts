import assert from "node:assert/strict";
import test from "node:test";
import {
  GRILLE_MOTIVATION,
  grilleUtilisable,
  noteGlobale,
  validerNote,
  type Critere,
} from "./oraux.ts";

const SUR_CINQ: Critere[] = [
  { libelle: "A", ponderation: 1, echelle: 5 },
  { libelle: "B", ponderation: 1, echelle: 5 },
];

test("note globale : tout au maximum donne 20", () => {
  assert.equal(noteGlobale(SUR_CINQ, { 0: 5, 1: 5 }), 20);
});

test("note globale : la moitié donne 10", () => {
  assert.equal(noteGlobale(SUR_CINQ, { 0: 2.5, 1: 2.5 }), 10);
});

test("note globale : la pondération pèse sur le résultat", () => {
  const criteres: Critere[] = [
    { libelle: "Léger", ponderation: 1, echelle: 5 },
    { libelle: "Lourd", ponderation: 3, echelle: 5 },
  ];
  // 0 sur le critère léger, 5 sur le lourd : 3/4 des points.
  assert.equal(noteGlobale(criteres, { 0: 0, 1: 5 }), 15);
  assert.equal(noteGlobale(criteres, { 0: 5, 1: 0 }), 5);
});

test("note globale : des échelles différentes se ramènent au même barème", () => {
  const criteres: Critere[] = [
    { libelle: "Sur 5", ponderation: 1, echelle: 5 },
    { libelle: "Sur 10", ponderation: 1, echelle: 10 },
  ];
  assert.equal(noteGlobale(criteres, { 0: 5, 1: 10 }), 20);
  assert.equal(noteGlobale(criteres, { 0: 4, 1: 8 }), 16);
});

test("un critère non noté est écarté, pas compté zéro", () => {
  // « Anglais, le cas échéant » : ne pas le poser ne doit pas punir l'élève.
  assert.equal(noteGlobale(SUR_CINQ, { 0: 5, 1: null }), 20);
  assert.equal(noteGlobale(SUR_CINQ, { 0: 5 }), 20);
});

test("une grille entièrement vide ne vaut pas zéro mais rien du tout", () => {
  assert.equal(noteGlobale(SUR_CINQ, {}), null);
  assert.equal(noteGlobale(SUR_CINQ, { 0: null, 1: null }), null);
});

test("les notes se repèrent aussi par libellé, pas seulement par rang", () => {
  assert.equal(noteGlobale(SUR_CINQ, { A: 5, B: 5 }), 20);
});

test("un critère de pondération ou d'échelle nulle est ignoré", () => {
  const criteres: Critere[] = [
    { libelle: "Compte", ponderation: 1, echelle: 5 },
    { libelle: "Décoratif", ponderation: 0, echelle: 5 },
  ];
  assert.equal(noteGlobale(criteres, { 0: 5, 1: 0 }), 20);
});

test("validation : une note hors échelle est refusée, pas tronquée", () => {
  const c = SUR_CINQ[0];
  assert.equal(validerNote(c, 3), null);
  assert.equal(validerNote(c, 5), null);
  assert.match(validerNote(c, 6) ?? "", /maximum est 5/);
  assert.match(validerNote(c, -1) ?? "", /négative/);
  assert.match(validerNote(c, Number.NaN) ?? "", /illisible/);
});

test("grille utilisable : il faut au moins un critère qui compte", () => {
  assert.equal(grilleUtilisable(GRILLE_MOTIVATION), true);
  assert.equal(grilleUtilisable([]), false);
  assert.equal(
    grilleUtilisable([{ libelle: "Vide", ponderation: 0, echelle: 5 }]),
    false,
  );
});

test("la grille de motivation par défaut porte les cinq critères du §5.5", () => {
  assert.equal(GRILLE_MOTIVATION.length, 5);
  assert.equal(noteGlobale(GRILLE_MOTIVATION, { 0: 4, 1: 4, 2: 4, 3: 4, 4: 4 }), 16);
});
