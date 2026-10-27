import Link from "next/link";
import { exigerStaff } from "@/lib/admin";
import { seDeconnecter } from "@/app/connexion/actions";

export const dynamic = "force-dynamic";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { role } = await exigerStaff();

  return (
    <div className="flex min-h-full flex-1 flex-col bg-white">
      <header className="border-b border-ligne">
        <div className="mx-auto flex max-w-[1100px] flex-wrap items-center justify-between gap-4 px-[22px] py-4">
          <div className="flex items-center gap-6">
            <Link href="/admin" className="text-encre no-underline">
              <span className="text-[1.2rem] leading-none font-black tracking-tight">
                Admissible<span className="text-primaire">.</span>
              </span>
              <small className="block text-[0.7rem] font-bold tracking-wider">
                back-office
              </small>
            </Link>
            <nav className="flex flex-wrap gap-4 text-sm font-bold">
              <Link href="/admin/annales" className="hover:text-primaire">
                Annales
              </Link>
              <Link href="/admin/relecture" className="hover:text-primaire">
                Relecture
              </Link>
              {/* Module concours blancs, §5 : la section Prépa porte les
                  listes d'élèves de la prépa — hors périmètre du contributeur,
                  qui ne fait que relire du contenu. */}
              {(role === "admin" || role === "responsable_prepa") && (
                <Link href="/admin/prepa" className="hover:text-primaire">
                  Prépa
                </Link>
              )}
              {/* §4 : le contributeur ne voit que le contenu. Les fiches
                  élèves et le pilotage portent des données personnelles de
                  mineurs, les barèmes engagent la note affichée. */}
              {role === "admin" && (
                <>
                  <Link href="/admin/eleves" className="hover:text-primaire">
                    Élèves
                  </Link>
                  <Link href="/admin/pilotage" className="hover:text-primaire">
                    Pilotage
                  </Link>
                  <Link href="/admin/baremes" className="hover:text-primaire">
                    Barèmes
                  </Link>
                </>
              )}
            </nav>
          </div>
          <div className="flex items-center gap-4 text-sm">
            <span className="rounded-full bg-fond-doux px-3 py-1 font-bold">
              {role}
            </span>
            <form action={seDeconnecter}>
              <button type="submit" className="cursor-pointer hover:underline">
                Se déconnecter
              </button>
            </form>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[1100px] flex-1 px-[22px] py-8">
        {children}
      </main>
    </div>
  );
}
