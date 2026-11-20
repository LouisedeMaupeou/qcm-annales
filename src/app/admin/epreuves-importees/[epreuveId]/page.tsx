import Link from "next/link";
import { notFound } from "next/navigation";
import { exigerStaff } from "@/lib/admin";
import { chargerEpreuveImportee } from "@/lib/epreuves-importees";
import { formaterMath } from "@/lib/notation-math";

export const dynamic = "force-dynamic";

/**
 * Une épreuve importée : sa liste, ou son aperçu.
 *
 * Deux lectures pour deux besoins. La liste sert à retrouver une question et
 * à aller la corriger — statut, chapitre, réserve, lien vers la fiche. L'aperçu
 * montre l'épreuve telle qu'un élève la verra, dossier compris, avec la bonne
 * réponse marquée : c'est la seule façon de voir qu'une figure manque ou qu'un
 * texte commun n'a pas suivi, avant qu'un élève ne le découvre en composition.
 */

const VUES = [
  { cle: "liste", libelle: "Liste" },
  { cle: "apercu", libelle: "Aperçu élève" },
] as const;

type Vue = (typeof VUES)[number]["cle"];

const ETIQUETTE_STATUT: Record<string, { libelle: string; classe: string }> = {
  publie: { libelle: "validée", classe: "bg-positif/15 text-positif" },
  a_verifier: { libelle: "en relecture", classe: "bg-soleil/25 text-encre" },
  brouillon: { libelle: "brouillon", classe: "bg-fond-doux text-encre" },
  depubliee: { libelle: "dépubliée", classe: "bg-negatif/10 text-negatif" },
};

