"use client";

import Link from "next/link";
import { useActionState, useId } from "react";
import { inscrire, type EtatInscription } from "./actions";

export type ConcoursOption = {
  id: string;
  nom: string;
  filiere: "commerce" | "ingenieur";
};

const LIBELLE_FILIERE = {
  commerce: "Écoles de commerce",
  ingenieur: "Écoles d'ingénieurs",
} as const;

export function FormulaireInscription({
  concours,
}: {
  concours: ConcoursOption[];
}) {
  const [etat, action, enCours] = useActionState<EtatInscription, FormData>(
    inscrire,
    {},
  );

  if (etat.succes) return <Confirmation {...etat.succes} />;

  const groupes = (["commerce", "ingenieur"] as const)
    .map((f) => ({
      filiere: f,
      items: concours.filter((c) => c.filiere === f),
    }))
    .filter((g) => g.items.length > 0);

  return (
    <form action={action} className="space-y-6">
      {etat.message && (
        <p
          role="alert"
          className="rounded-carte bg-negatif/10 p-4 text-sm text-negatif"
        >
          {etat.message}
        </p>
      )}

      <Groupe titre="Toi">
        <div className="grid gap-4 sm:grid-cols-2">
          <Champ
            nom="prenom"
            libelle="Prénom"
            autoComplete="given-name"
            requis
            defaultValue={etat.valeurs?.prenom}
            erreurs={etat.erreurs?.prenom}
          />
          <Champ
            nom="nom"
            libelle="Nom"
            autoComplete="family-name"
            requis
            defaultValue={etat.valeurs?.nom}
            erreurs={etat.erreurs?.nom}
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Champ
            nom="ville"
            libelle="Ville"
            autoComplete="address-level2"
            requis
            defaultValue={etat.valeurs?.ville}
            erreurs={etat.erreurs?.ville}
          />
          <Champ
            nom="etablissement"
            libelle="Établissement scolaire"
            autoComplete="organization"
            requis
            defaultValue={etat.valeurs?.etablissement}
            erreurs={etat.erreurs?.etablissement}
          />
        </div>
      </Groupe>

      <Groupe titre="Ton compte">
        <Champ
          nom="email"
          libelle="Ton adresse email"
          type="email"
          autoComplete="email"
          aide="Tu recevras un lien pour la confirmer."
          requis
          defaultValue={etat.valeurs?.email}
          erreurs={etat.erreurs?.email}
        />
        <Champ
          nom="motDePasse"
          libelle="Mot de passe"
          type="password"
          autoComplete="new-password"
          aide="8 caractères minimum."
          requis
          erreurs={etat.erreurs?.motDePasse}
        />
      </Groupe>

      <Groupe titre="Un parent ou responsable">
        <div className="grid gap-4 sm:grid-cols-2">
          <Champ
            nom="emailParent"
            libelle="Email d'un parent"
            type="email"
            autoComplete="off"
            requis
            defaultValue={etat.valeurs?.emailParent}
            erreurs={etat.erreurs?.emailParent}
          />
          <Champ
            nom="telephoneParent"
            libelle="Téléphone d'un parent"
            type="tel"
            autoComplete="off"
            aide="Par exemple 06 12 34 56 78."
            requis
            defaultValue={etat.valeurs?.telephoneParent}
            erreurs={etat.erreurs?.telephoneParent}
          />
        </div>
      </Groupe>

      <Groupe titre="Tes concours visés">
        {etat.erreurs?.concoursVises && (
          <p role="alert" className="text-sm text-negatif">
            {etat.erreurs.concoursVises[0]}
          </p>
        )}
        {groupes.map((g) => (
          <fieldset key={g.filiere}>
            <legend className="mb-2 text-sm font-extrabold tracking-[.08em] text-primaire-fonce uppercase">
              {LIBELLE_FILIERE[g.filiere]}
            </legend>
            <div className="grid gap-2 sm:grid-cols-2">
              {g.items.map((c) => (
                <label
                  key={c.id}
                  className="flex cursor-pointer items-center gap-2.5 rounded-[14px] border border-ligne bg-white px-4 py-3 font-bold hover:bg-fond-doux"
                >
                  <input
                    type="checkbox"
                    name="concoursVises"
                    value={c.id}
                    defaultChecked={etat.valeurs?.concoursVises?.includes(c.id)}
                    className="size-4.5 accent-primaire"
                  />
                  {c.nom}
                </label>
              ))}
            </div>
          </fieldset>
        ))}
      </Groupe>

      <Groupe titre="Consentements">
        {/* §8.1 : deux cases distinctes, marketing décoché par défaut. */}
        <Case
          nom="cguAcceptees"
          requis
          erreurs={etat.erreurs?.cguAcceptees}
          libelle={
            <>
              J&apos;accepte les{" "}
              <Link href="/cgu" target="_blank" className="underline">
                conditions générales d&apos;utilisation
              </Link>{" "}
              et la{" "}
              <Link href="/confidentialite" target="_blank" className="underline">
                politique de confidentialité
              </Link>
              .
            </>
          }
        />
        <Case
          nom="consentMarketing"
          defaultChecked={etat.valeurs?.consentMarketing}
          libelle="J'accepte de recevoir des informations sur les formations et événements de Parkours. (facultatif)"
        />
      </Groupe>

      <button
        type="submit"
        disabled={enCours}
        className="w-full cursor-pointer rounded-full bg-primaire px-9 py-4 text-lg font-extrabold text-white shadow-[0_6px_18px_rgba(37,99,235,.28)] transition hover:bg-primaire-fonce disabled:cursor-wait disabled:opacity-60"
      >
        {enCours ? "Création du compte…" : "Créer mon compte"}
      </button>

      <p className="text-center text-sm">
        Déjà inscrit ?{" "}
        <Link href="/connexion" className="font-bold underline">
          Se connecter
        </Link>
      </p>
    </form>
  );
}

