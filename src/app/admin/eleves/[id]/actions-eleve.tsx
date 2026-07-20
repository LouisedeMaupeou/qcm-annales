"use client";

import { useActionState, useState } from "react";
import {
  basculerSuspension,
  envoyerReinitialisation,
  supprimerEleve,
  type EtatAction,
} from "./actions";

/** §6.2 : désactiver · reset · suppression RGPD. */
export function ActionsEleve({
  id,
  email,
  suspendu,
}: {
  id: string;
  email: string;
  suspendu: boolean;
}) {
  return (
    <>
      <div className="space-y-3 rounded-carte border border-ligne p-5">
        <h2 className="text-lg font-extrabold">Actions</h2>
        <Suspension id={id} suspendu={suspendu} />
        <Reinitialisation id={id} />
      </div>
      <Suppression id={id} email={email} />
    </>
  );
}

function Suspension({ id, suspendu }: { id: string; suspendu: boolean }) {
  const [etat, action, enCours] = useActionState<EtatAction, FormData>(
    basculerSuspension,
    {},
  );

  return (
    <form action={action}>
      <input type="hidden" name="id" value={id} />
      <Retour etat={etat} />
      <button
        type="submit"
        disabled={enCours}
        className="w-full cursor-pointer rounded-full border-2 border-ligne px-6 py-2.5 font-bold text-encre transition hover:bg-fond-doux disabled:opacity-60"
      >
        {enCours
          ? "…"
          : suspendu
            ? "Réactiver le compte"
            : "Désactiver le compte"}
      </button>
    </form>
  );
}

function Reinitialisation({ id }: { id: string }) {
  const [etat, action, enCours] = useActionState<EtatAction, FormData>(
    envoyerReinitialisation,
    {},
  );

  return (
    <form action={action}>
      <input type="hidden" name="id" value={id} />
      <Retour etat={etat} />
      <button
        type="submit"
        disabled={enCours}
        className="w-full cursor-pointer rounded-full border-2 border-ligne px-6 py-2.5 font-bold text-encre transition hover:bg-fond-doux disabled:opacity-60"
      >
        {enCours ? "Envoi…" : "Envoyer un lien de réinitialisation"}
      </button>
    </form>
  );
}

function Suppression({ id, email }: { id: string; email: string }) {
  const [etat, action, enCours] = useActionState<EtatAction, FormData>(
    supprimerEleve,
    {},
  );
  const [ouvert, setOuvert] = useState(false);

  return (
    <div className="rounded-carte border-2 border-negatif/40 bg-negatif/5 p-5">
      <h2 className="mb-2 text-lg font-extrabold text-encre">Suppression RGPD</h2>
      <p className="mb-4 text-[0.9rem]">
        Efface définitivement le compte, ses sessions, ses réponses, ses
        signalements et l&apos;accès de son parent. Irréversible.
      </p>

      {!ouvert ? (
        <button
          type="button"
          onClick={() => setOuvert(true)}
          className="w-full cursor-pointer rounded-full border-2 border-negatif px-6 py-2.5 font-extrabold text-negatif transition hover:bg-negatif hover:text-white"
        >
          Supprimer cet élève
        </button>
      ) : (
        <form action={action} className="space-y-3">
          <input type="hidden" name="id" value={id} />
          <Retour etat={etat} />
          <div>
            <label
              htmlFor="confirmation"
              className="mb-1.5 block text-[0.9rem] font-bold text-encre"
            >
              Recopie <span className="font-black">{email}</span> pour confirmer
            </label>
            <input
              id="confirmation"
              name="confirmation"
              autoComplete="off"
              className="w-full rounded-[14px] border border-ligne bg-white px-4 py-2.5"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="submit"
              disabled={enCours}
              className="cursor-pointer rounded-full bg-negatif px-6 py-2.5 font-extrabold text-white transition hover:opacity-90 disabled:opacity-60"
            >
              {enCours ? "Suppression…" : "Supprimer définitivement"}
            </button>
            <button
              type="button"
              onClick={() => setOuvert(false)}
              className="cursor-pointer rounded-full border-2 border-ligne px-6 py-2.5 font-bold"
            >
              Annuler
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

function Retour({ etat }: { etat: EtatAction }) {
  if (etat.message)
    return (
      <p role="alert" className="mb-3 text-[0.9rem] font-bold text-negatif">
        {etat.message}
      </p>
    );
  if (etat.succes)
    return (
      <p className="mb-3 text-[0.9rem] font-bold text-primaire-fonce">
        {etat.succes}
      </p>
    );
  return null;
}
