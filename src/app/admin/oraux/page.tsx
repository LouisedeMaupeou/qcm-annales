import Link from "next/link";
import { exigerOraux } from "@/lib/admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { chargerEpreuvesOrales } from "@/lib/oraux-donnees";
import { FormulaireEpreuveOrale } from "./formulaire-epreuve";

export const dynamic = "force-dynamic";

/** §5.5 : section Oraux — choisir une épreuve, puis chercher un élève. */
export default async function Oraux() {
  const { role } = await exigerOraux();
  const peutConfigurer = role === "admin" || role === "responsable_prepa";

  const admin = createAdminClient();
  const [epreuves, { data: sessions }, { data: concours }] = await Promise.all([
    chargerEpreuvesOrales(),
    admin.from("sessions_cb").select("id, nom").order("created_at", { ascending: false }),
    admin.from("concours").select("id, nom").eq("actif", true).order("nom"),
  ]);

  return (
    <>
      <h1 className="mb-2 text-3xl font-black">Oraux</h1>
      <p className="mb-8 max-w-[70ch]">
        Entretiens de motivation et oraux de synthèse des concours blancs.
        Choisis une épreuve, cherche l&apos;élève, remplis sa grille. Ta note
        et ton appréciation alimentent son bilan de session.
      </p>

      {epreuves.length === 0 ? (
        <p className="mb-8 rounded-carte border border-dashed border-ligne p-8 text-center">
          Aucune épreuve orale n&apos;est encore ouverte.
        </p>
      ) : (
        <ul className="mb-8 space-y-3">
          {epreuves.map((e) => (
            <li key={e.id}>
              <Link
                href={`/admin/oraux/${e.id}`}
                className="block rounded-carte border border-ligne p-5 no-underline transition hover:border-primaire"
              >
                <span className="font-extrabold text-encre">
                  {e.concours} — {e.nom}
                </span>
                <span className="block text-sm opacity-75">
                  {e.session} · {e.criteres.length} critères ·{" "}
                  {e.nbEvaluations} évaluation{e.nbEvaluations > 1 ? "s" : ""}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {peutConfigurer && (
        <FormulaireEpreuveOrale
          sessions={(sessions ?? []).map((s) => ({ id: s.id as string, nom: s.nom as string }))}
          concours={(concours ?? []).map((c) => ({ id: c.id as string, nom: c.nom as string }))}
        />
      )}
    </>
  );
}
