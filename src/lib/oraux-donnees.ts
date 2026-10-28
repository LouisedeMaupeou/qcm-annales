import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { GRILLE_MOTIVATION, type Critere, type NotesCriteres } from "@/lib/oraux";

/**
 * Épreuves orales et évaluations (module concours blancs, §5.5).
 *
 * Lectures du back-office Oraux. Le professeur cherche un élève par son nom
 * et ouvre sa grille : il ne reçoit jamais la liste complète des élèves d'une
 * cohorte sans la demander, ni leurs coordonnées — il n'évalue qu'un oral.
 */

export type EpreuveOrale = {
  id: string;
  nom: string;
  concours: string;
  session: string;
  sessionId: string;
  criteres: Critere[];
  nbEvaluations: number;
};

export async function chargerEpreuvesOrales(): Promise<EpreuveOrale[]> {
  const admin = createAdminClient();

  const { data: epreuves } = await admin
    .from("epreuves_orales")
    .select("id, nom, ordre, session_cb_id, concours(nom), sessions_cb(nom)")
    .order("ordre");

  if (!epreuves || epreuves.length === 0) return [];
  const ids = epreuves.map((e) => e.id as string);

  const [{ data: grilles }, { data: evaluations }] = await Promise.all([
    admin
      .from("grilles_oral")
      .select("epreuve_orale_id, criteres")
      .in("epreuve_orale_id", ids)
      .eq("actif", true),
    admin.from("evaluations_orales").select("epreuve_orale_id").in("epreuve_orale_id", ids),
  ]);

  const parGrille = new Map(
    (grilles ?? []).map((g) => [g.epreuve_orale_id as string, g.criteres as Critere[]]),
  );
  const compte = new Map<string, number>();
  for (const e of evaluations ?? []) {
    const id = e.epreuve_orale_id as string;
    compte.set(id, (compte.get(id) ?? 0) + 1);
  }

  return epreuves.map((e) => ({
    id: e.id as string,
    nom: e.nom as string,
    concours: (e.concours as unknown as { nom: string } | null)?.nom ?? "—",
    session: (e.sessions_cb as unknown as { nom: string } | null)?.nom ?? "—",
    sessionId: e.session_cb_id as string,
    criteres: parGrille.get(e.id as string) ?? GRILLE_MOTIVATION,
    nbEvaluations: compte.get(e.id as string) ?? 0,
  }));
}

export type EleveOral = {
  id: string;
  nom: string;
  prenom: string;
  cohorte: string | null;
  noteGlobale: number | null;
  statut: "brouillon" | "validee" | null;
};

/**
 * Élèves évaluables sur une épreuve orale : ceux des cohortes de la session.
 *
 * La recherche est obligatoire au-delà d'une poignée d'élèves : le §5.5
 * décrit un professeur qui cherche un élève, pas qui parcourt un trombinoscope.
 */
export async function chercherEleves(
  epreuveOraleId: string,
  recherche: string,
): Promise<EleveOral[]> {
  const admin = createAdminClient();

  const { data: epreuve } = await admin
    .from("epreuves_orales")
    .select("session_cb_id")
    .eq("id", epreuveOraleId)
    .maybeSingle();
  if (!epreuve) return [];

  const { data: epreuvesEcrites } = await admin
    .from("epreuves_cb")
    .select("id")
    .eq("session_cb_id", epreuve.session_cb_id);
  const ids = (epreuvesEcrites ?? []).map((e) => e.id as string);
  if (ids.length === 0) return [];

  const { data: liens } = await admin
    .from("epreuve_cb_cohortes")
    .select("cohorte_id")
    .in("epreuve_cb_id", ids);
  const cohorteIds = [...new Set((liens ?? []).map((l) => l.cohorte_id as string))];
  if (cohorteIds.length === 0) return [];

  let requete = admin
    .from("users")
    .select("id, nom, prenom, cohortes(nom)")
    .in("cohorte_id", cohorteIds)
    .order("nom")
    .order("prenom")
    .limit(100);

  const terme = recherche.trim();
  if (terme) requete = requete.or(`nom.ilike.%${terme}%,prenom.ilike.%${terme}%`);

  const { data: eleves } = await requete;
  if (!eleves || eleves.length === 0) return [];

  const { data: evaluations } = await admin
    .from("evaluations_orales")
    .select("user_id, note_globale, statut")
    .eq("epreuve_orale_id", epreuveOraleId)
    .in(
      "user_id",
      eleves.map((e) => e.id as string),
    );

  const parEleve = new Map((evaluations ?? []).map((e) => [e.user_id as string, e]));

  return eleves.map((e) => {
    const ev = parEleve.get(e.id as string);
    return {
      id: e.id as string,
      nom: e.nom as string,
      prenom: e.prenom as string,
      cohorte: (e.cohortes as unknown as { nom: string } | null)?.nom ?? null,
      noteGlobale: ev?.note_globale === null || !ev ? null : Number(ev.note_globale),
      statut: (ev?.statut as EleveOral["statut"]) ?? null,
    };
  });
}

export type EvaluationChargee = {
  epreuve: EpreuveOrale;
  eleve: { id: string; nom: string; prenom: string; cohorte: string | null };
  notes: NotesCriteres;
  appreciation: string;
  recommandation: string;
  noteGlobale: number | null;
  statut: "brouillon" | "validee";
  professeur: string | null;
  majLe: string | null;
};

export async function chargerEvaluation(
  epreuveOraleId: string,
  userId: string,
): Promise<EvaluationChargee | null> {
  const admin = createAdminClient();

  const epreuves = await chargerEpreuvesOrales();
  const epreuve = epreuves.find((e) => e.id === epreuveOraleId);
  if (!epreuve) return null;

  const [{ data: eleve }, { data: evaluation }] = await Promise.all([
    admin
      .from("users")
      .select("id, nom, prenom, cohortes(nom)")
      .eq("id", userId)
      .maybeSingle(),
    admin
      .from("evaluations_orales")
      .select("notes_criteres, appreciation, recommandation, note_globale, statut, updated_at, users!evaluations_orales_professeur_id_fkey(prenom, nom)")
      .eq("epreuve_orale_id", epreuveOraleId)
      .eq("user_id", userId)
      .maybeSingle(),
  ]);

  if (!eleve) return null;

  const prof = evaluation?.users as unknown as { prenom: string; nom: string } | null;

  return {
    epreuve,
    eleve: {
      id: eleve.id as string,
      nom: eleve.nom as string,
      prenom: eleve.prenom as string,
      cohorte: (eleve.cohortes as unknown as { nom: string } | null)?.nom ?? null,
    },
    notes: (evaluation?.notes_criteres ?? {}) as NotesCriteres,
    appreciation: (evaluation?.appreciation as string | null) ?? "",
    recommandation: (evaluation?.recommandation as string | null) ?? "",
    noteGlobale:
      evaluation?.note_globale === null || !evaluation
        ? null
        : Number(evaluation.note_globale),
    statut: (evaluation?.statut as "brouillon" | "validee") ?? "brouillon",
    professeur: prof ? `${prof.prenom} ${prof.nom}` : null,
    majLe: (evaluation?.updated_at as string | null) ?? null,
  };
}
