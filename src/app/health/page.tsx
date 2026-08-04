import "server-only";
import type { Metadata } from "next";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Page de contrôle d'infrastructure (§12, fin d'étape 1). Cinq voyants vérifiés
// à chaque chargement : configuration, connexion au projet, clé service_role,
// schéma appliqué, seed du POC ACCÈS. Rien n'est mis en cache — l'intérêt est
// de refléter l'état réel de la base au moment où on regarde.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "État du système — Admissible",
  robots: { index: false, follow: false },
};

type Etat = "ok" | "ko" | "attention";
type Voyant = { titre: string; etat: Etat; detail: string };

// Tables attendues après application des migrations (§7).
const TABLES_CLES = [
  "concours",
  "epreuves",
  "baremes",
  "annales",
  "blocs",
  "questions",
  "reponses_possibles",
  "sessions",
] as const;

/** Compte les lignes d'une table sans les rapatrier (head + count exact). */
async function compter(
  db: SupabaseClient,
  table: string,
  filtre?: (q: ReturnType<SupabaseClient["from"]>) => unknown,
) {
  let requete = db.from(table).select("*", { count: "exact", head: true });
  if (filtre) requete = filtre(requete) as typeof requete;
  const { count, error } = await requete;
  if (error) throw new Error(error.message);
  return count ?? 0;
}

