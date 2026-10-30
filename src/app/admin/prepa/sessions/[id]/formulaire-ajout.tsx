"use client";

import { BoutonAction } from "@/components/bouton-action";
import { useActionState, useState } from "react";
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
  const [selection, setSelection] = useState<Set<string>>(new Set());

  const basculer = (id: string) =>
    setSelection((s) => {
      const suivant = new Set(s);
      if (suivant.has(id)) suivant.delete(id);
      else suivant.add(id);
      return suivant;
    });

  const toutBasculer = () =>
    setSelection((s) =>
      s.size === disponibles.length ? new Set() : new Set(disponibles.map((d) => d.id)),
    );

  return (
    <section className="rounded-carte border border-ligne p-5">
      <h2 className="mb-1 text-lg font-extrabold">Ajouter des épreuves</h2>
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
        <form action={action} className="space-y-4">
          <input type="hidden" name="sessionId" value={sessionId} />

          <fieldset>
            <legend className="mb-2 text-sm font-bold text-encre">
              Épreuves importées
            </legend>
            <div className="grid gap-2 sm:grid-cols-2">
              {disponibles.map((d) => (
                <label
                  key={d.id}
                  className={`flex cursor-pointer items-center gap-3 rounded-[14px] border px-4 py-2.5 text-sm transition ${
                    selection.has(d.id)
                      ? "border-primaire bg-fond-doux/60"
                      : "border-ligne bg-white"
                  }`}
                >
                  <input
                    type="checkbox"
                    name="epreuveIdExterne"
                    value={d.id}
                    checked={selection.has(d.id)}
                    onChange={() => basculer(d.id)}
                    className="size-4.5 shrink-0 accent-primaire"
                  />
                  <span className="min-w-0">
                    <span className="block font-mono font-bold text-encre">{d.id}</span>
                    <span className="opacity-70">
                      {d.nb} question{d.nb > 1 ? "s" : ""}
                    </span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          <div className="flex flex-wrap items-center gap-4">
            <button
              type="button"
              onClick={toutBasculer}
              className="cursor-pointer text-sm underline"
            >
              {selection.size === disponibles.length
                ? "Tout désélectionner"
                : `Tout sélectionner (${disponibles.length})`}
            </button>

            <BoutonAction
              className="ml-auto disabled:cursor-not-allowed"
              disabled={enCours || selection.size === 0}
              succes={Boolean(etat.succes)}
              enCours={enCours}
              libelleEnCours="Ajout…"
              libelleSucces="Épreuves ajoutées"
            >
              {selection.size === 0
                ? "Ajouter"
                : `Ajouter ${selection.size} épreuve${selection.size > 1 ? "s" : ""}`}
            </BoutonAction>
          </div>
        </form>
      )}
    </section>
  );
}
