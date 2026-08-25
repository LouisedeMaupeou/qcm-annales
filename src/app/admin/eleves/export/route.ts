import { NextResponse, type NextRequest } from "next/server";
import * as XLSX from "xlsx";
import { createClient } from "@/lib/supabase/server";
import { chargerEleves, type FiltresEleves } from "@/lib/eleves";

/**
 * §6.2 : export XLSX vers Zoho, respectant les filtres de la liste.
 *
 * Le fichier contient des données personnelles de mineurs (identité, email du
 * parent, établissement). L'accès est donc réservé à l'admin — le contrôle est
 * refait ici et non délégué au proxy : une route d'export est une porte de
 * sortie de données, elle vérifie elle-même qui frappe.
 */
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.redirect(new URL("/connexion", request.url));
  }

  const { data: profil } = await supabase
    .from("users")
    .select("role")
    .eq("id", user.id)
    .single();

  if (profil?.role !== "admin") {
    return new NextResponse("Accès refusé", { status: 403 });
  }

  const p = request.nextUrl.searchParams;
  const filtres: FiltresEleves = {
    recherche: p.get("q") ?? undefined,
    concoursId: p.get("concours") ?? undefined,
    consentement:
      p.get("consentement") === "oui" || p.get("consentement") === "non"
        ? (p.get("consentement") as "oui" | "non")
        : undefined,
    statut:
      p.get("statut") === "actifs" || p.get("statut") === "inactifs"
        ? (p.get("statut") as FiltresEleves["statut"])
        : undefined,
  };

  const eleves = await chargerEleves(filtres);

  // Colonnes attendues au §6.2 : identité, contacts, ville, établissement,
  // concours visés, consentement + date, inscription, nb de sessions, scores
  // moyens, dernière activité.
  const lignes = eleves.map((e) => ({
    Prénom: e.prenom,
    Nom: e.nom,
    Email: e.email,
    "Date de naissance": jour(e.dateNaissance),
    Ville: e.ville ?? "",
    Établissement: e.etablissement ?? "",
    "Concours visés": e.concoursVises.join(", "),
    "Consentement marketing": e.consentMarketing ? "oui" : "non",
    "Date du consentement": horodatage(e.consentMarketingDate),
    "CGU acceptées le": horodatage(e.cguAccepteesDate),
    "Inscrit le": horodatage(e.creeLe),
    "Compte actif": e.actif ? "oui" : "non",
    "Nombre de sessions": e.nbSessions,
    "Score moyen (%)": e.scoreMoyen === null ? "" : Math.round(e.scoreMoyen * 100),
    "Dernière activité": horodatage(e.derniereActivite),
  }));

  const feuille = XLSX.utils.json_to_sheet(lignes);
  const classeur = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(classeur, feuille, "Élèves");

  const contenu = XLSX.write(classeur, { type: "buffer", bookType: "xlsx" });
  const horodate = new Date().toISOString().slice(0, 10);

  return new NextResponse(contenu as ArrayBuffer, {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="eleves-admissible-${horodate}.xlsx"`,
      // Un export nominatif ne doit jamais être mis en cache par un
      // intermédiaire ni par le navigateur.
      "Cache-Control": "no-store, private",
    },
  });
}

const jour = (v: string | null) =>
  v ? new Date(v).toLocaleDateString("fr-FR") : "";

const horodatage = (v: string | null) =>
  v ? new Date(v).toLocaleString("fr-FR") : "";
