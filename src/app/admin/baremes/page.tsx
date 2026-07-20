import { exigerAdmin } from "@/lib/admin";
import { createClient } from "@/lib/supabase/server";
import { CarteBareme } from "./carte";
import { ReglageSeuil } from "./seuil";

export const dynamic = "force-dynamic";

export default async function Baremes() {
  await exigerAdmin();
  const supabase = await createClient();

  const { data: parametre } = await supabase
    .from("parametres")
    .select("valeur")
    .eq("cle", "seuil_confiance")
    .maybeSingle();

  const { data: concours } = await supabase
    .from("concours")
    .select(
      "id, nom, filiere, taille_session, baremes(id, epreuve_id, points_bonne, points_mauvaise, points_abstention, regle_speciale, source_officielle, verifie_le)",
    )
    .order("filiere")
    .order("nom");

  const lignes = (concours ?? []).map((c) => {
    const baremes = (c.baremes as unknown as {
      id: string;
      epreuve_id: string | null;
      points_bonne: number;
      points_mauvaise: number;
      points_abstention: number;
      regle_speciale: string | null;
      source_officielle: string | null;
      verifie_le: string | null;
    }[]) ?? [];
    return { concours: c, bareme: baremes.find((b) => b.epreuve_id === null) };
  });

  const nonVerifies = lignes.filter((l) => l.bareme && !l.bareme.verifie_le).length;

  return (
    <>
      <h1 className="mb-2 text-3xl font-black">Barèmes et seuils</h1>
      <p className="mb-6 max-w-[70ch]">
        Points attribués par réponse et taille de session, par concours. Ces
        valeurs déterminent la note affichée aux élèves.
      </p>

      {nonVerifies > 0 && (
        <p className="mb-8 rounded-carte border-2 border-soleil bg-soleil/10 p-4 text-sm">
          <strong className="block text-encre">
            {nonVerifies} barème{nonVerifies > 1 ? "s" : ""} non vérifié
            {nonVerifies > 1 ? "s" : ""}
          </strong>
          Les specs (§2) imposent de contrôler chaque barème sur le règlement
          officiel de la session concernée avant de l&apos;afficher. Renseigne la
          source et la date de vérification une fois le contrôle fait.
        </p>
      )}

      <div className="mb-8">
        <ReglageSeuil seuil={Number(parametre?.valeur ?? 90)} />
      </div>

      <h2 className="mb-4 text-xl font-black">Barèmes par concours</h2>

      <div className="space-y-5">
        {lignes.map(({ concours: c, bareme }) =>
          bareme ? (
            <CarteBareme
              key={c.id}
              concours={{
                id: c.id,
                nom: c.nom,
                filiere: c.filiere,
                tailleSession: c.taille_session,
              }}
              bareme={bareme}
            />
          ) : (
            <p
              key={c.id}
              className="rounded-carte border border-dashed border-ligne p-5 text-sm"
            >
              {c.nom} — aucun barème par défaut enregistré.
            </p>
          ),
        )}
      </div>
    </>
  );
}
