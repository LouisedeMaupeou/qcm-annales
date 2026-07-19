import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/** Les 15 tables du §7. */
const TABLES_ATTENDUES = [
  "users",
  "parent_access",
  "user_concours_vises",
  "concours",
  "epreuves",
  "baremes",
  "annales",
  "annale_documents",
  "blocs",
  "bloc_documents",
  "questions",
  "reponses_possibles",
  "sessions",
  "session_questions",
  "signalements",
] as const;

/**
 * Page de vérification du socle (étape 1 du §12) — à supprimer avant la mise en
 * production.
 *
 * Deux lectures volontairement différentes :
 *  - service_role, qui contourne la RLS, pour vérifier que le schéma et le seed
 *    sont bien en place ;
 *  - clé anon, qui y est soumise, pour vérifier que la RLS ferme bien la porte
 *    à un visiteur non connecté (§9). Ce second test doit renvoyer 0 ligne.
 */
export default async function HealthPage() {
  const envOk =
    !!process.env.NEXT_PUBLIC_SUPABASE_URL &&
    !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY &&
    !!process.env.SUPABASE_SERVICE_ROLE_KEY;

  let concours: { nom: string; filiere: string; taille_session: number }[] = [];
  let tables = 0;
  let fuiteAnon: number | null = null;
  let erreur: string | null = null;

  if (envOk) {
    try {
      const admin = createAdminClient();

      const { data, error } = await admin
        .from("concours")
        .select("nom, filiere, taille_session")
        .order("filiere")
        .order("nom");
      if (error) throw new Error(error.message);
      concours = data ?? [];

      const presentes = await Promise.all(
        TABLES_ATTENDUES.map(async (nom) => {
          const { error } = await admin
            .from(nom)
            .select("*", { count: "exact", head: true });
          return !error;
        }),
      );
      tables = presentes.filter(Boolean).length;

      // La clé anon ne doit rien voir.
      const anon = await createClient();
      const { data: leak } = await anon.from("concours").select("id");
      fuiteAnon = leak?.length ?? 0;
    } catch (e) {
      erreur = e instanceof Error ? e.message : String(e);
    }
  }

  return (
    <main className="mx-auto max-w-2xl p-6 font-sans">
      <h1 className="text-2xl font-bold">Socle — vérification</h1>

      <ul className="mt-6 space-y-2 text-sm">
        <Check ok={envOk} label="Variables d'environnement Supabase" />
        <Check ok={envOk && !erreur} label="Connexion à la base" />
        <Check ok={tables >= 15} label={`Tables du §7 créées (${tables}/15)`} />
        <Check
          ok={concours.length === 6}
          label={`Référentiel concours seedé (${concours.length}/6)`}
        />
        <Check
          ok={fuiteAnon === 0}
          label={
            fuiteAnon === null
              ? "RLS : test non exécuté"
              : `RLS : visiteur anonyme ne lit rien (${fuiteAnon} ligne(s) exposée(s))`
          }
        />
      </ul>

      {erreur && (
        <p className="mt-4 rounded bg-red-50 p-3 text-sm text-red-800">
          {erreur}
        </p>
      )}

      {concours.length > 0 && (
        <table className="mt-6 w-full border-collapse text-sm">
          <thead>
            <tr className="border-b text-left">
              <th className="py-2">Concours</th>
              <th className="py-2">Filière</th>
              <th className="py-2">Taille de session</th>
            </tr>
          </thead>
          <tbody>
            {concours.map((c) => (
              <tr key={c.nom} className="border-b">
                <td className="py-2">{c.nom}</td>
                <td className="py-2">{c.filiere}</td>
                <td className="py-2">{c.taille_session}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}

function Check({ ok, label }: { ok: boolean; label: string }) {
  return (
    <li className="flex items-center gap-2">
      <span className={ok ? "text-green-600" : "text-red-600"}>
        {ok ? "✓" : "✗"}
      </span>
      {label}
    </li>
  );
}
