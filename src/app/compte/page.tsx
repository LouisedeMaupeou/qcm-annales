import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { PiedDePage } from "@/components/pied-de-page";
import { createClient } from "@/lib/supabase/server";
import { FormulaireSuppression } from "./formulaire-suppression";

export const metadata: Metadata = {
  title: "Mon compte — Admissible",
  robots: { index: false },
};

export const dynamic = "force-dynamic";

export default async function Compte() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/connexion");

  const { data: profil } = await supabase
    .from("users")
    .select(
      "prenom, nom, email, ville, etablissement, email_parent, consent_marketing, consent_marketing_date, cgu_acceptees_date, autorisation_parentale",
    )
    .eq("id", user.id)
    .single();

  return (
    <div className="mx-auto flex w-full max-w-[720px] flex-1 flex-col px-[22px]">
      <header className="flex items-center justify-between gap-4 py-5">
        <Link href="/tableau-de-bord" className="text-encre no-underline">
          <span className="text-[1.4rem] leading-none font-black tracking-tight">
            Admissible<span className="text-primaire">.</span>
          </span>
        </Link>
        <Link href="/tableau-de-bord" className="text-sm font-bold hover:underline">
          ← Tableau de bord
        </Link>
      </header>

      <main className="flex-1 pb-16">
        <h1 className="mb-8 text-[clamp(1.8rem,4vw,2.4rem)] font-black">
          Mon compte
        </h1>

        <section className="mb-8 rounded-carte border border-ligne bg-white p-6">
          <h2 className="mb-4 text-lg font-extrabold">Mes informations</h2>
          <dl className="space-y-2 text-[0.95rem]">
            <Ligne libelle="Nom" valeur={`${profil?.prenom} ${profil?.nom}`} />
            <Ligne libelle="Email" valeur={profil?.email} />
            <Ligne libelle="Ville" valeur={profil?.ville} />
            <Ligne libelle="Établissement" valeur={profil?.etablissement} />
            <Ligne libelle="Email du parent" valeur={profil?.email_parent} />
          </dl>
        </section>

        <section className="mb-8 rounded-carte border border-ligne bg-white p-6">
          <h2 className="mb-4 text-lg font-extrabold">Mes consentements</h2>
          <dl className="space-y-2 text-[0.95rem]">
            <Ligne
              libelle="CGU acceptées le"
              valeur={formaterDate(profil?.cgu_acceptees_date)}
            />
            <Ligne
              libelle="Communications commerciales"
              valeur={
                profil?.consent_marketing
                  ? `acceptées le ${formaterDate(profil.consent_marketing_date)}`
                  : "refusées"
              }
            />
          </dl>
        </section>

        {/* §8.4 : « Supprimer mon compte » côté élève. */}
        <section className="rounded-carte border-2 border-negatif/40 bg-negatif/5 p-6">
          <h2 className="mb-2 text-lg font-extrabold text-encre">
            Supprimer mon compte
          </h2>
          <p className="mb-5 text-[0.95rem]">
            Ton compte, tes sessions, tes résultats et l&apos;accès de ton
            parent seront définitivement effacés. Cette action est
            irréversible.
          </p>
          <FormulaireSuppression />
        </section>
      </main>

      <PiedDePage />
    </div>
  );
}

function Ligne({ libelle, valeur }: { libelle: string; valeur?: string | null }) {
  return (
    <div className="flex flex-wrap gap-x-2">
      <dt className="font-bold text-encre">{libelle} :</dt>
      <dd>{valeur ?? "—"}</dd>
    </div>
  );
}

function formaterDate(v?: string | null) {
  return v ? new Date(v).toLocaleDateString("fr-FR") : null;
}
