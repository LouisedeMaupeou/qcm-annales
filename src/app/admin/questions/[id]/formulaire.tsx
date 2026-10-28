"use client";

import { useActionState, useState } from "react";
import { ApercuMath } from "@/lib/notation-math";
import { enregistrerQuestion, type EtatQuestion } from "./actions";

type Question = {
  id: string;
  type: string;
  enonce: string;
  chapitre: string;
  explication: string | null;
  explicationOrigine: string;
  explicationRelue: boolean;
  statut: string;
};

type Proposition = {
  id: string;
  texte: string;
  est_correcte: boolean;
  ordre: number;
};

const STATUTS = [
  { valeur: "brouillon", libelle: "Brouillon" },
  { valeur: "a_verifier", libelle: "À vérifier — en file de relecture" },
  { valeur: "publie", libelle: "Publiée — jouable par les élèves" },
  { valeur: "depubliee", libelle: "Dépubliée" },
];

export function FormulaireQuestion({
  question,
  propositions,
}: {
  question: Question;
  propositions: Proposition[];
}) {
  const [etat, action, enCours] = useActionState<EtatQuestion, FormData>(
    enregistrerQuestion,
    {},
  );
  // Champs contrôlés : l'aperçu du rendu doit suivre la frappe.
  const [enonce, setEnonce] = useState(question.enonce);
  const [textes, setTextes] = useState<Record<string, string>>(() =>
    Object.fromEntries(propositions.map((p) => [p.id, p.texte])),
  );
  const [explication, setExplication] = useState(question.explication ?? "");
  const [origine, setOrigine] = useState(question.explicationOrigine);
  const [relue, setRelue] = useState(question.explicationRelue);

  const generéeNonRelue = explication.trim() !== "" && origine === "generee" && !relue;

  return (
    <form action={action} className="space-y-6">
      <input type="hidden" name="id" value={question.id} />

      {etat.message && (
        <p role="alert" className="rounded-carte bg-negatif/10 p-4 text-sm text-negatif">
          {etat.message}
        </p>
      )}
      {etat.enregistre && (
        <p className="rounded-carte bg-primaire/10 p-4 text-sm font-bold text-primaire-fonce">
          Enregistré.
        </p>
      )}

      <Bloc titre="Énoncé">
        <textarea
          name="enonce"
          value={enonce}
          onChange={(e) => setEnonce(e.target.value)}
          rows={5}
          className="w-full rounded-[14px] border border-ligne bg-white px-4 py-3"
        />
        <ApercuMath texte={enonce} />
      </Bloc>

      <Bloc
        titre="Propositions"
        aide={
          question.type === "vrai_faux"
            ? "Chaque proposition est jugée Vrai ou Faux. La question n'est correcte que si les quatre jugements sont exacts (§2.3)."
            : "Coche l'unique bonne réponse."
        }
      >
        <ul className="space-y-3">
          {propositions.map((p, i) => (
            <li key={p.id} className="flex flex-wrap items-start gap-3">
              <input type="hidden" name="propositionId" value={p.id} />
              <span className="mt-3 w-5 shrink-0 font-black text-encre">
                {i + 1}
              </span>
              <div className="min-w-[240px] flex-1">
                <textarea
                  name={`texte-${p.id}`}
                  value={textes[p.id] ?? ""}
                  onChange={(e) =>
                    setTextes((t) => ({ ...t, [p.id]: e.target.value }))
                  }
                  rows={2}
                  className="w-full rounded-[14px] border border-ligne bg-white px-4 py-2.5"
                />
                <ApercuMath texte={textes[p.id] ?? ""} />
              </div>
              <label className="mt-2 flex shrink-0 cursor-pointer items-center gap-2 rounded-full bg-fond-doux px-4 py-2 font-bold">
                <input
                  type="checkbox"
                  name={`correcte-${p.id}`}
                  defaultChecked={p.est_correcte}
                  className="size-4.5 accent-primaire"
                />
                {question.type === "vrai_faux" ? "Vrai" : "Bonne réponse"}
              </label>
            </li>
          ))}
        </ul>
      </Bloc>

      <Bloc titre="Chapitre" aide="Obligatoire — alimente « chapitres à retravailler ».">
        <input
          name="chapitre"
          defaultValue={question.chapitre}
          className="w-full rounded-[14px] border border-ligne bg-white px-4 py-3"
        />
      </Bloc>

      <Bloc
        titre="Explication"
        aide="Facultative. Une explication générée par IA n'est jamais montrée à un élève tant qu'elle n'est pas relue."
      >
        <textarea
          name="explication"
          value={explication}
          onChange={(e) => setExplication(e.target.value)}
          rows={4}
          className="w-full rounded-[14px] border border-ligne bg-white px-4 py-3"
        />

        <div className="mt-3 flex flex-wrap items-center gap-5">
          <label className="flex items-center gap-2">
            <span className="font-bold text-encre">Origine</span>
            <select
              name="explicationOrigine"
              value={origine}
              onChange={(e) => setOrigine(e.target.value)}
              className="rounded-[14px] border border-ligne bg-white px-3 py-2"
            >
              <option value="humaine">humaine</option>
              <option value="generee">générée</option>
            </select>
          </label>

          <label className="flex cursor-pointer items-center gap-2 font-bold text-encre">
            <input
              type="checkbox"
              name="explicationRelue"
              checked={relue}
              onChange={(e) => setRelue(e.target.checked)}
              className="size-4.5 accent-primaire"
            />
            Relue et validée
          </label>
        </div>

        {generéeNonRelue && (
          <p className="mt-3 rounded-[14px] border-2 border-soleil bg-soleil/10 p-3 text-sm">
            Cette explication est générée et non relue : elle ne sera pas
            affichée aux élèves. La question reste jouable sans elle.
          </p>
        )}
      </Bloc>

      <Bloc titre="Statut">
        <select
          name="statut"
          defaultValue={question.statut}
          className="w-full rounded-[14px] border border-ligne bg-white px-4 py-3"
        >
          {STATUTS.map((s) => (
            <option key={s.valeur} value={s.valeur}>
              {s.libelle}
            </option>
          ))}
        </select>
      </Bloc>

      <button
        type="submit"
        disabled={enCours}
        className="cursor-pointer rounded-full bg-primaire px-9 py-3.5 font-extrabold text-white transition hover:bg-primaire-fonce disabled:cursor-wait disabled:opacity-60"
      >
        {enCours ? "Enregistrement…" : "Enregistrer"}
      </button>
    </form>
  );
}

function Bloc({
  titre,
  aide,
  children,
}: {
  titre: string;
  aide?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-carte border border-ligne p-5">
      <h2 className="mb-1 text-lg font-extrabold">{titre}</h2>
      {aide && <p className="mb-3 text-[0.85rem] opacity-75">{aide}</p>}
      {children}
    </section>
  );
}
