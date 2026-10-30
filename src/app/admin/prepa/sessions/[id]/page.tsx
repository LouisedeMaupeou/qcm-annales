import Link from "next/link";
import { notFound } from "next/navigation";
import { exigerPrepa } from "@/lib/admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { chargerCohortes } from "@/lib/cohortes";
import { chargerEpreuves, epreuvesDisponibles } from "@/lib/sessions-cb";
import { changerStatutSession } from "../actions";
import { FormulaireAjout } from "./formulaire-ajout";
import { CarteEpreuve } from "./carte-epreuve";

export const dynamic = "force-dynamic";

const STATUTS = [
  { cle: "preparation", libelle: "En préparation" },
  { cle: "ouverte", libelle: "Ouverte" },
  { cle: "correction", libelle: "En correction" },
  { cle: "cloturee", libelle: "Clôturée" },
] as const;

export default async function FicheSession({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await exigerPrepa();
  const { id } = await params;

  const admin = createAdminClient();
  const [{ data: session }, epreuves, disponibles, cohortes] = await Promise.all([
    admin.from("sessions_cb").select("id, nom, statut").eq("id", id).maybeSingle(),
    chargerEpreuves(id),
    epreuvesDisponibles(id),
    chargerCohortes(),
  ]);

  if (!session) notFound();

  const total = epreuves.reduce(
    (s, e) => ({
      questions: s.questions + e.nbQuestions,
      relecture: s.relecture + e.nbEnRelecture,
      remis: s.remis + e.suivi.remis + e.suivi.corriges,
      attendus: s.attendus + e.suivi.attendus,
    }),
    { questions: 0, relecture: 0, remis: 0, attendus: 0 },
  );

  return (
    <>
      <p className="mb-2 text-sm">
        <Link href="/admin/prepa/sessions" className="hover:underline">
          ← Sessions
        </Link>
      </p>

      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-baseline gap-4">
          <h1 className="text-3xl font-black">{session.nom}</h1>
          <Link
            href={`/admin/prepa/sessions/${id}/bilans`}
            className="text-sm font-bold text-primaire hover:underline"
          >
            Bilans de la session →
          </Link>
          <a
            href={`/admin/prepa/sessions/${id}/export`}
            className="text-sm font-bold text-primaire no-underline hover:underline"
          >
            Export XLSX des résultats
          </a>
        </div>
        <form action={changerStatutSession} className="flex items-center gap-2 text-sm">
          <input type="hidden" name="sessionId" value={id} />
          <label htmlFor="statut" className="font-bold text-encre">
            Statut
          </label>
          <select
            id="statut"
            name="statut"
            defaultValue={session.statut}
            className="rounded-[14px] border border-ligne bg-white px-4 py-2"
          >
            {STATUTS.map((s) => (
              <option key={s.cle} value={s.cle}>
                {s.libelle}
              </option>
            ))}
          </select>
          <button
            type="submit"
            className="cursor-pointer rounded-full border-2 border-primaire px-5 py-2 font-extrabold text-primaire transition hover:bg-fond-doux"
          >
            Appliquer
          </button>
        </form>
      </div>

      <div className="mb-8 grid gap-4 sm:grid-cols-4">
        <Compteur valeur={epreuves.length} libelle="épreuves" />
        <Compteur valeur={total.questions} libelle="questions" />
        <Compteur
          valeur={total.relecture}
          libelle="questions en relecture"
          alerte={total.relecture > 0}
        />
        <Compteur valeur={`${total.remis}/${total.attendus}`} libelle="copies remises" />
      </div>

      {epreuves.length === 0 ? (
        <p className="mb-8 rounded-carte border border-dashed border-ligne p-8 text-center">
          Aucune épreuve dans cette session.
        </p>
      ) : (
        <div className="mb-8 space-y-5">
          {epreuves.map((e) => (
            <CarteEpreuve
              key={e.id}
              sessionId={id}
              epreuve={e}
              cohortes={cohortes.map((c) => ({ id: c.id, nom: c.nom, nbEleves: c.nbEleves }))}
            />
          ))}
        </div>
      )}

      <FormulaireAjout sessionId={id} disponibles={disponibles} />
    </>
  );
}

function Compteur({
  valeur,
  libelle,
  alerte = false,
}: {
  valeur: number | string;
  libelle: string;
  alerte?: boolean;
}) {
  return (
    <div
      className={`rounded-carte border p-5 ${
        alerte ? "border-soleil bg-soleil/10" : "border-ligne"
      }`}
    >
      <p className="text-3xl font-black text-encre">{valeur}</p>
      <p className="text-[0.95rem]">{libelle}</p>
    </div>
  );
}
