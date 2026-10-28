import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Sessions et épreuves blanches (module concours blancs, §5.2).
 *
 * Lectures du back-office Prépa. Elles passent par le service_role après
 * contrôle du rôle dans la page appelante : le suivi en temps réel croise des
 * listes d'élèves de la prépa, qui sont des données personnelles de mineurs.
 */

export type SessionCb = {
  id: string;
  nom: string;
  statut: "preparation" | "ouverte" | "correction" | "cloturee";
  creeLe: string;
  nbEpreuves: number;
  nbPubliees: number;
};

export type EpreuveCb = {
  id: string;
  epreuveIdExterne: string;
  concours: string;
  matiere: string;
  dureeMinutes: number;
  fenetreDebut: string | null;
  fenetreFin: string | null;
  pointsBonne: number;
  pointsMauvaise: number;
  pointsAbstention: number;
  regles: Record<string, unknown>;
  baremeSource: string | null;
  noteSur: number;
  statut: "brouillon" | "publiee";
  nbQuestions: number;
  /** Questions encore en file de relecture : une épreuve ne se publie pas avec. */
  nbEnRelecture: number;
  pointsTotal: number;
  cohorteIds: string[];
  suivi: { attendus: number; enCours: number; remis: number; corriges: number };
};

export async function chargerSessions(): Promise<SessionCb[]> {
  const admin = createAdminClient();

  const [{ data: sessions }, { data: epreuves }] = await Promise.all([
    admin
      .from("sessions_cb")
      .select("id, nom, statut, created_at")
      .order("created_at", { ascending: false }),
    admin.from("epreuves_cb").select("session_cb_id, statut"),
  ]);

  const compte = new Map<string, { total: number; publiees: number }>();
  for (const e of epreuves ?? []) {
    const c = compte.get(e.session_cb_id) ?? { total: 0, publiees: 0 };
    c.total += 1;
    if (e.statut === "publiee") c.publiees += 1;
    compte.set(e.session_cb_id, c);
  }

  return (sessions ?? []).map((s) => ({
    id: s.id,
    nom: s.nom,
    statut: s.statut,
    creeLe: s.created_at,
    nbEpreuves: compte.get(s.id)?.total ?? 0,
    nbPubliees: compte.get(s.id)?.publiees ?? 0,
  }));
}

