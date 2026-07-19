import type { Metadata } from "next";
import { BoutonLien } from "@/components/bouton";
import { PiedDePage } from "@/components/pied-de-page";

export const metadata: Metadata = {
  title: "Inscription — Admissible",
  robots: { index: false },
};

/**
 * Marque-page. Le vrai formulaire (date de naissance, parcours mineur, double
 * opt-in) arrive à l'étape 3 du §12 ; cette page évite que les CTA de la
 * landing pointent vers un 404 pendant la revue.
 */
export default function Inscription() {
  return (
    <div className="mx-auto flex w-full max-w-[820px] flex-1 flex-col px-[22px]">
      <main className="flex-1 py-20 text-center">
        <h1 className="mb-3 text-[clamp(1.8rem,4vw,2.4rem)] font-black">
          L&apos;inscription arrive
        </h1>
        <p className="mx-auto mb-8 max-w-[48ch]">
          Le formulaire d&apos;inscription est en cours de développement
          (étape 3 du plan). En attendant, tu peux revenir à la présentation du
          site.
        </p>
        <BoutonLien href="/">Retour à l&apos;accueil</BoutonLien>
      </main>
      <PiedDePage />
    </div>
  );
}
