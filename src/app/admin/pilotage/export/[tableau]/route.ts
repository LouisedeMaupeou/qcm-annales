import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { versCsv } from "@/lib/kpi";
import { chargerPilotage, PERIODES, type Periode } from "@/lib/pilotage";

/** §6.3 : « export CSV de chaque tableau ». */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ tableau: string }> },
) {
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

  // Le classement d'usage est nominatif : contrôle refait dans la route.
  if (profil?.role !== "admin") {
    return new NextResponse("Accès refusé", { status: 403 });
  }

  const { tableau } = await params;
  const brut = request.nextUrl.searchParams.get("periode");
  const periode: Periode = brut && brut in PERIODES ? (brut as Periode) : "30j";

  const d = await chargerPilotage(periode);
  const pct = (v: number) => Math.round(v * 100);

  let entetes: string[];
  let lignes: (string | number | null)[][];
  let nom: string;

  switch (tableau) {
    case "usage":
      nom = `usage-eleves-${periode}`;
      entetes = ["Élève", "Email", "Sessions", "Score moyen (%)", "Progression (pts)"];
      lignes = d.usage.map((u) => [
        u.identite.nom,
        u.identite.email,
        u.nbSessions,
        pct(u.scoreMoyen),
        u.progression === null ? "" : pct(u.progression),
      ]);
      break;

    case "couverture":
      nom = "taux-annales-realisees";
      entetes = ["Concours", "Questions publiées", "Vues au moins une fois", "Taux (%)"];
      lignes = d.couverture.map((c) => [c.concoursNom, c.publiees, c.vues, pct(c.taux)]);
      break;

    case "scores-concours":
      nom = `scores-par-concours-${periode}`;
      entetes = ["Concours", "Sessions", "Score moyen (%)"];
      lignes = d.parConcours.map((s) => [s.concoursNom, s.nbSessions, pct(s.scoreMoyen)]);
      break;

    case "scores-epreuves":
      nom = `scores-par-epreuve-${periode}`;
      entetes = ["Concours", "Épreuve", "Sessions", "Score moyen (%)"];
      lignes = d.parEpreuve.map((s) => [
        s.concoursNom,
        s.epreuveNom ?? "",
        s.nbSessions,
        pct(s.scoreMoyen),
      ]);
      break;

    default:
      return new NextResponse("Tableau inconnu", { status: 404 });
  }

  const horodate = new Date().toISOString().slice(0, 10);

  return new NextResponse(versCsv(entetes, lignes), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${nom}-${horodate}.csv"`,
      "Cache-Control": "no-store, private",
    },
  });
}
