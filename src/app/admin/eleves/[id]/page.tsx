import Link from "next/link";
import { notFound } from "next/navigation";
import { exigerAdmin } from "@/lib/admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { ageAns } from "@/lib/validation";
import { ActionsEleve } from "./actions-eleve";

export const dynamic = "force-dynamic";

/** §6.2 : fiche élève — coordonnées, consentements horodatés, historique. */
export default async function FicheEleve({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await exigerAdmin();
  const { id } = await params;
  const admin = createAdminClient();

  const { data: eleve } = await admin
    .from("users")
    .select(
      "id, email, nom, prenom, date_naissance, ville, etablissement, consent_marketing, consent_marketing_date, cgu_acceptees_date, email_verifie, actif, suspendu, created_at, role",
    )
    .eq("id", id)
    .maybeSingle();

  if (!eleve || eleve.role !== "eleve") notFound();

  const [{ data: vises }, { data: sessions }, { data: signalements }] =
    await Promise.all([
      admin.from("user_concours_vises").select("concours(nom)").eq("user_id", id),
      admin
        .from("sessions")
        .select(
          "id, score_normalise, points, points_max, nb_questions, nb_correctes, completed_at, concours(nom), epreuves(nom)",
        )
        .eq("user_id", id)
        .not("completed_at", "is", null)
        .order("completed_at", { ascending: false })
        .limit(30),
      admin
        .from("signalements")
        .select("id, motif, created_at, traite")
        .eq("user_id", id)
        .order("created_at", { ascending: false }),
    ]);

  const concours = (vises ?? [])
    .map((v) => (v.concours as unknown as { nom: string } | null)?.nom)
    .filter(Boolean);

  const jouees = sessions ?? [];
  const moyenne =
    jouees.length > 0
      ? jouees.reduce((s, x) => s + Number(x.score_normalise ?? 0), 0) / jouees.length
      : null;

  return (
    <>
      <p className="mb-2 text-sm">
        <Link href="/admin/eleves" className="hover:underline">
          ← Élèves
        </Link>
      </p>
      <h1 className="mb-1 text-3xl font-black">
        {eleve.prenom} {eleve.nom}
      </h1>
      <p className="mb-8 text-sm">
        {eleve.email} · inscrit le{" "}
        {new Date(eleve.created_at).toLocaleDateString("fr-FR")}
      </p>

      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <div className="space-y-6">
          <Section titre="Coordonnées">
            <dl className="space-y-2 text-[0.95rem]">
              <Ligne libelle="Date de naissance">
                {new Date(eleve.date_naissance).toLocaleDateString("fr-FR")} (
                {ageAns(eleve.date_naissance)} ans)
              </Ligne>
              <Ligne libelle="Ville">{eleve.ville ?? "—"}</Ligne>
              <Ligne libelle="Établissement">{eleve.etablissement ?? "—"}</Ligne>
              <Ligne libelle="Concours visés">
                {concours.join(", ") || "aucun"}
              </Ligne>
            </dl>
          </Section>

          {/* §8.1 : consentements horodatés, tracés séparément. */}
          <Section titre="Consentements">
            <dl className="space-y-2 text-[0.95rem]">
              <Ligne libelle="CGU et confidentialité">
                {eleve.cgu_acceptees_date
                  ? `acceptées le ${new Date(eleve.cgu_acceptees_date).toLocaleString("fr-FR")}`
                  : "non enregistrées"}
              </Ligne>
              <Ligne libelle="Communications commerciales">
                {eleve.consent_marketing
                  ? `acceptées le ${eleve.consent_marketing_date ? new Date(eleve.consent_marketing_date).toLocaleString("fr-FR") : "date inconnue"}`
                  : "refusées"}
              </Ligne>
              <Ligne libelle="Adresse email confirmée">
                {eleve.email_verifie ? "oui" : "non"}
              </Ligne>
            </dl>
          </Section>

          <Section titre={`Historique (${jouees.length} session${jouees.length > 1 ? "s" : ""})`}>
            {jouees.length === 0 ? (
              <p className="text-[0.95rem]">Aucune session jouée.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-[0.9rem]">
                  <thead>
                    <tr className="border-b border-ligne text-left">
                      <th className="py-2 font-extrabold text-encre">Épreuve</th>
                      <th className="py-2 font-extrabold text-encre">Score</th>
                      <th className="py-2 font-extrabold text-encre">Points</th>
                      <th className="py-2 font-extrabold text-encre">Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {jouees.map((s) => (
                      <tr key={s.id} className="border-b border-ligne last:border-0">
                        <td className="py-2">
                          {(s.epreuves as unknown as { nom: string } | null)?.nom}
                          <span className="block text-[0.8rem] opacity-70">
                            {(s.concours as unknown as { nom: string } | null)?.nom}
                          </span>
                        </td>
                        <td className="py-2 tabular-nums">
                          {Math.round(Number(s.score_normalise ?? 0) * 100)} %
                        </td>
                        <td className="py-2 tabular-nums">
                          {Number(s.points ?? 0)} / {Number(s.points_max ?? 0)}
                        </td>
                        <td className="py-2">
                          {new Date(s.completed_at as string).toLocaleDateString("fr-FR")}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Section>

          {(signalements ?? []).length > 0 && (
            <Section titre={`Signalements émis (${signalements!.length})`}>
              <ul className="space-y-2 text-[0.9rem]">
                {signalements!.map((s) => (
                  <li key={s.id} className="border-b border-ligne pb-2 last:border-0">
                    « {s.motif} »
                    <span className="block text-[0.8rem] opacity-70">
                      {new Date(s.created_at).toLocaleDateString("fr-FR")} ·{" "}
                      {s.traite ? "traité" : "en attente"}
                    </span>
                  </li>
                ))}
              </ul>
            </Section>
          )}
        </div>

        <aside className="space-y-4">
          <div className="rounded-carte border border-ligne p-5">
            <h2 className="mb-3 text-lg font-extrabold">État</h2>
            <p className="mb-1 text-[0.95rem]">
              {eleve.suspendu
                ? "Compte désactivé par un administrateur."
                : eleve.actif
                  ? "Compte actif."
                  : "Compte inactif : adresse email pas encore confirmée."}
            </p>
            {moyenne !== null && (
              <p className="mt-3 text-[0.95rem]">
                Score moyen :{" "}
                <strong className="text-encre">{Math.round(moyenne * 100)} %</strong>
              </p>
            )}
          </div>

          <ActionsEleve
            id={eleve.id}
            email={eleve.email}
            suspendu={eleve.suspendu}
          />
        </aside>
      </div>
    </>
  );
}

function Section({
  titre,
  children,
}: {
  titre: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-carte border border-ligne p-5">
      <h2 className="mb-3 text-lg font-extrabold">{titre}</h2>
      {children}
    </section>
  );
}

function Ligne({
  libelle,
  children,
}: {
  libelle: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap gap-x-2">
      <dt className="font-bold text-encre">{libelle} :</dt>
      <dd>{children}</dd>
    </div>
  );
}
