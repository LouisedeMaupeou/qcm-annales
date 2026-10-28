import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

/**
 * « Mes concours blancs », côté élève (module concours blancs, §4.2).
 *
 * Lecture faite avec le client authentifié, pas avec le service_role : la
 * politique `epreuves_cb_lecture` dit déjà qu'un élève ne voit que les
 * épreuves publiées assignées à sa cohorte, et il vaut mieux s'appuyer dessus
 * que la réécrire ici. Si la politique est fausse, l'écran le montrera — un
 * contournement en service_role masquerait le défaut.
 *
 * Une exception : le nombre de questions. La table `epreuve_cb_questions` est
 * fermée aux élèves — sa liste dirait le sujet avant l'heure — mais le volume
 * est une information d'organisation. Il est donc compté en service_role, et
 * seulement pour les épreuves que la RLS vient déjà d'autoriser.
 *
 * Ce qui n'est volontairement pas lu : la note, le détail des réponses, le
 * corrigé. L'embargo du §4.4 est tenu par les privilèges de colonne sur
 * `passages`, et cet écran n'a aucune raison d'aller les chercher.
 */

export type StatutEpreuveEleve = "a_venir" | "a_composer" | "terminee" | "fermee";

export type EpreuveEleve = {
  id: string;
  concours: string;
  matiere: string;
  dureeMinutes: number;
  fenetreDebut: string | null;
  fenetreFin: string | null;
  nbQuestions: number;
  statut: StatutEpreuveEleve;
  remisLe: string | null;
  /** Copie ouverte mais pas encore remise : le chronomètre tourne déjà. */
  enCours: boolean;
};

export type MesConcoursBlancs = {
  /** Null quand l'élève n'appartient à aucune cohorte de la prépa. */
  cohorte: string | null;
  epreuves: EpreuveEleve[];
};

export async function chargerMesConcoursBlancs(
  userId: string,
): Promise<MesConcoursBlancs> {
  const supabase = await createClient();

  const { data: profil } = await supabase
    .from("users")
    .select("cohorte_id, cohortes(nom)")
    .eq("id", userId)
    .maybeSingle();

  const cohorte = (profil?.cohortes as unknown as { nom: string } | null)?.nom ?? null;
  if (!profil?.cohorte_id) return { cohorte: null, epreuves: [] };

  const { data: epreuves } = await supabase
    .from("epreuves_cb")
    .select("id, matiere, duree_minutes, fenetre_debut, fenetre_fin, concours(nom)")
    .eq("statut", "publiee")
    .order("fenetre_debut", { nullsFirst: false });

  if (!epreuves || epreuves.length === 0) return { cohorte, epreuves: [] };

  const ids = epreuves.map((e) => e.id as string);

  const [{ data: passages }, { data: liens }] = await Promise.all([
    supabase.from("passages").select("epreuve_cb_id, statut, remis_at").in("epreuve_cb_id", ids),
    createAdminClient()
      .from("epreuve_cb_questions")
      .select("epreuve_cb_id")
      .in("epreuve_cb_id", ids),
  ]);

  const parPassage = new Map(
    (passages ?? []).map((p) => [p.epreuve_cb_id as string, p]),
  );
  const volumes = new Map<string, number>();
  for (const l of liens ?? []) {
    const id = l.epreuve_cb_id as string;
    volumes.set(id, (volumes.get(id) ?? 0) + 1);
  }

  const maintenant = Date.now();

  return {
    cohorte,
    epreuves: epreuves.map((e) => {
      const passage = parPassage.get(e.id as string);
      const debut = e.fenetre_debut ? new Date(e.fenetre_debut).getTime() : null;
      const fin = e.fenetre_fin ? new Date(e.fenetre_fin).getTime() : null;

      let statut: StatutEpreuveEleve;
      if (passage && passage.statut !== "en_cours") statut = "terminee";
      else if (debut && maintenant < debut) statut = "a_venir";
      else if (fin && maintenant > fin) statut = "fermee";
      else statut = "a_composer";

      return {
        id: e.id as string,
        concours: (e.concours as unknown as { nom: string } | null)?.nom ?? "—",
        matiere: e.matiere as string,
        dureeMinutes: e.duree_minutes as number,
        fenetreDebut: e.fenetre_debut as string | null,
        fenetreFin: e.fenetre_fin as string | null,
        nbQuestions: volumes.get(e.id as string) ?? 0,
        statut,
        remisLe: (passage?.remis_at as string | null) ?? null,
        enCours: passage?.statut === "en_cours",
      };
    }),
  };
}
