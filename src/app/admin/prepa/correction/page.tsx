import Link from "next/link";
import { exigerPrepa } from "@/lib/admin";
import { chargerFileCorrection } from "@/lib/file-correction";
import { FormulaireNote } from "./formulaire-note";

export const dynamic = "force-dynamic";

/** §5.3 : file réservée aux questions `auto_correction = NON`. */
export default async function FileCorrection() {
  await exigerPrepa();
  const copies = await chargerFileCorrection();

  const total = copies.reduce((s, c) => s + c.reponses.length, 0);

  return (
    <>
      <p className="mb-2 text-sm">
        <Link href="/admin/prepa" className="hover:underline">
          ← Prépa
        </Link>
      </p>
      <h1 className="mb-2 text-3xl font-black">Correction manuelle</h1>
      <p className="mb-8 max-w-[70ch]">
        Les questions à choix sont corrigées automatiquement à la remise. Ne
        restent ici que les réponses rédigées, qui demandent un œil. Tant
        qu&apos;une copie attend une note, elle n&apos;est pas « corrigée » et
        le bilan de session de l&apos;élève n&apos;est pas générable.
      </p>

      {copies.length === 0 ? (
        <p className="rounded-carte border border-dashed border-ligne p-8 text-center">
          Rien à corriger. Toutes les copies remises sont à jour.
        </p>
      ) : (
        <>
          <p className="mb-5 text-sm">
            {total} réponse{total > 1 ? "s" : ""} à noter, sur {copies.length} copie
            {copies.length > 1 ? "s" : ""}.
          </p>

          <div className="space-y-8">
            {copies.map((copie) => (
              <section key={copie.passageId} className="rounded-carte border border-ligne p-5">
                <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
                  <h2 className="text-lg font-extrabold text-encre">{copie.eleve}</h2>
                  <p className="text-sm opacity-75">
                    {copie.epreuve}
                    {copie.remisLe &&
                      ` · remise le ${new Date(copie.remisLe).toLocaleString("fr-FR", {
                        dateStyle: "short",
                        timeStyle: "short",
                      })}`}
                  </p>
                </div>

                <ul className="space-y-5">
                  {copie.reponses.map((r) => (
                    <li
                      key={r.questionId}
                      className="rounded-[14px] border border-ligne p-4"
                    >
                      {r.enonceCommun && (
                        <p className="mb-2 rounded-[10px] bg-fond-doux p-3 text-[0.9rem] whitespace-pre-line">
                          {r.enonceCommun}
                        </p>
                      )}
                      <p className="mb-3 font-bold text-encre whitespace-pre-line">
                        {r.enonce}
                      </p>

                      <div className="mb-3 rounded-[10px] bg-fond-doux/70 p-3">
                        <p className="mb-1 text-[0.7rem] font-bold tracking-[.08em] uppercase opacity-60">
                          Réponse de l&apos;élève
                        </p>
                        {r.texte ? (
                          <p className="whitespace-pre-line">{r.texte}</p>
                        ) : (
                          <p className="opacity-70">
                            {r.abstention
                              ? "A explicitement choisi de ne pas répondre."
                              : "Copie blanche sur cette question."}
                          </p>
                        )}
                      </div>

                      <FormulaireNote
                        passageId={r.passageId}
                        questionId={r.questionId}
                        maximum={r.maximum}
                        pointsActuels={r.pointsActuels}
                        annotation={r.annotation}
                      />
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        </>
      )}
    </>
  );
}
