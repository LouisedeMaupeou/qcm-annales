import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { PiedDePage } from "@/components/pied-de-page";
import { createClient } from "@/lib/supabase/server";
import { seDeconnecter } from "@/app/connexion/actions";

export const metadata: Metadata = {
  title: "Mon tableau de bord — Admissible",
  robots: { index: false },
};

export const dynamic = "force-dynamic";

/**
 * Coquille du tableau de bord : le contenu réel (courbes par matière,
 * historique, chapitres à retravailler) arrive à l'étape 7 du §12.
 */
export default async function TableauDeBord({
  searchParams,
}: {
  searchParams: Promise<{ bienvenue?: string; motdepasse?: string }>;
}) {
  const { bienvenue, motdepasse } = await searchParams;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/connexion");

  // Lecture soumise à la RLS : la politique users_select_self limite au
  // propriétaire de la ligne.
  const { data: profil } = await supabase
    .from("users")
    .select("prenom, nom")
    .eq("id", user.id)
    .single();

  return (
    <div className="mx-auto flex w-full max-w-[820px] flex-1 flex-col px-[22px]">
      <header className="flex items-center justify-between gap-4 py-5">
        <Link href="/" className="text-encre no-underline">
          <span className="text-[1.4rem] leading-none font-black tracking-tight">
            Admissible<span className="text-primaire">.</span>
          </span>
        </Link>
        <nav className="flex items-center gap-4 text-sm">
          <Link href="/compte" className="font-bold hover:underline">
            Mon compte
          </Link>
          <form action={seDeconnecter}>
            <button type="submit" className="cursor-pointer hover:underline">
              Se déconnecter
            </button>
          </form>
        </nav>
      </header>

      <main className="flex-1 pb-16">
        {bienvenue && (
          <p className="mb-6 rounded-carte bg-fond-doux p-4 text-[0.95rem]">
            Ton adresse est confirmée, ton compte est actif. Bienvenue !
          </p>
        )}
        {motdepasse && (
          <p className="mb-6 rounded-carte bg-fond-doux p-4 text-[0.95rem]">
            Ton mot de passe a bien été modifié.
          </p>
        )}

        <h1 className="mb-2 text-[clamp(1.8rem,4vw,2.4rem)] font-black">
          Salut {profil?.prenom} !
        </h1>
        <p className="mb-8">Voici où tu en es.</p>

        <div className="rounded-carte border border-ligne bg-white p-8 text-center">
          <p className="mb-2 text-lg font-extrabold text-encre">
            Prêt à t&apos;entraîner ?
          </p>
          <p className="mx-auto mb-6 max-w-[48ch] text-[0.95rem]">
            Choisis ton concours et joue une session sur des annales
            officielles, avec le vrai barème.
          </p>
          <Link
            href="/entrainement"
            className="inline-flex cursor-pointer rounded-full bg-primaire px-8 py-3.5 font-extrabold text-white no-underline transition hover:bg-primaire-fonce"
          >
            Commencer une session
          </Link>
          <p className="mt-6 text-[0.85rem] opacity-70">
            Le suivi détaillé de ta progression arrive prochainement.
          </p>
        </div>
      </main>

      <PiedDePage />
    </div>
  );
}