async function construireVoyants(): Promise<Voyant[]> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const clePub = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  const cleSecrete = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

  const voyants: Voyant[] = [];

  // 1 — Configuration : présence et format des trois variables. Les nouvelles
  // clés Supabase (sb_publishable_ / sb_secret_) comme les anciennes (JWT eyJ…)
  // sont acceptées ; on signale seulement un format inattendu, sans bloquer.
  {
    const manquantes = [
      ["NEXT_PUBLIC_SUPABASE_URL", url],
      ["NEXT_PUBLIC_SUPABASE_ANON_KEY", clePub],
      ["SUPABASE_SERVICE_ROLE_KEY", cleSecrete],
    ]
      .filter(([, v]) => !v)
      .map(([n]) => n);

    if (manquantes.length > 0) {
      voyants.push({
        titre: "Configuration (.env.local)",
        etat: "ko",
        detail: `Variable(s) absente(s) : ${manquantes.join(", ")}.`,
      });
    } else {
      const formatDouteux: string[] = [];
      if (!/^https:\/\/.+\.supabase\.co\/?$/.test(url!))
        formatDouteux.push("URL");
      if (!/^(sb_publishable_|eyJ)/.test(clePub!))
        formatDouteux.push("clé publiable");
      if (!/^(sb_secret_|eyJ)/.test(cleSecrete!))
        formatDouteux.push("clé secrète");

      const pub = clePub!.startsWith("sb_publishable_")
        ? "nouveau format sb_publishable_"
        : "format JWT hérité";
      const sec = cleSecrete!.startsWith("sb_secret_")
        ? "nouveau format sb_secret_"
        : "format JWT hérité";

      voyants.push({
        titre: "Configuration (.env.local)",
        etat: formatDouteux.length > 0 ? "attention" : "ok",
        detail:
          formatDouteux.length > 0
            ? `Trois variables présentes, format inattendu : ${formatDouteux.join(", ")}.`
            : `Trois variables présentes. Clé publiable : ${pub}. Clé secrète : ${sec}.`,
      });
    }
  }

  // 2 — Connexion au projet Supabase avec la clé publiable. La passerelle valide
  // la clé avant de servir /auth/v1/health : 200 prouve que l'URL est joignable
  // et que la clé publiable est acceptée, 401 la rejette. On ne lit aucune table
  // (anon n'a aucun droit, §9), et le point d'entrée REST exige désormais une
  // clé secrète — inadapté pour tester la publiable.
  if (url && clePub) {
    try {
      const reponse = await fetch(
        `${url.replace(/\/$/, "")}/auth/v1/health`,
        { headers: { apikey: clePub }, cache: "no-store" },
      );
      voyants.push({
        titre: "Connexion au projet (clé publiable)",
        etat: reponse.ok ? "ok" : "ko",
        detail: reponse.ok
          ? "Le projet répond et accepte la clé publiable."
          : `Le serveur a répondu ${reponse.status} : clé publiable rejetée ou projet injoignable.`,
      });
    } catch (e) {
      voyants.push({
        titre: "Connexion au projet (clé publiable)",
        etat: "ko",
        detail: `Projet injoignable : ${(e as Error).message}.`,
      });
    }
  } else {
    voyants.push({
      titre: "Connexion au projet (clé publiable)",
      etat: "ko",
      detail: "URL ou clé publiable absente — connexion non testée.",
    });
  }

  // Client service_role partagé par les voyants 3 à 5. Contourne la RLS.
  const admin =
    url && cleSecrete
      ? createClient(url, cleSecrete, {
          auth: { autoRefreshToken: false, persistSession: false },
        })
      : null;

  // 3 — La clé secrète contourne bien la RLS. `questions` est fermé à tout le
  // monde sauf staff et service_role (§9) : la lire prouve que la clé placée
  // dans SUPABASE_SERVICE_ROLE_KEY est bien une clé secrète, pas la publiable.
  if (admin) {
    try {
      const n = await compter(admin, "questions");
      voyants.push({
        titre: "Clé service_role (accès serveur)",
        etat: "ok",
        detail: `Lecture de « questions » autorisée : la RLS est contournée (${n} questions).`,
      });
    } catch (e) {
      voyants.push({
        titre: "Clé service_role (accès serveur)",
        etat: "ko",
        detail: `Lecture refusée : ${(e as Error).message}. La clé n'est pas une clé secrète valide.`,
      });
    }
  } else {
    voyants.push({
      titre: "Clé service_role (accès serveur)",
      etat: "ko",
      detail: "Clé secrète absente — accès serveur non testé.",
    });
  }

  // 4 — Schéma appliqué : les tables clés des migrations existent.
  if (admin) {
    const manquantes: string[] = [];
    for (const table of TABLES_CLES) {
      try {
        await compter(admin, table);
      } catch {
        manquantes.push(table);
      }
    }
    voyants.push({
      titre: "Schéma appliqué (migrations)",
      etat: manquantes.length === 0 ? "ok" : "ko",
      detail:
        manquantes.length === 0
          ? `Les ${TABLES_CLES.length} tables clés du schéma répondent.`
          : `Table(s) absente(s) : ${manquantes.join(", ")}. Lancer « supabase db push ».`,
    });
  } else {
    voyants.push({
      titre: "Schéma appliqué (migrations)",
      etat: "ko",
      detail: "Clé secrète absente — schéma non testé.",
    });
  }

  // 5 — Seed du POC : annale ACCÈS 2025 présente avec ses questions.
  if (admin) {
    try {
      const { data: concours, error: eC } = await admin
        .from("concours")
        .select("id")
        .eq("nom", "ACCÈS")
        .maybeSingle();
      if (eC) throw new Error(eC.message);
      if (!concours) throw new Error("concours ACCÈS absent");

      const { data: annale, error: eA } = await admin
        .from("annales")
        .select("id, statut")
        .eq("concours_id", concours.id)
        .eq("annee", 2025)
        .maybeSingle();
      if (eA) throw new Error(eA.message);
      if (!annale) throw new Error("annale ACCÈS 2025 absente");

      const { data: blocs, error: eB } = await admin
        .from("blocs")
        .select("id")
        .eq("annale_id", annale.id);
      if (eB) throw new Error(eB.message);
      const ids = (blocs ?? []).map((b) => b.id);

      const total = ids.length
        ? await compter(admin, "questions", (q) =>
            (q as ReturnType<SupabaseClient["from"]>).in("bloc_id", ids),
          )
        : 0;
      const publiees = ids.length
        ? await compter(admin, "questions", (q) =>
            (q as ReturnType<SupabaseClient["from"]>)
              .in("bloc_id", ids)
              .eq("statut", "publie"),
          )
        : 0;

      voyants.push({
        titre: "Données du POC ACCÈS 2025",
        etat: total > 0 ? "ok" : "ko",
        detail:
          total > 0
            ? `Annale présente (${annale.statut}) : ${total} questions, ${publiees} publiées, ${total - publiees} en relecture, sur ${ids.length} blocs.`
            : "Annale ACCÈS 2025 sans question — relancer le seed.",
      });
    } catch (e) {
      voyants.push({
        titre: "Données du POC ACCÈS 2025",
        etat: "ko",
        detail: `${(e as Error).message}. Lancer « node --env-file=.env.local scripts/seed-acces-2025.mjs ».`,
      });
    }
  } else {
    voyants.push({
      titre: "Données du POC ACCÈS 2025",
      etat: "ko",
      detail: "Clé secrète absente — seed non vérifié.",
    });
  }

  return voyants;
}

