import Link from "next/link";
import { seDeconnecter } from "@/app/connexion/actions";

const LIEN_NAV =
  "inline-flex min-h-11 items-center font-bold hover:underline";

/** Bandeau commun aux écrans élève connectés. */
export function EnteteEleve() {
  return (
    <header className="flex flex-wrap items-center justify-between gap-4 py-5">
      <Link href="/tableau-de-bord" className="text-encre no-underline">
        <span className="text-[1.4rem] leading-none font-black tracking-tight">
          Admissible<span className="text-primaire">.</span>
        </span>
      </Link>
      {/* §3 : les élèves réviseront majoritairement au téléphone. Chaque entrée
          garde une zone tactile d'au moins 44 px de haut — un lien de texte nu
          en fait 20 et se rate au pouce. */}
      <nav className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
        <Link href="/entrainement" className={LIEN_NAV}>
          M&apos;entraîner
        </Link>
        <Link href="/tableau-de-bord" className={LIEN_NAV}>
          Ma progression
        </Link>
        <Link href="/compte" className={`${LIEN_NAV} font-normal`}>
          Mon compte
        </Link>
        <form action={seDeconnecter} className="flex">
          <button type="submit" className={`${LIEN_NAV} cursor-pointer font-normal`}>
            Se déconnecter
          </button>
        </form>
      </nav>
    </header>
  );
}
