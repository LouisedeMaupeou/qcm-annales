import Link from "next/link";
import { notFound } from "next/navigation";
import { exigerPrepa } from "@/lib/admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { assemblerBilan } from "@/lib/bilans-generation";
import { BilanV10 } from "@/components/bilan-v10";
import { FormulaireBilan } from "./formulaire";

export const dynamic = "force-dynamic";

/** §5.4 : relecture d'un bilan — les chiffres sont calculés, les textes édités. */
export default async function FicheBilan({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await exigerPrepa();
  const { id } = await params;

  const admin = createAdminClient();
  const { data: ligne } = await admin
    .from("bilans")
    .select("id, session_cb_id, user_id")
    .eq("id", id)
    .maybeSingle();
  if (!ligne) notFound();

  const bilan = await assemblerBilan(
    ligne.session_cb_id as string,
    ligne.user_id as string,
  );
  if (!bilan) notFound();

  const { data: journal } = await admin
    .from("bilan_journal")
    .select("champ, le, users(prenom, nom)")
    .eq("bilan_id", id)
    .order("le", { ascending: false })
    .limit(10);

  return (
    <>
      <p className="mb-2 text-sm">
        <Link
          href={`/admin/prepa/sessions/${ligne.session_cb_id}/bilans`}
          className="hover:underline"
        >
          ← Bilans de la session
        </Link>
      </p>

      <FormulaireBilan bilanId={id} bilan={bilan} />

      <section className="mt-10">
        <h2 className="mb-3 text-sm font-extrabold tracking-[.08em] text-primaire-fonce uppercase">
          Aperçu du bilan tel qu&apos;il partira
        </h2>
        <div className="rounded-carte border border-ligne p-6">
          <BilanV10 bilan={bilan} />
        </div>
      </section>

      {journal && journal.length > 0 && (
        <section className="mt-10">
          <h2 className="mb-3 text-sm font-extrabold tracking-[.08em] text-primaire-fonce uppercase">
            Journal des modifications
          </h2>
          <ul className="space-y-1 text-sm">
            {journal.map((j, i) => {
              const auteur = j.users as unknown as { prenom: string; nom: string } | null;
              return (
                <li key={i}>
                  <span className="font-mono opacity-60">
                    {new Date(j.le as string).toLocaleString("fr-FR", {
                      dateStyle: "short",
                      timeStyle: "short",
                    })}
                  </span>{" "}
                  — {j.champ as string}
                  {auteur && ` par ${auteur.prenom} ${auteur.nom}`}
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </>
  );
}
