"use client";

import Link from "next/link";
import { EVENEMENT_OUVRIR } from "./bandeau-cookies";

/** Pied de page légal, commun à la landing et aux pages légales (§8.5). */
export function PiedDePage() {
  return (
    <footer className="mt-auto flex flex-wrap justify-between gap-4 border-t border-ligne py-7 text-sm">
      <span>© Admissible — un service Parkours</span>
      <nav aria-label="Liens légaux" className="flex flex-wrap gap-4">
        <Link href="/mentions-legales" className="hover:underline">
          Mentions légales
        </Link>
        <Link href="/cgu" className="hover:underline">
          CGU
        </Link>
        <Link href="/confidentialite" className="hover:underline">
          Confidentialité
        </Link>
        <button
          type="button"
          onClick={() => window.dispatchEvent(new Event(EVENEMENT_OUVRIR))}
          className="cursor-pointer hover:underline"
        >
          Gérer les cookies
        </button>
      </nav>
    </footer>
  );
}
