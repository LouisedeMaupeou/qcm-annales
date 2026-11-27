import Link from "next/link";
import { notFound } from "next/navigation";
import { exigerPrepa } from "@/lib/admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { bilansDeLaCohorte, chargerMembres } from "@/lib/cohortes";

export const dynamic = "force-dynamic";

const ETATS: Record<string, { libelle: string; classe: string }> = {
  genere: { libelle: "généré", classe: "bg-ligne text-encre" },
  en_relecture: { libelle: "en relecture", classe: "bg-soleil/25 text-encre" },
  valide: { libelle: "validé", classe: "bg-primaire/10 text-primaire-fonce" },
  envoye: { libelle: "envoyé", classe: "bg-positif/15 text-positif" },
};

const date = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("fr-FR", { dateStyle: "medium" }) : null;

/**
 * Les bilans d'une cohorte, session par session.
 *
 * Demande de la responsable des prépas : retrouver les bilans depuis la
 * promotion, sans passer par la section Sessions. Chaque ligne mène à la
 * fiche, où les textes se modifient, se valident et s'envoient, et au PDF.
 */
export default async function BilansDeLaCohorte({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await exigerPrepa();
  const { id } = await params;

  const [{ data: cohorte }, membres, bilans] = await Promise.all([
    createAdminClient().from("cohortes").select("id, nom").eq("id", id).maybeSingle(),
    chargerMembres(id),
    bilansDeLaCohorte(id),
  ]);
  if (!cohorte) notFound();

  // Session par session, la plus récente d'abord (ordre de génération).
  const sessions = new Map<string, string>();
  for (const liste of bilans.values()) {
    for (const b of liste) if (!sessions.has(b.sessionId)) sessions.set(b.sessionId, b.session);
  }

  return (
    <>
      <p className="mb-2 text-sm">
        <Link href={`/admin/prepa/${id}`} className="hover:underline">
          ← {cohorte.nom}
        </Link>
      </p>
      <h1 className="mb-2 text-3xl font-black">Bilans — {cohorte.nom}</h1>
      <p className="mb-8 max-w-[70ch]">
        « Voir / modifier » ouvre la fiche du bilan : vous y relisez le bilan tel qu&apos;il
        partira, modifiez « En quelques mots » et les commentaires par épreuve, puis validez et
        envoyez aux familles.
      </p>

      {sessions.size === 0 ? (
        <p className="rounded-carte border border-dashed border-ligne p-8 text-center">
          Aucun bilan pour cette cohorte. Ils se génèrent depuis la page Bilans de chaque session.
        </p>
      ) : (
        [...sessions.entries()].map(([sessionId, nom]) => (
          <section key={sessionId} className="mb-10">
            <div className="mb-3 flex flex-wrap items-baseline justify-between gap-3">
              <h2 className="text-xl font-extrabold text-encre">{nom}</h2>
              <Link
                href={`/admin/prepa/sessions/${sessionId}/bilans`}
                className="text-sm font-bold text-primaire"
              >
                Tous les bilans de la session →
              </Link>
            </div>
            <div className="overflow-x-auto rounded-carte border border-ligne">
              <table className="w-full border-collapse text-[0.9rem]">
                <thead>
                  <tr className="bg-fond-doux text-left">
                    <th className="px-4 py-3 font-extrabold text-encre">Élève</th>
                    <th className="px-4 py-3 font-extrabold text-encre">Bilan</th>
                    <th className="px-4 py-3 font-extrabold text-encre">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {membres.map((m) => {
                    const b = (bilans.get(m.id) ?? []).find((x) => x.sessionId === sessionId);
                    const etat = b ? ETATS[b.statut] : null;
                    return (
                      <tr key={m.id} className="border-t border-ligne">
                        <td className="px-4 py-3 font-bold text-encre">
                          {m.prenom} {m.nom}
                        </td>
                        <td className="px-4 py-3">
                          {etat ? (
                            <>
                              <span
                                className={`rounded-full px-2.5 py-0.5 text-[0.75rem] font-bold ${etat.classe}`}
                              >
                                {etat.libelle}
                              </span>
                              {b?.statut === "envoye" && b.envoyeLe && (
                                <span className="ml-2 text-[0.8rem] opacity-70">
                                  le {date(b.envoyeLe)}
                                </span>
                              )}
                              {b?.detail && (
                                <span className="block text-[0.8rem] opacity-70">{b.detail}</span>
                              )}
                            </>
                          ) : (
                            <span className="opacity-60">pas de bilan pour cette session</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          {b && (
                            <div className="flex flex-wrap gap-2">
                              <Link
                                href={`/admin/prepa/bilans/${b.id}`}
                                className="rounded-full bg-primaire px-4 py-1.5 text-[0.85rem] font-bold text-white no-underline transition hover:bg-primaire-fonce"
                              >
                                Voir / modifier
                              </Link>
                              <a
                                href={`/admin/prepa/bilans/${b.id}/pdf`}
                                className="rounded-full border-2 border-primaire px-4 py-1 text-[0.85rem] font-bold text-primaire no-underline"
                              >
                                PDF
                              </a>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        ))
      )}
    </>
  );
}
