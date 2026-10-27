import Link from "next/link";
import { exigerPrepa } from "@/lib/admin";
import { chargerSessions } from "@/lib/sessions-cb";
import { FormulaireSession } from "./formulaire-session";

export const dynamic = "force-dynamic";

const LIBELLES: Record<string, string> = {
  preparation: "en préparation",
  ouverte: "ouverte",
  correction: "en correction",
  cloturee: "clôturée",
};

/** §5.2 : création d'une session, puis ajout de ses épreuves. */
export default async function Sessions() {
  await exigerPrepa();
  const sessions = await chargerSessions();

  return (
    <>
      <p className="mb-2 text-sm">
        <Link href="/admin/prepa" className="hover:underline">
          ← Prépa
        </Link>
      </p>
      <h1 className="mb-2 text-3xl font-black">Sessions de concours blancs</h1>
      <p className="mb-8 max-w-[70ch]">
        Une session regroupe les épreuves blanches d&apos;une même campagne
        (« Toussaint 2026 ») et sert d&apos;unité au bilan. Les questions
        d&apos;une épreuve sont fixes et ordonnées — jamais tirées au sort.
      </p>

      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <section>
          {sessions.length === 0 ? (
            <p className="rounded-carte border border-dashed border-ligne p-8 text-center">
              Aucune session. Crée la première pour y placer des épreuves.
            </p>
          ) : (
            <ul className="space-y-3">
              {sessions.map((s) => (
                <li key={s.id}>
                  <Link
                    href={`/admin/prepa/sessions/${s.id}`}
                    className="block rounded-carte border border-ligne p-5 no-underline transition hover:border-primaire"
                  >
                    <div className="mb-1 flex flex-wrap items-center gap-2">
                      <span className="font-extrabold text-encre">{s.nom}</span>
                      <span className="rounded-full bg-fond-doux px-2.5 py-0.5 text-[0.75rem] font-bold">
                        {LIBELLES[s.statut]}
                      </span>
                    </div>
                    <p className="text-sm">
                      {s.nbEpreuves} épreuve{s.nbEpreuves > 1 ? "s" : ""}
                      {s.nbEpreuves > 0 && ` · ${s.nbPubliees} publiée${s.nbPubliees > 1 ? "s" : ""}`}
                    </p>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <aside>
          <FormulaireSession />
        </aside>
      </div>
    </>
  );
}
