"use client";

import { useActionState } from "react";
import { autoriser, type EtatAutorisation } from "./actions";

export function BoutonAutoriser({ jeton }: { jeton: string }) {
  const [etat, action, enCours] = useActionState<EtatAutorisation, FormData>(
    autoriser,
    {},
  );

  return (
    <form action={action}>
      <input type="hidden" name="jeton" value={jeton} />
      {etat.message && (
        <p role="alert" className="mb-3 text-sm text-negatif">
          {etat.message}
        </p>
      )}
      <button
        type="submit"
        disabled={enCours}
        className="cursor-pointer rounded-full bg-primaire px-7 py-3.5 font-extrabold text-white shadow-[0_6px_18px_rgba(37,99,235,.28)] transition hover:bg-primaire-fonce disabled:cursor-wait disabled:opacity-60"
      >
        {enCours ? "Enregistrement…" : "J'autorise l'inscription"}
      </button>
    </form>
  );
}
