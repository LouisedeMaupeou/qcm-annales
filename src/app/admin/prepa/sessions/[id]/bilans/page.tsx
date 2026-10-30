import Link from "next/link";
import { notFound } from "next/navigation";
import { exigerPrepa } from "@/lib/admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { elevesDeLaSession } from "@/lib/bilans-generation";
import { genererBilans } from "@/app/admin/prepa/bilans/actions";

export const dynamic = "force-dynamic";

const ETATS: Record<string, { libelle: string; classe: string }> = {
  genere: { libelle: "généré", classe: "bg-ligne text-encre" },
  en_relecture: { libelle: "en relecture", classe: "bg-soleil/25 text-encre" },
  valide: { libelle: "validé", classe: "bg-primaire/10 text-primaire-fonce" },
  envoye: { libelle: "envoyé", classe: "bg-positif/15 text-positif" },
};

/** §5.4 : génération, relecture, validation, envoi — vue d'ensemble. */
export default async function BilansDeLaSession({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await exigerPrepa();
  const { id } = await params;

  const admin = createAdminClient();
  const [{ data: session }, eleves, { data: bilans }, { data: passages }] =
    await Promise.all([
      admin.from("sessions_cb").select("id, nom").eq("id", id).maybeSingle(),
      elevesDeLaSession(id),
      admin.from("bilans").select("id, user_id, statut").eq("session_cb_id", id),
      admin
        .from("passages")
        .select("user_id, statut, epreuves_cb!inner(session_cb_id)")
        .eq("epreuves_cb.session_cb_id", id),
    ]);

  if (!session) notFound();

  const parEleve = new Map((bilans ?? []).map((b) => [b.user_id as string, b]));
  const aCorriger = new Map<string, number>();
  for (const p of passages ?? []) {
    if (p.statut !== "remis") continue;
    const u = p.user_id as string;
    aCorriger.set(u, (aCorriger.get(u) ?? 0) + 1);
  }

  return (
    <>
      <p className="mb-2 text-sm">
        <Link href={`/admin/prepa/sessions/${id}`} className="hover:underline">
          ← {session.nom}
        </Link>
      </p>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-3xl font-black">Bilans — {session.nom}</h1>
        <form action={genererBilans}>
          <input type="hidden" name="sessionId" value={id} />
          <button
            type="submit"
            className="cursor-pointer rounded-full bg-primaire px-7 py-3 font-extrabold text-white transition hover:bg-primaire-fonce"
          >
            Générer les bilans manquants
          </button>
        </form>
      </div>

      <p className="mb-6 max-w-[70ch]">
        Un bilan par élève. Les chiffres sont recalculés à chaque ouverture
        depuis les copies : seuls les textes que vous écrivez sont conservés.
        Une copie encore en correction empêche l&apos;envoi.
      </p>

      {eleves.length === 0 ? (
        <p className="rounded-carte border border-dashed border-ligne p-8 text-center">
          Aucun élève : les épreuves de cette session n&apos;ont pas de cohorte
          assignée.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-carte border border-ligne">
          <table className="w-full border-collapse text-[0.9rem]">
            <thead>
              <tr className="bg-fond-doux text-left">
                <th className="px-4 py-3 font-extrabold text-encre">Élève</th>
                <th className="px-4 py-3 font-extrabold text-encre">Bilan</th>
                <th className="px-4 py-3 font-extrabold text-encre">Correction</th>
              </tr>
            </thead>
            <tbody>
              {eleves.map((e) => {
                const bilan = parEleve.get(e.id as string);
                const reste = aCorriger.get(e.id as string) ?? 0;
                const etat = bilan ? ETATS[bilan.statut as string] : null;
                return (
                  <tr key={e.id as string} className="border-t border-ligne">
                    <td className="px-4 py-3">
                      {bilan ? (
                        <Link
                          href={`/admin/prepa/bilans/${bilan.id}`}
                          className="font-bold text-encre no-underline hover:text-primaire"
                        >
                          {e.prenom as string} {e.nom as string}
                        </Link>
                      ) : (
                        <span className="font-bold text-encre">
                          {e.prenom as string} {e.nom as string}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {etat ? (
                        <span
                          className={`rounded-full px-2.5 py-0.5 text-[0.75rem] font-bold ${etat.classe}`}
                        >
                          {etat.libelle}
                        </span>
                      ) : (
                        <span className="opacity-60">pas encore généré</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {reste > 0 ? (
                        <span className="font-bold text-negatif">
                          {reste} copie{reste > 1 ? "s" : ""} à corriger
                        </span>
                      ) : (
                        "à jour"
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
