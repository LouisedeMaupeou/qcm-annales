import Link from "next/link";
import { seDeconnecter } from "@/app/connexion/actions";

/** Bandeau commun aux écrans élève connectés. */
export function EnteteEleve() {
  return (
    <header className="flex flex-wrap items-center justify-between gap-4 py-5">
      <Link href="/tableau-de-bord" className="text-encre no-underline">
        <span className="text-[1.4rem] leading-none font-black tracking-tight">
          Admissible<span className="text-primaire">.</span>
        </span>
      </Link>
      <nav className="flex flex-wrap items-center gap-4 text-sm">
        <Link href="/entrainement" className="font-bold hover:underline">
          M&apos;entraîner
        </Link>
        <Link href="/tableau-de-bord" className="font-bold hover:underline">
          Ma progression
        </Link>
        <Link href="/compte" className="hover:underline">
          Mon compte
        </Link>
        <form action={seDeconnecter}>
          <button type="submit" className="cursor-pointer hover:underline">
            Se déconnecter
          </button>
        </form>
      </nav>
    </header>
  );
}
