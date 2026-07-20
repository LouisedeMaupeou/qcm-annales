import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import {
  compteursTransverses,
  couvertureParConcours,
  scoresMoyens,
  usageParEleve,
  type SessionKpi,
} from "@/lib/kpi";

/** Période filtrable du classement d'usage (§6.3). */
export const PERIODES = {
  "7j": { libelle: "7 jours", jours: 7 },
  "30j": { libelle: "30 jours", jours: 30 },
  "90j": { libelle: "90 jours", jours: 90 },
  tout: { libelle: "Depuis le début", jours: null },
} as const;

export type Periode = keyof typeof PERIODES;

export async function chargerPilotage(periode: Periode = "30j") {
  const admin = createAdminClient();

  const [{ data: sessions }, { data: eleves }, { data: questions }, { data: vues }] =
    await Promise.all([
      admin
        .from("sessions")
        .select(
          "user_id, concours_id, epreuve_id, score_normalise, completed_at, concours(nom), epreuves(nom)",
        )
        .not("completed_at", "is", null),
      admin
        .from("users")
        .select("id, prenom, nom, email, consent_marketing")
        .eq("role", "eleve"),
      admin
        .from("questions")
        .select("id, blocs!inner(epreuves!inner(concours_id, concours(nom)))")
        .eq("statut", "publie"),
      admin.from("session_questions").select("question_id"),
    ]);

  const toutes: SessionKpi[] = (sessions ?? []).map((s) => ({
    userId: s.user_id,
    concoursId: s.concours_id,
    concoursNom: (s.concours as unknown as { nom: string } | null)?.nom ?? "—",
    epreuveId: s.epreuve_id,
    epreuveNom: (s.epreuves as unknown as { nom: string } | null)?.nom ?? "—",
    scoreNormalise: Number(s.score_normalise ?? 0),
    termineeLe: s.completed_at as string,
  }));

  const jours: number | null = PERIODES[periode].jours;
  let depuis: Date | null = null;
  if (jours !== null) {
    depuis = new Date();
    depuis.setDate(depuis.getDate() - jours);
  }

  const borne = depuis;
  const surPeriode = borne
    ? toutes.filter((s) => new Date(s.termineeLe) >= borne)
    : toutes;

  const listeEleves = (eleves ?? []).map((e) => ({
    id: e.id as string,
    consentMarketing: e.consent_marketing as boolean,
  }));

  const identites = new Map(
    (eleves ?? []).map((e) => [
      e.id as string,
      { nom: `${e.prenom} ${e.nom}`, email: e.email as string },
    ]),
  );

  // §6.3 : « questions publiées vues au moins une fois / questions publiées ».
  const catalogue = (questions ?? []).map((q) => {
    const bloc = q.blocs as unknown as {
      epreuves: { concours_id: string; concours: { nom: string } | null } | null;
    } | null;
    return {
      questionId: q.id as string,
      concoursId: bloc?.epreuves?.concours_id ?? "—",
      concoursNom: bloc?.epreuves?.concours?.nom ?? "—",
    };
  });

  const usage = usageParEleve(surPeriode).map((u) => ({
    ...u,
    identite: identites.get(u.userId) ?? { nom: "compte supprimé", email: "—" },
  }));

  return {
    periode,
    usage,
    couverture: couvertureParConcours(
      catalogue,
      new Set((vues ?? []).map((v) => v.question_id as string)),
    ),
    ...scoresMoyens(surPeriode),
    compteurs: compteursTransverses(toutes, listeEleves),
    nbSessionsPeriode: surPeriode.length,
  };
}
