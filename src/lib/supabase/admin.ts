import "server-only";

import { createClient } from "@supabase/supabase-js";

/**
 * Client service_role — contourne la RLS. À n'utiliser que dans du code serveur,
 * pour les cas où la RLS ne peut pas exprimer la règle :
 *
 *  - servir les questions d'une session en retirant `est_correcte` et les
 *    explications non relues (§5.3, §6.1) ;
 *  - valider un jeton d'espace parent, le parent n'étant pas authentifié (§5.1).
 *
 * L'import de `server-only` fait échouer le build si ce module est tiré dans un
 * bundle client.
 */
export function createAdminClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY manquante");
  }

  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
