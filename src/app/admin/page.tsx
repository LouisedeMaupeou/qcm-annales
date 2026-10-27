import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function AdminAccueil() {
  const supabase = await createClient();

  const [annales, questions, relecture, signalements] = await Promise.all([
    supabase.from("annales").select("*", { count: "exact", head: true }),
    supabase
      .from("questions")
      .select("*", { count: "exact", head: true })
      .eq("statut", "publie"),
    supabase
      .from("questions")
      .select("*", { count: "exact", head: true })
      .in("statut", ["a_verifier", "brouillon"]),
    supabase
      .from("signalements")
      .select("*", { count: "exact", head: true })
      .eq("traite", false),
  ]);

  return (
    <>
      <h1 className="mb-8 text-3xl font-black">Back-office</h1>

      <div className="mb-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Compteur valeur={annales.count} libelle="annales" />
        <Compteur valeur={questions.count} libelle="questions publiées" />
        <Compteur
          valeur={relecture.count}
          libelle="en attente de relecture"
          alerte={(relecture.count ?? 0) > 0}
        />
        <Compteur
          valeur={signalements.count}
          libelle="signalements ouverts"
          alerte={(signalements.count ?? 0) > 0}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Carte
          href="/admin/annales"
          titre="Annales"
          texte="Importer une annale, gérer les épreuves, blocs et questions."
        />
        <Carte
          href="/admin/relecture"
          titre="Relecture"
          texte="Questions sous le seuil de confiance et questions signalées par les élèves."
        />
        <Carte
          href="/admin/prepa"
          titre="Prépa"
          texte="Cohortes de la prépa Parkours, rattachements et invitations."
        />
        <Carte
          href="/admin/prepa/import"
          titre="Import concours blancs"
          texte="Questions d'épreuves blanches au format Parkours, avec leurs images."
        />
        <Carte
          href="/admin/eleves"
          titre="Élèves"
          texte="Liste filtrable, fiches, actions RGPD et export vers Zoho."
        />
        <Carte
          href="/admin/pilotage"
          titre="Pilotage"
          texte="Usage, progression, taux d'annales réalisées et scores moyens."
        />
        <Carte
          href="/admin/baremes"
          titre="Barèmes et seuils"
          texte="Points par concours, taille de session, seuil d'auto-publication."
        />
      </div>
    </>
  );
}

function Compteur({
  valeur,
  libelle,
  alerte = false,
}: {
  valeur: number | null;
  libelle: string;
  alerte?: boolean;
}) {
  return (
    <div
      className={`rounded-carte border p-5 ${
        alerte ? "border-soleil bg-soleil/10" : "border-ligne"
      }`}
    >
      <p className="text-3xl font-black text-encre">{valeur ?? "—"}</p>
      <p className="text-[0.95rem]">{libelle}</p>
    </div>
  );
}

function Carte({
  href,
  titre,
  texte,
}: {
  href: string;
  titre: string;
  texte: string;
}) {
  return (
    <Link
      href={href}
      className="rounded-carte border border-ligne p-6 no-underline transition hover:border-primaire"
    >
      <h2 className="mb-1 text-lg font-extrabold text-encre">{titre}</h2>
      <p className="text-[0.95rem]">{texte}</p>
    </Link>
  );
}
