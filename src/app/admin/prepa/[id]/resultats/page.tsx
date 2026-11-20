import Link from "next/link";
import { notFound } from "next/navigation";
import { exigerPrepa } from "@/lib/admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { resultatsDeLaCohorte } from "@/lib/resultats-cohorte";
import { genererBilans } from "../../bilans/actions";

export const dynamic = "force-dynamic";

const ETATS: Record<string, { libelle: string; classe: string }> = {
  genere: { libelle: "à relire", classe: "bg-fond-doux text-encre" },
  en_relecture: { libelle: "en relecture", classe: "bg-soleil/25 text-encre" },
  valide: { libelle: "validé", classe: "bg-primaire/10 text-primaire-fonce" },
  envoye: { libelle: "envoyé", classe: "bg-positif/15 text-positif" },
};

/**
 * Les résultats des concours blancs d'une promotion (§5.4).
 *
 * Écrits et oraux côte à côte, élève par élève : c'est ce que le bilan
 * envoie aux familles, et la seule façon de voir qu'il manque un oral avant
 * de l'envoyer. La vue par session reste disponible — elle sert quand on
 * prépare une session plutôt qu'un groupe.
 */
export default async function ResultatsDeLaCohorte({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await exigerPrepa();
  const { id } = await params;

  const admin = createAdminClient();
  const [{ data: cohorte }, sessions] = await Promise.all([
    admin.from("cohortes").select("id, nom").eq("id", id).maybeSingle(),
    resultatsDeLaCohorte(id),
  ]);
  if (!cohorte) notFound();

  return (
    <>
      <p className="mb-2 text-sm">
        <Link href={`/admin/prepa/${id}`} className="hover:underline">
          ← {cohorte.nom as string}
        </Link>
      </p>
      <h1 className="mb-2 text-3xl font-black">Résultats des concours blancs</h1>
      <p className="mb-8 max-w-[70ch]">
        Les notes sur 20 de chaque épreuve, la moyenne des écrits et la note
        d&apos;oral pondérée. Une case vide signifie que l&apos;élève n&apos;a
        pas composé ; une copie remise mais non corrigée reste sans note.
      </p>

      {sessions.length === 0 ? (
        <p className="rounded-carte border border-dashed border-ligne p-8 text-center">
          Cette promotion n&apos;est convoquée à aucune session de concours blanc.
        </p>
      ) : (
        sessions.map((s) => (
          <section key={s.sessionId} className="mb-12">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-lg font-extrabold text-encre">{s.session}</h2>
              <div className="flex flex-wrap items-center gap-3 text-sm">
                {s.nbACorriger > 0 && (
                  <Link href="/admin/prepa/correction" className="font-bold text-negatif">
                    {s.nbACorriger} copie{s.nbACorriger > 1 ? "s" : ""} à corriger
                  </Link>
                )}
                {s.eleves.some((e) => !e.bilanId) && (
                  <form action={genererBilans}>
                    <input type="hidden" name="sessionId" value={s.sessionId} />
                    <button
                      type="submit"
                      className="cursor-pointer rounded-full border-2 border-primaire px-5 py-1.5 font-bold text-primaire"
                    >
                      Générer les bilans manquants
                    </button>
                  </form>
                )}
              </div>
            </div>

            <div className="overflow-x-auto rounded-carte border border-ligne">
              <table className="w-full border-collapse text-[0.85rem]">
                <thead>
                  <tr className="bg-fond-doux text-left">
                    <th className="px-3 py-2.5 font-extrabold text-encre">Élève</th>
                    {s.epreuves.map((e) => (
                      <th key={e.id} className="px-3 py-2.5 text-center font-extrabold text-encre">
                        {e.libelle.replace(/^[A-ZÀ-Ÿ]+ \d+ /, "")}
                      </th>
                    ))}
                    <th className="px-3 py-2.5 text-center font-extrabold text-encre">
                      Moyenne écrits
                    </th>
                    {s.oraux.map((o) => (
                      <th key={o.id} className="px-3 py-2.5 text-center font-extrabold text-encre">
                        {o.nom}
                      </th>
                    ))}
                    <th className="px-3 py-2.5 text-center font-extrabold text-encre">
                      Note d&apos;oral
                    </th>
                    <th className="px-3 py-2.5 font-extrabold text-encre">Bilan</th>
                  </tr>
                </thead>
                <tbody>
                  {s.eleves.map((el) => (
                    <tr key={el.id} className="border-t border-ligne">
                      <td className="px-3 py-2.5 font-bold text-encre whitespace-nowrap">
                        {el.prenom} {el.nom}
                      </td>

                      {s.epreuves.map((e) => (
                        <td key={e.id} className="px-3 py-2.5 text-center tabular-nums">
                          {el.ecrits[e.id]?.note ?? (
                            <span className="opacity-40">
                              {el.ecrits[e.id]?.statut === "remis" ? "à corriger" : "—"}
                            </span>
                          )}
                        </td>
                      ))}

                      <td className="px-3 py-2.5 text-center font-extrabold tabular-nums">
                        {el.moyenneEcrits ?? <span className="opacity-40">—</span>}
                      </td>

                      {s.oraux.map((o) => (
                        <td key={o.id} className="px-3 py-2.5 text-center tabular-nums">
                          {el.oraux[o.id]?.note ?? (
                            <span className="opacity-40">
                              {el.oraux[o.id]?.statut === "brouillon" ? "brouillon" : "—"}
                            </span>
                          )}
                        </td>
                      ))}

                      <td className="px-3 py-2.5 text-center font-extrabold tabular-nums">
                        {el.noteOraux ?? <span className="opacity-40">—</span>}
                        {el.noteOraux !== null && !el.orauxComplets && (
                          <span className="ml-1 text-[0.72rem] font-bold text-negatif">
                            partiel
                          </span>
                        )}
                      </td>

                      <td className="px-3 py-2.5 whitespace-nowrap">
                        {el.bilanId ? (
                          <Link
                            href={`/admin/prepa/bilans/${el.bilanId}`}
                            className="font-bold text-primaire no-underline hover:underline"
                          >
                            <span
                              className={`rounded-full px-2.5 py-0.5 text-[0.75rem] font-bold ${
                                ETATS[el.bilanStatut ?? "genere"]?.classe ?? "bg-fond-doux"
                              }`}
                            >
                              {ETATS[el.bilanStatut ?? "genere"]?.libelle ?? el.bilanStatut}
                            </span>
                          </Link>
                        ) : (
                          <span className="opacity-40">aucun</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ))
      )}
    </>
  );
}
