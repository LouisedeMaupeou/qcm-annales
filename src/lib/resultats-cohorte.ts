import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { libelleEpreuveImportee } from "@/lib/epreuves-cb";
import { noteGlobaleOraux } from "@/lib/oraux";

/**
 * Les résultats des concours blancs, vus depuis la cohorte (§5.4).
 *
 * Ils ne vivaient que dans la section Sessions, où la responsable devait
 * d'abord retrouver la bonne session. Or elle travaille par promotion : ses
 * élèves, leurs notes, leurs bilans. On range donc les résultats là où elle
 * les cherche, sans rien déplacer — la vue par session reste utile quand on
 * prépare une session plutôt qu'un groupe.
 *
 * Écrits et oraux figurent côte à côte : c'est ce que le bilan envoie aux
 * familles, et c'est la seule façon de voir qu'il manque un oral avant de
 * l'envoyer.
 */

export type NoteEleve = {
  /** Null quand l'élève n'a pas composé, ou que la copie n'est pas corrigée. */
  note: number | null;
  statut: string | null;
};

export type ResultatsEleve = {
  id: string;
  prenom: string;
  nom: string;
  ecrits: Record<string, NoteEleve>;
  oraux: Record<string, NoteEleve>;
  moyenneEcrits: number | null;
  noteOraux: number | null;
  orauxComplets: boolean;
  bilanId: string | null;
  bilanStatut: string | null;
};

export type ResultatsSession = {
  sessionId: string;
  session: string;
  epreuves: { id: string; libelle: string }[];
  oraux: { id: string; nom: string; ponderation: number }[];
  eleves: ResultatsEleve[];
  nbACorriger: number;
};

const moyenne = (valeurs: number[]) =>
  valeurs.length === 0
    ? null
    : Math.round((valeurs.reduce((a, b) => a + b, 0) / valeurs.length) * 10) / 10;

export async function resultatsDeLaCohorte(
  cohorteId: string,
): Promise<ResultatsSession[]> {
  const admin = createAdminClient();

  const { data: membres } = await admin
    .from("users")
    .select("id, prenom, nom")
    .eq("cohorte_id", cohorteId)
    .order("nom")
    .order("prenom");
  const eleves = membres ?? [];
  if (eleves.length === 0) return [];
  const ids = eleves.map((e) => e.id as string);

  // Les sessions auxquelles la cohorte est convoquée.
  const { data: liens } = await admin
    .from("epreuve_cb_cohortes")
    .select("epreuve_cb_id, epreuves_cb(id, session_cb_id, epreuve_id_externe, sessions_cb(nom))")
    .eq("cohorte_id", cohorteId);

  type LienEpreuve = {
    id: string;
    session_cb_id: string;
    epreuve_id_externe: string;
    sessions_cb: { nom: string } | null;
  };

  const parSession = new Map<string, { nom: string; epreuves: LienEpreuve[] }>();
  for (const l of liens ?? []) {
    const e = l.epreuves_cb as unknown as LienEpreuve | null;
    if (!e) continue;
    if (!parSession.has(e.session_cb_id)) {
      parSession.set(e.session_cb_id, { nom: e.sessions_cb?.nom ?? "session", epreuves: [] });
    }
    parSession.get(e.session_cb_id)!.epreuves.push(e);
  }
  if (parSession.size === 0) return [];

  const resultats: ResultatsSession[] = [];

  for (const [sessionId, { nom, epreuves }] of parSession) {
    const epreuveIds = epreuves.map((e) => e.id);

    const [{ data: passages }, { data: oraux }, { data: bilans }] = await Promise.all([
      admin
        .from("passages")
        .select("user_id, epreuve_cb_id, note_sur_20, statut")
        .in("epreuve_cb_id", epreuveIds)
        .in("user_id", ids),
      admin
        .from("epreuves_orales")
        .select("id, cle, nom, ponderation, ordre")
        .eq("session_cb_id", sessionId)
        .order("ordre"),
      admin
        .from("bilans")
        .select("id, user_id, statut")
        .eq("session_cb_id", sessionId)
        .in("user_id", ids),
    ]);

    const oralIds = (oraux ?? []).map((o) => o.id as string);
    const { data: evaluations } = oralIds.length
      ? await admin
          .from("evaluations_orales")
          .select("user_id, epreuve_orale_id, note, statut")
          .in("epreuve_orale_id", oralIds)
          .in("user_id", ids)
      : { data: [] };

    const bilanDe = new Map((bilans ?? []).map((b) => [b.user_id as string, b]));

    resultats.push({
      sessionId,
      session: nom,
      epreuves: epreuves
        .map((e) => ({
          id: e.id,
          libelle: libelleEpreuveImportee(e.epreuve_id_externe) ?? e.epreuve_id_externe,
        }))
        .sort((a, b) => a.libelle.localeCompare(b.libelle, "fr")),
      oraux: (oraux ?? []).map((o) => ({
        id: o.id as string,
        nom: o.nom as string,
        ponderation: Number(o.ponderation),
      })),
      nbACorriger: (passages ?? []).filter((p) => p.statut === "remis").length,
      eleves: eleves.map((el) => {
        const id = el.id as string;

        const ecrits: Record<string, NoteEleve> = {};
        for (const e of epreuves) {
          const p = (passages ?? []).find(
            (x) => x.user_id === id && x.epreuve_cb_id === e.id,
          );
          ecrits[e.id] = {
            note: p?.note_sur_20 === null || !p ? null : Number(p.note_sur_20),
            statut: (p?.statut as string | null) ?? null,
          };
        }

        const siens: Record<string, NoteEleve> = {};
        const pourMoyenne: {
          cle: string;
          nom: string;
          note: number | null;
          ponderation: number;
          maximum: number;
        }[] = [];
        for (const o of oraux ?? []) {
          const v = (evaluations ?? []).find(
            (x) => x.user_id === id && x.epreuve_orale_id === o.id,
          );
          // Une évaluation non validée ne compte pas : elle est encore un
          // brouillon de jury, et le bilan ne la retiendrait pas non plus.
          const retenue = v && v.statut === "validee" ? Number(v.note) : null;
          siens[o.id as string] = { note: retenue, statut: (v?.statut as string) ?? null };
          pourMoyenne.push({
            cle: o.cle as string,
            nom: o.nom as string,
            note: retenue,
            ponderation: Number(o.ponderation),
            // Les notes d'oral sont déjà ramenées sur 20 à la saisie.
            maximum: 20,
          });
        }

        const global = noteGlobaleOraux(pourMoyenne);
        const bilan = bilanDe.get(id);

        return {
          id,
          prenom: el.prenom as string,
          nom: el.nom as string,
          ecrits,
          oraux: siens,
          moyenneEcrits: moyenne(
            Object.values(ecrits)
              .map((n) => n.note)
              .filter((n): n is number => n !== null),
          ),
          noteOraux: global.note,
          orauxComplets: global.complet,
          bilanId: (bilan?.id as string | undefined) ?? null,
          bilanStatut: (bilan?.statut as string | undefined) ?? null,
        };
      }),
    });
  }

  return resultats.sort((a, b) => a.session.localeCompare(b.session, "fr"));
}
