import Link from "next/link";
import { redirect } from "next/navigation";
import { EnteteEleve } from "@/components/entete-eleve";
import { PiedDePage } from "@/components/pied-de-page";
import { BilanV10 } from "@/components/bilan-v10";
import { createClient } from "@/lib/supabase/server";
import { assemblerBilan } from "@/lib/bilans-generation";

export const dynamic = "force-dynamic";

/**
 * Consultation du bilan par l'élève (§4.5).
 *
 * La ligne est lue avec le client authentifié : la politique
 * `bilans_sien_envoye` ne laisse passer que son propre bilan, et seulement à
 * l'état envoyé. C'est l'embargo du §4.4, tenu par la base et non par cette
 * page — un bilan validé mais non envoyé reste invisible même avec son lien.
 */
export default async function BilanEleve({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/connexion?suite=/concours-blancs/bilan/${id}`);

  const { data: ligne } = await supabase
    .from("bilans")
    .select("id, session_cb_id, user_id")
    .eq("id", id)
    .maybeSingle();

  const bilan = ligne
    ? await assemblerBilan(ligne.session_cb_id as string, ligne.user_id as string)
    : null;

  return (
    <div className="mx-auto flex w-full max-w-[1000px] flex-1 flex-col px-[22px]">
      <EnteteEleve />

      <main className="flex-1 pb-16">
        <p className="mb-4 text-sm">
          <Link href="/concours-blancs" className="hover:underline">
            ← Mes concours blancs
          </Link>
        </p>

        {!bilan ? (
          <>
            <h1 className="mb-3 text-[clamp(1.6rem,4vw,2.2rem)] font-black">
              Bilan indisponible
            </h1>
            <p className="max-w-[60ch]">
              Ce bilan n&apos;existe pas, ou il ne t&apos;a pas encore été envoyé.
              Tu recevras un email dès qu&apos;il sera disponible.
            </p>
          </>
        ) : (
          <>
            <BilanV10 bilan={bilan} />
            <p className="mt-8">
              <a
                href={`/concours-blancs/bilan/${id}/pdf`}
                className="inline-flex cursor-pointer rounded-full bg-primaire px-7 py-3 font-extrabold text-white no-underline transition hover:bg-primaire-fonce"
              >
                Télécharger le bilan en PDF
              </a>
            </p>
          </>
        )}
      </main>

      <PiedDePage />
    </div>
  );
}
