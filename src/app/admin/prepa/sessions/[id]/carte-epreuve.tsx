"use client";

import { useActionState } from "react";
import {
  enregistrerEpreuve,
  relancerRetardataires,
  retirerEpreuve,
  type EtatEpreuve,
} from "../actions";

type Epreuve = {
  id: string;
  epreuveIdExterne: string;
  concours: string;
  matiere: string;
  dureeMinutes: number;
  fenetreDebut: string | null;
  fenetreFin: string | null;
  pointsBonne: number;
  pointsMauvaise: number;
  pointsAbstention: number;
  regles: Record<string, unknown>;
  baremeSource: string | null;
  noteSur: number;
  statut: "brouillon" | "publiee";
  nbQuestions: number;
  nbEnRelecture: number;
  pointsTotal: number;
  cohorteIds: string[];
  suivi: { attendus: number; enCours: number; remis: number; corriges: number };
};

/** Pour un <input type="datetime-local">, qui ne lit pas l'ISO avec fuseau. */
function pourChamp(iso: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function CarteEpreuve({
  sessionId,
  epreuve,
  cohortes,
}: {
  sessionId: string;
  epreuve: Epreuve;
  cohortes: { id: string; nom: string; nbEleves: number }[];
}) {
  const [etat, action, enCours] = useActionState<EtatEpreuve, FormData>(
    enregistrerEpreuve,
    {},
  );

  const composees = epreuve.suivi.remis + epreuve.suivi.corriges;
  const pasCommence = Math.max(
    0,
    epreuve.suivi.attendus - composees - epreuve.suivi.enCours,
  );
  const reglesLisibles = Object.keys(epreuve.regles);

  return (
    <section className="rounded-carte border border-ligne p-5">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-extrabold text-encre">
            {epreuve.concours} — {epreuve.matiere}
          </h2>
          <p className="text-sm opacity-75">
            <span className="font-mono">{epreuve.epreuveIdExterne}</span> ·{" "}
            {epreuve.nbQuestions} questions · {epreuve.pointsTotal} points
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`rounded-full px-2.5 py-0.5 text-[0.75rem] font-bold ${
              epreuve.statut === "publiee"
                ? "bg-primaire/10 text-primaire-fonce"
                : "bg-ligne text-encre"
            }`}
          >
            {epreuve.statut === "publiee" ? "publiée" : "brouillon"}
          </span>
          {epreuve.nbEnRelecture > 0 && (
            <span className="rounded-full bg-soleil/20 px-2.5 py-0.5 text-[0.75rem] font-bold">
              {epreuve.nbEnRelecture} en relecture
            </span>
          )}
        </div>
      </div>

      {/* Suivi en temps réel (§5.2) */}
      <div className="mb-4 flex flex-wrap items-center gap-4 rounded-[14px] bg-fond-doux px-4 py-3 text-sm">
        <span>
          <strong className="tabular-nums">{composees}</strong> remise
          {composees > 1 ? "s" : ""}
        </span>
        <span>
          <strong className="tabular-nums">{epreuve.suivi.enCours}</strong> en cours
        </span>
        <span>
          <strong className="tabular-nums">{pasCommence}</strong> pas commencé
        </span>
        <span className="opacity-70">sur {epreuve.suivi.attendus} attendus</span>
        {pasCommence > 0 && (
          <form action={relancerRetardataires} className="ml-auto">
            <input type="hidden" name="epreuveCbId" value={epreuve.id} />
            <input type="hidden" name="sessionId" value={sessionId} />
            <button type="submit" className="cursor-pointer font-bold text-primaire underline">
              Relancer les {pasCommence} retardataires
            </button>
          </form>
        )}
      </div>

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

      <form action={action} className="space-y-4">
        <input type="hidden" name="epreuveCbId" value={epreuve.id} />
        <input type="hidden" name="sessionId" value={sessionId} />

        <div className="grid gap-4 sm:grid-cols-3">
          <Champ
            id={`duree-${epreuve.id}`}
            nom="dureeMinutes"
            libelle="Durée (minutes)"
            type="number"
            valeur={String(epreuve.dureeMinutes)}
          />
          <Champ
            id={`debut-${epreuve.id}`}
            nom="fenetreDebut"
            libelle="Ouverture"
            type="datetime-local"
            valeur={pourChamp(epreuve.fenetreDebut)}
          />
          <Champ
            id={`fin-${epreuve.id}`}
            nom="fenetreFin"
            libelle="Fermeture"
            type="datetime-local"
            valeur={pourChamp(epreuve.fenetreFin)}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-4">
          <Champ
            id={`bonne-${epreuve.id}`}
            nom="pointsBonne"
            libelle="Bonne réponse"
            type="number"
            pas="0.25"
            valeur={String(epreuve.pointsBonne)}
          />
          <Champ
            id={`mauvaise-${epreuve.id}`}
            nom="pointsMauvaise"
            libelle="Mauvaise"
            type="number"
            pas="0.25"
            valeur={String(epreuve.pointsMauvaise)}
          />
          <Champ
            id={`abstention-${epreuve.id}`}
            nom="pointsAbstention"
            libelle="Abstention"
            type="number"
            pas="0.25"
            valeur={String(epreuve.pointsAbstention)}
          />
          <Champ
            id={`note-${epreuve.id}`}
            nom="noteSur"
            libelle="Note ramenée sur"
            type="number"
            pas="1"
            valeur={String(epreuve.noteSur)}
          />
        </div>

        {epreuve.baremeSource && (
          <details className="rounded-[14px] bg-fond-doux p-4 text-sm">
            <summary className="cursor-pointer font-bold text-encre">
              Consigne relevée sur le sujet
              {reglesLisibles.length > 0 && ` · règles : ${reglesLisibles.join(", ")}`}
            </summary>
            <p className="mt-2">{epreuve.baremeSource}</p>
            {reglesLisibles.length > 0 && (
              <p className="mt-2 opacity-75">
                Ces règles ne s&apos;expriment pas par un barème à trois valeurs : elles
                sont appliquées par la correction automatique (§5.3).
              </p>
            )}
          </details>
        )}

        <fieldset>
          <legend className="mb-1.5 text-sm font-bold text-encre">
            Cohortes qui composent
          </legend>
          {cohortes.length === 0 ? (
            <p className="text-sm opacity-75">Aucune cohorte créée.</p>
          ) : (
            <div className="flex flex-wrap gap-3">
              {cohortes.map((c) => (
                <label
                  key={c.id}
                  className="flex cursor-pointer items-center gap-2 rounded-full border border-ligne px-4 py-2 text-sm"
                >
                  <input
                    type="checkbox"
                    name="cohortes"
                    value={c.id}
                    defaultChecked={epreuve.cohorteIds.includes(c.id)}
                  />
                  {c.nom}
                  <span className="opacity-70">({c.nbEleves})</span>
                </label>
              ))}
            </div>
          )}
        </fieldset>

        <div className="flex flex-wrap items-center gap-4">
          <label className="flex cursor-pointer items-center gap-2 text-sm font-bold text-encre">
            <input
              type="checkbox"
              name="statut"
              value="publiee"
              defaultChecked={epreuve.statut === "publiee"}
            />
            Publier l&apos;épreuve (visible des élèves de la cohorte)
          </label>

          <button
            type="submit"
            disabled={enCours}
            className="cursor-pointer rounded-full bg-primaire px-7 py-3 font-extrabold text-white transition hover:bg-primaire-fonce disabled:cursor-wait disabled:opacity-60"
          >
            {enCours ? "Enregistrement…" : "Enregistrer"}
          </button>

          {epreuve.suivi.attendus === 0 && composees === 0 && epreuve.suivi.enCours === 0 && (
            <form action={retirerEpreuve}>
              <input type="hidden" name="epreuveCbId" value={epreuve.id} />
              <input type="hidden" name="sessionId" value={sessionId} />
              <button type="submit" className="cursor-pointer text-sm underline opacity-70">
                Retirer de la session
              </button>
            </form>
          )}
        </div>
      </form>
    </section>
  );
}

function Champ({
  id,
  nom,
  libelle,
  type,
  valeur,
  pas,
}: {
  id: string;
  nom: string;
  libelle: string;
  type: string;
  valeur: string;
  pas?: string;
}) {
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-bold text-encre">
        {libelle}
      </label>
      <input
        id={id}
        name={nom}
        type={type}
        step={pas}
        defaultValue={valeur}
        className="w-full rounded-[14px] border border-ligne bg-white px-4 py-2.5"
      />
    </div>
  );
}
