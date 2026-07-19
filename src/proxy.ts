import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/** Pages accessibles sans compte connecté. */
const PUBLIQUES = [
  "/",
  "/inscription",
  "/connexion",
  "/mot-de-passe-oublie",
  "/reinitialiser",
  "/mentions-legales",
  "/cgu",
  "/confidentialite",
  "/health",
];

/** L'espace parent s'authentifie par son jeton d'URL, pas par une session. */
const PREFIXES_PUBLICS = ["/parent/", "/auth/"];

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookiesToSet) => {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // getUser() revalide le jeton auprès de Supabase — contrairement à
  // getSession(), qui se contente de lire le cookie et accepterait un jeton
  // forgé. Cet appel rafraîchit aussi la session au passage.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const chemin = request.nextUrl.pathname;
  const publique =
    PUBLIQUES.includes(chemin) ||
    PREFIXES_PUBLICS.some((p) => chemin.startsWith(p));

  if (!user && !publique) {
    const url = request.nextUrl.clone();
    url.pathname = "/connexion";
    url.searchParams.set("suite", chemin);
    return NextResponse.redirect(url);
  }

  // Avoir une session ne suffit pas : le compte doit être actif.
  //
  // Sans ce contrôle, un élève de moins de 15 ans dont le parent n'a pas encore
  // autorisé l'inscription entrerait malgré tout — la confirmation d'adresse
  // email ouvre une session, et vérifier `actif` uniquement à la connexion
  // laisse cette porte ouverte. Le §5.1 impose que le compte reste inutilisable
  // jusqu'à l'accord parental, donc le contrôle appartient à la requête, pas au
  // seul formulaire de connexion.
  //
  // La lecture passe par la politique users_select_self : pas besoin du
  // service_role ici.
  if (user && !publique) {
    const { data: profil } = await supabase
      .from("users")
      .select("actif")
      .eq("id", user.id)
      .single();

    if (!profil?.actif) {
      const url = request.nextUrl.clone();
      url.pathname = "/connexion";
      url.search = "?erreur=compte_inactif";
      const redirection = NextResponse.redirect(url);
      // La session est révoquée pour que le rafraîchissement automatique ne
      // rouvre pas l'accès au coup d'après.
      await supabase.auth.signOut();
      response.cookies
        .getAll()
        .forEach((c) => redirection.cookies.set(c.name, c.value, c));
      return redirection;
    }
  }

  return response;
}

export const config = {
  matcher: [
    // Tout sauf les fichiers statiques et les images.
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
