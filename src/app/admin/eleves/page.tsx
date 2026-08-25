import Link from "next/link";
import { exigerAdmin } from "@/lib/admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { chargerEleves, type FiltresEleves } from "@/lib/eleves";
import { FiltresListe } from "./filtres";

export const dynamic = "force-dynamic";

/** §6.2 : compteurs, liste filtrable, export respectant les filtres. */
export default async function SectionEleves({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  await exigerAdmin();
  const params = await searchParams;

  const filtres: FiltresEleves = {
    recherche: params.q,
    concoursId: params.concours,
    consentement:
      params.consentement === "oui" || params.consentement === "non"
        ? params.consentement
        : undefined,
    statut:
      params.statut === "actifs" || params.statut === "inactifs"
        ? params.statut
        : undefined,
  };

  const admin = createAdminClient();
  const [eleves, tous, { data: concours }] = await Promise.all([
    chargerEleves(filtres),
    chargerEleves(),
    admin.from("concours").select("id, nom").order("nom"),
  ]);

  const il30j = new Date();
  il30j.setDate(il30j.getDate() - 30);

  const compteurs = {
    inscrits: tous.length,
    consentants: tous.filter((e) => e.consentMarketing).length,
    actifs30j: tous.filter(
      (e) => e.derniereActivite && new Date(e.derniereActivite) >= il30j,
    ).length,
    nonConfirmes: tous.filter((e) => !e.emailVerifie).length,
  };

  const repartition = new Map<string, number>();
  for (const e of tous) {
    for (const c of e.concoursVises) {
      repartition.set(c, (repartition.get(c) ?? 0) + 1);
    }
  }

  const query = new URLSearchParams(
    Object.entries(params).filter(([, v]) => v) as [string, string][],
  ).toString();

  return (
    <>
      <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-3xl font-black">Élèves</h1>
        <a
          href={`/admin/eleves/export${query ? `?${query}` : ""}`}
          className="cursor-pointer rounded-full bg-primaire px-7 py-3 font-extrabold text-white no-underline transition hover:bg-primaire-fonce"
        >
          Exporter vers Zoho (XLSX)
        </a>
      </div>

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Compteur valeur={compteurs.inscrits} libelle="inscrits" />
        <Compteur valeur={compteurs.consentants} libelle="consentent au marketing" />
        <Compteur valeur={compteurs.actifs30j} libelle="actifs sur 30 jours" />
        <Compteur
          valeur={compteurs.nonConfirmes}
          libelle="email non confirmé"
          alerte={compteurs.nonConfirmes > 0}
        />
      </div>

      {repartition.size > 0 && (
        <div className="mb-8 rounded-carte bg-fond-doux p-5">
          <h2 className="mb-2 text-sm font-extrabold tracking-[.08em] text-primaire-fonce uppercase">
            Répartition par concours visé
          </h2>
          <ul className="flex flex-wrap gap-2">
            {[...repartition.entries()]
              .sort((a, b) => b[1] - a[1])
              .map(([nom, n]) => (
                <li
                  key={nom}
                  className="rounded-full bg-white px-3.5 py-1.5 text-[0.9rem]"
                >
                  <span className="font-bold text-encre">{nom}</span>
                  <span className="ml-2 tabular-nums opacity-70">{n}</span>
                </li>
              ))}
          </ul>
        </div>
      )}

      <FiltresListe concours={concours ?? []} valeurs={params} />

      <p className="mb-3 text-sm">
        {eleves.length} élève{eleves.length > 1 ? "s" : ""}
        {eleves.length !== tous.length && ` sur ${tous.length}`}
      </p>

      <div className="overflow-x-auto rounded-carte border border-ligne">
        <table className="w-full border-collapse text-[0.9rem]">
          <thead>
            <tr className="bg-fond-doux text-left">
              <Th>Élève</Th>
              <Th>Établissement</Th>
              <Th>Concours visés</Th>
              <Th>Sessions</Th>
              <Th>Score moyen</Th>
              <Th>Statut</Th>
            </tr>
          </thead>
          <tbody>
            {eleves.map((e) => (
              <tr key={e.id} className="border-t border-ligne">
                <td className="px-4 py-3">
                  <Link
                    href={`/admin/eleves/${e.id}`}
                    className="font-bold text-encre no-underline hover:text-primaire"
                  >
                    {e.prenom} {e.nom}
                  </Link>
                  <span className="block text-[0.8rem] opacity-70">{e.email}</span>
                </td>
                <td className="px-4 py-3">
                  {e.etablissement ?? "—"}
                  <span className="block text-[0.8rem] opacity-70">{e.ville}</span>
                </td>
                <td className="px-4 py-3">{e.concoursVises.join(", ") || "—"}</td>
                <td className="px-4 py-3 tabular-nums">{e.nbSessions}</td>
                <td className="px-4 py-3 tabular-nums">
                  {e.scoreMoyen === null ? "—" : `${Math.round(e.scoreMoyen * 100)} %`}
                </td>
                <td className="px-4 py-3">
                  <Statut eleve={e} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {eleves.length === 0 && (
          <p className="p-8 text-center text-sm">
            Aucun élève ne correspond à ces filtres.
          </p>
        )}
      </div>
    </>
  );
}

function Statut({
  eleve,
}: {
  eleve: { actif: boolean; suspendu: boolean; emailVerifie: boolean };
}) {
  if (eleve.suspendu)
    return <Pastille classe="bg-negatif/10 text-negatif">désactivé</Pastille>;
  if (!eleve.emailVerifie)
    return <Pastille classe="bg-ligne text-encre">email non confirmé</Pastille>;
  if (eleve.actif)
    return <Pastille classe="bg-primaire/10 text-primaire-fonce">actif</Pastille>;
  return <Pastille classe="bg-ligne text-encre">inactif</Pastille>;
}

function Pastille({
  classe,
  children,
}: {
  classe: string;
  children: React.ReactNode;
}) {
  return (
    <span className={`rounded-full px-2.5 py-0.5 text-[0.75rem] font-bold ${classe}`}>
      {children}
    </span>
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

function Th({ children }: { children: React.ReactNode }) {
  return <th className="px-4 py-3 font-extrabold text-encre">{children}</th>;
}
