import type { Metadata } from "next";
import { PiedDePage } from "@/components/pied-de-page";
import { createAdminClient } from "@/lib/supabase/admin";
import { empreinteJeton } from "@/lib/parent";
import { parMatiere, regularite, type SessionJouee } from "@/lib/progression";
import { BoutonAutoriser } from "./bouton-autoriser";

export const metadata: Metadata = {
  title: "Espace parent — Admissible",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/**
 * Espace parent en lecture seule (§5.1).
 *
 * L'authentification se fait par le jeton de l'URL, pas par une session : le
 * parent n'a pas de compte. Toutes les lectures passent donc par le client
 * service_role, après vérification de l'empreinte du jeton — la RLS ne peut
 * rien exprimer ici, faute d'auth.uid().
 *
 * Aucune action sur le compte de l'élève n'est possible depuis cette page,
 * hormis l'autorisation d'inscription pour les moins de 15 ans.
 */
export default async function EspaceParent({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const admin = createAdminClient();

  const { data: acces } = await admin
    .from("parent_access")
    .select("id, user_id, expires_at")
    .eq("token_hash", empreinteJeton(token))
    .maybeSingle();

  const expire = acces?.expires_at && new Date(acces.expires_at) < new Date();

  if (!acces || expire) {
    return (
      <Cadre>
        <h1 className="mb-3 text-2xl font-black">Lien non valable</h1>
        <p>
          {expire
            ? "Ce lien d'accès a expiré."
            : "Ce lien ne correspond à aucun accès."}{" "}
          Demandez à votre enfant de vous en faire renvoyer un depuis son
          compte.
        </p>
      </Cadre>
    );
  }

  const { data: eleve } = await admin
    .from("users")
    .select("prenom, nom, autorisation_parentale, actif, email_verifie")
    .eq("id", acces.user_id)
    .single();

  if (!eleve) {
    return (
      <Cadre>
        <h1 className="mb-3 text-2xl font-black">Compte introuvable</h1>
        <p>Ce compte élève n&apos;existe plus.</p>
      </Cadre>
    );
  }

  const { data: sessions } = await admin
    .from("sessions")
    .select(
      "id, concours_id, epreuve_id, score_normalise, points, points_max, nb_questions, nb_correctes, completed_at, concours(nom), epreuves(nom)",
    )
    .eq("user_id", acces.user_id)
    .not("completed_at", "is", null)
    .order("completed_at", { ascending: false })
    .limit(200);

  // Trace de consultation, sans bloquer le rendu si l'écriture échoue.
  await admin
    .from("parent_access")
    .update({ dernier_acces: new Date().toISOString() })
    .eq("id", acces.id);

  const jouees = sessions ?? [];
  const moyenne =
    jouees.length > 0
      ? jouees.reduce((s, x) => s + (x.score_normalise ?? 0), 0) / jouees.length
      : null;

  // §5.1 : le parent voit « scores par matière, régularité » — un niveau
  // d'agrégat, jamais le détail des réponses de l'enfant.
  const pourAgregats: SessionJouee[] = jouees.map((s) => ({
    id: s.id as string,
    concoursId: s.concours_id as string,
    concoursNom: (s.concours as unknown as { nom: string } | null)?.nom ?? "—",
    epreuveId: s.epreuve_id as string,
    epreuveNom: nomEpreuve(s.epreuves),
    scoreNormalise: Number(s.score_normalise ?? 0),
    points: Number(s.points ?? 0),
    pointsMax: Number(s.points_max ?? 0),
    nbQuestions: s.nb_questions as number,
    nbCorrectes: s.nb_correctes as number,
    termineeLe: s.completed_at as string,
  }));

  const matieres = parMatiere(pourAgregats);
  const rythme = regularite(pourAgregats);

  return (
    <Cadre>
      <p className="mb-1 text-sm font-extrabold tracking-[.08em] text-primaire-fonce uppercase">
        Espace parent · lecture seule
      </p>
      <h1 className="mb-6 text-[clamp(1.8rem,4vw,2.4rem)] font-black">
        La progression de {eleve.prenom}
      </h1>

      {eleve.autorisation_parentale === "en_attente" && (
        <div className="mb-8 rounded-carte border-2 border-soleil bg-soleil/10 p-5">
          <h2 className="mb-2 text-lg font-extrabold">
            Votre autorisation est nécessaire
          </h2>
          <p className="mb-4 text-[0.95rem]">
            {eleve.prenom} a moins de 15 ans. La réglementation nous impose
            votre accord avant qu&apos;il puisse utiliser la plateforme. Son
            compte est actuellement inactif.
          </p>
          <BoutonAutoriser jeton={token} />
        </div>
      )}

      {eleve.autorisation_parentale === "accordee" && !eleve.email_verifie && (
        <p className="mb-8 rounded-carte bg-fond-doux p-4 text-sm">
          Merci, votre autorisation est enregistrée. Il reste à {eleve.prenom} à
          confirmer son adresse email depuis le message que nous lui avons
          envoyé.
        </p>
      )}

      <div className="mb-8 grid gap-4 sm:grid-cols-3">
        <Compteur
          valeur={String(jouees.length)}
          libelle={jouees.length <= 1 ? "session jouée" : "sessions jouées"}
        />
        <Compteur
          valeur={moyenne === null ? "—" : `${Math.round(moyenne * 100)} %`}
          libelle="score moyen"
        />
        <Compteur
          valeur={
            jouees.length === 0
              ? "—"
              : `${rythme.semainesJouees}/${rythme.semainesObservees}`
          }
          libelle="semaines actives (2 mois)"
        />
      </div>

      {jouees.length === 0 ? (
        <p className="rounded-carte border border-ligne bg-white p-6">
          {eleve.actif
            ? `${eleve.prenom} n'a pas encore joué de session. Les résultats apparaîtront ici dès la première.`
            : `Le compte de ${eleve.prenom} n'est pas encore actif.`}
        </p>
      ) : (
        <>
          <h2 className="mb-3 text-lg font-extrabold">Par matière</h2>
          <div className="mb-8 overflow-x-auto rounded-carte border border-ligne bg-white">
            <table className="w-full border-collapse text-[0.95rem]">
              <thead>
                <tr className="bg-fond-doux text-left">
                  <th className="px-4 py-3 font-extrabold text-encre">Matière</th>
                  <th className="px-4 py-3 font-extrabold text-encre">Sessions</th>
                  <th className="px-4 py-3 font-extrabold text-encre">
                    Score moyen
                  </th>
                  <th className="px-4 py-3 font-extrabold text-encre">Tendance</th>
                </tr>
              </thead>
              <tbody>
                {matieres.map((m) => (
                  <tr key={m.epreuveId} className="border-t border-ligne">
                    <td className="px-4 py-3 font-bold text-encre">
                      {m.epreuveNom}
                    </td>
                    <td className="px-4 py-3 tabular-nums">{m.nbSessions}</td>
                    <td className="px-4 py-3 tabular-nums">
                      {Math.round(m.scoreMoyen * 100)} %
                    </td>
                    <td className="px-4 py-3">
                      {m.tendance === "hausse"
                        ? "en progrès"
                        : m.tendance === "baisse"
                          ? "en baisse"
                          : m.tendance === "stable"
                            ? "stable"
                            : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <h2 className="mb-3 text-lg font-extrabold">Dernières sessions</h2>
          <div className="overflow-x-auto rounded-carte border border-ligne bg-white">
            <table className="w-full border-collapse text-[0.95rem]">
              <thead>
                <tr className="bg-fond-doux text-left">
                  <th className="px-4 py-3 font-extrabold text-encre">Épreuve</th>
                  <th className="px-4 py-3 font-extrabold text-encre">Score</th>
                  <th className="px-4 py-3 font-extrabold text-encre">Date</th>
                </tr>
              </thead>
              <tbody>
                {jouees.slice(0, 10).map((s, i) => (
                  <tr key={i} className="border-t border-ligne">
                    <td className="px-4 py-3">{nomEpreuve(s.epreuves)}</td>
                    <td className="px-4 py-3 font-bold tabular-nums">
                      {s.score_normalise === null
                        ? "—"
                        : `${Math.round(s.score_normalise * 100)} %`}
                    </td>
                    <td className="px-4 py-3">
                      {s.completed_at
                        ? new Date(s.completed_at).toLocaleDateString("fr-FR")
                        : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <p className="mt-8 rounded-carte bg-fond-doux p-5 text-[0.95rem]">
        <strong className="text-encre">Aidez-le à garder le rythme.</strong> La
        régularité compte davantage que la durée : quelques sessions par semaine
        valent mieux qu&apos;une longue séance isolée.
      </p>

      <p className="mt-6 text-[0.82rem] opacity-70">
        Cet accès est en lecture seule. Il ne permet ni de modifier le compte de
        votre enfant, ni de consulter le détail de ses réponses. Conservez ce
        lien : il vous est personnel.
      </p>
    </Cadre>
  );
}

function Cadre({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto flex w-full max-w-[720px] flex-1 flex-col px-[22px]">
      <header className="py-5">
        <span className="text-[1.4rem] leading-none font-black tracking-tight text-encre">
          Admissible<span className="text-primaire">.</span>
        </span>
      </header>
      <main className="flex-1 pb-16">{children}</main>
      <PiedDePage />
    </div>
  );
}

/**
 * PostgREST renvoie une jointure tantôt comme objet, tantôt comme tableau
 * selon la cardinalité qu'il infère. Sans types générés, on absorbe les deux.
 */
function nomEpreuve(epreuves: unknown): string {
  const e = Array.isArray(epreuves) ? epreuves[0] : epreuves;
  return (e as { nom?: string } | null)?.nom ?? "—";
}

function Compteur({ valeur, libelle }: { valeur: string; libelle: string }) {
  return (
    <div className="rounded-carte border border-ligne bg-white p-5">
      <p className="text-3xl font-black text-encre">{valeur}</p>
      <p className="text-[0.95rem]">{libelle}</p>
    </div>
  );
}
