import Link from "next/link";
import { PiedDePage } from "./pied-de-page";

/**
 * Gabarit commun aux trois pages légales (§8.5).
 *
 * `AVertir` affiche un bandeau tant que la page n'a pas été relue : ces textes
 * sont des trames, pas un avis juridique. Retirer le bandeau page par page une
 * fois le contenu validé.
 */
export function PageLegale({
  titre,
  maj,
  brouillon = true,
  children,
}: {
  titre: string;
  maj?: string;
  brouillon?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="mx-auto w-full max-w-[820px] flex-1 px-[22px]">
      <header className="py-5">
        <Link href="/" className="text-encre no-underline">
          <span className="text-[1.4rem] leading-none font-black tracking-tight">
            Admissible<span className="text-primaire">.</span>
          </span>
        </Link>
      </header>

      <main className="pb-16">
        <h1 className="mb-2 text-[clamp(1.8rem,4vw,2.4rem)] font-black">
          {titre}
        </h1>
        {maj && (
          <p className="mb-6 text-sm opacity-70">Dernière mise à jour : {maj}</p>
        )}

        {brouillon && (
          <div className="mb-8 rounded-carte border-2 border-soleil bg-soleil/10 p-4 text-sm">
            <strong className="block text-encre">
              Trame non validée juridiquement
            </strong>
            Les passages entre crochets doivent être complétés, et l&apos;ensemble
            relu par un conseil avant mise en ligne. Ce texte n&apos;est pas un
            avis juridique.
          </div>
        )}

        <div className="space-y-6 [&_a]:underline [&_h2]:mt-8 [&_h2]:text-xl [&_h2]:font-extrabold [&_li]:ml-5 [&_li]:list-disc [&_ul]:space-y-1.5">
          {children}
        </div>
      </main>

      <PiedDePage />
    </div>
  );
}

/** Marqueur visible pour tout ce qui reste à renseigner. */
export function ACompleter({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded bg-soleil/30 px-1.5 py-0.5 font-bold text-encre">
      [{children}]
    </span>
  );
}
