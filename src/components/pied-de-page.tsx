"use client";

import Link from "next/link";
import { EVENEMENT_OUVRIR } from "./bandeau-cookies";

// Même exigence que la navigation : une zone tactile confortable au pouce (§3).
const LIEN = "inline-flex min-h-11 items-center hover:underline";

/** Pied de page légal, commun à la landing et aux pages légales (§8.5). */
export function PiedDePage() {
  return (
    <footer className="mt-auto flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-t border-ligne py-4 text-sm">
      <span className="py-2">© Admissible — un service Parkours</span>
      <nav aria-label="Liens légaux" className="flex flex-wrap gap-x-4 gap-y-1">
        <Link href="/mentions-legales" className={LIEN}>
          Mentions légales
        </Link>
        <Link href="/cgu" className={LIEN}>
          CGU
        </Link>
        <Link href="/confidentialite" className={LIEN}>
          Confidentialité
        </Link>
        <button
          type="button"
          onClick={() => window.dispatchEvent(new Event(EVENEMENT_OUVRIR))}
          className={`${LIEN} cursor-pointer`}
        >
          Gérer les cookies
        </button>
      </nav>
    </footer>
  );
}
