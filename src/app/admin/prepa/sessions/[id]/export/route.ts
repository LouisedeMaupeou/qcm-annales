import { NextResponse, type NextRequest } from "next/server";
import * as XLSX from "xlsx";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { assemblerBilan, elevesDeLaSession } from "@/lib/bilans-generation";

/**
 * §5.4 : export XLSX des résultats d'une session, pour l'archivage et Zoho.
 *
 * Trois feuilles : une ligne par élève × épreuve écrite, une par élève ×
 * oral, et une synthèse par élève. Le détail et la synthèse sont séparés
 * parce qu'ils ne servent pas la même chose — le premier se croise dans un
 * tableur, la seconde se lit telle quelle.
 *
 * Le fichier porte des noms d'élèves et leurs notes : l'accès est refait ici
 * plutôt que délégué, une route d'export étant une porte de sortie de données.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL("/connexion", request.url));

  const { data: profil } = await supabase
    .from("users")
    .select("role")
    .eq("id", user.id)
    .single();
  if (profil?.role !== "admin" && profil?.role !== "responsable_prepa") {
    return new NextResponse("Accès refusé", { status: 403 });
  }

  const admin = createAdminClient();
  const { data: session } = await admin
    .from("sessions_cb")
    .select("nom")
    .eq("id", id)
    .maybeSingle();
  if (!session) return new NextResponse("Session introuvable", { status: 404 });

  const eleves = await elevesDeLaSession(id);

  const ecrits: Record<string, string | number>[] = [];
  const oraux: Record<string, string | number>[] = [];
  const synthese: Record<string, string | number>[] = [];

  for (const e of eleves) {
    const bilan = await assemblerBilan(id, e.id as string);
    if (!bilan) continue;

    const notes: number[] = [];

    for (const c of bilan.colonnes) {
      if (!c.absent && c.noteSur20 !== null) notes.push(c.noteSur20);
      ecrits.push({
        Élève: `${bilan.eleve.prenom} ${bilan.eleve.nom}`,
        Cohorte: bilan.cohorte?.nom ?? "",
        Concours: c.concours,
        Épreuve: c.matiere,
        Note: c.absent || c.noteSur20 === null ? "non composée" : c.noteSur20,
        "Moyenne du groupe": c.moyenneGroupe ?? "",
        Rang: c.rang ?? "",
        Participants: c.participants,
        Justes: c.absent ? "" : c.nbBonnes,
        Fausses: c.absent ? "" : c.nbFausses,
        "Sans réponse": c.absent ? "" : c.nbAbstentions,
        "Niveau de maîtrise": c.niveau ?? "",
      });
    }

    for (const o of bilan.oraux.oraux) {
      oraux.push({
        Élève: `${bilan.eleve.prenom} ${bilan.eleve.nom}`,
        Cohorte: bilan.cohorte?.nom ?? "",
        Oral: o.nom,
        Contexte: o.contexte ?? "",
        Note: o.note ?? "non évalué",
        "Sur": o.maximum,
        "Poids dans la note d'oral": o.ponderation,
        "Point fort": o.pointFort ?? "",
        "Progrès prioritaire": o.progresPrioritaire ?? "",
        "Commentaire du jury": o.commentaireJury ?? "",
      });
    }

    const moyenneEcrits =
      notes.length > 0
        ? Math.round((notes.reduce((s, n) => s + n, 0) / notes.length) * 100) / 100
        : "";

    synthese.push({
      Élève: `${bilan.eleve.prenom} ${bilan.eleve.nom}`,
      Cohorte: bilan.cohorte?.nom ?? "",
      Filière: bilan.cohorte?.filiere ?? "",
      "Épreuves composées": notes.length,
      "Moyenne des écrits": moyenneEcrits,
      "Note globale des oraux": bilan.oraux.complet ? (bilan.oraux.noteGlobale ?? "") : "",
      "Bilan — état": bilan.statut,
      "Bilan — envoyé le": bilan.envoyeLe
        ? new Date(bilan.envoyeLe).toLocaleDateString("fr-FR")
        : "",
    });
  }

  const classeur = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(classeur, XLSX.utils.json_to_sheet(synthese), "Synthèse");
  XLSX.utils.book_append_sheet(classeur, XLSX.utils.json_to_sheet(ecrits), "Écrits");
  if (oraux.length > 0) {
    XLSX.utils.book_append_sheet(classeur, XLSX.utils.json_to_sheet(oraux), "Oraux");
  }

  // Sérialisation en mémoire : le build ESM de SheetJS n'a pas accès au
  // système de fichiers, et de toute façon rien n'a à être écrit sur disque.
  const contenu = XLSX.write(classeur, { type: "buffer", bookType: "xlsx" });

  const nom = `resultats-${session.nom}`
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9-]+/g, "-")
    .toLowerCase();

  return new NextResponse(contenu, {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${nom}.xlsx"`,
    },
  });
}
