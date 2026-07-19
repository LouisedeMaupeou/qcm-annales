import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { FormulaireAnnale } from "./formulaire";

export const dynamic = "force-dynamic";

export default async function NouvelleAnnale() {
  const supabase = await createClient();
  const { data: concours } = await supabase
    .from("concours")
    .select("id, nom")
    .eq("actif", true)
    .order("nom");

  return (
    <>
      <p className="mb-2 text-sm">
        <Link href="/admin/annales" className="hover:underline">
          ← Annales
        </Link>
      </p>
      <h1 className="mb-8 text-3xl font-black">Importer une annale</h1>
      <FormulaireAnnale concours={concours ?? []} />
    </>
  );
}
