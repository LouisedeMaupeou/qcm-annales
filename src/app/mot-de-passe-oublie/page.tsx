import type { Metadata } from "next";
import Link from "next/link";
import { PiedDePage } from "@/components/pied-de-page";
import { FormulaireOubli } from "./formulaire";

export const metadata: Metadata = {
  title: "Mot de passe oublié — Admissible",
};

export default function MotDePasseOublie() {
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
        <h1 className="mb-3 text-[clamp(1.8rem,4vw,2.4rem)] font-black">
          Mot de passe oublié
        </h1>
        <p className="mb-6">
          Indique ton adresse email : nous t&apos;enverrons un lien pour en
          choisir un nouveau.
        </p>
        <FormulaireOubli />
      </main>

      <PiedDePage />
    </div>
  );
}
