import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { assemblerBilan } from "@/lib/bilans-generation";
import { bilanEnPdf, nomFichierBilan } from "@/lib/bilan-pdf";

/**
 * PDF d'un bilan, côté back-office (§5.4 : « PDF unitaire conforme V10 »).
 *
 * Généré à la demande plutôt que stocké : les chiffres du bilan se
 * recalculent depuis les copies, un PDF figé vieillirait mal.
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
  const { data: ligne } = await admin
    .from("bilans")
    .select("session_cb_id, user_id")
    .eq("id", id)
    .maybeSingle();
  if (!ligne) return new NextResponse("Bilan introuvable", { status: 404 });

  const bilan = await assemblerBilan(
    ligne.session_cb_id as string,
    ligne.user_id as string,
  );
  if (!bilan) return new NextResponse("Bilan introuvable", { status: 404 });

  const pdf = await bilanEnPdf(bilan);

  // Buffer vers Uint8Array : NextResponse n'accepte pas un Buffer Node tel quel.
  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${nomFichierBilan(bilan)}.pdf"`,
    },
  });
}
