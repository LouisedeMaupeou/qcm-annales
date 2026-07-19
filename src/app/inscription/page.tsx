import type { Metadata } from "next";
import Link from "next/link";
import { PiedDePage } from "@/components/pied-de-page";
import { createAdminClient } from "@/lib/supabase/admin";
import { FormulaireInscription, type ConcoursOption } from "./formulaire";

export const metadata: Metadata = {
  title: "Créer mon compte — Admissible",
};

export const dynamic = "force-dynamic";

export default async function Inscription() {
  // Lecture avec le service_role : la RLS ferme `concours` aux visiteurs non
  // connectés (§9), or le formulaire d'inscription en a besoin. Seuls le nom et
  // la filière sont transmis au navigateur — aucune donnée sensible.
  const admin = createAdminClient();
  const { data } = await admin
    .from("concours")
    .select("id, nom, filiere")
    .eq("actif", true)
    .order("filiere")
    .order("nom");

  const concours = (data ?? []) as ConcoursOption[];

  return (
    <div className="mx-auto flex w-full max-w-[720px] flex-1 flex-col px-[22px]">
      <header className="py-5">
        <Link href="/" className="text-encre no-underline">
          <span className="text-[1.4rem] leading-none font-black tracking-tight">
            Admissible<span className="text-primaire">.</span>
          </span>
        </Link>
      </header>

      <main className="pb-16">
        <h1 className="mb-2 text-[clamp(1.8rem,4vw,2.4rem)] font-black">
          Crée ton compte
        </h1>
        <p className="mb-8">
          Gratuit, sans engagement. Deux minutes et tu joues ta première
          session.
        </p>
        <FormulaireInscription concours={concours} />
      </main>

      <PiedDePage />
    </div>
  );
}