const COULEUR: Record<Etat, string> = {
  ok: "#16a34a",
  attention: "var(--color-soleil)",
  ko: "var(--color-negatif)",
};
const LIBELLE: Record<Etat, string> = {
  ok: "OK",
  attention: "À vérifier",
  ko: "En échec",
};

export default async function PageSante() {
  const voyants = await construireVoyants();
  const nbOk = voyants.filter((v) => v.etat === "ok").length;
  const global: Etat = voyants.some((v) => v.etat === "ko")
    ? "ko"
    : voyants.some((v) => v.etat === "attention")
      ? "attention"
      : "ok";

  return (
    <div className="mx-auto flex w-full max-w-[720px] flex-1 flex-col px-[22px]">
      <header className="py-5">
        <span className="text-[1.4rem] leading-none font-black tracking-tight text-encre">
          Admissible<span className="text-primaire">.</span>
        </span>
      </header>

      <main className="flex-1 py-8">
        <h1 className="mb-1 text-[clamp(1.6rem,4vw,2.2rem)] font-black">
          État du système
        </h1>
        <p className="mb-6 text-sm text-texte">
          Contrôle d&apos;infrastructure de fin d&apos;étape 1 — {nbOk}/
          {voyants.length} voyants au vert.
        </p>

        <div
          className="mb-6 flex items-center gap-3 rounded-carte border-2 p-4"
          style={{
            borderColor: COULEUR[global],
            backgroundColor: `color-mix(in srgb, ${COULEUR[global]} 10%, transparent)`,
          }}
        >
          <span
            className="inline-block h-3.5 w-3.5 shrink-0 rounded-full"
            style={{ backgroundColor: COULEUR[global] }}
          />
          <span className="font-bold text-encre">
            {global === "ok"
              ? "Tout est opérationnel."
              : global === "attention"
                ? "Opérationnel, un point à vérifier."
                : "Un ou plusieurs contrôles ont échoué."}
          </span>
        </div>

        <ul className="flex flex-col gap-3">
          {voyants.map((v, i) => (
            <li
              key={i}
              className="flex items-start gap-3 rounded-carte border-2 border-ligne bg-white/70 p-4"
            >
              <span
                className="mt-1 inline-block h-3.5 w-3.5 shrink-0 rounded-full"
                style={{ backgroundColor: COULEUR[v.etat] }}
                aria-hidden
              />
              <div className="min-w-0">
                <div className="flex flex-wrap items-baseline gap-x-2">
                  <span className="font-bold text-encre">{v.titre}</span>
                  <span
                    className="text-xs font-bold"
                    style={{ color: COULEUR[v.etat] }}
                  >
                    {LIBELLE[v.etat]}
                  </span>
                </div>
                <p className="text-sm text-texte">{v.detail}</p>
              </div>
            </li>
          ))}
        </ul>

        <p className="mt-6 text-xs text-texte">
          Page rechargée à chaque visite (aucun cache). Non indexée, non liée
          depuis le site — à retirer ou protéger avant la mise en production.
        </p>
      </main>
    </div>
  );
}
