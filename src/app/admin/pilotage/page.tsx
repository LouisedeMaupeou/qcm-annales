import Link from "next/link";
import { exigerAdmin } from "@/lib/admin";
import { chargerPilotage, PERIODES, type Periode } from "@/lib/pilotage";

export const dynamic = "force-dynamic";

/** §6.3 : section Pilotage (KPI). */
export default async function Pilotage({
  searchParams,
}: {
  searchParams: Promise<{ periode?: string }>;
}) {
  await exigerAdmin();
  const { periode: brut } = await searchParams;
  const periode: Periode = brut && brut in PERIODES ? (brut as Periode) : "30j";

  const d = await chargerPilotage(periode);
  const pourcent = (v: number) => `${Math.round(v * 100)} %`;

  return (
    <>
      <h1 className="mb-2 text-3xl font-black">Pilotage</h1>
      <p className="mb-6 max-w-[70ch]">
        Usage de la plateforme et profondeur d&apos;exploitation du stock de
        questions.
      </p>

      <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Compteur valeur={String(d.compteurs.sessions7j)} libelle="sessions sur 7 jours" />
        <Compteur valeur={String(d.compteurs.sessions30j)} libelle="sessions sur 30 jours" />
        <Compteur
          valeur={pourcent(d.compteurs.tauxPremiereSession)}
          libelle={`inscrits ayant joué (${d.compteurs.ayantJoue}/${d.compteurs.inscrits})`}
        />
        <Compteur
          valeur={pourcent(d.compteurs.tauxConsentement)}
          libelle={`consentement marketing (${d.compteurs.consentants}/${d.compteurs.inscrits})`}
        />
      </div>

      {/* Période filtrable (§6.3) */}
      <div className="mb-6 flex flex-wrap items-center gap-2 text-sm">
        <span className="font-bold text-encre">Période :</span>
        {(Object.keys(PERIODES) as Periode[]).map((p) => (
          <Link
            key={p}
            href={`/admin/pilotage?periode=${p}`}
            className={`rounded-full px-4 py-2 font-bold no-underline ${
              periode === p ? "bg-primaire text-white" : "bg-fond-doux text-encre"
            }`}
          >
            {PERIODES[p].libelle}
          </Link>
        ))}
        <span className="opacity-70">
          {d.nbSessionsPeriode} session{d.nbSessionsPeriode > 1 ? "s" : ""} sur la
          période
        </span>
      </div>

      <Tableau
        titre="Élèves par usage"
        aide="Classement par nombre de sessions sur la période, avec la progression entre les premières et les dernières sessions. La progression apparaît à partir de quatre sessions."
        lienExport={`/admin/pilotage/export/usage?periode=${periode}`}
        entetes={["Élève", "Sessions", "Score moyen", "Progression"]}
        vide="Aucune session sur cette période."
        lignes={d.usage.slice(0, 50).map((u) => [
          <span key="e">
            <strong className="text-encre">{u.identite.nom}</strong>
            <span className="block text-[0.8rem] opacity-70">{u.identite.email}</span>
          </span>,
          <span key="n" className="tabular-nums">{u.nbSessions}</span>,
          <span key="s" className="tabular-nums">{pourcent(u.scoreMoyen)}</span>,
          <span
            key="p"
            className={`tabular-nums font-bold ${
              u.progression === null
                ? "opacity-50"
                : u.progression > 0
                  ? "text-[#006300]"
                  : u.progression < 0
                    ? "text-negatif"
                    : ""
            }`}
          >
            {u.progression === null
              ? "—"
              : `${u.progression > 0 ? "+" : ""}${Math.round(u.progression * 100)} pts`}
          </span>,
        ])}
      />

      <Tableau
        titre="Taux d'annales réalisées"
        aide="Questions publiées vues au moins une fois, rapportées au total publié. Mesure la profondeur d'usage du stock, tous élèves confondus et depuis toujours."
        lienExport="/admin/pilotage/export/couverture"
        entetes={["Concours", "Publiées", "Vues", "Taux"]}
        vide="Aucune question publiée."
        lignes={d.couverture.map((c) => [
          <strong key="c" className="text-encre">{c.concoursNom}</strong>,
          <span key="p" className="tabular-nums">{c.publiees}</span>,
          <span key="v" className="tabular-nums">{c.vues}</span>,
          <span key="t" className="tabular-nums font-bold">{pourcent(c.taux)}</span>,
        ])}
      />

      <Tableau
        titre="Score moyen par concours"
        lienExport={`/admin/pilotage/export/scores-concours?periode=${periode}`}
        entetes={["Concours", "Sessions", "Score moyen"]}
        vide="Aucune session sur cette période."
        lignes={d.parConcours.map((s) => [
          <strong key="c" className="text-encre">{s.concoursNom}</strong>,
          <span key="n" className="tabular-nums">{s.nbSessions}</span>,
          <span key="s" className="tabular-nums font-bold">{pourcent(s.scoreMoyen)}</span>,
        ])}
      />

      <Tableau
        titre="Score moyen par épreuve"
        lienExport={`/admin/pilotage/export/scores-epreuves?periode=${periode}`}
        entetes={["Concours", "Épreuve", "Sessions", "Score moyen"]}
        vide="Aucune session sur cette période."
        lignes={d.parEpreuve.map((s) => [
          <span key="c">{s.concoursNom}</span>,
          <strong key="e" className="text-encre">{s.epreuveNom}</strong>,
          <span key="n" className="tabular-nums">{s.nbSessions}</span>,
          <span key="s" className="tabular-nums font-bold">{pourcent(s.scoreMoyen)}</span>,
        ])}
      />
    </>
  );
}

function Tableau({
  titre,
  aide,
  lienExport,
  entetes,
  lignes,
  vide,
}: {
  titre: string;
  aide?: string;
  lienExport: string;
  entetes: string[];
  lignes: React.ReactNode[][];
  vide: string;
}) {
  return (
    <section className="mb-10">
      <div className="mb-2 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-black">{titre}</h2>
          {aide && <p className="mt-1 max-w-[70ch] text-[0.85rem] opacity-75">{aide}</p>}
        </div>
        <a
          href={lienExport}
          className="shrink-0 rounded-full border-2 border-ligne px-5 py-2 text-sm font-bold text-encre no-underline transition hover:bg-fond-doux"
        >
          Export CSV
        </a>
      </div>

      <div className="overflow-x-auto rounded-carte border border-ligne">
        <table className="w-full border-collapse text-[0.9rem]">
          <thead>
            <tr className="bg-fond-doux text-left">
              {entetes.map((e) => (
                <th key={e} className="px-4 py-3 font-extrabold text-encre">
                  {e}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {lignes.map((ligne, i) => (
              <tr key={i} className="border-t border-ligne">
                {ligne.map((cellule, j) => (
                  <td key={j} className="px-4 py-3">
                    {cellule}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {lignes.length === 0 && <p className="p-8 text-center text-sm">{vide}</p>}
      </div>
    </section>
  );
}

function Compteur({ valeur, libelle }: { valeur: string; libelle: string }) {
  return (
    <div className="rounded-carte border border-ligne p-5">
      <p className="text-3xl font-black text-encre">{valeur}</p>
      <p className="text-[0.9rem]">{libelle}</p>
    </div>
  );
}
