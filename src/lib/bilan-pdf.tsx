import "server-only";

import {
  Document,
  Page,
  StyleSheet,
  Text,
  View,
  renderToBuffer,
} from "@react-pdf/renderer";
import type { PointAnalyse } from "@/lib/bilan-cb";
import type { BilanAssemble } from "@/lib/bilans-generation";

/**
 * Bilan de session au format PDF (module concours blancs, §5.4).
 *
 * ⚠ Seconde mise en page du même document : celle-ci et `BilanV10` doivent
 * évoluer ensemble. C'est un coût assumé — le §5.4 demande un PDF joint à
 * l'email, et l'impression du navigateur ne peut pas produire une pièce
 * jointe côté serveur. Les deux rendus partent des mêmes données
 * (`BilanAssemble`), donc seule la présentation est dupliquée, jamais un
 * calcul.
 *
 * Paysage : le tableau porte une colonne par épreuve, il y en a jusqu'à dix
 * sur un bilan commerce complet.
 */

const COULEURS = {
  encre: "#12263A",
  texte: "#3D4B5C",
  ligne: "#E2E8F3",
  doux: "#F5F8FD",
  primaire: "#2563EB",
  negatif: "#C43D2F",
  positif: "#15713C",
};

const s = StyleSheet.create({
  page: {
    padding: 28,
    fontSize: 8,
    color: COULEURS.texte,
    fontFamily: "Helvetica",
  },
  titre: { fontSize: 16, color: COULEURS.encre, fontFamily: "Helvetica-Bold" },
  sousTitre: { fontSize: 9, marginBottom: 14 },
  section: { marginTop: 14 },
  sectionTitre: {
    fontSize: 9,
    color: COULEURS.primaire,
    fontFamily: "Helvetica-Bold",
    marginBottom: 6,
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  ligne: { flexDirection: "row" },
  cellule: {
    borderWidth: 0.5,
    borderColor: COULEURS.ligne,
    padding: 4,
    flexGrow: 1,
    flexBasis: 0,
  },
  entete: {
    borderWidth: 0.5,
    borderColor: COULEURS.ligne,
    padding: 4,
    backgroundColor: COULEURS.doux,
    fontFamily: "Helvetica-Bold",
    color: COULEURS.encre,
    width: 110,
  },
  celluleTitre: {
    borderWidth: 0.5,
    borderColor: COULEURS.ligne,
    padding: 4,
    backgroundColor: COULEURS.doux,
    fontFamily: "Helvetica-Bold",
    color: COULEURS.encre,
    flexGrow: 1,
    flexBasis: 0,
  },
  encadre: {
    borderWidth: 1,
    borderColor: COULEURS.primaire,
    borderRadius: 6,
    padding: 10,
    marginTop: 14,
  },
  bloc: {
    borderWidth: 0.5,
    borderColor: COULEURS.ligne,
    borderRadius: 6,
    padding: 10,
    marginTop: 8,
  },
  gras: { fontFamily: "Helvetica-Bold", color: COULEURS.encre },
  petit: { fontSize: 7 },
});

const nombre = (n: number | null, suffixe = "") =>
  n === null ? "—" : `${String(n).replace(".", ",")}${suffixe}`;

function Ligne({
  titre,
  valeurs,
  masquerSiVide = false,
}: {
  titre: string;
  valeurs: string[];
  /**
   * Pour les lignes de commentaire : une ligne vide sur toutes les épreuves
   * disparaît du document envoyé aux familles. Les lignes de chiffres, elles,
   * gardent leur tiret — une absence s'y lit.
   */
  masquerSiVide?: boolean;
}) {
  if (masquerSiVide && valeurs.every((v) => !v.trim() || v.trim() === "—")) {
    return null;
  }

  return (
    <View style={s.ligne} wrap={false}>
      <Text style={s.entete}>{titre}</Text>
      {valeurs.map((v, i) => (
        <Text key={i} style={s.cellule}>
          {v}
        </Text>
      ))}
    </View>
  );
}

/**
 * Les points d'une épreuve (chapitres, domaines en langues), puis le
 * commentaire de la responsable.
 *
 * Les points viennent de la correction ; elle n'a pas à les recopier, elle
 * ajoute ce que les chiffres ne disent pas.
 */
function cellulePoints(
  points: PointAnalyse[],
  detail: (p: PointAnalyse) => string,
  commentaire: string,
): string {
  const lignes = points.map((p) => `• ${p.libelle} — ${detail(p)}`);
  const texte = commentaire.trim();
  if (texte) lignes.push(texte);
  return lignes.join("\n");
}

function DocumentBilan({ bilan }: { bilan: BilanAssemble }) {
  const detaille = bilan.cohorte?.filiere !== "commerce";
  const c = bilan.colonnes;

  return (
    <Document
      title={`Bilan ${bilan.eleve.prenom} ${bilan.eleve.nom} — ${bilan.session}`}
      author="Parkours"
    >
      <Page size="A4" orientation="landscape" style={s.page}>
        <Text style={s.titre}>
          {bilan.eleve.prenom} {bilan.eleve.nom.toUpperCase()}
        </Text>
        <Text style={s.sousTitre}>
          Concours blancs — {bilan.session}
          {bilan.cohorte ? ` · ${bilan.cohorte.nom}` : ""}
        </Text>

        <View>
          <View style={s.ligne} wrap={false}>
            <Text style={s.entete}>Épreuve</Text>
            {c.map((x) => (
              <Text key={x.epreuveCbId} style={s.celluleTitre}>
                {x.concours}
                {"\n"}
                {x.matiere}
              </Text>
            ))}
          </View>

          <Ligne
            titre="Note"
            valeurs={c.map((x) => (x.absent ? "non composée" : nombre(x.noteSur20, "/20")))}
          />
          <Ligne
            titre="Moyenne du groupe"
            valeurs={c.map((x) => nombre(x.moyenneGroupe, "/20"))}
          />
          <Ligne
            titre="Ta place dans le groupe"
            valeurs={c.map((x) => (x.rang === null ? "—" : `${x.rang}/${x.participants}`))}
          />
          <Ligne titre="Questions attendues" valeurs={c.map((x) => String(x.nbQuestions))} />
          <Ligne
            titre="Questions réussies"
            valeurs={c.map((x) => (x.absent ? "—" : String(x.nbBonnes)))}
          />
          <Ligne
            titre="Questions ratées"
            valeurs={c.map((x) => (x.absent ? "—" : String(x.nbFausses)))}
          />
          <Ligne
            titre="Sans réponse"
            valeurs={c.map((x) => (x.absent ? "—" : String(x.nbAbstentions)))}
          />

          <Ligne titre="Niveau de maîtrise" valeurs={c.map((x) => x.niveau ?? "—")} />

          {/* Calculées, donc valables pour les deux filières. */}
          <Ligne
            titre="Forces identifiées"
            valeurs={c.map((x) =>
              cellulePoints(x.forcesPoints, (p) => `${p.justes}/${p.posees} réussies`, x.forces),
            )}
            masquerSiVide
          />
          <Ligne
            titre="Points d'amélioration (faux plus de 2 fois)"
            valeurs={c.map((x) =>
              cellulePoints(x.ameliorationsPoints, (p) => `${p.fausses} fautes`, x.ameliorations),
            )}
            masquerSiVide
          />

          {detaille ? (
            <>
              <Ligne
                titre="Maîtrise de la méthode"
                valeurs={c.map((x) => x.methode)}
                masquerSiVide
              />
              <Ligne
                titre="Conseils de reprise"
                valeurs={c.map((x) => x.conseils)}
                masquerSiVide
              />
            </>
          ) : null}
        </View>

        {/* §5.5 : les oraux viennent après les résultats des écrits. */}
        {bilan.oraux.oraux.length > 0 && (
          <View style={s.section} break={bilan.oraux.oraux.length > 2}>
            <Text style={s.sectionTitre}>
              Oraux blancs
              {bilan.oraux.complet && bilan.oraux.noteGlobale !== null
                ? ` — note globale ${nombre(bilan.oraux.noteGlobale, "/20")}`
                : ""}
            </Text>

            {bilan.oraux.oraux.map((o) => (
              <View key={o.nom} style={s.bloc} wrap={false}>
                <Text style={s.gras}>
                  {o.nom}
                  {o.contexte ? ` — ${o.contexte}` : ""}
                  {"  "}
                  {o.note === null
                    ? "(non évalué)"
                    : `${nombre(o.note)}/${o.maximum}${
                        o.ponderation > 0
                          ? ` · ${Math.round(o.ponderation * 100)} %`
                          : " · hors moyenne"
                      }`}
                </Text>

                {o.note !== null && (
                  <>
                    <View style={{ marginTop: 4 }}>
                      {o.criteres.map((critere) => (
                        <View key={critere.libelle} style={s.ligne}>
                          <Text style={[s.cellule, { flexGrow: 4 }]}>{critere.libelle}</Text>
                          <Text style={[s.cellule, { flexGrow: 1 }]}>
                            {critere.note === null
                              ? "—"
                              : `${nombre(critere.note)} / ${critere.maximum}`}
                          </Text>
                        </View>
                      ))}
                    </View>

                    {o.pointFort && (
                      <Text style={{ marginTop: 4 }}>
                        <Text style={s.gras}>Point fort. </Text>
                        {o.pointFort}
                      </Text>
                    )}
                    {o.progresPrioritaire && (
                      <Text>
                        <Text style={s.gras}>Progrès prioritaire. </Text>
                        {o.progresPrioritaire}
                      </Text>
                    )}
                    {o.commentaireJury && (
                      <Text>
                        <Text style={s.gras}>Commentaire du jury. </Text>
                        {o.commentaireJury}
                      </Text>
                    )}
                  </>
                )}
              </View>
            ))}
          </View>
        )}

        <View style={s.encadre} wrap={false}>
          <Text style={s.sectionTitre}>En quelques mots</Text>
          <Text>{bilan.enQuelquesMots}</Text>
        </View>

        {bilan.priorites.length > 0 && (
          <View style={s.section} wrap={false}>
            <Text style={s.sectionTitre}>À travailler en priorité</Text>
            {bilan.priorites.map((p) => (
              <Text key={`${p.matiere}-${p.chapitre}`} style={{ marginBottom: 3 }}>
                <Text style={s.gras}>{p.chapitre}</Text>
                <Text style={s.petit}>
                  {" "}
                  — {p.erreurs} erreur{p.erreurs > 1 ? "s" : ""}, {p.tauxReussite} % de
                  réussite.{" "}
                </Text>
                {p.action}
              </Text>
            ))}
          </View>
        )}

        {bilan.plan.length > 0 && (
          <View style={s.section} break>
            <Text style={s.sectionTitre}>Ton plan de travail</Text>
            <Text style={{ marginBottom: 6 }}>
              Tes points d&apos;amélioration, du plus fréquent au moins fréquent, avec des exemples
              tirés de tes copies : la notion, l&apos;erreur commise, et comment ne plus la refaire.
              Toutes tes fautes sont dans tes copies corrigées, sur ton espace.
            </Text>
            {bilan.plan.map((e) => (
              <View key={e.epreuve} style={{ marginTop: 6 }}>
                <Text style={[s.gras, { fontSize: 10, marginBottom: 2 }]}>{e.epreuve}</Text>
                {e.points.map((p) => (
                  <View key={`${p.domaine}-${p.libelle}`} style={s.bloc} wrap={false}>
                    <Text style={s.gras}>
                      {p.libelle !== p.domaine ? `${p.domaine} › ` : ""}
                      {p.libelle}
                      <Text style={{ color: COULEURS.negatif }}> — {p.fautes} fautes</Text>
                    </Text>
                    {p.detail.map((f) => (
                      <View
                        key={f.numero}
                        style={{ marginTop: 3, paddingLeft: 6, borderLeftWidth: 2, borderLeftColor: "#E7B3AD" }}
                      >
                        <Text>
                          <Text style={s.gras}>Question {f.numero}</Text>
                          {f.chapitre ? ` · ${f.chapitre}` : ""}
                          {f.notion ? ` · ${f.notion}` : ""}
                        </Text>
                        {f.erreur && (
                          <Text>
                            <Text style={[s.gras, { color: COULEURS.negatif }]}>Erreur : </Text>
                            {f.erreur}
                          </Text>
                        )}
                        {f.amelioration && (
                          <Text>
                            <Text style={[s.gras, { color: COULEURS.positif }]}>À reprendre : </Text>
                            {f.amelioration}
                          </Text>
                        )}
                        {f.methode && (
                          <Text>
                            <Text style={[s.gras, { color: COULEURS.primaire }]}>Méthode : </Text>
                            {f.methode}
                          </Text>
                        )}
                      </View>
                    ))}
                    {p.autres > 0 && (
                      <Text style={[s.petit, { marginTop: 2 }]}>
                        + {p.autres} autre{p.autres > 1 ? "s" : ""} faute{p.autres > 1 ? "s" : ""} sur ce
                        point : voir ta copie corrigée.
                      </Text>
                    )}
                  </View>
                ))}
              </View>
            ))}
          </View>
        )}
      </Page>
    </Document>
  );
}

/** Rend le bilan en PDF. Le nom de fichier est calculé par l'appelant. */
export async function bilanEnPdf(bilan: BilanAssemble): Promise<Buffer> {
  return renderToBuffer(<DocumentBilan bilan={bilan} />);
}

export function nomFichierBilan(bilan: BilanAssemble): string {
  return `bilan-${bilan.eleve.nom}-${bilan.eleve.prenom}-${bilan.session}`
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9-]+/g, "-")
    .toLowerCase()
    .replace(/-+/g, "-");
}
