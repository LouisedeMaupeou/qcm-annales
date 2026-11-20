/**
 * Conversion entre l'heure de Paris et un instant, sans dépendre du fuseau de
 * la machine (module concours blancs, §4.1).
 *
 * Un champ `datetime-local` rend une heure sans fuseau — « 2026-11-20T16:53 ».
 * `new Date()` l'interprète dans le fuseau de l'environnement : celui du
 * navigateur à l'affichage, celui du serveur à l'enregistrement. Sur un
 * hébergement qui tourne en UTC, une fenêtre saisie à 16 h 53 depuis la France
 * était donc enregistrée pour 17 h 53, et comme le formulaire la réaffichait
 * reconvertie, chaque enregistrement la repoussait d'une heure de plus.
 *
 * Les concours blancs de la prépa se déroulent à l'heure française : on la
 * nomme explicitement plutôt que de s'en remettre à la machine. La conversion
 * se fait en deux passes parce que le décalage dépend de l'instant lui-même —
 * une heure saisie le dernier dimanche d'octobre n'a pas le même décalage
 * avant et après la bascule.
 *
 * Module pur : aucun accès base, testable isolément.
 */

export const FUSEAU = "Europe/Paris";

/** Décalage de Paris par rapport à UTC, en millisecondes, à cet instant. */
function decalage(instant: number): number {
  const date = new Date(instant);
  const aParis = new Date(date.toLocaleString("en-US", { timeZone: FUSEAU }));
  const aUtc = new Date(date.toLocaleString("en-US", { timeZone: "UTC" }));
  return aParis.getTime() - aUtc.getTime();
}

/**
 * « 2026-11-20T16:53 » saisi en France → instant ISO en UTC.
 *
 * Rend null si la saisie est vide ou illisible, pour que l'appelant distingue
 * « pas de fenêtre » d'une date fautive silencieusement ramenée à aujourd'hui.
 */
export function instantDepuisHeureParis(saisie: string): string | null {
  const texte = saisie.trim();
  if (!texte) return null;

  const m = texte.match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (!m) {
    // Déjà un instant complet (avec fuseau) : on le respecte tel quel.
    const direct = new Date(texte);
    return Number.isNaN(direct.getTime()) ? null : direct.toISOString();
  }

  const [, a, mois, j, h, min, s] = m;
  const naif = Date.UTC(
    Number(a),
    Number(mois) - 1,
    Number(j),
    Number(h),
    Number(min),
    Number(s ?? 0),
  );

  // Première passe avec le décalage de l'instant naïf, seconde avec celui de
  // l'instant trouvé : c'est ce qui rend juste une heure saisie près d'une
  // bascule d'heure d'été.
  const premier = naif - decalage(naif);
  const instant = naif - decalage(premier);

  return new Date(instant).toISOString();
}

/** Instant ISO → « 2026-11-20T16:53 », tel que le champ l'attend, heure de Paris. */
export function heureParisPourChamp(iso: string | null): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";

  // `sv-SE` rend « 2026-11-20 16:53 » : le format ISO à l'espace près.
  const texte = new Intl.DateTimeFormat("sv-SE", {
    timeZone: FUSEAU,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);

  return texte.replace(" ", "T");
}
