import "server-only";

import { Resend } from "resend";

/**
 * Envoi des emails transactionnels (§5.1).
 *
 * Sans RESEND_API_KEY, l'email est écrit dans la console du serveur au lieu
 * d'être envoyé. C'est ce qui permet de dérouler tout le parcours d'inscription
 * en local sans compte Resend — les liens restent cliquables depuis le
 * terminal. En production, l'absence de clé doit faire échouer le déploiement :
 * cf. la vérification dans verifierConfigurationEmail().
 */
const EXPEDITEUR = process.env.EMAIL_EXPEDITEUR ?? "Admissible <onboarding@resend.dev>";

export function verifierConfigurationEmail() {
  if (process.env.NODE_ENV === "production" && !process.env.RESEND_API_KEY) {
    throw new Error(
      "RESEND_API_KEY manquante : les emails d'autorisation parentale ne partiraient pas.",
    );
  }
}

type Email = {
  destinataire: string;
  sujet: string;
  html: string;
};

async function envoyer({ destinataire, sujet, html }: Email) {
  const cle = process.env.RESEND_API_KEY;

  if (!cle) {
    console.info(
      `\n📧 [email non envoyé — RESEND_API_KEY absente]\n   à : ${destinataire}\n   objet : ${sujet}\n${html
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim()}\n`,
    );
    return { simule: true as const };
  }

  const { error } = await new Resend(cle).emails.send({
    from: EXPEDITEUR,
    to: destinataire,
    subject: sujet,
    html,
  });

  if (error) throw new Error(`Envoi email échoué : ${error.message}`);
  return { simule: false as const };
}

// ---------------------------------------------------------------------------
// Gabarit
// ---------------------------------------------------------------------------
function gabarit(titre: string, corps: string, cta?: { url: string; texte: string }) {
  return `
<div style="font-family:system-ui,-apple-system,'Segoe UI',sans-serif;line-height:1.6;color:#3D4B5C;max-width:560px;margin:0 auto;padding:24px">
  <p style="font-size:22px;font-weight:800;color:#12263A;margin:0 0 4px">Admissible</p>
  <p style="font-size:12px;color:#3D4B5C;margin:0 0 24px">un service Parkours</p>
  <h1 style="font-size:20px;color:#12263A;margin:0 0 16px">${titre}</h1>
  ${corps}
  ${
    cta
      ? `<p style="margin:28px 0"><a href="${cta.url}" style="background:#2563EB;color:#fff;text-decoration:none;font-weight:700;border-radius:999px;padding:13px 26px;display:inline-block">${cta.texte}</a></p>
         <p style="font-size:12px;color:#6b7a8d">Si le bouton ne fonctionne pas, copiez ce lien dans votre navigateur :<br>${cta.url}</p>`
      : ""
  }
  <hr style="border:none;border-top:1px solid #E2E8F3;margin:28px 0">
  <p style="font-size:12px;color:#6b7a8d">
    Cet email vous est adressé parce qu'une inscription a été faite sur Admissible.
    Si vous n'en êtes pas à l'origine, vous pouvez l'ignorer : sans action de votre part, aucun compte ne sera activé.
  </p>
</div>`;
}

// ---------------------------------------------------------------------------
// Emails
// ---------------------------------------------------------------------------

/** Double opt-in élève (§5.1). */
export function emailConfirmationEleve(prenom: string, url: string) {
  return {
    sujet: "Confirme ton adresse email",
    html: gabarit(
      `Bienvenue ${prenom} !`,
      `<p>Encore un clic et ton compte est prêt. Confirme ton adresse email pour commencer à t'entraîner sur les annales officielles.</p>`,
      { url, texte: "Confirmer mon adresse" },
    ),
  };
}

/** Réinitialisation de mot de passe. */
export function emailReinitialisation(url: string) {
  return {
    sujet: "Réinitialiser ton mot de passe",
    html: gabarit(
      "Nouveau mot de passe",
      `<p>Tu as demandé à réinitialiser ton mot de passe. Ce lien est valable une heure.</p>`,
      { url, texte: "Choisir un nouveau mot de passe" },
    ),
  };
}

/**
 * Invitation d'un élève rattaché à une cohorte de la prépa (module concours
 * blancs, §5.1). Le compte existe déjà — c'est l'établissement qui l'a créé
 * au titre du contrat de scolarité — il ne reste qu'à choisir un mot de passe.
 */
export function emailInvitationPrepa(prenom: string, cohorte: string, url: string) {
  return {
    sujet: "Ton accès à la plateforme des concours blancs Parkours",
    html: gabarit(
      `Bienvenue ${prenom} !`,
      `<p>Ton compte Admissible est prêt : il te donne accès aux <strong>concours blancs de la prépa Parkours</strong> (${cohorte}), à tes bilans, et à l'entraînement libre sur les annales officielles.</p>
       <p>Choisis ton mot de passe pour l'activer : c'est ensuite le même identifiant pour tout le site.</p>`,
      { url, texte: "Choisir mon mot de passe" },
    ),
  };
}

/**
 * Relance d'un élève qui n'a pas encore composé (module concours blancs,
 * §5.2). Aucun détail du sujet : la relance part pendant la fenêtre, et
 * d'autres élèves n'ont pas encore composé.
 */
export function emailRelanceConcoursBlanc(
  prenom: string,
  epreuve: string,
  fenetreFin: string | null,
  url: string,
) {
  const echeance = fenetreFin
    ? new Date(fenetreFin).toLocaleString("fr-FR", {
        dateStyle: "full",
        timeStyle: "short",
      })
    : null;

  return {
    sujet: `Concours blanc à composer : ${epreuve}`,
    html: gabarit(
      `${prenom}, il te reste une épreuve à passer`,
      `<p>Tu n'as pas encore composé l'épreuve <strong>${epreuve}</strong> du concours blanc.</p>
       ${echeance ? `<p>La fenêtre de passage se ferme le <strong>${echeance}</strong>.</p>` : ""}
       <p>Prévois d'être au calme : le chronomètre démarre dès que tu ouvres l'épreuve, et tu n'as qu'une tentative.</p>`,
      { url, texte: "Voir mes concours blancs" },
    ),
  };
}

export async function envoyerEmail(destinataire: string, email: { sujet: string; html: string }) {
  return envoyer({ destinataire, ...email });
}