function Confirmation({ email }: NonNullable<EtatInscription["succes"]>) {
  return (
    <div className="rounded-carte border border-ligne bg-white p-8">
      <h2 className="mb-3 text-2xl font-black">Ton compte est créé</h2>
      <p className="mb-4">
        Nous venons d&apos;envoyer un email à <strong>{email}</strong> : clique
        sur le lien qu&apos;il contient pour confirmer ton adresse, et ton compte
        sera actif.
      </p>
      <p className="rounded-carte bg-fond-doux p-4 text-sm">
        Pas d&apos;email dans quelques minutes ? Pense à vérifier tes courriers
        indésirables.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------

function Groupe({
  titre,
  children,
}: {
  titre: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-4 rounded-carte border border-ligne bg-white/70 p-5 sm:p-6">
      <h2 className="text-lg font-extrabold">{titre}</h2>
      {children}
    </section>
  );
}

function Champ({
  nom,
  libelle,
  type = "text",
  aide,
  erreurs,
  autoComplete,
  requis = false,
  defaultValue,
  onChange,
}: {
  nom: string;
  libelle: string;
  type?: string;
  aide?: string;
  erreurs?: string[];
  autoComplete?: string;
  requis?: boolean;
  defaultValue?: string;
  onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
}) {
  const id = useId();
  const idAide = `${id}-aide`;
  const idErreur = `${id}-erreur`;

  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block font-bold text-encre">
        {libelle}
        {requis && (
          <span className="text-negatif" aria-hidden>
            {" "}
            *
          </span>
        )}
      </label>
      <input
        id={id}
        name={nom}
        type={type}
        autoComplete={autoComplete}
        required={requis}
        aria-required={requis || undefined}
        defaultValue={defaultValue}
        onChange={onChange}
        aria-describedby={
          [aide ? idAide : null, erreurs?.length ? idErreur : null]
            .filter(Boolean)
            .join(" ") || undefined
        }
        aria-invalid={erreurs?.length ? true : undefined}
        className={`w-full rounded-[14px] border bg-white px-4 py-3 ${
          erreurs?.length ? "border-negatif" : "border-ligne"
        }`}
      />
      {aide && (
        <p id={idAide} className="mt-1 text-[0.82rem] opacity-75">
          {aide}
        </p>
      )}
      {/* Zod peut produire deux fois le même libellé pour un seul champ (la
          date de naissance échoue au format et à la borne d'âge). On dédoublonne
          plutôt que d'afficher deux lignes identiques. */}
      {[...new Set(erreurs ?? [])].map((e) => (
        <p key={e} id={idErreur} role="alert" className="mt-1 text-sm text-negatif">
          {e}
        </p>
      ))}
    </div>
  );
}

function Case({
  nom,
  libelle,
  erreurs,
  requis = false,
  defaultChecked = false,
}: {
  nom: string;
  libelle: React.ReactNode;
  erreurs?: string[];
  requis?: boolean;
  defaultChecked?: boolean;
}) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className="flex cursor-pointer items-start gap-3">
        <input
          id={id}
          name={nom}
          type="checkbox"
          required={requis}
          aria-required={requis || undefined}
          defaultChecked={defaultChecked}
          className="mt-1 size-4.5 shrink-0 accent-primaire"
        />
        <span className="text-[0.95rem]">{libelle}</span>
      </label>
      {[...new Set(erreurs ?? [])].map((e) => (
        <p key={e} role="alert" className="mt-1 text-sm text-negatif">
          {e}
        </p>
      ))}
    </div>
  );
}
