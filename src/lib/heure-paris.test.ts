import { strict as assert } from "node:assert";
import { test } from "node:test";
import { heureParisPourChamp, instantDepuisHeureParis } from "./heure-paris.ts";

test("heure d'hiver : Paris est à UTC+1", () => {
  // Le cas qui a fait manquer son créneau à une épreuve : saisi 16 h 53 à
  // Paris, enregistré 17 h 53 parce que le serveur lisait en UTC.
  assert.equal(instantDepuisHeureParis("2026-11-20T16:53"), "2026-11-20T15:53:00.000Z");
});

test("heure d'été : Paris est à UTC+2", () => {
  assert.equal(instantDepuisHeureParis("2026-07-15T09:00"), "2026-07-15T07:00:00.000Z");
});

test("l'aller-retour ne décale pas la fenêtre", () => {
  // C'est la répétition de ce décalage qui repoussait l'épreuve d'une heure à
  // chaque enregistrement.
  for (const saisie of ["2026-11-20T16:53", "2026-07-15T09:00", "2027-01-05T08:30"]) {
    const instant = instantDepuisHeureParis(saisie);
    assert.ok(instant);
    assert.equal(heureParisPourChamp(instant), saisie);
  }
});

test("bascule d'heure d'hiver : 02 h 30 le dernier dimanche d'octobre", () => {
  // Le 25 octobre 2026, Paris passe de UTC+2 à UTC+1 à 3 h du matin. Une heure
  // saisie juste après la bascule doit être lue à UTC+1.
  assert.equal(instantDepuisHeureParis("2026-10-25T04:30"), "2026-10-25T03:30:00.000Z");
  // Et juste avant, à UTC+2.
  assert.equal(instantDepuisHeureParis("2026-10-25T01:30"), "2026-10-24T23:30:00.000Z");
});

test("une saisie vide ne vaut pas aujourd'hui", () => {
  assert.equal(instantDepuisHeureParis(""), null);
  assert.equal(instantDepuisHeureParis("   "), null);
  assert.equal(instantDepuisHeureParis("pas une date"), null);
});

test("un instant déjà complet est respecté", () => {
  assert.equal(
    instantDepuisHeureParis("2026-11-20T15:53:00.000Z"),
    "2026-11-20T15:53:00.000Z",
  );
});

test("sans fenêtre, le champ reste vide", () => {
  assert.equal(heureParisPourChamp(null), "");
  assert.equal(heureParisPourChamp("pas une date"), "");
});
