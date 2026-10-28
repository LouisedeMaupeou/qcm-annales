"use server";

import { revalidatePath } from "next/cache";
import { exigerPrepa } from "@/lib/admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { assemblerBilan, elevesDeLaSession } from "@/lib/bilans-generation";
import { emailBilan, envoyerEmail } from "@/lib/emails";
import { urlSite } from "@/lib/site";

/** Workflow des bilans : généré → en relecture → validé → envoyé (§5.4). */

export type EtatBilan = { message?: string; succes?: string };

/** Crée les lignes manquantes. Les chiffres, eux, se recalculent à la lecture. */
export async function genererBilans(formulaire: FormData) {
  await exigerPrepa();
  const sessionCbId = String(formulaire.get("sessionId") ?? "");

  const admin = createAdminClient();
  const eleves = await elevesDeLaSession(sessionCbId);

  const { data: existants } = await admin
    .from("bilans")
    .select("user_id")
    .eq("session_cb_id", sessionCbId);
  const deja = new Set((existants ?? []).map((b) => b.user_id as string));

  const aCreer = eleves
    .filter((e) => !deja.has(e.id as string))
    .map((e) => ({ session_cb_id: sessionCbId, user_id: e.id as string }));

  if (aCreer.length > 0) await admin.from("bilans").insert(aCreer);

  revalidatePath(`/admin/prepa/sessions/${sessionCbId}/bilans`);
}

async function journaliser(
  bilanId: string,
  auteurId: string,
  champ: string,
  avant: string | null,
  apres: string | null,
) {
  if ((avant ?? "") === (apres ?? "")) return;
  const admin = createAdminClient();
  await admin
    .from("bilan_journal")
    .insert({ bilan_id: bilanId, auteur_id: auteurId, champ, avant, apres });
}

/**
 * Enregistre les textes relus. Les chiffres ne sont jamais écrits ici : ils
 * se recalculent depuis les copies (§5.4, « les chiffres sont calculés »).
 */
export async function enregistrerBilan(
  _precedent: EtatBilan,
  donnees: FormData,
): Promise<EtatBilan> {
  const { userId } = await exigerPrepa();

  const bilanId = String(donnees.get("bilanId") ?? "");
  const admin = createAdminClient();

  const { data: avant } = await admin
    .from("bilans")
    .select("en_quelques_mots, analyse, statut, session_cb_id")
    .eq("id", bilanId)
    .maybeSingle();
  if (!avant) return { message: "Bilan introuvable." };

  const enQuelquesMots = String(donnees.get("enQuelquesMots") ?? "").trim();

  // Textes par épreuve : le formulaire envoie un champ par couple épreuve ×
  // rubrique, on les regroupe.
  const analyse: Record<string, Record<string, string>> = {};
  for (const [cle, valeur] of donnees.entries()) {
    const m = cle.match(/^texte-([0-9a-f-]{36})-(forces|ameliorations|methode|conseils)$/);
    if (!m) continue;
    const texte = String(valeur).trim();
    if (!texte) continue;
    analyse[m[1]] ??= {};
    analyse[m[1]][m[2]] = texte;
  }

  const { error } = await admin
    .from("bilans")
    .update({
      en_quelques_mots: enQuelquesMots || null,
      analyse,
      // Dès qu'un humain y touche, le bilan quitte l'état « généré ».
      statut: avant.statut === "genere" ? "en_relecture" : avant.statut,
    })
    .eq("id", bilanId);
  if (error) return { message: error.message };

  await journaliser(
    bilanId,
    userId,
    "en_quelques_mots",
    (avant.en_quelques_mots as string | null) ?? null,
    enQuelquesMots || null,
  );
  await journaliser(
    bilanId,
    userId,
    "analyse",
    JSON.stringify(avant.analyse ?? {}),
    JSON.stringify(analyse),
  );

  revalidatePath(`/admin/prepa/bilans/${bilanId}`);
  return { succes: "Bilan enregistré." };
}

export async function validerBilan(formulaire: FormData) {
  const { userId } = await exigerPrepa();
  const bilanId = String(formulaire.get("bilanId") ?? "");

  const admin = createAdminClient();
  await admin
    .from("bilans")
    .update({ statut: "valide", valide_par: userId, valide_le: new Date().toISOString() })
    .eq("id", bilanId);

  await journaliser(bilanId, userId, "statut", null, "valide");
  revalidatePath(`/admin/prepa/bilans/${bilanId}`);
}

/**
 * Envoie le bilan au parent et à l'élève, et le publie dans l'espace élève.
 *
 * L'envoi est ce qui lève l'embargo : la RLS ne laisse l'élève lire son bilan
 * qu'à l'état « envoyé » (§4.4). Un échec d'email est consigné sans bloquer
 * les autres destinataires — mieux vaut un parent servi qu'aucun.
 */
export async function envoyerBilan(formulaire: FormData) {
  const { userId } = await exigerPrepa();
  const bilanId = String(formulaire.get("bilanId") ?? "");

  const admin = createAdminClient();
  const { data: bilan } = await admin
    .from("bilans")
    .select("id, session_cb_id, user_id, statut")
    .eq("id", bilanId)
    .maybeSingle();
  if (!bilan || bilan.statut !== "valide") return;

  const assemble = await assemblerBilan(
    bilan.session_cb_id as string,
    bilan.user_id as string,
  );
  if (!assemble) return;

  const lien = `${urlSite()}/concours-blancs/bilan/${bilanId}`;
  const journal: { destinataire: string; le: string; ok: boolean; erreur?: string }[] = [];

  const destinataires = [
    { email: assemble.eleve.email, prenom: assemble.eleve.prenom },
    ...(assemble.eleve.emailParent
      ? [{ email: assemble.eleve.emailParent, prenom: "" }]
      : []),
  ];

  for (const d of destinataires) {
    try {
      await envoyerEmail(
        d.email,
        emailBilan(
          d.prenom || "Madame, Monsieur",
          assemble.eleve.prenom,
          assemble.session,
          lien,
        ),
      );
      journal.push({ destinataire: d.email, le: new Date().toISOString(), ok: true });
    } catch (e) {
      journal.push({
        destinataire: d.email,
        le: new Date().toISOString(),
        ok: false,
        erreur: e instanceof Error ? e.message : String(e),
      });
    }
  }

  await admin
    .from("bilans")
    .update({
      statut: "envoye",
      envoye_le: new Date().toISOString(),
      destinataires: destinataires.map((d) => d.email),
      log_envoi: journal,
    })
    .eq("id", bilanId);

  await journaliser(bilanId, userId, "statut", "valide", "envoye");

  revalidatePath(`/admin/prepa/bilans/${bilanId}`);
  revalidatePath("/concours-blancs");
}
