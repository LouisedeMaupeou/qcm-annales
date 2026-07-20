/**
 * Vérification de la configuration, exécutée au build (cf. next.config.ts).
 *
 * Le principe : une variable dont l'absence casse une fonction *silencieusement*
 * doit faire échouer le build, pas se découvrir en production. C'est le cas de
 * l'envoi d'emails — sans clé, les messages sont écrits en console et un élève
 * de moins de 15 ans reste bloqué sans que personne ne le sache — et de l'URL
 * publique, sans laquelle tous les liens envoyés pointent vers localhost.
 */

type Manquante = { nom: string; pourquoi: string };

export function verifierEnvironnement(env: NodeJS.ProcessEnv = process.env) {
  const requisesPartout: Manquante[] = [
    {
      nom: "NEXT_PUBLIC_SUPABASE_URL",
      pourquoi: "aucune connexion à la base",
    },
    {
      nom: "NEXT_PUBLIC_SUPABASE_ANON_KEY",
      pourquoi: "aucune session utilisateur possible",
    },
    {
      nom: "SUPABASE_SERVICE_ROLE_KEY",
      pourquoi:
        "le contenu des sessions et l'espace parent ne peuvent pas être servis",
    },
  ];

  const requisesEnProduction: Manquante[] = [
    {
      nom: "RESEND_API_KEY",
      pourquoi:
        "les emails ne partiraient pas : double opt-in impossible, et un élève de moins de 15 ans resterait bloqué faute d'autorisation parentale (§5.1)",
    },
    {
      nom: "NEXT_PUBLIC_SITE_URL",
      pourquoi:
        "les liens de confirmation et d'accès parent pointeraient vers localhost",
    },
  ];

  // `next build` bascule NODE_ENV en production même en local : ce n'est pas le
  // bon signal. On durcit sur un déploiement de production réel — VERCEL_ENV
  // est posé par la plateforme — ou sur demande explicite.
  const deploiementProduction =
    env.VERCEL_ENV === "production" || env.VERIFIER_PROD === "1";

  const manquantesPartout = requisesPartout.filter(({ nom }) => !env[nom]?.trim());
  const manquantesProd = requisesEnProduction.filter(({ nom }) => !env[nom]?.trim());

  const bloquantes = deploiementProduction
    ? [...manquantesPartout, ...manquantesProd]
    : manquantesPartout;

  if (bloquantes.length > 0) {
    const detail = bloquantes.map((m) => `  - ${m.nom} : ${m.pourquoi}`).join("\n");
    throw new Error(
      `Configuration incomplète (${bloquantes.length} variable(s) manquante(s)) :\n${detail}\n\n` +
        `Renseigne-les dans .env.local en local, ou dans les variables d'environnement du déploiement.`,
    );
  }

  // Hors production, on avertit sans bloquer : le build local doit rester
  // possible sans compte Resend.
  if (!deploiementProduction && manquantesProd.length > 0) {
    console.warn(
      `\n⚠ ${manquantesProd.length} variable(s) absente(s) — sans conséquence en local, bloquantes en production :\n` +
        manquantesProd.map((m) => `  - ${m.nom}`).join("\n") +
        `\n  (les emails seront écrits dans la console au lieu d'être envoyés)\n`,
    );
  }

  if (deploiementProduction) {
    const url = env.NEXT_PUBLIC_SITE_URL ?? "";
    if (url.includes("localhost") || url.startsWith("http://")) {
      throw new Error(
        `NEXT_PUBLIC_SITE_URL vaut « ${url} » : en production, les liens envoyés par email doivent pointer vers l'URL publique en HTTPS.`,
      );
    }
  }
}
