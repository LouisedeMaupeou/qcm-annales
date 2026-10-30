import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import {
  maximumGrille,
  noteEpreuveOrale,
  noteGlobaleOraux,
  ORAUX_PAR_FILIERE,
  type CritereOral,
  type NoteOrale,
  type NotesCriteres,
} from "@/lib/oraux";

/**
 * Oraux blancs : lecture et ouverture des épreuves (§5.5).
 *
 * Le jury cherche un élève et ouvre sa grille ; il ne reçoit jamais la liste
 * complète d'une cohorte sans la demander, ni les coordonnées de qui que ce
 * soit — il évalue un oral.
 */

export type EpreuveOraleChargee = {
  id: string;
  cle: string;
  nom: string;
  filiere: "commerce" | "ingenieur";
  ponderation: number;
  contexte: string;
  ordre: number;
  session: string;
  sessionId: string;
  criteres: CritereOral[];
  maximum: number;
  nbEvaluees: number;
  nbValidees: number;
};

export async function chargerEpreuvesOrales(
  sessionCbId?: string,
): Promise<EpreuveOraleChargee[]> {
  const admin = createAdminClient();

  let requete = admin
    .from("epreuves_orales")
    .select("id, cle, nom, filiere, ponderation, contexte, ordre, session_cb_id, sessions_cb(nom)")
    .order("filiere")
    .order("ordre");
  if (sessionCbId) requete = requete.eq("session_cb_id", sessionCbId);

  const { data: epreuves } = await requete;
  if (!epreuves || epreuves.length === 0) return [];

  const ids = epreuves.map((e) => e.id as string);
  const [{ data: grilles }, { data: evaluations }] = await Promise.all([
    admin
      .from("grilles_oral")
      .select("epreuve_orale_id, criteres")
      .in("epreuve_orale_id", ids)
      .eq("actif", true),
    admin
      .from("evaluations_orales")
      .select("epreuve_orale_id, statut")
      .in("epreuve_orale_id", ids),
  ]);

  const parGrille = new Map(
    (grilles ?? []).map((g) => [g.epreuve_orale_id as string, g.criteres as CritereOral[]]),
  );

  return epreuves.map((e) => {
    const miennes = (evaluations ?? []).filter((x) => x.epreuve_orale_id === e.id);
    const criteres = parGrille.get(e.id as string) ?? [];
    return {
      id: e.id as string,
      cle: e.cle as string,
      nom: e.nom as string,
      filiere: e.filiere as "commerce" | "ingenieur",
      ponderation: Number(e.ponderation),
      contexte: (e.contexte as string | null) ?? "Contexte",
      ordre: Number(e.ordre),
      session: (e.sessions_cb as unknown as { nom: string } | null)?.nom ?? "—",
      sessionId: e.session_cb_id as string,
      criteres,
      maximum: maximumGrille(criteres),
      nbEvaluees: miennes.length,
      nbValidees: miennes.filter((x) => x.statut === "validee").length,
    };
  });
}

/**
 * Ouvre les oraux d'une session : une épreuve par ligne du référentiel, pour
 * chaque filière représentée dans les cohortes de la session.
 *
 * Idempotent : relancer n'ajoute que ce qui manque. C'est ce qui permet de
 * rouvrir après l'arrivée d'une cohorte dans une session déjà commencée.
 */
export async function ouvrirOrauxDeLaSession(sessionCbId: string) {
  const admin = createAdminClient();

  const { data: epreuvesEcrites } = await admin
    .from("epreuves_cb")
    .select("id")
    .eq("session_cb_id", sessionCbId);
  const ids = (epreuvesEcrites ?? []).map((e) => e.id as string);

  const { data: liens } = ids.length
    ? await admin.from("epreuve_cb_cohortes").select("cohorte_id").in("epreuve_cb_id", ids)
    : { data: [] };
  const cohorteIds = [...new Set((liens ?? []).map((l) => l.cohorte_id as string))];

  const { data: cohortes } = cohorteIds.length
    ? await admin.from("cohortes").select("filiere").in("id", cohorteIds)
    : { data: [] };

  const filieres = [
    ...new Set((cohortes ?? []).map((c) => c.filiere as "commerce" | "ingenieur")),
  ];
  if (filieres.length === 0) return { creees: 0, filieres };

  const { data: deja } = await admin
    .from("epreuves_orales")
    .select("filiere, cle")
    .eq("session_cb_id", sessionCbId);
  const presentes = new Set((deja ?? []).map((e) => `${e.filiere}|${e.cle}`));

  let creees = 0;
  for (const filiere of filieres) {
    for (const modele of ORAUX_PAR_FILIERE[filiere]) {
      if (presentes.has(`${filiere}|${modele.cle}`)) continue;

      const { data: epreuve, error } = await admin
        .from("epreuves_orales")
        .insert({
          session_cb_id: sessionCbId,
          filiere,
          cle: modele.cle,
          nom: modele.nom,
          ponderation: modele.ponderation,
          contexte: modele.contexte,
          ordre: modele.ordre,
        })
        .select("id")
        .single();
      if (error) continue;

      await admin
        .from("grilles_oral")
        .insert({ epreuve_orale_id: epreuve.id, criteres: modele.criteres });
      creees += 1;
    }
  }

  return { creees, filieres };
}

export type EleveOral = {
  id: string;
  nom: string;
  prenom: string;
  cohorte: string | null;
  note: number | null;
  statut: "brouillon" | "validee" | null;
};

