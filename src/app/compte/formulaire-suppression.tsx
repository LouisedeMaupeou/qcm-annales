"use client";

import { useActionState, useState } from "react";
import { supprimerMonCompte, type EtatSuppression } from "./actions";

export function FormulaireSuppression() {
  const [etat, action, enCours] = useActionState<EtatSuppression, FormData>(
    supprimerMonCompte,
    {},
  );
  const [ouvert, setOuvert] = useState(false);

  if (!ouvert) {
    return (
      <button
        type="button"
        onClick={() => setOuvert(true)}
        className="cursor-pointer rounded-full border-2 border-negatif px-7 py-3 font-extrabold text-negatif transition hover:bg-negatif hover:text-white"
      >
        Supprimer mon compte
      </button>
    );
  }

  return (
    <form action={action} className="space-y-4">
      {etat.message && (
        <p role="alert" className="text-sm font-bold text-negatif">
          {etat.message}
        </p>
      )}
      <div>
        <label
          htmlFor="confirmation"
          className="mb-1.5 block font-bold text-encre"
        >
          Écris <span className="font-black">SUPPRIMER</span> pour confirmer
        </label>
        <input
          id="confirmation"
          name="confirmation"
          autoComplete="off"
          className="w-full rounded-[14px] border border-ligne bg-white px-4 py-3"
        />
      </div>
      <div className="flex flex-wrap gap-3">
        <button
          type="submit"
          disabled={enCours}
          className="cursor-pointer rounded-full bg-negatif px-7 py-3 font-extrabold text-white transition hover:opacity-90 disabled:cursor-wait disabled:opacity-60"
        >
          {enCours ? "Suppression…" : "Supprimer définitivement"}
        </button>
        <button
          type="button"
          onClick={() => setOuvert(false)}
          className="cursor-pointer rounded-full border-2 border-ligne px-7 py-3 font-bold text-encre transition hover:bg-white"
        >
          Annuler
        </button>
      </div>
    </form>
  );
}
