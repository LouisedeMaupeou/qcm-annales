"use client";

import Link from "next/link";
import { useActionState } from "react";
import { seConnecter, type EtatConnexion } from "./actions";

export function FormulaireConnexion({ suite }: { suite?: string }) {
  const [etat, action, enCours] = useActionState<EtatConnexion, FormData>(
    seConnecter,
    {},
  );

  return (
    <form action={action} className="space-y-5" noValidate>
      {suite && <input type="hidden" name="suite" value={suite} />}

      {etat.message && (
        <p
          role="alert"
          className="rounded-carte bg-negatif/10 p-4 text-sm text-negatif"
        >
          {etat.message}
        </p>
      )}

      <div>
        <label htmlFor="email" className="mb-1.5 block font-bold text-encre">
          Adresse email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          className="w-full rounded-[14px] border border-ligne bg-white px-4 py-3"
        />
      </div>

      <div>
        <label
          htmlFor="motDePasse"
          className="mb-1.5 block font-bold text-encre"
        >
          Mot de passe
        </label>
        <input
          id="motDePasse"
          name="motDePasse"
          type="password"
          autoComplete="current-password"
          className="w-full rounded-[14px] border border-ligne bg-white px-4 py-3"
        />
        <p className="mt-2 text-sm">
          <Link href="/mot-de-passe-oublie" className="underline">
            Mot de passe oublié ?
          </Link>
        </p>
      </div>

      <button
        type="submit"
        disabled={enCours}
        className="w-full cursor-pointer rounded-full bg-primaire px-9 py-4 text-lg font-extrabold text-white shadow-[0_6px_18px_rgba(37,99,235,.28)] transition hover:bg-primaire-fonce disabled:cursor-wait disabled:opacity-60"
      >
        {enCours ? "Connexion…" : "Se connecter"}
      </button>

      <p className="text-center text-sm">
        Pas encore de compte ?{" "}
        <Link href="/inscription" className="font-bold underline">
          Je me lance !
        </Link>
      </p>
    </form>
  );
}
