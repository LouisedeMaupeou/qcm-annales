import assert from "node:assert/strict";
import test from "node:test";
import {
  grilleComplete,
  maximumGrille,
  noteEpreuveOrale,
  noteGlobaleOraux,
  ORAUX_PAR_FILIERE,
  validerNoteCritere,
  type CritereOral,
  type NoteOrale,
} from "./oraux.ts";

const PERSONNALITE = ORAUX_PAR_FILIERE.commerce.find((e) => e.cle === "personnalite")!;
const COLLECTIF = ORAUX_PAR_FILIERE.commerce.find((e) => e.cle === "collectif")!;

// ---------------------------------------------------------------------------
// Le référentiel lui-même
// ---------------------------------------------------------------------------

test("chaque grille porte huit critères totalisant 20 points", () => {
  for (const filiere of ["commerce", "ingenieur"] as const) {
    for (const epreuve of ORAUX_PAR_FILIERE[filiere]) {
      assert.equal(epreuve.criteres.length, 8, `${epreuve.nom} : 8 critères`);
      assert.equal(
        maximumGrille(epreuve.criteres),
        20,
        `${epreuve.nom} : total de 20 points`,
      );
    }
  }
});

test("commerce passe quatre oraux, ingénieur le seul oral de personnalité", () => {
  assert.deepEqual(
    ORAUX_PAR_FILIERE.commerce.map((e) => e.cle),
    ["collectif", "personnalite", "image", "anglais"],
  );
  assert.deepEqual(
    ORAUX_PAR_FILIERE.ingenieur.map((e) => e.cle),
    ["personnalite"],
  );
});

test("les pondérations sont celles de l'onglet Paramètres, et font 100 %", () => {
  const commerce = ORAUX_PAR_FILIERE.commerce;
  assert.equal(commerce.find((e) => e.cle === "collectif")!.ponderation, 0);
  assert.equal(commerce.find((e) => e.cle === "personnalite")!.ponderation, 0.4);
  assert.equal(commerce.find((e) => e.cle === "image")!.ponderation, 0.3);
  assert.equal(commerce.find((e) => e.cle === "anglais")!.ponderation, 0.3);
  assert.equal(
    commerce.reduce((s, e) => s + e.ponderation, 0),
    1,
  );
  assert.equal(ORAUX_PAR_FILIERE.ingenieur[0].ponderation, 1);
});

// ---------------------------------------------------------------------------
// Note d'une épreuve
// ---------------------------------------------------------------------------

test("note d'une épreuve : la somme des points, pas une moyenne", () => {
  // Maxima 3,3,3,3,3,2,2,1 : tout au maximum fait 20.
  const parfait = Object.fromEntries(
    PERSONNALITE.criteres.map((c, i) => [String(i), c.maximum]),
  );
  assert.equal(noteEpreuveOrale(PERSONNALITE.criteres, parfait), 20);
});

test("note d'une épreuve : le cas réel de la grille fournie", () => {
  // Emma FOURNEL, onglet Personnalité : 1,5 2 2,5 2,5 2,5 2 2 1 → 16/20.
  const notes = { 0: 1.5, 1: 2, 2: 2.5, 3: 2.5, 4: 2.5, 5: 2, 6: 2, 7: 1 };
  assert.equal(noteEpreuveOrale(PERSONNALITE.criteres, notes), 16);
});

test("note d'une épreuve : un critère non noté compte zéro", () => {
  const notes = { 0: 3, 1: 3, 2: 3, 3: 3, 4: 3, 5: 2, 6: 2 };
  assert.equal(noteEpreuveOrale(PERSONNALITE.criteres, notes), 19);
  assert.equal(grilleComplete(PERSONNALITE.criteres, notes), false);
});

test("note d'une épreuve : une note au-dessus du maximum est plafonnée", () => {
  const notes = { 7: 5 }; // le critère 7 vaut 1 point au plus
  assert.equal(noteEpreuveOrale(PERSONNALITE.criteres, notes), 1);
});

