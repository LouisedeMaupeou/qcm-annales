import Link from "next/link";
import { exigerStaff } from "@/lib/admin";
import { listerEpreuvesImportees } from "@/lib/epreuves-importees";

export const dynamic = "force-dynamic";

/**
 * Épreuves importées (§3).
 *
 * L'import dit ce qu'il a écrit et la file de relecture montre ce qui reste à
 * trancher ; une fois validée, une question quittait la file et devenait
 * introuvable. Cet écran la retrouve par son épreuve, et montre au passage ce
 * qu'aucun autre ne montrait : deux imports successifs rangés sous le même
 * identifiant, ou des questions sans énoncé parce qu'elles n'existent qu'en
 * image.
 */

const jour = (iso: string) =>
  iso
    ? new Date(iso).toLocaleDateString("fr-FR", {
        day: "numeric",
        month: "short",
        year: "numeric",
      })
    : "—";

export default async function EpreuvesImportees() {
  await exigerStaff();
  const epreuves = await listerEpreuvesImportees();

  const total = epreuves.reduce((s, e) => s + e.total, 0);
  const enRelecture = epreuves.reduce((s, e) => s + e.enRelecture, 0);

  return (
    <>
      <h1 className="mb-2 text-3xl font-black">Épreuves importées</h1>
      <p className="mb-8 max-w-[70ch]">
        Les questions de concours blancs entrées en banque, par épreuve. Elles
        ne sont jamais servies à l&apos;entraînement libre : seules les sessions
        de la prépa les distribuent. {total} question{total > 1 ? "s" : ""} au
        total, dont {enRelecture} encore en relecture.
      </p>

      {epreuves.length === 0 ? (
        <p className="rounded-carte border border-dashed border-ligne p-8 text-center">
          Aucune épreuve importée pour le moment.
        </p>
      ) : (
        <ul className="space-y-3">
          {epreuves.map((e) => {
            // Deux dates d'import éloignées sous un même identifiant : soit
            // une reprise, soit deux sujets différents rangés au même endroit.
            const deuxGenerations =
              e.premierImport.slice(0, 10) !== e.dernierImport.slice(0, 10);

            return (
              <li key={e.epreuveIdExterne}>
                <Link
                  href={`/admin/epreuves-importees/${encodeURIComponent(e.epreuveIdExterne)}`}
                  className="block rounded-carte border border-ligne p-5 no-underline transition hover:border-primaire"
                >
                  <div className="mb-2 flex flex-wrap items-baseline justify-between gap-3">
                    <h2 className="text-lg font-extrabold text-encre">
                      {e.concours} — {e.matiere}
                      {e.session && (
                        <span className="ml-2 font-bold opacity-60">{e.session}</span>
                      )}
                    </h2>
                    <code className="rounded-full bg-fond-doux px-2.5 py-0.5 text-[0.75rem] font-bold">
                      {e.epreuveIdExterne}
                    </code>
                  </div>

                  <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 text-sm">
                    <span className="font-bold text-encre">
                      {e.total} question{e.total > 1 ? "s" : ""}
                    </span>
                    {e.publiees > 0 && (
                      <span className="text-positif">{e.publiees} validée{e.publiees > 1 ? "s" : ""}</span>
                    )}
                    {e.enRelecture > 0 && (
                      <span className="font-bold text-negatif">
                        {e.enRelecture} en relecture
                      </span>
                    )}
                    {e.avecFigure > 0 && (
                      <span className="opacity-70">{e.avecFigure} avec figure</span>
                    )}
                    <span className="opacity-60">importée le {jour(e.premierImport)}</span>
                  </div>

                  {e.sansEnonce > 0 && (
                    <p className="mt-2.5 rounded-[10px] bg-soleil/15 p-2.5 text-[0.85rem]">
                      {e.sansEnonce} question{e.sansEnonce > 1 ? "s" : ""} sans énoncé
                      texte : elle{e.sansEnonce > 1 ? "s n'existent" : " n'existe"} qu&apos;en
                      image, et reste{e.sansEnonce > 1 ? "nt" : ""} donc illisible
                      {e.sansEnonce > 1 ? "s" : ""} hors affichage.
                    </p>
                  )}

                  {deuxGenerations && (
                    <p className="mt-2.5 rounded-[10px] bg-soleil/15 p-2.5 text-[0.85rem]">
                      Deux imports sous le même identifiant, le {jour(e.premierImport)}{" "}
                      et le {jour(e.dernierImport)}. À vérifier : reprise du même
                      sujet, ou deux sujets distincts rangés au même endroit ?
                    </p>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
