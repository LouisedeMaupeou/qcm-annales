import Link from "next/link";
import { exigerPrepa } from "@/lib/admin";
import { chargerCohortes } from "@/lib/cohortes";
import { FormulaireCohorte } from "./formulaire-cohorte";

export const dynamic = "force-dynamic";

/** §5.1 : CRUD cohortes et vue des rattachés avec statut d'invitation. */
export default async function SectionPrepa() {
  await exigerPrepa();
  const cohortes = await chargerCohortes();

  const total = cohortes.reduce((s, c) => s + c.nbEleves, 0);
  const enAttente = cohortes.reduce((s, c) => s + c.nbEnAttente, 0);

  return (
    <>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-3xl font-black">Prépa</h1>
        <nav className="flex gap-4 text-sm font-bold">
          <Link href="/admin/prepa/sessions" className="text-primaire hover:underline">
            Sessions de concours blancs
          </Link>
          <Link href="/admin/prepa/import" className="text-primaire hover:underline">
            Import de questions
          </Link>
        </nav>
      </div>
      <p className="mb-8 max-w-[70ch]">
        Cohortes de la prépa Parkours. Un élève appartient à une cohorte au
        plus ; rattaché, il garde son compte et son accès à l&apos;entraînement
        libre.
      </p>

      <div className="mb-8 grid gap-4 sm:grid-cols-3">
        <Compteur valeur={cohortes.length} libelle="cohortes" />
        <Compteur valeur={total} libelle="élèves rattachés" />
        <Compteur
          valeur={enAttente}
          libelle="invitations en attente"
          alerte={enAttente > 0}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <section>
          {cohortes.length === 0 ? (
            <p className="rounded-carte border border-dashed border-ligne p-8 text-center">
              Aucune cohorte. Crée la première pour importer sa liste
              d&apos;élèves.
            </p>
          ) : (
            <ul className="space-y-3">
              {cohortes.map((c) => (
                <li key={c.id}>
                  <Link
                    href={`/admin/prepa/${c.id}`}
                    className="block rounded-carte border border-ligne p-5 no-underline transition hover:border-primaire"
                  >
                    <div className="mb-1 flex flex-wrap items-center gap-2">
                      <span className="font-extrabold text-encre">{c.nom}</span>
                      {!c.active && (
                        <span className="rounded-full bg-ligne px-2.5 py-0.5 text-[0.75rem] font-bold">
                          archivée
                        </span>
                      )}
                      {c.nbEnAttente > 0 && (
                        <span className="rounded-full bg-soleil/20 px-2.5 py-0.5 text-[0.75rem] font-bold">
                          {c.nbEnAttente} invitation
                          {c.nbEnAttente > 1 ? "s" : ""} en attente
                        </span>
                      )}
                    </div>
                    <p className="text-sm">
                      {c.filiere === "commerce" ? "Commerce" : "Ingénieurs"} ·{" "}
                      {c.millesime} ·{" "}
                      <span className="tabular-nums">{c.nbEleves}</span> élève
                      {c.nbEleves > 1 ? "s" : ""}
                    </p>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <aside>
          <FormulaireCohorte />
        </aside>
      </div>
    </>
  );
}

function Compteur({
  valeur,
  libelle,
  alerte = false,
}: {
  valeur: number;
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
