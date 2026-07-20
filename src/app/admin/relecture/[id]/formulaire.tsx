"use client";

import { useActionState, useState } from "react";
import { deciderRelecture, type EtatRelecture } from "./actions";

type Question = {
  id: string;
  type: string;
  enonce: string;
  chapitre: string;
  explication: string | null;
  explicationOrigine: string;
  explicationRelue: boolean;
};

type Proposition = {
  id: string;
  texte: string;
  est_correcte: boolean;
  ordre: number;
};

export function FormulaireRelecture({
  question,
  propositions,
}: {
  question: Question;
  propositions: Proposition[];
}) {
  const [etat, action, enCours] = useActionState<EtatRelecture, FormData>(
    deciderRelecture,
    {},
  );
  const [explication, setExplication] = useState(question.explication ?? "");
  const [relue, setRelue] = useState(question.explicationRelue);

  const generéeNonRelue =
    explication.trim() !== "" && question.explicationOrigine === "generee" && !relue;

  return (
    <form action={action} className="space-y-5">
      <input type="hidden" name="id" value={question.id} />

      {etat.message && (
        <p role="alert" className="rounded-carte bg-negatif/10 p-4 text-sm text-negatif">
          {etat.message}
        </p>
      )}

      <div>
        <label htmlFor="enonce" className="mb-1.5 block font-bold text-encre">
          Énoncé
        </label>
        <textarea
          id="enonce"
          name="enonce"
          defaultValue={question.enonce}
          rows={6}
          className="w-full rounded-[14px] border border-ligne bg-white px-4 py-3"
        />
      </div>

      <div>
        <p className="mb-1.5 font-bold text-encre">Propositions</p>
        <p className="mb-3 text-[0.85rem] opacity-75">
          {question.type === "vrai_faux"
            ? "La question n'est correcte que si les quatre jugements sont exacts."
            : "Coche l'unique bonne réponse."}
        </p>
        <ul className="space-y-3">
          {propositions.map((p, i) => (
            <li key={p.id} className="flex flex-wrap items-start gap-3">
              <input type="hidden" name="propositionId" value={p.id} />
              <span className="mt-3 w-5 shrink-0 font-black text-encre">{i + 1}</span>
              <textarea
                name={`texte-${p.id}`}
                defaultValue={p.texte}
                rows={2}
                className="min-w-[200px] flex-1 rounded-[14px] border border-ligne bg-white px-4 py-2.5"
              />
              <label className="mt-2 flex shrink-0 cursor-pointer items-center gap-2 rounded-full bg-fond-doux px-4 py-2 font-bold">
                <input
                  type="checkbox"
                  name={`correcte-${p.id}`}
                  defaultChecked={p.est_correcte}
                  className="size-4.5 accent-primaire"
                />
                {question.type === "vrai_faux" ? "Vrai" : "Bonne"}
              </label>
            </li>
          ))}
        </ul>
      </div>

      <div>
        <label htmlFor="chapitre" className="mb-1.5 block font-bold text-encre">
          Chapitre
        </label>
        <input
          id="chapitre"
          name="chapitre"
          defaultValue={question.chapitre}
          className="w-full rounded-[14px] border border-ligne bg-white px-4 py-3"
        />
      </div>

      <div>
        <label htmlFor="explication" className="mb-1.5 block font-bold text-encre">
          Explication{" "}
          <span className="font-normal opacity-70">
            (facultative — {question.explicationOrigine})
          </span>
        </label>
        <textarea
          id="explication"
          name="explication"
          value={explication}
          onChange={(e) => setExplication(e.target.value)}
          rows={4}
          className="w-full rounded-[14px] border border-ligne bg-white px-4 py-3"
        />
        <label className="mt-2 flex cursor-pointer items-center gap-2 font-bold text-encre">
          <input
            type="checkbox"
            name="explicationRelue"
            checked={relue}
            onChange={(e) => setRelue(e.target.checked)}
            className="size-4.5 accent-primaire"
          />
          Explication relue et validée
        </label>
        {generéeNonRelue && (
          <p className="mt-2 rounded-[14px] border-2 border-soleil bg-soleil/10 p-3 text-sm">
            Explication générée non relue : elle ne sera pas affichée aux élèves.
            La question reste jouable sans elle.
          </p>
        )}
      </div>

      {/* §6.1 : Valider · Corriger puis valider · Rejeter. Les deux premiers
          cas sont le même bouton — les corrections éventuelles partent avec. */}
      <div className="flex flex-wrap gap-3 border-t border-ligne pt-5">
        <button
          type="submit"
          name="decision"
          value="valider"
          disabled={enCours}
          className="cursor-pointer rounded-full bg-primaire px-7 py-3 font-extrabold text-white transition hover:bg-primaire-fonce disabled:cursor-wait disabled:opacity-60"
        >
          {enCours ? "Enregistrement…" : "Valider et publier"}
        </button>
        <button
          type="submit"
          name="decision"
          value="rejeter"
          disabled={enCours}
          className="cursor-pointer rounded-full border-2 border-negatif px-7 py-3 font-extrabold text-negatif transition hover:bg-negatif hover:text-white disabled:cursor-wait disabled:opacity-60"
        >
          Rejeter
        </button>
      </div>
      <p className="text-[0.85rem] opacity-75">
        Valider publie la question avec les corrections saisies. Rejeter la
        laisse hors des sessions sans la supprimer.
      </p>
    </form>
  );
}
