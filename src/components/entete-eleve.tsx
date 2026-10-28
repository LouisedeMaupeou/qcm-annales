import Link from "next/link";
import { seDeconnecter } from "@/app/connexion/actions";
import { createClient } from "@/lib/supabase/server";

const LIEN_NAV =
  "inline-flex min-h-11 items-center font-bold hover:underline";

/** Bandeau commun aux écrans élève connectés. */
export async function EnteteEleve() {
  // Un membre du back-office (admin/contributeur) peut se retrouver sur l'espace
  // élève ; on lui offre un accès direct à l'administration, invisible pour un
  // élève ordinaire.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  let estStaff = false;
  // Un élève rattaché à une cohorte de la prépa a un onglet de plus : les
  // concours blancs ne concernent pas les internautes inscrits librement
  // (module concours blancs, §4.2).
  let deLaPrepa = false;
  if (user) {
    const { data: profil } = await supabase
      .from("users")
      .select("role, cohorte_id")
      .eq("id", user.id)
      .single();
    estStaff = profil?.role === "admin" || profil?.role === "contributeur";
    deLaPrepa = Boolean(profil?.cohorte_id);
  }

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
        {estStaff && (
          <Link
            href="/admin"
            className="inline-flex min-h-11 items-center rounded-full bg-encre px-4 font-extrabold text-white no-underline hover:bg-primaire-fonce"
          >
            Administration
          </Link>
        )}
        <Link href="/entrainement" className={LIEN_NAV}>
          Annales
        </Link>
        {deLaPrepa && (
          <Link href="/concours-blancs" className={LIEN_NAV}>
            Mes concours blancs
          </Link>
        )}
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
