"use client";

import { useActionState } from "react";
import { creerSession, type EtatSession } from "./actions";
import { BoutonAction } from "@/components/bouton-action";

export function FormulaireSession() {
  const [etat, action, enCours] = useActionState<EtatSession, FormData>(creerSession, {});

  return (
    <form action={action} className="space-y-4 rounded-carte border border-ligne p-5">
      <h2 className="font-extrabold text-encre">Nouvelle session</h2>

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
          placeholder="Toussaint 2026"
          className="w-full rounded-[14px] border border-ligne bg-white px-4 py-2.5"
        />
      </div>

      <BoutonAction
        className="w-full"
        succes={Boolean(etat.succes)}
        enCours={enCours}
        libelleEnCours="Création…"
        libelleSucces="Session créée"
      >
        Créer la session
      </BoutonAction>
    </form>
  );
}
