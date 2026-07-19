"use client";

import { useActionState, useState } from "react";
import { creerAnnale, type EtatNouvelleAnnale } from "./actions";

export function FormulaireAnnale({
  concours,
}: {
  concours: { id: string; nom: string }[];
}) {
  const [etat, action, enCours] = useActionState<EtatNouvelleAnnale, FormData>(
    creerAnnale,
    {},
  );
  const [format, setFormat] = useState<"deux_documents" | "un_document">(
    "deux_documents",
  );

  return (
    <form action={action} className="max-w-[620px] space-y-6">
      {etat.message && (
        <p
          role="alert"
          className="rounded-carte bg-negatif/10 p-4 text-sm text-negatif"
        >
          {etat.message}
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="concoursId" className="mb-1.5 block font-bold text-encre">
            Concours
          </label>
          <select
            id="concoursId"
            name="concoursId"
            className="w-full rounded-[14px] border border-ligne bg-white px-4 py-3"
          >
            {concours.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nom}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="annee" className="mb-1.5 block font-bold text-encre">
            Année
          </label>
          <input
            id="annee"
            name="annee"
            type="number"
            min={1990}
            max={2100}
            defaultValue={new Date().getFullYear()}
            className="w-full rounded-[14px] border border-ligne bg-white px-4 py-3"
          />
        </div>
      </div>

      <fieldset>
        <legend className="mb-2 font-bold text-encre">Format source</legend>
        <div className="space-y-2">
          <Radio
            nom="formatSource"
            valeur="deux_documents"
            coche={format === "deux_documents"}
            onChange={() => setFormat("deux_documents")}
            libelle="2 documents — un sujet et un corrigé séparés"
          />
          <Radio
            nom="formatSource"
            valeur="un_document"
            coche={format === "un_document"}
            onChange={() => setFormat("un_document")}
            libelle="1 document — sujet et corrigé réunis"
          />
        </div>
      </fieldset>

      {format === "deux_documents" ? (
        <>
          <Fichier nom="pdfQuestions" libelle="PDF du sujet" />
          <Fichier nom="pdfCorrections" libelle="PDF du corrigé" />
        </>
      ) : (
        <Fichier nom="pdfComplet" libelle="PDF complet" />
      )}

      <p className="rounded-carte bg-fond-doux p-4 text-sm">
        Les PDF sont archivés dans un espace privé, jamais exposé publiquement :
        les droits de reproduction des annales doivent être sécurisés concours
        par concours (§8.9). Ils servent de référence à la relecture, en regard
        des questions saisies.
      </p>

      <button
        type="submit"
        disabled={enCours}
        className="cursor-pointer rounded-full bg-primaire px-9 py-3.5 font-extrabold text-white transition hover:bg-primaire-fonce disabled:cursor-wait disabled:opacity-60"
      >
        {enCours ? "Import en cours…" : "Créer l'annale"}
      </button>
    </form>
  );
}

function Radio({
  nom,
  valeur,
  libelle,
  coche,
  onChange,
}: {
  nom: string;
  valeur: string;
  libelle: string;
  coche: boolean;
  onChange: () => void;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-3 rounded-[14px] border border-ligne px-4 py-3">
      <input
        type="radio"
        name={nom}
        value={valeur}
        checked={coche}
        onChange={onChange}
        className="size-4.5 accent-primaire"
      />
      <span>{libelle}</span>
    </label>
  );
}

function Fichier({ nom, libelle }: { nom: string; libelle: string }) {
  return (
    <div>
      <label htmlFor={nom} className="mb-1.5 block font-bold text-encre">
        {libelle}
      </label>
      <input
        id={nom}
        name={nom}
        type="file"
        accept="application/pdf"
        className="w-full rounded-[14px] border border-ligne bg-white px-4 py-3 text-sm file:mr-3 file:rounded-full file:border-0 file:bg-fond-doux file:px-4 file:py-2 file:font-bold"
      />
      <p className="mt-1 text-[0.82rem] opacity-75">PDF, 50 Mo maximum.</p>
    </div>
  );
}
