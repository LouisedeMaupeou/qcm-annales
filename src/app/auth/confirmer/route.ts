import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Point d'arrivée des liens envoyés par email : double opt-in et
 * réinitialisation de mot de passe.
 */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const tokenHash = params.get("token_hash");
  const type = params.get("type") as EmailOtpType | null;

  if (!tokenHash || !type) {
    return redirige(request, "/connexion?erreur=lien_invalide");
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.verifyOtp({
    type,
    token_hash: tokenHash,
  });

  if (error || !data.user) {
    return redirige(request, "/connexion?erreur=lien_expire");
  }

  if (type === "recovery") {
    // La session ouverte par le lien autorise le changement de mot de passe.
    return redirige(request, "/reinitialiser");
  }

  // Double opt-in confirmé : le trigger users_calculer_actif active le compte
  // dès que l'email est vérifié (et le compte non suspendu).
  const admin = createAdminClient();
  const { data: profil } = await admin
    .from("users")
    .update({ email_verifie: true })
    .eq("id", data.user.id)
    .select("actif")
    .single();

  // verifyOtp a ouvert une session. Si le compte reste inutilisable (compte
  // suspendu par un admin), on la referme aussitôt.
  if (profil && !profil.actif) {
    await supabase.auth.signOut();
    return redirige(request, "/connexion?erreur=compte_inactif");
  }

  return redirige(request, "/tableau-de-bord?bienvenue=1");
}

function redirige(request: NextRequest, chemin: string) {
  const url = request.nextUrl.clone();
  const [pathname, recherche] = chemin.split("?");
  url.pathname = pathname;
  url.search = recherche ?? "";
  return NextResponse.redirect(url);
}
