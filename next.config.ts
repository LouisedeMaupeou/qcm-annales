import type { NextConfig } from "next";
import { verifierEnvironnement } from "./src/lib/env";

// Exécuté au build : une configuration incomplète doit arrêter le déploiement,
// pas se découvrir quand un parent n'a jamais reçu sa demande d'autorisation.
verifierEnvironnement();

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // Le zip d'images d'un concours blanc pèse une vingtaine de méga-octets
      // (les sujets SÉSAME sont des captures, une par question). La limite par
      // défaut d'une Server Action est de 1 Mo : l'import serait refusé avant
      // même d'atteindre notre propre contrôle de taille.
      bodySizeLimit: "40mb",
    },
  },
  async headers() {
    return [
      {
        source: "/:chemin*",
        headers: [
          // Le jeton d'accès parent voyage dans l'URL : aucun referer ne doit
          // partir vers un tiers avec le chemin complet.
          { key: "Referrer-Policy", value: "same-origin" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(), interest-cohort=()",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
