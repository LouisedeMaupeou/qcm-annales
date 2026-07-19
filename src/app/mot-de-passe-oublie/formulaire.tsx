"use client";

import Link from "next/link";
import { useActionState } from "react";
import { demanderReinitialisation, type EtatOubli } from "./actions";

export function FormulaireOubli() {
  const [etat, action, enCours] = useActionState<EtatOubli, FormData>(
    demanderReinitialisation,
    {},
  );

  if (etat.envoye) {
    return (
      <div className="rounded-carte border border-ligne bg-white p-6">
        <h2 className="mb-2 text-lg font-extrabold">Email envoyé</h2>
        <p className="text-[0.95rem]">
          Si un compte existe avec cette adresse, un lien de réinitialisation
          vient d&apos;y être envoyé. Il est valable une heure.
        </p>
        <p className="mt-4 text-sm">
          <Link href="/connexion" className="underline">
            Retour à la connexion
          </Link>
        </p>
      </div>
    );
  }

  return (
    <form action={action} className="space-y-5" noValidate>
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

      <button
        type="submit"
        disabled={enCours}
        className="w-full cursor-pointer rounded-full bg-primaire px-9 py-4 text-lg font-extrabold text-white shadow-[0_6px_18px_rgba(37,99,235,.28)] transition hover:bg-primaire-fonce disabled:cursor-wait disabled:opacity-60"
      >
        {enCours ? "Envoi…" : "Envoyer le lien"}
      </button>
    </form>
  );
}
