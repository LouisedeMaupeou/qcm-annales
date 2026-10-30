import Link from "next/link";
import { exigerOraux } from "@/lib/admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { chargerEpreuvesOrales } from "@/lib/oraux-donnees";
import { ouvrirOraux } from "./actions";

export const dynamic = "force-dynamic";

const FILIERES = {
  commerce: "Écoles de commerce",
  ingenieur: "Écoles d'ingénieurs",
} as const;

/** §5.5 : section Oraux — choisir une épreuve, puis chercher un élève. */
export default async function Oraux() {
  const { role } = await exigerOraux();
  const peutOuvrir = role === "admin" || role === "responsable_prepa";

  const admin = createAdminClient();
  const [epreuves, { data: sessions }] = await Promise.all([
    chargerEpreuvesOrales(),
    admin.from("sessions_cb").select("id, nom").order("created_at", { ascending: false }),
  ]);

  const parSession = new Map<string, typeof epreuves>();
  for (const e of epreuves) {
    if (!parSession.has(e.sessionId)) parSession.set(e.sessionId, []);
    parSession.get(e.sessionId)!.push(e);
  }

  return (
    <>
      <h1 className="mb-2 text-3xl font-black">Oraux blancs</h1>
      <p className="mb-8 max-w-[70ch]">
        Choisis une épreuve, cherche l&apos;élève, remplis sa grille. Ta
        notation et tes commentaires alimentent la section « Oraux blancs » de
        son bilan de session, après les résultats des écrits.
      </p>

      {epreuves.length === 0 ? (
        <p className="mb-8 rounded-carte border border-dashed border-ligne p-8 text-center">
          Aucune épreuve orale n&apos;est ouverte.
        </p>
      ) : (
        [...parSession.entries()].map(([sessionId, liste]) => (
          <section key={sessionId} className="mb-8">
            <h2 className="mb-3 text-sm font-extrabold tracking-[.08em] text-primaire-fonce uppercase">
              {liste[0].session}
            </h2>

            {(["commerce", "ingenieur"] as const).map((filiere) => {
              const items = liste.filter((e) => e.filiere === filiere);
              if (items.length === 0) return null;
              return (
                <div key={filiere} className="mb-4">
                  <p className="mb-2 text-sm font-bold">{FILIERES[filiere]}</p>
                  <ul className="space-y-2">
                    {items.map((e) => (
                      <li key={e.id}>
                        <Link
                          href={`/admin/oraux/${e.id}`}
                          className="flex flex-wrap items-center justify-between gap-3 rounded-carte border border-ligne p-4 no-underline transition hover:border-primaire"
                        >
                          <span>
                            <span className="font-extrabold text-encre">{e.nom}</span>
                            <span className="ml-3 text-sm opacity-75">
                              {e.criteres.length} critères · /{e.maximum}
                            </span>
                          </span>
                          <span className="flex flex-wrap items-center gap-3 text-sm">
                            <span
                              className={`rounded-full px-2.5 py-0.5 text-[0.75rem] font-bold ${
                                e.ponderation > 0
                                  ? "bg-primaire/10 text-primaire-fonce"
                                  : "bg-fond-doux text-encre"
                              }`}
                            >
                              {e.ponderation > 0
                                ? `${Math.round(e.ponderation * 100)} % de la note d'oral`
                                : "hors moyenne"}
                            </span>
                            <span className="opacity-75">
                              {e.nbValidees}/{e.nbEvaluees} validée
                              {e.nbValidees > 1 ? "s" : ""}
                            </span>
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </section>
        ))
      )}

      {peutOuvrir && (sessions ?? []).length > 0 && (
        <section className="rounded-carte border border-ligne p-5">
          <h2 className="mb-1 text-lg font-extrabold">Ouvrir les oraux d&apos;une session</h2>
          <p className="mb-4 text-sm opacity-75">
            Crée les épreuves prévues par le référentiel, avec leur grille et
            leur pondération : quatre oraux pour les cohortes de commerce
            (collectif hors moyenne, personnalité 40 %, image 30 %, anglais
            30 %), l&apos;oral de personnalité seul pour les cohortes
            d&apos;ingénieurs. Relancer n&apos;ajoute que ce qui manque.
          </p>
          <form action={ouvrirOraux} className="flex flex-wrap items-end gap-3">
            <div>
              <label htmlFor="sessionId" className="mb-1.5 block text-sm font-bold text-encre">
                Session
              </label>
              <select
                id="sessionId"
                name="sessionId"
                className="rounded-[14px] border border-ligne bg-white px-4 py-2.5"
              >
                {(sessions ?? []).map((s) => (
                  <option key={s.id as string} value={s.id as string}>
                    {s.nom as string}
                  </option>
                ))}
              </select>
            </div>
            <button
              type="submit"
              className="cursor-pointer rounded-full bg-primaire px-7 py-3 font-extrabold text-white transition hover:bg-primaire-fonce"
            >
              Ouvrir les oraux
            </button>
          </form>
        </section>
      )}
    </>
  );
}
