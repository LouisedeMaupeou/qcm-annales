"use client";

import { useActionState } from "react";
import { enregistrerSeuil, type EtatSeuil } from "./actions";

/** §6.1 : le seuil d'auto-publication est configurable. */
export function ReglageSeuil({ seuil }: { seuil: number }) {
  const [etat, action, enCours] = useActionState<EtatSeuil, FormData>(
    enregistrerSeuil,
    {},
  );

  return (
    <form action={action} className="rounded-carte border border-ligne p-5">
      <h2 className="mb-1 text-lg font-extrabold text-encre">
        Seuil d&apos;auto-publication
      </h2>
      <p className="mb-4 max-w-[70ch] text-sm">
        Une question importée dont l&apos;indice de confiance atteint ce seuil
        est publiée automatiquement, avec la marque{" "}
        <code className="font-bold">auto_publiee</code>. En dessous, elle entre
        en file de relecture et ne peut être publiée sans validation humaine.
        Une réserve d&apos;extraction ou une figure manquante l&apos;emportent
        sur le seuil.
      </p>

      {etat.message && (
        <p role="alert" className="mb-4 rounded-[14px] bg-negatif/10 p-3 text-sm text-negatif">
          {etat.message}
        </p>
      )}
      {etat.enregistre && (
        <p className="mb-4 rounded-[14px] bg-primaire/10 p-3 text-sm font-bold text-primaire-fonce">
          Seuil enregistré.
        </p>
      )}

      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label htmlFor="seuil" className="mb-1.5 block font-bold text-encre">
            Confiance minimale (%)
          </label>
          <input
            id="seuil"
            name="seuil"
            type="number"
            min={0}
            max={100}
            defaultValue={seuil}
            className="w-32 rounded-[14px] border border-ligne bg-white px-4 py-2.5"
          />
        </div>
        <button
          type="submit"
          disabled={enCours}
          className="cursor-pointer rounded-full bg-primaire px-7 py-2.5 font-extrabold text-white transition hover:bg-primaire-fonce disabled:cursor-wait disabled:opacity-60"
        >
          {enCours ? "Enregistrement…" : "Enregistrer"}
        </button>
      </div>
    </form>
  );
}
