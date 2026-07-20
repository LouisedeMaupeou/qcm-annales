import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Chargement de la section Élèves (§6.2).
 *
 * Les fiches élèves contiennent des données personnelles de mineurs : ces
 * lectures passent par le service_role après contrôle du rôle admin dans la
 * page appelante, jamais depuis un composant client.
 */

export type FiltresEleves = {
  recherche?: string;
  concoursId?: string;
  consentement?: "oui" | "non";
  statut?: "actifs" | "inactifs" | "attente_parent";
};

export type LigneEleve = {
  id: string;
  email: string;
  nom: string;
  prenom: string;
  dateNaissance: string;
  ville: string | null;
  etablissement: string | null;
  emailParent: string | null;
  consentMarketing: boolean;
  consentMarketingDate: string | null;
  cguAccepteesDate: string | null;
  emailVerifie: boolean;
  autorisationParentale: string;
  actif: boolean;
  suspendu: boolean;
  creeLe: string;
  concoursVises: string[];
  concoursIds: string[];
  nbSessions: number;
  scoreMoyen: number | null;
  derniereActivite: string | null;
};

export async function chargerEleves(
  filtres: FiltresEleves = {},
): Promise<LigneEleve[]> {
  const admin = createAdminClient();

  const [{ data: utilisateurs }, { data: vises }, { data: sessions }] =
    await Promise.all([
      admin
        .from("users")
        .select(
          "id, email, nom, prenom, date_naissance, ville, etablissement, email_parent, consent_marketing, consent_marketing_date, cgu_acceptees_date, email_verifie, autorisation_parentale, actif, suspendu, created_at",
        )
        .eq("role", "eleve")
        .order("created_at", { ascending: false }),
      admin.from("user_concours_vises").select("user_id, concours(id, nom)"),
      admin
        .from("sessions")
        .select("user_id, score_normalise, completed_at")
        .not("completed_at", "is", null),
    ]);

  const parEleve = new Map<string, { nom: string; id: string }[]>();
  for (const v of vises ?? []) {
    const c = v.concours as unknown as { id: string; nom: string } | null;
    if (!c) continue;
    if (!parEleve.has(v.user_id)) parEleve.set(v.user_id, []);
    parEleve.get(v.user_id)!.push(c);
  }

  const stats = new Map<string, { n: number; total: number; derniere: string }>();
  for (const s of sessions ?? []) {
    const e = stats.get(s.user_id) ?? { n: 0, total: 0, derniere: "" };
    e.n += 1;
    e.total += Number(s.score_normalise ?? 0);
    if ((s.completed_at as string) > e.derniere) e.derniere = s.completed_at as string;
    stats.set(s.user_id, e);
  }

  let lignes: LigneEleve[] = (utilisateurs ?? []).map((u) => {
    const concours = parEleve.get(u.id) ?? [];
    const stat = stats.get(u.id);
    return {
      id: u.id,
      email: u.email,
      nom: u.nom,
      prenom: u.prenom,
      dateNaissance: u.date_naissance,
      ville: u.ville,
      etablissement: u.etablissement,
      emailParent: u.email_parent,
      consentMarketing: u.consent_marketing,
      consentMarketingDate: u.consent_marketing_date,
      cguAccepteesDate: u.cgu_acceptees_date,
      emailVerifie: u.email_verifie,
      autorisationParentale: u.autorisation_parentale,
      actif: u.actif,
      suspendu: u.suspendu,
      creeLe: u.created_at,
      concoursVises: concours.map((c) => c.nom).sort(),
      concoursIds: concours.map((c) => c.id),
      nbSessions: stat?.n ?? 0,
      scoreMoyen: stat && stat.n > 0 ? stat.total / stat.n : null,
      derniereActivite: stat?.derniere || null,
    };
  });

  // --- Filtres (§6.2 : « liste filtrable ») -------------------------------
  const recherche = filtres.recherche?.trim().toLowerCase();
  if (recherche) {
    lignes = lignes.filter((l) =>
      [l.nom, l.prenom, l.email, l.ville, l.etablissement]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(recherche)),
    );
  }

  if (filtres.concoursId) {
    lignes = lignes.filter((l) => l.concoursIds.includes(filtres.concoursId!));
  }

  if (filtres.consentement === "oui") {
    lignes = lignes.filter((l) => l.consentMarketing);
  } else if (filtres.consentement === "non") {
    lignes = lignes.filter((l) => !l.consentMarketing);
  }

  if (filtres.statut === "actifs") {
    lignes = lignes.filter((l) => l.actif);
  } else if (filtres.statut === "inactifs") {
    lignes = lignes.filter((l) => !l.actif);
  } else if (filtres.statut === "attente_parent") {
    lignes = lignes.filter((l) => l.autorisationParentale === "en_attente");
  }

  return lignes;
}
