"use client";

import { useActionState } from "react";
import { creerCohorte, type EtatCohorte } from "./actions";

export function FormulaireCohorte() {
  const [etat, action, enCours] = useActionState<EtatCohorte, FormData>(
    creerCohorte,
    {},
  );

  return (
    <form action={action} className="space-y-4 rounded-carte border border-ligne p-5">
      <h2 className="font-extrabold text-encre">Nouvelle cohorte</h2>

      {etat.message && (
        <p role="alert" className="rounded-[14px] bg-negatif/10 p-3 text-sm text-negatif">
          {etat.message}
        </p>
      )}
      {etat.succes && (
        <p className="rounded-[14px] bg-primaire/10 p-3 text-sm text-primaire-fonce">
          {etat.succes}
        </p>
      )}

      <div>
        <label htmlFor="nom" className="mb-1.5 block text-sm font-bold text-encre">
          Nom
        </label>
        <input
          id="nom"
          name="nom"
          required
          placeholder="Prépa Ingénieurs 2026-2027"
          className="w-full rounded-[14px] border border-ligne bg-white px-4 py-2.5"
        />
      </div>

      <div>
        <label htmlFor="filiere" className="mb-1.5 block text-sm font-bold text-encre">
          Filière
        </label>
        <select
          id="filiere"
          name="filiere"
          className="w-full rounded-[14px] border border-ligne bg-white px-4 py-2.5"
        >
          <option value="ingenieur">Ingénieurs</option>
          <option value="commerce">Commerce</option>
        </select>
      </div>

      <div>
        <label htmlFor="millesime" className="mb-1.5 block text-sm font-bold text-encre">
          Millésime
        </label>
        <input
          id="millesime"
          name="millesime"
          required
          defaultValue="2026-2027"
          pattern="\d{4}(-\d{4})?"
          className="w-full rounded-[14px] border border-ligne bg-white px-4 py-2.5"
        />
      </div>

      <button
        type="submit"
        disabled={enCours}
        className="w-full cursor-pointer rounded-full bg-primaire px-7 py-3 font-extrabold text-white transition hover:bg-primaire-fonce disabled:cursor-wait disabled:opacity-60"
      >
        {enCours ? "Création…" : "Créer la cohorte"}
      </button>
    </form>
  );
}