export async function chargerEpreuves(sessionCbId: string): Promise<EpreuveCb[]> {
  const admin = createAdminClient();

  const { data: epreuves } = await admin
    .from("epreuves_cb")
    // Chaîne de sélection sur une seule ligne : supabase-js déduit le type du
    // résultat du littéral, une concaténation lui fait perdre l'inférence.
    .select("id, epreuve_id_externe, matiere, duree_minutes, fenetre_debut, fenetre_fin, points_bonne, points_mauvaise, points_abstention, regles, bareme_source, note_sur, statut, concours(nom)")
    .eq("session_cb_id", sessionCbId)
    .order("epreuve_id_externe");

  if (!epreuves || epreuves.length === 0) return [];
  const ids = epreuves.map((e) => e.id as string);

  const [{ data: liens }, { data: cohortes }, { data: passages }] = await Promise.all([
    admin
      .from("epreuve_cb_questions")
      .select("epreuve_cb_id, points, questions(statut)")
      .in("epreuve_cb_id", ids),
    admin.from("epreuve_cb_cohortes").select("epreuve_cb_id, cohorte_id").in("epreuve_cb_id", ids),
    admin.from("passages").select("epreuve_cb_id, statut").in("epreuve_cb_id", ids),
  ]);

  // Qui est attendu : les élèves des cohortes assignées. Sans cohorte, personne.
  const cohortesParEpreuve = new Map<string, string[]>();
  for (const c of cohortes ?? []) {
    if (!cohortesParEpreuve.has(c.epreuve_cb_id)) cohortesParEpreuve.set(c.epreuve_cb_id, []);
    cohortesParEpreuve.get(c.epreuve_cb_id)!.push(c.cohorte_id);
  }

  const toutesCohortes = [...new Set((cohortes ?? []).map((c) => c.cohorte_id))];
  const { data: eleves } = toutesCohortes.length
    ? await admin.from("users").select("id, cohorte_id").in("cohorte_id", toutesCohortes)
    : { data: [] };

  const effectif = new Map<string, number>();
  for (const e of eleves ?? []) {
    effectif.set(e.cohorte_id, (effectif.get(e.cohorte_id) ?? 0) + 1);
  }

  const questionsParEpreuve = new Map<
    string,
    { total: number; enRelecture: number; points: number }
  >();
  for (const l of liens ?? []) {
    const q = l.questions as unknown as { statut: string } | null;
    const e = questionsParEpreuve.get(l.epreuve_cb_id) ?? {
      total: 0,
      enRelecture: 0,
      points: 0,
    };
    e.total += 1;
    e.points += Number(l.points ?? 0);
    if (q && q.statut !== "publie") e.enRelecture += 1;
    questionsParEpreuve.set(l.epreuve_cb_id, e);
  }

  const passagesParEpreuve = new Map<string, { enCours: number; remis: number; corriges: number }>();
  for (const p of passages ?? []) {
    const e = passagesParEpreuve.get(p.epreuve_cb_id) ?? { enCours: 0, remis: 0, corriges: 0 };
    if (p.statut === "en_cours") e.enCours += 1;
    else if (p.statut === "remis") e.remis += 1;
    else if (p.statut === "corrige") e.corriges += 1;
    passagesParEpreuve.set(p.epreuve_cb_id, e);
  }

  return epreuves.map((e) => {
    const q = questionsParEpreuve.get(e.id) ?? { total: 0, enRelecture: 0, points: 0 };
    const p = passagesParEpreuve.get(e.id) ?? { enCours: 0, remis: 0, corriges: 0 };
    const mesCohortes = cohortesParEpreuve.get(e.id) ?? [];
    return {
      id: e.id,
      epreuveIdExterne: e.epreuve_id_externe,
      concours: (e.concours as unknown as { nom: string } | null)?.nom ?? "—",
      matiere: e.matiere,
      dureeMinutes: e.duree_minutes,
      fenetreDebut: e.fenetre_debut,
      fenetreFin: e.fenetre_fin,
      pointsBonne: Number(e.points_bonne),
      pointsMauvaise: Number(e.points_mauvaise),
      pointsAbstention: Number(e.points_abstention),
      regles: (e.regles ?? {}) as Record<string, unknown>,
      baremeSource: e.bareme_source,
      noteSur: Number(e.note_sur),
      statut: e.statut,
      nbQuestions: q.total,
      nbEnRelecture: q.enRelecture,
      pointsTotal: q.points,
      cohorteIds: mesCohortes,
      suivi: {
        attendus: mesCohortes.reduce((s, c) => s + (effectif.get(c) ?? 0), 0),
        ...p,
      },
    };
  });
}

/**
 * Épreuves blanches importées dans la banque et pas encore placées dans cette
 * session : c'est le menu d'ajout du §5.2 (« sélection d'un EPREUVE_ID
 * importé »).
 */
export async function epreuvesDisponibles(sessionCbId: string) {
  const admin = createAdminClient();

  const { data: deja } = await admin
    .from("epreuves_cb")
    .select("epreuve_id_externe")
    .eq("session_cb_id", sessionCbId);

  const placees = new Set((deja ?? []).map((e) => e.epreuve_id_externe as string));
  const compte = new Map<string, number>();

  // Pagination explicite : PostgREST plafonne une réponse à 1 000 lignes et
  // se tait quand il tronque. Une banque de concours blancs dépassera ce
  // seuil au bout de deux ou trois sessions, et des épreuves disparaîtraient
  // silencieusement du menu d'ajout.
  const PAGE = 1000;
  for (let debut = 0; ; debut += PAGE) {
    const { data } = await admin
      .from("questions")
      .select("epreuve_id_externe")
      .not("epreuve_id_externe", "is", null)
      .neq("statut", "depubliee")
      .range(debut, debut + PAGE - 1);

    for (const q of data ?? []) {
      const id = q.epreuve_id_externe as string;
      if (placees.has(id)) continue;
      compte.set(id, (compte.get(id) ?? 0) + 1);
    }

    if (!data || data.length < PAGE) break;
  }

  return [...compte.entries()]
    .map(([id, nb]) => ({ id, nb }))
    .sort((a, b) => a.id.localeCompare(b.id));
}
