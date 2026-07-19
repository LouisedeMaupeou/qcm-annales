"use client";

import { useActionState } from "react";
import { definirMotDePasse, type EtatNouveauMotDePasse } from "./actions";

export function FormulaireNouveauMotDePasse() {
  const [etat, action, enCours] = useActionState<
    EtatNouveauMotDePasse,
    FormData
  >(definirMotDePasse, {});

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
        <label
          htmlFor="motDePasse"
          className="mb-1.5 block font-bold text-encre"
        >
          Nouveau mot de passe
        </label>
        <input
          id="motDePasse"
          name="motDePasse"
          type="password"
          autoComplete="new-password"
          className="w-full rounded-[14px] border border-ligne bg-white px-4 py-3"
        />
        <p className="mt-1 text-[0.82rem] opacity-75">8 caractères minimum.</p>
      </div>

      <div>
        <label
          htmlFor="confirmation"
          className="mb-1.5 block font-bold text-encre"
        >
          Confirme le mot de passe
        </label>
        <input
          id="confirmation"
          name="confirmation"
          type="password"
          autoComplete="new-password"
          className="w-full rounded-[14px] border border-ligne bg-white px-4 py-3"
        />
      </div>

      <button
        type="submit"
        disabled={enCours}
        className="w-full cursor-pointer rounded-full bg-primaire px-9 py-4 text-lg font-extrabold text-white shadow-[0_6px_18px_rgba(37,99,235,.28)] transition hover:bg-primaire-fonce disabled:cursor-wait disabled:opacity-60"
      >
        {enCours ? "Enregistrement…" : "Enregistrer"}
      </button>
    </form>
  );
}
