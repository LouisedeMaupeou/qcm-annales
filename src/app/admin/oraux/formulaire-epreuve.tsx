"use client";

import { useActionState } from "react";
import { creerEpreuveOrale, type EtatOral } from "./actions";

export function FormulaireEpreuveOrale({
  sessions,
  concours,
}: {
  sessions: { id: string; nom: string }[];
  concours: { id: string; nom: string }[];
}) {
  const [etat, action, enCours] = useActionState<EtatOral, FormData>(
    creerEpreuveOrale,
    {},
  );

  if (sessions.length === 0) {
    return (
      <p className="rounded-carte bg-fond-doux p-5 text-sm">
        Crée d&apos;abord une session de concours blancs : une épreuve orale
        s&apos;y rattache.
      </p>
    );
  }

  return (
    <section className="rounded-carte border border-ligne p-5">
      <h2 className="mb-1 text-lg font-extrabold">Ouvrir une épreuve orale</h2>
      <p className="mb-4 text-sm opacity-75">
        La grille de motivation du référentiel est posée par défaut — cinq
        critères sur 5. Elle reste modifiable ensuite.
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

      <form action={action} className="flex flex-wrap items-end gap-3">
        <div>
          <label htmlFor="sessionId" className="mb-1.5 block text-sm font-bold text-encre">
            Session
          </label>
          <select
            id="sessionId"
            name="sessionId"
            className="rounded-[14px] border border-ligne bg-white px-4 py-2.5"
          >
            {sessions.map((s) => (
              <option key={s.id} value={s.id}>
                {s.nom}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="concoursId" className="mb-1.5 block text-sm font-bold text-encre">
            Concours
          </label>
          <select
            id="concoursId"
            name="concoursId"
            className="rounded-[14px] border border-ligne bg-white px-4 py-2.5"
          >
            {concours.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nom}
              </option>
            ))}
          </select>
        </div>

        <div className="min-w-[220px] flex-1">
          <label htmlFor="nom" className="mb-1.5 block text-sm font-bold text-encre">
            Intitulé
          </label>
          <input
            id="nom"
            name="nom"
            required
            placeholder="Oral de motivation"
            className="w-full rounded-[14px] border border-ligne bg-white px-4 py-2.5"
          />
        </div>

        <button
          type="submit"
          disabled={enCours}
          className="cursor-pointer rounded-full bg-primaire px-7 py-3 font-extrabold text-white transition hover:bg-primaire-fonce disabled:cursor-wait disabled:opacity-60"
        >
          {enCours ? "Création…" : "Ouvrir"}
        </button>
      </form>
    </section>
  );
}
