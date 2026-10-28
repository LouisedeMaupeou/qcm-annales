import Link from "next/link";
import { exigerPrepa } from "@/lib/admin";
import { COLONNES_CB, COLONNES_CB_FACULTATIVES } from "@/lib/import-cb";
import { FormulaireImportCb } from "./formulaire";

export const dynamic = "force-dynamic";

/** §3 et §9 (étape 10) : import CSV/XLSX au format Parkours + zip d'images. */
export default async function ImportConcoursBlancs() {
  await exigerPrepa();

  return (
    <>
      <p className="mb-2 text-sm">
        <Link href="/admin/prepa" className="hover:underline">
          ← Prépa
        </Link>
      </p>
      <h1 className="mb-2 text-3xl font-black">Import des concours blancs</h1>
      <p className="mb-8 max-w-[70ch]">
        Fichier CSV ou XLSX au format Parkours,{" "}
        <strong>une ligne par question</strong>, accompagné du zip de ses
        images. Les questions entrent dans la banque et restent invisibles de
        l&apos;entraînement libre : elles ne sont servies qu&apos;aux élèves de
        la prépa, pendant la fenêtre de passage.
      </p>

      <div className="mb-8 grid gap-5 lg:grid-cols-[1fr_320px]">
        <FormulaireImportCb />

        <aside className="space-y-4">
          <section className="rounded-carte border border-ligne p-5 text-sm">
            <h2 className="mb-2 font-extrabold text-encre">Colonnes requises</h2>
            <ul className="space-y-0.5 font-mono text-[0.8rem]">
              {COLONNES_CB.map((c) => (
                <li key={c}>{c}</li>
              ))}
            </ul>
            <p className="mt-2 text-[0.82rem] opacity-75">
              <code className="font-bold">chapitre</code> est requis lui aussi :
              il alimente l&apos;analyse par chapitre du bilan.
            </p>
            <h2 className="mt-4 mb-2 font-extrabold text-encre">Facultatives</h2>
            <ul className="space-y-0.5 font-mono text-[0.8rem] opacity-75">
              {COLONNES_CB_FACULTATIVES.map((c) => (
                <li key={c}>{c}</li>
              ))}
            </ul>
          </section>

          <section className="rounded-carte bg-fond-doux p-5 text-sm">
            <h2 className="mb-2 font-extrabold text-encre">Clés acceptées</h2>
            <ul className="space-y-1">
              <li>
                <code className="font-bold">B</code> — choix unique
              </li>
              <li>
                <code className="font-bold">A;C</code> — choix multiple
              </li>
              <li>
                <code className="font-bold">VRAI</code> /{" "}
                <code className="font-bold">FAUX</code> — une affirmation
              </li>
              <li>vide — question rédigée, correction manuelle</li>
            </ul>
          </section>

          <section className="rounded-carte bg-fond-doux p-5 text-sm">
            <h2 className="mb-2 font-extrabold text-encre">Réimport</h2>
            <p>
              L&apos;import se rejoue sans risque :{" "}
              <code className="font-bold">id_question</code> et{" "}
              <code className="font-bold">bloc_id</code> servent de clés de
              rapprochement. Un fichier corrigé après relecture met à jour les
              questions existantes au lieu de les dupliquer.
            </p>
          </section>

          <section className="rounded-carte bg-fond-doux p-5 text-sm">
            <h2 className="mb-2 font-extrabold text-encre">Relecture</h2>
            <p>
              Une question dont <code className="font-bold">statut_extraction</code>{" "}
              n&apos;est pas <code className="font-bold">OK</code>, ou dont
              l&apos;image manque au zip, part en file de relecture et
              n&apos;est pas servie telle quelle.
            </p>
          </section>
        </aside>
      </div>
    </>
  );
}