export default async function EpreuveImportee({
  params,
  searchParams,
}: {
  params: Promise<{ epreuveId: string }>;
  searchParams: Promise<{ vue?: string }>;
}) {
  await exigerStaff();

  const { epreuveId } = await params;
  const { vue: vueBrute } = await searchParams;
  const vue = (VUES.find((v) => v.cle === vueBrute)?.cle ?? "liste") as Vue;

  const epreuve = await chargerEpreuveImportee(decodeURIComponent(epreuveId));
  if (!epreuve) notFound();

  const { entete, questions } = epreuve;

  return (
    <>
      <p className="mb-2 text-sm">
        <Link href="/admin/epreuves-importees" className="hover:underline">
          ← Épreuves importées
        </Link>
      </p>

      <h1 className="mb-2 text-3xl font-black">
        {entete.concours} — {entete.matiere}
      </h1>
      <p className="mb-6 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-sm">
        <code className="rounded-full bg-fond-doux px-2.5 py-0.5 font-bold">
          {entete.epreuveIdExterne}
        </code>
        <span className="font-bold text-encre">{entete.total} questions</span>
        {entete.publiees > 0 && <span className="text-positif">{entete.publiees} validées</span>}
        {entete.enRelecture > 0 && (
          <span className="font-bold text-negatif">{entete.enRelecture} en relecture</span>
        )}
      </p>

      <div className="mb-7 flex flex-wrap gap-2 text-sm">
        {VUES.map((v) => (
          <Link
            key={v.cle}
            href={`/admin/epreuves-importees/${encodeURIComponent(entete.epreuveIdExterne)}${
              v.cle === "liste" ? "" : `?vue=${v.cle}`
            }`}
            className={`rounded-full px-4 py-2 font-bold no-underline ${
              vue === v.cle ? "bg-primaire text-white" : "bg-fond-doux text-encre"
            }`}
          >
            {v.libelle}
          </Link>
        ))}
      </div>

      {vue === "liste" ? (
        <ul className="space-y-2.5">
          {questions.map((q) => {
            const etiquette = ETIQUETTE_STATUT[q.statut] ?? {
              libelle: q.statut,
              classe: "bg-fond-doux text-encre",
            };
            return (
              <li key={q.id}>
                <div className="flex flex-wrap items-start gap-4 rounded-carte border border-ligne p-4">
                  <span className="w-10 shrink-0 text-center font-black text-primaire-fonce tabular-nums">
                    {q.ordre ?? "—"}
                  </span>

                  <div className="min-w-0 flex-1">
                    <Link
                      href={`/admin/relecture/${q.id}`}
                      className="block font-bold text-encre no-underline hover:text-primaire"
                    >
                      {q.enonce?.trim() ? (
                        <span className="line-clamp-2">{formaterMath(q.enonce)}</span>
                      ) : (
                        <span className="text-negatif">
                          (sans énoncé texte — la question n&apos;existe qu&apos;en image)
                        </span>
                      )}
                    </Link>

                    <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[0.78rem]">
                      <span className={`rounded-full px-2.5 py-0.5 font-bold ${etiquette.classe}`}>
                        {etiquette.libelle}
                      </span>
                      {q.chapitre && (
                        <span className="rounded-full bg-fond-doux px-2.5 py-0.5 font-bold">
                          {q.chapitre}
                        </span>
                      )}
                      <span className="opacity-60">{q.type.replace("_", " ")}</span>
                      {q.figureUrl && <span className="opacity-60">figure</span>}
                      {q.documents.length > 0 && (
                        <span className="opacity-60">
                          {q.documents.length} document{q.documents.length > 1 ? "s" : ""}
                        </span>
                      )}
                      <span className="opacity-50">{q.blocCle}</span>
                    </div>

                    {q.commentaire && (
                      <p className="mt-1.5 text-[0.82rem] opacity-75">{q.commentaire}</p>
                    )}
                  </div>

                  <Link
                    href={`/admin/relecture/${q.id}`}
                    className="shrink-0 rounded-full border-2 border-ligne px-4 py-1.5 text-sm font-bold text-encre no-underline transition hover:bg-fond-doux"
                  >
                    Modifier
                  </Link>
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <ol className="space-y-9">
          {questions.map((q, i) => {
            // L'énoncé commun et le dossier ne sont répétés que s'ils changent :
            // c'est ainsi que l'élève les verra, une fois par exercice.
            const precedente = questions[i - 1];
            const nouveauDossier =
              q.enonceCommun !== precedente?.enonceCommun ||
              q.documents.length !== (precedente?.documents.length ?? 0);

            return (
              <li key={q.id} className="border-t border-ligne pt-7 first:border-0 first:pt-0">
                {nouveauDossier && q.enonceCommun && (
                  <p className="mb-4 max-h-[26rem] overflow-y-auto rounded-carte bg-fond-doux p-4 whitespace-pre-line">
                    {formaterMath(q.enonceCommun)}
                  </p>
                )}
                {nouveauDossier &&
                  q.documents.map((d, n) => (
                    <figure key={`${q.id}-doc-${n}`} className="mb-4">
                      {d.titre && (
                        <figcaption className="mb-1.5 text-sm font-extrabold text-encre">
                          {d.titre}
                        </figcaption>
                      )}
                      {d.url ? (
                        // eslint-disable-next-line @next/next/no-img-element -- URL signée temporaire
                        <img
                          src={d.url}
                          alt={d.titre ?? "Document"}
                          className="max-h-[30rem] w-full rounded-[10px] border border-ligne bg-white object-contain"
                        />
                      ) : (
                        <p className="rounded-[10px] bg-negatif/5 p-3 text-sm text-negatif">
                          Document introuvable dans le stockage.
                        </p>
                      )}
                    </figure>
                  ))}

                <p className="mb-2 text-sm font-extrabold tracking-[.08em] text-primaire-fonce uppercase">
                  Question {q.ordre ?? i + 1}
                </p>

                {q.figureUrl && (
                  <figure className="mb-4">
                    {/* eslint-disable-next-line @next/next/no-img-element -- URL signée temporaire */}
                    <img
                      src={q.figureUrl}
                      alt={`Figure de la question ${q.ordre ?? i + 1}`}
                      className="w-full rounded-carte border border-ligne bg-white"
                    />
                  </figure>
                )}

                {q.enonce?.trim() ? (
                  <p className="mb-4 text-[1.05rem] whitespace-pre-line">
                    {formaterMath(q.enonce)}
                  </p>
                ) : (
                  !q.figureUrl && (
                    <p
                      role="alert"
                      className="mb-4 rounded-carte border-2 border-negatif bg-negatif/5 p-4 text-sm text-negatif"
                    >
                      Cette question n&apos;a ni énoncé ni figure : elle serait servie vide.
                    </p>
                  )
                )}

                {q.propositions.length === 0 ? (
                  q.type !== "redaction" && (
                    <p
                      role="alert"
                      className="rounded-carte border-2 border-negatif bg-negatif/5 p-4 text-sm text-negatif"
                    >
                      Aucune proposition : la question est injouable telle quelle.
                    </p>
                  )
                ) : (
                  <ul className="space-y-2.5">
                    {q.propositions.map((p, n) => (
                      <li
                        key={p.id}
                        className={`flex items-start gap-3 rounded-carte border-2 p-3.5 ${
                          p.correcte
                            ? "border-positif bg-positif/5"
                            : "border-ligne bg-white"
                        }`}
                      >
                        <strong className="text-encre">{"ABCDEF"[n]}.</strong>
                        <span className="min-w-0 flex-1">{formaterMath(p.texte)}</span>
                        {p.correcte && (
                          <span className="shrink-0 text-sm font-extrabold text-positif">
                            bonne réponse
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                )}

                <p className="mt-3 text-sm">
                  <Link href={`/admin/relecture/${q.id}`} className="font-bold text-primaire">
                    Modifier cette question
                  </Link>
                </p>
              </li>
            );
          })}
        </ol>
      )}
    </>
  );
}
