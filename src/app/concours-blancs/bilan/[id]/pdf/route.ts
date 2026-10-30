import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { assemblerBilan } from "@/lib/bilans-generation";
import { bilanEnPdf, nomFichierBilan } from "@/lib/bilan-pdf";

/**
 * PDF du bilan, côté élève.
 *
 * La ligne est lue avec le client authentifié : la politique
 * `bilans_sien_envoye` ne laisse passer que son propre bilan, et seulement à
 * l'état envoyé. L'embargo tient donc ici comme ailleurs, sans contrôle
 * supplémentaire à maintenir.
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

  const { data: ligne } = await supabase
    .from("bilans")
    .select("session_cb_id, user_id")
    .eq("id", id)
    .maybeSingle();
  if (!ligne) return new NextResponse("Bilan indisponible", { status: 404 });

  const bilan = await assemblerBilan(
    ligne.session_cb_id as string,
    ligne.user_id as string,
  );
  if (!bilan) return new NextResponse("Bilan indisponible", { status: 404 });

  const pdf = await bilanEnPdf(bilan);

  // Buffer vers Uint8Array : NextResponse n'accepte pas un Buffer Node tel quel.
  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${nomFichierBilan(bilan)}.pdf"`,
    },
  });
}