test("grille complète : tous les critères notés, zéro compris", () => {
  const zeros = Object.fromEntries(PERSONNALITE.criteres.map((_, i) => [String(i), 0]));
  assert.equal(grilleComplete(PERSONNALITE.criteres, zeros), true);
  assert.equal(noteEpreuveOrale(PERSONNALITE.criteres, zeros), 0);
});

// ---------------------------------------------------------------------------
// Validation de saisie
// ---------------------------------------------------------------------------

test("validation : le pas de 0,5 de la grille est imposé", () => {
  const c: CritereOral = { libelle: "x", maximum: 3, indicateur: "" };
  assert.equal(validerNoteCritere(c, 2.5), null);
  assert.equal(validerNoteCritere(c, 3), null);
  assert.equal(validerNoteCritere(c, 0), null);
  assert.match(validerNoteCritere(c, 1.3) ?? "", /pas de 0,5/);
  assert.match(validerNoteCritere(c, 3.5) ?? "", /maximum est 3/);
  assert.match(validerNoteCritere(c, -1) ?? "", /négative/);
});

// ---------------------------------------------------------------------------
// Note globale pondérée
// ---------------------------------------------------------------------------

const commerce = (notes: Partial<Record<string, number | null>>): NoteOrale[] =>
  ORAUX_PAR_FILIERE.commerce.map((e) => ({
    cle: e.cle,
    nom: e.nom,
    ponderation: e.ponderation,
    note: notes[e.cle] ?? null,
    maximum: 20,
  }));

test("note globale : le cas réel de la synthèse fournie", () => {
  // Emma FOURNEL : collectif 15,5 (poids 0), personnalité 16, image 15,
  // anglais 15 → 0,4×16 + 0,3×15 + 0,3×15 = 15,4.
  const { note, complet } = noteGlobaleOraux(
    commerce({ collectif: 15.5, personnalite: 16, image: 15, anglais: 15 }),
  );
  assert.equal(note, 15.4);
  assert.equal(complet, true);
});

test("note globale : Carla DUCLOY, second cas de la synthèse", () => {
  // 13,5 / 15 / 14 / 14 → 0,4×15 + 0,3×14 + 0,3×14 = 14,4.
  assert.equal(
    noteGlobaleOraux(commerce({ collectif: 13.5, personnalite: 15, image: 14, anglais: 14 }))
      .note,
    14.4,
  );
});

test("note globale : l'oral collectif ne pèse pas, même brillant", () => {
  const sans = noteGlobaleOraux(commerce({ personnalite: 10, image: 10, anglais: 10 }));
  const avec = noteGlobaleOraux(
    commerce({ collectif: 20, personnalite: 10, image: 10, anglais: 10 }),
  );
  assert.equal(sans.note, 10);
  assert.equal(avec.note, 10);
});

test("note globale : une épreuve pesante non notée écarte le « complet »", () => {
  const { note, complet } = noteGlobaleOraux(
    commerce({ personnalite: 16, image: 14 }),
  );
  // Moyenne des seules épreuves notées : (0,4×16 + 0,3×14) / 0,7 = 15,14.
  assert.equal(note, 15.14);
  assert.equal(complet, false);
});

test("note globale : rien de noté, rien à afficher — et surtout pas zéro", () => {
  assert.deepEqual(noteGlobaleOraux(commerce({})), { note: null, complet: false });
  assert.deepEqual(noteGlobaleOraux(commerce({ collectif: 18 })), {
    note: null,
    complet: false,
  });
});

test("ingénieur : la note de personnalité est la note globale", () => {
  const notes: NoteOrale[] = ORAUX_PAR_FILIERE.ingenieur.map((e) => ({
    cle: e.cle,
    nom: e.nom,
    ponderation: e.ponderation,
    note: 13.5,
    maximum: 20,
  }));
  assert.deepEqual(noteGlobaleOraux(notes), { note: 13.5, complet: true });
});

test("le collectif garde ses huit critères propres, distincts de personnalité", () => {
  assert.notDeepEqual(
    COLLECTIF.criteres.map((c) => c.libelle),
    PERSONNALITE.criteres.map((c) => c.libelle),
  );
  assert.equal(COLLECTIF.criteres[0].libelle, "Prise de parole");
});
