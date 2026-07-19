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
          href="/admin/baremes"
          titre="Barèmes"
          texte="Points par concours et par épreuve, taille de session, source officielle."
        />
      </div>

      <p className="mt-10 rounded-carte bg-fond-doux p-5 text-sm">
        Les sections <strong>Élèves</strong> et <strong>Pilotage</strong> du §6,
        ainsi que la file de relecture et l&apos;import en masse, arrivent aux
        étapes suivantes du plan de développement.
      </p>
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
