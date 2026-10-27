import Link from "next/link";
import { notFound } from "next/navigation";
import { exigerPrepa } from "@/lib/admin";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  chargerMembres,
  COLONNES_LISTE,
  COLONNES_LISTE_FACULTATIVES,
} from "@/lib/cohortes";
import { detacherEleve, relancerInvitation } from "../actions";
import { FormulaireListe } from "./formulaire-liste";

export const dynamic = "force-dynamic";

export default async function FicheCohorte({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await exigerPrepa();
  const { id } = await params;

  const admin = createAdminClient();
  const [{ data: cohorte }, membres] = await Promise.all([
    admin
      .from("cohortes")
      .select("id, nom, filiere, millesime, active")
      .eq("id", id)
      .maybeSingle(),
    chargerMembres(id),
  ]);

  if (!cohorte) notFound();

  const enAttente = membres.filter((m) => !m.emailVerifie || !m.inviteLe).length;

  return (
    <>
      <p className="mb-2 text-sm">
        <Link href="/admin/prepa" className="hover:underline">
          ← Prépa
        </Link>
      </p>
      <h1 className="mb-1 text-3xl font-black">{cohorte.nom}</h1>
      <p className="mb-8">
        {cohorte.filiere === "commerce" ? "Commerce" : "Ingénieurs"} ·{" "}
        {cohorte.millesime} · {membres.length} élève
        {membres.length > 1 ? "s" : ""}
        {enAttente > 0 && ` · ${enAttente} en attente d'activation`}
      </p>

      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <section>
          <h2 className="mb-3 text-lg font-extrabold">Élèves rattachés</h2>

          {membres.length === 0 ? (
            <p className="rounded-carte border border-dashed border-ligne p-8 text-center">
              Aucun élève. Importe la liste de la cohorte pour les rattacher.
            </p>
          ) : (
            <div className="overflow-x-auto rounded-carte border border-ligne">
              <table className="w-full border-collapse text-[0.9rem]">
                <thead>
                  <tr className="bg-fond-doux text-left">
                    <Th>Élève</Th>
                    <Th>Contact parent</Th>
                    <Th>Statut</Th>
                    <Th>Actions</Th>
                  </tr>
                </thead>
                <tbody>
                  {membres.map((m) => (
                    <tr key={m.id} className="border-t border-ligne">
                      <td className="px-4 py-3">
                        <Link
                          href={`/admin/eleves/${m.id}`}
                          className="font-bold text-encre no-underline hover:text-primaire"
                        >
                          {m.prenom} {m.nom}
                        </Link>
                        <span className="block text-[0.8rem] opacity-70">{m.email}</span>
                      </td>
                      <td className="px-4 py-3">
                        {m.emailParent ?? (
                          <span className="text-negatif">manquant</span>
                        )}
                        <span className="block text-[0.8rem] opacity-70">
                          {m.telephoneParent ?? "—"}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <Statut membre={m} />
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-3 text-[0.8rem]">
                          <form action={relancerInvitation}>
                            <input type="hidden" name="userId" value={m.id} />
                            <button
                              type="submit"
                              className="cursor-pointer font-bold text-primaire underline"
                            >
                              Relancer
                            </button>
                          </form>
                          <form action={detacherEleve}>
                            <input type="hidden" name="userId" value={m.id} />
                            <input type="hidden" name="cohorteId" value={id} />
                            <button
                              type="submit"
                              className="cursor-pointer underline opacity-70"
                            >
                              Détacher
                            </button>
                          </form>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <aside className="space-y-4">
          <FormulaireListe cohorteId={id} />

          <section className="rounded-carte border border-ligne p-5 text-sm">
            <h2 className="mb-2 font-extrabold text-encre">Colonnes attendues</h2>
            <ul className="space-y-0.5 font-mono text-[0.8rem]">
              {COLONNES_LISTE.map((c) => (
                <li key={c}>{c}</li>
              ))}
            </ul>
            <h2 className="mt-4 mb-2 font-extrabold text-encre">Facultatives</h2>
            <ul className="space-y-0.5 font-mono text-[0.8rem] opacity-75">
              {COLONNES_LISTE_FACULTATIVES.map((c) => (
                <li key={c}>{c}</li>
              ))}
            </ul>
          </section>

          <section className="rounded-carte bg-fond-doux p-5 text-sm">
            <h2 className="mb-2 font-extrabold text-encre">Ce que fait l&apos;import</h2>
            <p className="mb-2">
              Un compte qui existe déjà est <strong>rattaché</strong> à la
              cohorte, jamais recréé : l&apos;élève garde son mot de passe et sa
              progression.
            </p>
            <p>
              Un compte qui n&apos;existe pas est créé puis{" "}
              <strong>invité par email</strong> à choisir son mot de passe.
              Aucun mot de passe n&apos;est transmis.
            </p>
          </section>
        </aside>
      </div>
    </>
  );
}

function Statut({
  membre,
}: {
  membre: { actif: boolean; suspendu: boolean; emailVerifie: boolean; inviteLe: string | null };
}) {
  if (membre.suspendu)
    return <Pastille classe="bg-negatif/10 text-negatif">désactivé</Pastille>;
  if (membre.actif)
    return <Pastille classe="bg-primaire/10 text-primaire-fonce">actif</Pastille>;
  if (membre.inviteLe)
    return (
      <Pastille classe="bg-soleil/20 text-encre">
        invité le{" "}
        {new Date(membre.inviteLe).toLocaleDateString("fr-FR", { dateStyle: "short" })}
      </Pastille>
    );
  return <Pastille classe="bg-ligne text-encre">jamais invité</Pastille>;
}

function Pastille({ classe, children }: { classe: string; children: React.ReactNode }) {
  return (
    <span className={`rounded-full px-2.5 py-0.5 text-[0.75rem] font-bold ${classe}`}>
      {children}
    </span>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return <th className="px-4 py-3 font-extrabold text-encre">{children}</th>;
}
