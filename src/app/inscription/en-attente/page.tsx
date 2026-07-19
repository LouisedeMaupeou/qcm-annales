import type { Metadata } from "next";
import Link from "next/link";
import { PiedDePage } from "@/components/pied-de-page";

export const metadata: Metadata = {
  title: "En attente de l'accord d'un parent — Admissible",
  robots: { index: false },
};

/** §5.1 : sous 15 ans, le compte reste inactif jusqu'à l'accord parental. */
export default function EnAttente() {
  return (
    <div className="mx-auto flex w-full max-w-[720px] flex-1 flex-col px-[22px]">
      <header className="py-5">
        <Link href="/" className="text-encre no-underline">
          <span className="text-[1.4rem] leading-none font-black tracking-tight">
            Admissible<span className="text-primaire">.</span>
          </span>
        </Link>
      </header>

      <main className="flex-1 py-12">
        <h1 className="mb-3 text-[clamp(1.8rem,4vw,2.4rem)] font-black">
          Adresse confirmée !
        </h1>
        <p className="mb-6">
          Il reste une étape : comme tu as moins de 15 ans, ton compte
          s&apos;activera quand un de tes parents aura donné son accord.
        </p>
        <div className="rounded-carte border-2 border-soleil bg-soleil/10 p-5">
          <p className="mb-2 font-bold text-encre">
            Un email lui a été envoyé à l&apos;adresse que tu as indiquée.
          </p>
          <p className="text-sm">
            Il contient un lien qui autorise ton inscription et lui donne accès,
            en lecture seule, à ta progression. Pense à lui demander de vérifier
            ses courriers indésirables. Tu pourras te connecter dès qu&apos;il
            aura cliqué.
          </p>
        </div>
        <p className="mt-8">
          <Link href="/connexion" className="font-bold underline">
            Retour à la connexion
          </Link>
        </p>
      </main>

      <PiedDePage />
    </div>
  );
}
