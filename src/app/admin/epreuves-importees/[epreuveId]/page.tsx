import Link from "next/link";
import { notFound } from "next/navigation";
import { exigerStaff } from "@/lib/admin";
import { chargerEpreuveImportee, type QuestionImportee } from "@/lib/epreuves-importees";
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

/**
 * Regroupe les questions consécutives qui partagent le même dossier.
 *
 * Sans cela, les mêmes textes seraient réaffichés entre chaque question : en
 * analyse documentaire, le Texte 7 revient sur plusieurs questions d'affilée,
 * et le relecteur verrait dix fois la même image en faisant défiler l'épreuve.
 */
function grouperParDossier(questions: QuestionImportee[]): QuestionImportee[][] {
  const groupes: QuestionImportee[][] = [];
  let signaturePrecedente: string | null = null;

  for (const q of questions) {
    const signature = `${q.enonceCommun ?? ""}##${q.documents
      .map((d) => d.titre ?? "")
      .join("|")}`;
    if (signature !== signaturePrecedente) {
      groupes.push([q]);
      signaturePrecedente = signature;
    } else {
      groupes[groupes.length - 1].push(q);
    }
  }

  return groupes;
}

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
        <div className="space-y-12">
          {grouperParDossier(questions).map((groupe) => {
            const tete = groupe[0];
            const aDossier = Boolean(tete.enonceCommun) || tete.documents.length > 0;

            return (
              <section
                key={tete.id}
                className={
                  aDossier
                    ? "lg:grid lg:grid-cols-[minmax(0,46%)_minmax(0,1fr)] lg:items-start lg:gap-9"
                    : ""
                }
              >
                {/* Le texte à gauche, dans sa propre zone de défilement : c'est
                    la situation de l'élève, qui relit un passage en gardant la
                    question sous les yeux. */}
                {aDossier && (
                  <aside
                    aria-label="Textes de l'exercice"
                    className="mb-6 max-h-[60vh] overflow-y-auto rounded-carte border border-ligne bg-fond-doux/40 p-5 lg:sticky lg:top-6 lg:mb-0 lg:max-h-[calc(100dvh-6rem)]"
                  >
                    <h2 className="mb-3 text-sm font-extrabold tracking-[.08em] text-primaire-fonce uppercase">
                      Dossier
                    </h2>
                    {tete.enonceCommun && (
                      <p className="mb-5 leading-relaxed whitespace-pre-line">
                        {formaterMath(tete.enonceCommun)}
                      </p>
                    )}
                    {tete.documents.map((d, n) => (
                      <figure key={`${tete.id}-doc-${n}`} className="mb-5 last:mb-0">
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
                            className="w-full rounded-[10px] border border-ligne bg-white"
                          />
                        ) : (
                          <p className="rounded-[10px] bg-negatif/5 p-3 text-sm text-negatif">
                            Document introuvable dans le stockage.
                          </p>
                        )}
                      </figure>
                    ))}
                  </aside>
                )}

                <ol className="space-y-8">
                  {groupe.map((q) => (
                    <li key={q.id}>
                      <p className="mb-2 text-sm font-extrabold tracking-[.08em] text-primaire-fonce uppercase">
                        Question {q.ordre ?? "?"}
                      </p>

                      {q.enonce?.trim() ? (
                        <p className="mb-4 text-[1.05rem] whitespace-pre-line">
                          {formaterMath(q.enonce)}
                        </p>
                      ) : q.figureUrl ? (
                        // Sans retranscription, la capture est tout ce qu'il y a :
                        // la masquer afficherait une question vide.
                        <figure className="mb-4">
                          {/* eslint-disable-next-line @next/next/no-img-element -- URL signée temporaire */}
                          <img
                            src={q.figureUrl}
                            alt={`Question ${q.ordre ?? ""} en image`}
                            className="w-full rounded-carte border border-ligne bg-white"
                          />
                          <figcaption className="mt-1.5 text-[0.8rem] text-negatif">
                            Question sans énoncé texte : elle n&apos;existe qu&apos;en image.
                          </figcaption>
                        </figure>
                      ) : (
                        <p
                          role="alert"
                          className="mb-4 rounded-carte border-2 border-negatif bg-negatif/5 p-4 text-sm text-negatif"
                        >
                          Cette question n&apos;a ni énoncé ni figure : elle serait servie vide.
                        </p>
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
                        <Link
                          href={`/admin/relecture/${q.id}`}
                          className="font-bold text-primaire"
                        >
                          Modifier cette question
                        </Link>
                      </p>
                    </li>
                  ))}
                </ol>
              </section>
            );
          })}
        </div>
      )}
    </>
  );
}
