import "server-only";

import { createHash, randomBytes } from "node:crypto";

/**
 * Jetons d'accès à l'espace parent (§5.1 : lien magique, pas de mot de passe).
 *
 * Le jeton en clair ne part que dans l'email ; la base ne stocke que son
 * empreinte, comme un mot de passe. Un accès en lecture à la table ne permet
 * donc pas d'ouvrir les espaces parents.
 */
export function creerJetonParent() {
  const jeton = randomBytes(32).toString("base64url");
  return { jeton, empreinte: empreinteJeton(jeton) };
}

export function empreinteJeton(jeton: string) {
  return createHash("sha256").update(jeton).digest("hex");
}

export function urlEspaceParent(jeton: string) {
  return `${urlSite()}/parent/${jeton}`;
}

export function urlSite() {
  return (
    process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ??
    "http://localhost:3000"
  );
}
