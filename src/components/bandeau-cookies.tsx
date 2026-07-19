"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";

const CLE = "admissible.consentement-cookies";

export type ConsentementCookies = "accepte" | "refuse";

/** Valeur pendant le rendu serveur : on ne sait pas encore, on n'affiche rien. */
type Etat = ConsentementCookies | null | "indetermine";

/** Événement émis par le lien « Gérer les cookies » du pied de page. */
export const EVENEMENT_OUVRIR = "admissible:ouvrir-cookies";

const ecouteurs = new Set<() => void>();

function souscrire(rappel: () => void) {
  ecouteurs.add(rappel);
  // `storage` couvre le cas de deux onglets ouverts sur le site.
  window.addEventListener("storage", rappel);
  return () => {
    ecouteurs.delete(rappel);
    window.removeEventListener("storage", rappel);
  };
}

function enregistrer(valeur: ConsentementCookies) {
  window.localStorage.setItem(CLE, valeur);
  ecouteurs.forEach((rappel) => rappel());
}

/**
 * Lit le consentement analytics. Tant que rien n'est stocké, la réponse est
 * `null` : aucun script non essentiel ne doit être chargé dans cet état (§8.6,
 * consentement *préalable*).
 */
export function lireConsentement(): ConsentementCookies | null {
  if (typeof window === "undefined") return null;
  const v = window.localStorage.getItem(CLE);
  return v === "accepte" || v === "refuse" ? v : null;
}

const snapshotServeur = (): Etat => "indetermine";

/**
 * Bandeau de consentement (§8.6).
 *
 * Le choix est conservé dans localStorage et non dans un cookie : stocker le
 * consentement est une finalité strictement nécessaire, et localStorage évite
 * de poser un cookie pour dire qu'on n'en veut pas.
 *
 * ⚠️ Aucun outil d'analytics n'est branché à ce jour. Quand il le sera, il
 * devra être monté *conditionnellement* à `lireConsentement() === "accepte"`,
 * et démonté si l'utilisateur revient sur son choix.
 */
export function BandeauCookies() {
  // useSyncExternalStore plutôt qu'un useState + useEffect : le rendu serveur
  // renvoie "indetermine" (bandeau masqué), et React bascule sur la valeur
  // réelle après hydratation, sans cascade de rendus ni clignotement chez
  // ceux qui ont déjà choisi.
  const consentement = useSyncExternalStore<Etat>(
    souscrire,
    lireConsentement,
    snapshotServeur,
  );

  // Rouvrir le bandeau depuis le pied de page, même après un choix.
  const [rouvert, setRouvert] = useState(false);
  useEffect(() => {
    const ouvrir = () => setRouvert(true);
    window.addEventListener(EVENEMENT_OUVRIR, ouvrir);
    return () => window.removeEventListener(EVENEMENT_OUVRIR, ouvrir);
  }, []);

  const choisir = useCallback((valeur: ConsentementCookies) => {
    enregistrer(valeur);
    setRouvert(false);
  }, []);

  if (!rouvert && consentement !== null) return null;

  return (
    <div
      role="dialog"
      aria-label="Consentement aux cookies"
      className="rounded-carte fixed inset-x-4 bottom-4 z-50 flex flex-col items-start justify-between gap-4 bg-encre px-5 py-4 text-white shadow-[0_12px_30px_rgba(0,0,0,.25)] sm:flex-row sm:items-center"
    >
      <p className="max-w-[60ch] text-sm">
        On aimerait mesurer l&apos;audience du site avec des cookies. Rien
        d&apos;essentiel n&apos;en dépend : tu peux refuser et tout fonctionne
        pareil.{" "}
        <a href="/confidentialite" className="underline">
          En savoir plus
        </a>
      </p>
      {/* §8.6 : « accepter / refuser d'égale visibilité ». Les deux boutons
          partagent donc exactement le même style — le prototype mettait
          « Accepter » en plein et « Refuser » en contour, ce qui crée le
          déséquilibre que la CNIL sanctionne. */}
      <div className="flex w-full shrink-0 gap-3 sm:w-auto">
        <button
          type="button"
          onClick={() => choisir("refuse")}
          className="flex-1 cursor-pointer rounded-full border-2 border-white bg-transparent px-5 py-2.5 text-sm font-extrabold text-white transition hover:bg-white/10 sm:flex-none"
        >
          Refuser
        </button>
        <button
          type="button"
          onClick={() => choisir("accepte")}
          className="flex-1 cursor-pointer rounded-full border-2 border-white bg-transparent px-5 py-2.5 text-sm font-extrabold text-white transition hover:bg-white/10 sm:flex-none"
        >
          Accepter
        </button>
      </div>
    </div>
  );
}
