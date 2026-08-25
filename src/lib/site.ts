/** URL de base du site, pour construire les liens envoyés par email. */
export function urlSite() {
  return (
    process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ??
    "http://localhost:3000"
  );
}
