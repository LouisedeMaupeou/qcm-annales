import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  COLONNES_ATTENDUES,
  COLONNES_FACULTATIVES,
} from "@/lib/import-questions";
import { FormulaireImport } from "./formulaire";

export const dynamic = "force-dynamic";

export default async function ImportAnnale({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const [{ data: annale }, { data: parametre }] = await Promise.all([
    supabase
      .from("annales")
      .select("id, annee, concours(nom)")
      .eq("id", id)
      .maybeSingle(),
    supabase
      .from("parametres")
      .select("valeur")
      .eq("cle", "seuil_confiance")
      .maybeSingle(),
  ]);

  if (!annale) notFound();

  const concours = (annale.concours as unknown as { nom: string } | null)?.nom;
  const seuil = Number(parametre?.valeur ?? 90);

  return (
    <>
      <p className="mb-2 text-sm">
        <Link href={`/admin/annales/${id}`} className="hover:underline">
          ← {concours} {annale.annee}
        </Link>
      </p>
      <h1 className="mb-2 text-3xl font-black">Import en masse</h1>
      <p className="mb-8 max-w-[70ch]">
        Fichier XLSX ou CSV, <strong>une ligne par proposition</strong>. Les
        questions sont ajoutées à l&apos;annale {concours} {annale.annee}.
      </p>

      <div className="mb-8 grid gap-5 lg:grid-cols-[1fr_320px]">
        <FormulaireImport annaleId={id} seuil={seuil} />

        <aside className="space-y-4">
          <section className="rounded-carte border border-ligne p-5 text-sm">
            <h2 className="mb-2 font-extrabold text-encre">Colonnes requises</h2>
            <ul className="space-y-0.5 font-mono text-[0.8rem]">
              {COLONNES_ATTENDUES.map((c) => (
                <li key={c}>{c}</li>
              ))}
            </ul>
            <h2 className="mt-4 mb-2 font-extrabold text-encre">Facultatives</h2>
            <ul className="space-y-0.5 font-mono text-[0.8rem] opacity-75">
              {COLONNES_FACULTATIVES.map((c) => (
                <li key={c}>{c}</li>
              ))}
            </ul>
          </section>

          <section className="rounded-carte bg-fond-doux p-5 text-sm">
            <h2 className="mb-2 font-extrabold text-encre">Regroupement</h2>
            <p className="mb-2">
              <code className="font-bold">groupe_id</code> réunit les
              propositions d&apos;une même question — pour un vrai/faux, un
              énoncé et ses 4 propositions.
            </p>
            <p>
              <code className="font-bold">bloc_id</code>, facultatif, réunit
              plusieurs questions dans un bloc lié, tiré entier et dans
              l&apos;ordre. Sans cette colonne, chaque question forme son propre
              bloc.
            </p>
          </section>

          <section className="rounded-carte bg-fond-doux p-5 text-sm">
            <h2 className="mb-2 font-extrabold text-encre">Publication</h2>
            <p>
              Une question dont la confiance atteint <strong>{seuil} %</strong>{" "}
              est publiée automatiquement. En dessous, sans indice de confiance,
              avec une réserve d&apos;extraction ou une figure manquante, elle
              part en file de relecture et ne peut être publiée sans validation
              humaine.
            </p>
          </section>
        </aside>
      </div>
    </>
  );
}
