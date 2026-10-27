"use client";

import { useActionState } from "react";
import { ajouterEpreuve, type EtatEpreuve } from "../actions";

/** §5.2 : « ajout d'épreuves par sélection d'un EPREUVE_ID importé ». */
export function FormulaireAjout({
  sessionId,
  disponibles,
}: {
  sessionId: string;
  disponibles: { id: string; nb: number }[];
}) {
  const [etat, action, enCours] = useActionState<EtatEpreuve, FormData>(ajouterEpreuve, {});

  return (
    <section className="rounded-carte border border-ligne p-5">
      <h2 className="mb-1 text-lg font-extrabold">Ajouter une épreuve</h2>
      <p className="mb-4 text-sm opacity-75">
        Les questions sont reprises dans l&apos;ordre du sujet, avec la durée et
        le barème officiels préremplis. Tout reste modifiable ensuite.
      </p>

      {etat.message && (
        <p role="alert" className="mb-4 rounded-[14px] bg-negatif/10 p-3 text-sm text-negatif">
          {etat.message}
        </p>
      )}
      {etat.succes && (
        <p className="mb-4 rounded-[14px] bg-primaire/10 p-3 text-sm text-primaire-fonce">
          {etat.succes}
        </p>
      )}

      {disponibles.length === 0 ? (
        <p className="text-sm">
          Toutes les épreuves importées sont déjà dans cette session.
        </p>
      ) : (
        <form action={action} className="flex flex-wrap items-end gap-3">
          <input type="hidden" name="sessionId" value={sessionId} />
          <div className="min-w-[260px] flex-1">
            <label
              htmlFor="epreuveIdExterne"
              className="mb-1.5 block text-sm font-bold text-encre"
            >
              Épreuve importée
            </label>
            <select
              id="epreuveIdExterne"
              name="epreuveIdExterne"
              className="w-full rounded-[14px] border border-ligne bg-white px-4 py-2.5"
            >
              {disponibles.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.id} — {d.nb} question{d.nb > 1 ? "s" : ""}
                </option>
              ))}
            </select>
          </div>
          <button
            type="submit"
            disabled={enCours}
            className="cursor-pointer rounded-full bg-primaire px-7 py-3 font-extrabold text-white transition hover:bg-primaire-fonce disabled:cursor-wait disabled:opacity-60"
          >
            {enCours ? "Ajout…" : "Ajouter"}
          </button>
        </form>
      )}
    </section>
  );
}