export async function chercherEleves(
  epreuveOraleId: string,
  recherche: string,
): Promise<EleveOral[]> {
  const admin = createAdminClient();

  const { data: epreuve } = await admin
    .from("epreuves_orales")
    .select("session_cb_id, filiere")
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

  // Une épreuve orale ne concerne que sa filière : un élève de prépa
  // ingénieurs n'a pas d'oral d'anglais à passer.
  const { data: cohortesFiliere } = await admin
    .from("cohortes")
    .select("id")
    .in("id", cohorteIds)
    .eq("filiere", epreuve.filiere);
  const retenues = (cohortesFiliere ?? []).map((c) => c.id as string);
  if (retenues.length === 0) return [];

  let requete = admin
    .from("users")
    .select("id, nom, prenom, cohortes(nom)")
    .in("cohorte_id", retenues)
    .order("nom")
    .order("prenom")
    .limit(200);

  const terme = recherche.trim();
  if (terme) requete = requete.or(`nom.ilike.%${terme}%,prenom.ilike.%${terme}%`);

  const { data: eleves } = await requete;
  if (!eleves || eleves.length === 0) return [];

  const { data: evaluations } = await admin
    .from("evaluations_orales")
    .select("user_id, note, statut")
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
      note: ev?.note === null || !ev ? null : Number(ev.note),
      statut: (ev?.statut as EleveOral["statut"]) ?? null,
    };
  });
}

export type EvaluationChargee = {
  epreuve: EpreuveOraleChargee;
  eleve: { id: string; nom: string; prenom: string; cohorte: string | null };
  contexte: string;
  notes: NotesCriteres;
  note: number | null;
  pointFort: string;
  progresPrioritaire: string;
  commentaireJury: string;
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
    admin.from("users").select("id, nom, prenom, cohortes(nom)").eq("id", userId).maybeSingle(),
    admin
      .from("evaluations_orales")
      .select("contexte, notes_criteres, note, point_fort, progres_prioritaire, commentaire_jury, statut, updated_at, users!evaluations_orales_professeur_id_fkey(prenom, nom)")
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
    contexte: (evaluation?.contexte as string | null) ?? "",
    notes: (evaluation?.notes_criteres ?? {}) as NotesCriteres,
    note: evaluation?.note === null || !evaluation ? null : Number(evaluation.note),
    pointFort: (evaluation?.point_fort as string | null) ?? "",
    progresPrioritaire: (evaluation?.progres_prioritaire as string | null) ?? "",
    commentaireJury: (evaluation?.commentaire_jury as string | null) ?? "",
    statut: (evaluation?.statut as "brouillon" | "validee") ?? "brouillon",
    professeur: prof ? `${prof.prenom} ${prof.nom}` : null,
    majLe: (evaluation?.updated_at as string | null) ?? null,
  };
}

// ---------------------------------------------------------------------------
// Pour le bilan
// ---------------------------------------------------------------------------

export type OralDuBilan = {
  nom: string;
  ponderation: number;
  note: number | null;
  maximum: number;
  contexte: string | null;
  criteres: { libelle: string; maximum: number; note: number | null }[];
  pointFort: string | null;
  progresPrioritaire: string | null;
  commentaireJury: string | null;
};

export type SectionOrauxBilan = {
  oraux: OralDuBilan[];
  noteGlobale: number | null;
  complet: boolean;
};

/**
 * Section « Oraux blancs » d'un bilan.
 *
 * Seules les évaluations validées y entrent : un brouillon de jury ne part
 * pas chez des parents.
 */
export async function orauxDuBilan(
  sessionCbId: string,
  userId: string,
): Promise<SectionOrauxBilan> {
  const admin = createAdminClient();

  const { data: eleve } = await admin
    .from("users")
    .select("cohortes(filiere)")
    .eq("id", userId)
    .maybeSingle();
  const filiere = (eleve?.cohortes as unknown as { filiere: string } | null)?.filiere;
  if (!filiere) return { oraux: [], noteGlobale: null, complet: false };

  const epreuves = (await chargerEpreuvesOrales(sessionCbId)).filter(
    (e) => e.filiere === filiere,
  );
  if (epreuves.length === 0) return { oraux: [], noteGlobale: null, complet: false };

  const { data: evaluations } = await admin
    .from("evaluations_orales")
    .select("epreuve_orale_id, contexte, notes_criteres, note, point_fort, progres_prioritaire, commentaire_jury")
    .eq("user_id", userId)
    .eq("statut", "validee")
    .in(
      "epreuve_orale_id",
      epreuves.map((e) => e.id),
    );

  const parEpreuve = new Map(
    (evaluations ?? []).map((e) => [e.epreuve_orale_id as string, e]),
  );

  const oraux: OralDuBilan[] = epreuves.map((e) => {
    const ev = parEpreuve.get(e.id);
    const notes = (ev?.notes_criteres ?? {}) as NotesCriteres;
    return {
      nom: e.nom,
      ponderation: e.ponderation,
      note: ev ? noteEpreuveOrale(e.criteres, notes) : null,
      maximum: e.maximum,
      contexte: (ev?.contexte as string | null) ?? null,
      criteres: e.criteres.map((c, i) => ({
        libelle: c.libelle,
        maximum: c.maximum,
        note: ev ? (notes[String(i)] ?? null) : null,
      })),
      pointFort: (ev?.point_fort as string | null) ?? null,
      progresPrioritaire: (ev?.progres_prioritaire as string | null) ?? null,
      commentaireJury: (ev?.commentaire_jury as string | null) ?? null,
    };
  });

  const pour: NoteOrale[] = oraux.map((o) => ({
    cle: o.nom,
    nom: o.nom,
    ponderation: o.ponderation,
    note: o.note,
    maximum: o.maximum,
  }));

  const global = noteGlobaleOraux(pour);
  return { oraux, noteGlobale: global.note, complet: global.complet };
}
