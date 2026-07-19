import type { Metadata } from "next";
import Link from "next/link";
import { PiedDePage } from "@/components/pied-de-page";
import { FormulaireConnexion } from "./formulaire";

export const metadata: Metadata = {
  title: "Connexion — Admissible",
};

const ERREURS: Record<string, string> = {
  lien_invalide: "Ce lien est incomplet. Demande-nous un nouvel email.",
  lien_expire:
    "Ce lien a expiré ou a déjà été utilisé. Demande-nous un nouvel email.",
  compte_inactif:
    "Ton compte n'est pas encore actif. S'il te reste l'accord d'un parent à obtenir, il a reçu un email avec le lien d'autorisation.",
};

export default async function Connexion({
  searchParams,
}: {
  searchParams: Promise<{ suite?: string; erreur?: string }>;
}) {
  const { suite, erreur } = await searchParams;

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
          Connexion
        </h1>

        {erreur && ERREURS[erreur] && (
          <p
            role="alert"
            className="mb-6 rounded-carte bg-negatif/10 p-4 text-sm text-negatif"
          >
            {ERREURS[erreur]}
          </p>
        )}

        <FormulaireConnexion suite={suite} />
      </main>

      <PiedDePage />
    </div>
  );
}
