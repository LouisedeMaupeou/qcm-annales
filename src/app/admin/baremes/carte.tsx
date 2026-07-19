"use client";

import { useActionState } from "react";
import { enregistrerBareme, type EtatBareme } from "./actions";

type Bareme = {
  id: string;
  points_bonne: number;
  points_mauvaise: number;
  points_abstention: number;
  regle_speciale: string | null;
  source_officielle: string | null;
  verifie_le: string | null;
};

export function CarteBareme({
  concours,
  bareme,
}: {
  concours: { id: string; nom: string; filiere: string; tailleSession: number };
  bareme: Bareme;
}) {
  const [etat, action, enCours] = useActionState<EtatBareme, FormData>(
    enregistrerBareme,
    {},
  );

  return (
    <form
      action={action}
      className={`rounded-carte border p-5 ${
        bareme.verifie_le ? "border-ligne" : "border-soleil"
      }`}
    >
      <input type="hidden" name="baremeId" value={bareme.id} />
      <input type="hidden" name="concoursId" value={concours.id} />

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-extrabold text-encre">{concours.nom}</h2>
        {bareme.verifie_le ? (
          <span className="rounded-full bg-primaire/10 px-3 py-1 text-[0.8rem] font-bold text-primaire-fonce">
            vérifié le {new Date(bareme.verifie_le).toLocaleDateString("fr-FR")}
          </span>
        ) : (
          <span className="rounded-full bg-soleil/25 px-3 py-1 text-[0.8rem] font-bold text-encre">
            non vérifié
          </span>
        )}
      </div>

      {etat.message && (
        <p role="alert" className="mb-4 rounded-[14px] bg-negatif/10 p-3 text-sm text-negatif">
          {etat.message}
        </p>
      )}
      {etat.enregistre && (
        <p className="mb-4 rounded-[14px] bg-primaire/10 p-3 text-sm font-bold text-primaire-fonce">
          Enregistré.
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-4">
        <Nombre nom="pointsBonne" libelle="Bonne réponse" valeur={bareme.points_bonne} />
        <Nombre nom="pointsMauvaise" libelle="Mauvaise réponse" valeur={bareme.points_mauvaise} />
        <Nombre nom="pointsAbstention" libelle="Abstention" valeur={bareme.points_abstention} />
        <Nombre
          nom="tailleSession"
          libelle="Questions par session"
          valeur={concours.tailleSession}
          pas={1}
        />
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div>
          <label className="mb-1.5 block font-bold text-encre">
            Source officielle
          </label>
          <input
            name="sourceOfficielle"
            defaultValue={bareme.source_officielle ?? ""}
            placeholder="Règlement du concours, session 2025"
            className="w-full rounded-[14px] border border-ligne bg-white px-4 py-2.5"
          />
        </div>
        <div>
          <label className="mb-1.5 block font-bold text-encre">
            Vérifié le
          </label>
          <input
            name="verifieLe"
            type="date"
            defaultValue={bareme.verifie_le ?? ""}
            className="w-full rounded-[14px] border border-ligne bg-white px-4 py-2.5"
          />
        </div>
      </div>

      <div className="mt-4">
        <label className="mb-1.5 block font-bold text-encre">
          Règle spéciale
        </label>
        <textarea
          name="regleSpeciale"
          defaultValue={bareme.regle_speciale ?? ""}
          rows={2}
          className="w-full rounded-[14px] border border-ligne bg-white px-4 py-2.5"
        />
      </div>

      <button
        type="submit"
        disabled={enCours}
        className="mt-4 cursor-pointer rounded-full bg-primaire px-7 py-2.5 font-extrabold text-white transition hover:bg-primaire-fonce disabled:cursor-wait disabled:opacity-60"
      >
        {enCours ? "Enregistrement…" : "Enregistrer"}
      </button>
    </form>
  );
}

function Nombre({
  nom,
  libelle,
  valeur,
  pas = 0.5,
}: {
  nom: string;
  libelle: string;
  valeur: number;
  pas?: number;
}) {
  return (
    <div>
      <label htmlFor={nom} className="mb-1.5 block font-bold text-encre">
        {libelle}
      </label>
      <input
        id={nom}
        name={nom}
        type="number"
        step={pas}
        defaultValue={valeur}
        className="w-full rounded-[14px] border border-ligne bg-white px-4 py-2.5"
      />
    </div>
  );
}
