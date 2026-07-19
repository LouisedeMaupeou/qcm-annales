import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { PiedDePage } from "@/components/pied-de-page";
import { createClient } from "@/lib/supabase/server";
import { FormulaireNouveauMotDePasse } from "./formulaire";

export const metadata: Metadata = {
  title: "Nouveau mot de passe — Admissible",
  robots: { index: false },
};

export const dynamic = "force-dynamic";

/**
 * Accessible uniquement avec la session ouverte par le lien de récupération
 * (cf. /auth/confirmer, type "recovery").
 */
export default async function Reinitialiser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/connexion?erreur=lien_expire");

  return (
    <div className="mx-auto flex w-full max-w-[480px] flex-1 flex-col px-[22px]">
      <header className="py-5">
        <Link href="/" className="text-encre no-underline">
          <span className="text-[1.4rem] leading-none font-black tracking-tight">
            Admissible<span className="text-primaire">.</span>
          </span>
        </Link>
      </header>

      <main className="flex-1 py-8">
        <h1 className="mb-6 text-[clamp(1.8rem,4vw,2.4rem)] font-black">
          Nouveau mot de passe
        </h1>
        <FormulaireNouveauMotDePasse />
      </main>

      <PiedDePage />
    </div>
  );
}
