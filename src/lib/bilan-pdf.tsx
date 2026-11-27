import "server-only";

import path from "node:path";
import {
  Document,
  Font,
  Page,
  StyleSheet,
  Text,
  View,
  renderToBuffer,
} from "@react-pdf/renderer";
import type { PointAnalyse } from "@/lib/bilan-cb";
import type { BilanAssemble, ColonneBilan } from "@/lib/bilans-generation";

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
 * V11 (retours de la responsable des prépas, novembre 2026) : portrait, police
 * Rubik, une carte par épreuve plutôt qu'un tableau de tableur. Chaque carte
 * se lit d'un coup d'œil — la note et sa jauge face à la moyenne du groupe, la
 * place, la barre réussies / ratées / sans réponse —, puis nomme ce qui est
 * acquis et ce qui ne l'est pas. Le plan de travail suit, une faute par bloc,
 * ses intitulés en colonne.
 */

// Rubik, licence OFL (voir `polices/LICENSE-Rubik-OFL.txt`). Les fichiers
// sont inclus au déploiement par `outputFileTracingIncludes` (next.config).
const POLICES = path.join(process.cwd(), "src", "lib", "polices");
Font.register({
  family: "Rubik",
  fonts: [
    { src: path.join(POLICES, "rubik-latin-400-normal.woff"), fontWeight: 400 },
    { src: path.join(POLICES, "rubik-latin-500-normal.woff"), fontWeight: 500 },
    { src: path.join(POLICES, "rubik-latin-700-normal.woff"), fontWeight: 700 },
    { src: path.join(POLICES, "rubik-latin-800-normal.woff"), fontWeight: 800 },
  ],
});
// Repli pour ce que Rubik ne dessine pas : flèches, lettres grecques,
// opérateurs (√, ≤, ≈, ℝ). Les textes du référentiel en contiennent.
Font.register({
  family: "NotoMath",
  src: path.join(POLICES, "noto-sans-math-latin-400-normal.woff"),
});
// Pas de césure automatique : un « Compré-hension » coupé se lit mal.
Font.registerHyphenationCallback((mot) => [mot]);

const C = {
  encre: "#12263A",
  texte: "#3D4B5C",
  pale: "#8592A3",
  ligne: "#E2E8F3",
  doux: "#F1F5FD",
  primaire: "#2563EB",
  primaireFonce: "#1B4FC4",
  positif: "#15713C",
  positifDoux: "#E6F2EA",
  negatif: "#C43D2F",
  negatifDoux: "#FAE9E7",
  gris: "#C9D2DE",
};

const s = StyleSheet.create({
  page: {
    paddingTop: 0,
    paddingBottom: 36,
    fontSize: 9,
    lineHeight: 1.35,
    color: C.texte,
    fontFamily: ["Rubik", "NotoMath"],
  },
  corps: { paddingHorizontal: 32 },
  bandeau: {
    backgroundColor: C.primaire,
    paddingHorizontal: 32,
    paddingTop: 26,
    paddingBottom: 20,
    marginBottom: 18,
  },
  bandeauSur: { color: "#C7D7FB", fontSize: 8, fontWeight: 500, letterSpacing: 1.2, textTransform: "uppercase" },
  bandeauNom: { color: "#FFFFFF", fontSize: 22, fontWeight: 800, marginTop: 4, lineHeight: 1.2 },
  bandeauSous: { color: "#E3EBFD", fontSize: 10, marginTop: 4 },
  titreSection: { fontSize: 11, fontWeight: 800, color: C.encre, marginBottom: 8, marginTop: 6 },
  intro: { fontSize: 8.5, color: C.pale, marginBottom: 10 },
  encadre: {
    backgroundColor: C.doux,
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
    borderLeftWidth: 4,
    borderLeftColor: C.primaire,
  },
  encadreTitre: {
    fontSize: 8,
    fontWeight: 700,
    color: C.primaireFonce,
    letterSpacing: 1,
    textTransform: "uppercase",
    marginBottom: 4,
  },
  carte: { borderWidth: 1, borderColor: C.ligne, borderRadius: 8, padding: 10, marginBottom: 8 },
  ligne: { flexDirection: "row" },
  pastille: { borderRadius: 10, paddingHorizontal: 7, paddingVertical: 2, fontSize: 8, fontWeight: 700 },
  gras: { fontWeight: 700, color: C.encre },
  petit: { fontSize: 7.5, color: C.pale },
  piedDePage: {
    position: "absolute",
    bottom: 16,
    left: 32,
    right: 32,
    fontSize: 7,
    color: C.pale,
    flexDirection: "row",
    justifyContent: "space-between",
  },
});

const EXPOSANTS: Record<string, string> = {
  "⁰": "0", "¹": "1", "²": "2", "³": "3", "⁴": "4", "⁵": "5", "⁶": "6", "⁷": "7", "⁸": "8", "⁹": "9",
  "⁺": "+", "⁻": "-", "ⁿ": "n",
};
const INDICES: Record<string, string> = {
  "₀": "0", "₁": "1", "₂": "2", "₃": "3", "₄": "4", "₅": "5", "₆": "6", "₇": "7", "₈": "8", "₉": "9",
  "₊": "+", "₋": "-", "ₙ": "n",
};

/**
 * Les textes du référentiel, tels qu'une police de PDF sait les dessiner.
 *
 * Ni Rubik ni le repli mathématique ne rendent proprement les exposants et
 * les indices Unicode (xⁿ, uₙ₊₁) ni « ≠ » : ils s'y superposaient. On les
 * écrit comme on les écrit au clavier — u(n+1), x^(-1), 10^5 — sans rien
 * changer au sens. Les carrés et cubes (², ³), que Rubik connaît, restent.
 * L'écran, lui, affiche le texte d'origine.
 */
function pourPdf(texte: string): string {
  return texte
    .replace(/[₀-₉₊₋ₙ]+/g, (m) => `(${[...m].map((c) => INDICES[c]).join("")})`)
    .replace(/[⁰¹⁴-⁹⁺⁻ⁿ][⁰-⁹⁺⁻ⁿ¹²³]*/g, (m) => {
      const brut = [...m].map((c) => EXPOSANTS[c] ?? c).join("");
      return brut.length > 1 ? `^(${brut})` : `^${brut}`;
    })
    .replace(/≠/g, " différent de ");
}

const virgule = (n: number | null, suffixe = "") =>
  n === null ? "—" : `${String(n).replace(".", ",")}${suffixe}`;

/** Couleur d'une note : la même échelle que le niveau de maîtrise. */
const couleurNote = (n: number | null) =>
  n === null ? C.pale : n >= 15 ? C.positif : n >= 8 ? C.primaire : C.negatif;

// ---------------------------------------------------------------------------
// Résultats : un tableau de synthèse, une ligne par épreuve
// ---------------------------------------------------------------------------

/** Largeurs des colonnes, en points : le tableau tient sur la largeur d'un A4 portrait. */
const COL = { epreuve: 82, note: 38, moyenne: 34, place: 30, nombre: 27, liste: 0 };

function Cellule({
  largeur,
  children,
  centre = true,
  style,
}: {
  largeur: number;
  children: React.ReactNode;
  centre?: boolean;
  style?: Record<string, unknown>;
}) {
  return (
    <View
      style={{
        ...(largeur ? { width: largeur } : { flex: 1 }),
        paddingHorizontal: 4,
        paddingVertical: 5,
        justifyContent: "center",
        alignItems: centre ? "center" : "flex-start",
        ...style,
      }}
    >
      {children}
    </View>
  );
}

function EnTete({ largeur, texte, centre = true }: { largeur: number; texte: string; centre?: boolean }) {
  return (
    <Cellule largeur={largeur} centre={centre}>
      <Text style={{ color: "#FFFFFF", fontSize: 7, fontWeight: 700, textAlign: centre ? "center" : "left" }}>
        {texte}
      </Text>
    </Cellule>
  );
}

/** Une liste de points dans une cellule : « Grammaire 13 », la mesure en couleur. */
function PointsCellule({
  points,
  couleur,
  mesure,
  commentaire,
}: {
  points: PointAnalyse[];
  couleur: string;
  mesure: (p: PointAnalyse) => string;
  commentaire: string;
}) {
  if (points.length === 0 && !commentaire.trim()) return <Text style={s.petit}>—</Text>;
  return (
    <View>
      {points.map((p) => (
        <Text key={`${p.domaine}-${p.libelle}`} style={{ fontSize: 7.5, marginBottom: 1 }}>
          <Text style={{ color: couleur }}>• </Text>
          <Text style={{ color: C.encre }}>{pourPdf(p.libelle)}</Text>
          <Text style={{ color: couleur, fontWeight: 700 }}> {mesure(p)}</Text>
        </Text>
      ))}
      {commentaire.trim() && (
        <Text style={{ fontSize: 7.5, marginTop: 2 }}>{pourPdf(commentaire.trim())}</Text>
      )}
    </View>
  );
}

function TableauResultats({ colonnes }: { colonnes: ColonneBilan[] }) {
  return (
    <View style={{ borderRadius: 8, overflow: "hidden", borderWidth: 1, borderColor: C.ligne }}>
      <View style={[s.ligne, { backgroundColor: C.encre }]} fixed>
        <EnTete largeur={COL.epreuve} texte="Épreuve" centre={false} />
        <EnTete largeur={COL.note} texte="Note" />
        <EnTete largeur={COL.moyenne} texte="Moy. groupe" />
        <EnTete largeur={COL.place} texte="Place" />
        <EnTete largeur={COL.nombre} texte="Quest." />
        <EnTete largeur={COL.nombre} texte="Réuss." />
        <EnTete largeur={COL.nombre} texte="Ratées" />
        <EnTete largeur={COL.nombre} texte="Sans rép." />
        <EnTete largeur={COL.liste} texte="Acquis" centre={false} />
        <EnTete largeur={COL.liste} texte="À reprendre (faux > 2 fois)" centre={false} />
      </View>
      {colonnes.map((c, i) => (
        <View
          key={c.epreuveCbId}
          wrap={false}
          style={[s.ligne, { backgroundColor: i % 2 ? C.doux : "#FFFFFF", borderTopWidth: 0.5, borderTopColor: C.ligne }]}
        >
          <Cellule largeur={COL.epreuve} centre={false}>
            <Text style={{ fontSize: 6.5, color: C.pale, textTransform: "uppercase" }}>{c.concours}</Text>
            <Text style={{ fontSize: 8.5, fontWeight: 700, color: C.encre }}>{c.matiere}</Text>
          </Cellule>
          {c.absent ? (
            <Cellule largeur={COL.note + COL.moyenne + COL.place + COL.nombre * 4}>
              <Text style={{ color: C.pale }}>Non composée</Text>
            </Cellule>
          ) : (
            <>
              <Cellule largeur={COL.note}>
                <Text style={{ fontSize: 12, fontWeight: 800, color: couleurNote(c.noteSur20) }}>
                  {virgule(c.noteSur20)}
                </Text>
                <Text style={{ fontSize: 6.5, color: C.pale }}>/20</Text>
              </Cellule>
              <Cellule largeur={COL.moyenne}>
                <Text>{virgule(c.moyenneGroupe)}</Text>
              </Cellule>
              <Cellule largeur={COL.place}>
                <Text>{c.rang === null ? "—" : `${c.rang}/${c.participants}`}</Text>
              </Cellule>
              <Cellule largeur={COL.nombre}>
                <Text>{c.nbQuestions}</Text>
              </Cellule>
              <Cellule largeur={COL.nombre}>
                <Text style={{ color: C.positif, fontWeight: 700 }}>{c.nbBonnes}</Text>
              </Cellule>
              <Cellule largeur={COL.nombre}>
                <Text style={{ color: C.negatif, fontWeight: 700 }}>{c.nbFausses}</Text>
              </Cellule>
              <Cellule largeur={COL.nombre}>
                <Text style={{ color: C.pale }}>{c.nbAbstentions}</Text>
              </Cellule>
            </>
          )}
          <Cellule largeur={COL.liste} centre={false}>
            <PointsCellule
              points={c.forcesPoints}
              couleur={C.positif}
              mesure={(p) => `${p.justes}/${p.posees}`}
              commentaire={c.forces}
            />
          </Cellule>
          <Cellule largeur={COL.liste} centre={false}>
            <PointsCellule
              points={c.ameliorationsPoints}
              couleur={C.negatif}
              mesure={(p) => String(p.fausses)}
              commentaire={c.ameliorations}
            />
          </Cellule>
        </View>
      ))}
    </View>
  );
}

/** Les commentaires de méthode et de reprise, quand la responsable en a écrit. */
function CommentairesEpreuves({ colonnes }: { colonnes: ColonneBilan[] }) {
  const avec = colonnes.filter((c) => c.methode.trim() || c.conseils.trim());
  if (avec.length === 0) return null;
  return (
    <View style={{ marginTop: 10 }}>
      {avec.map((c) => (
        <View key={c.epreuveCbId} style={{ marginBottom: 4 }} wrap={false}>
          <Text style={s.gras}>{c.matiere}</Text>
          {c.methode.trim() && <Rubrique libelle="Méthode" couleur={C.primaire} texte={c.methode.trim()} />}
          {c.conseils.trim() && <Rubrique libelle="Conseils" couleur={C.primaire} texte={c.conseils.trim()} />}
        </View>
      ))}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Plan de travail
// ---------------------------------------------------------------------------

type Point = BilanAssemble["plan"][number]["points"][number];

/** Un intitulé en colonne, son texte à droite : l'œil retrouve chaque rubrique. */
function Rubrique({ libelle, couleur, texte }: { libelle: string; couleur: string; texte: string }) {
  return (
    <View style={[s.ligne, { marginTop: 2 }]}>
      <Text
        style={{ width: 62, fontSize: 7.5, fontWeight: 700, color: couleur, textTransform: "uppercase", letterSpacing: 0.4, paddingTop: 0.5 }}
      >
        {libelle}
      </Text>
      <Text style={{ flex: 1 }}>{pourPdf(texte)}</Text>
    </View>
  );
}

function BandeauEpreuve({ epreuve }: { epreuve: string }) {
  return (
    <View
      style={{
        backgroundColor: C.encre,
        borderRadius: 6,
        paddingHorizontal: 10,
        paddingVertical: 5,
        marginBottom: 6,
      }}
    >
      <Text style={{ color: "#FFFFFF", fontWeight: 700, fontSize: 10 }}>{epreuve}</Text>
    </View>
  );
}

function PointDuPlanPdf({
  p,
  rang,
  epreuve,
}: {
  p: Point;
  rang: number;
  /** Le premier point porte le bandeau de son épreuve. */
  epreuve?: string;
}) {
  return (
    // Un bloc insécable, bandeau d'épreuve compris : aucun titre ne reste
    // seul en bas de page. Imbriquer des blocs insécables dans un bloc qui se
    // coupe faisait superposer le texte en bas de page (@react-pdf) ; une
    // carte entière tient toujours sur une page.
    <View wrap={false}>
      {epreuve && <BandeauEpreuve epreuve={epreuve} />}
      <View style={[s.carte, { padding: 10 }]}>
        <View style={[s.ligne, { alignItems: "center", marginBottom: 2 }]}>
          <View
            style={{
              width: 16,
              height: 16,
              borderRadius: 8,
              backgroundColor: C.negatif,
              marginRight: 6,
              justifyContent: "center",
            }}
          >
            <Text style={{ color: "#FFFFFF", fontSize: 8, fontWeight: 800, textAlign: "center" }}>
              {rang}
            </Text>
          </View>
          <Text style={{ flex: 1, fontSize: 10, fontWeight: 700, color: C.encre }}>
            {p.libelle !== p.domaine && (
              <Text style={{ color: C.pale, fontWeight: 500 }}>{pourPdf(p.domaine)} › </Text>
            )}
            {pourPdf(p.libelle)}
          </Text>
          <Text style={[s.pastille, { backgroundColor: C.negatifDoux, color: C.negatif }]}>
            {p.fautes} fautes
          </Text>
        </View>
        {p.detail.map((f) => (
          <Exemple key={f.numero} f={f} />
        ))}
        {p.autres > 0 && (
          <Text style={[s.petit, { marginTop: 4 }]}>
            + {p.autres} autre{p.autres > 1 ? "s" : ""} faute{p.autres > 1 ? "s" : ""} sur ce point,
            dans ton bilan en ligne.
          </Text>
        )}
      </View>
    </View>
  );
}

/** Une faute : la question et sa notion, puis l'erreur, quoi reprendre, la méthode. */
function Exemple({ f }: { f: Point["detail"][number] }) {
  return (
    <View style={{ marginTop: 5, paddingTop: 5, borderTopWidth: 0.5, borderTopColor: C.ligne }}>
      <Text style={{ fontSize: 8, color: C.pale, marginBottom: 1 }}>
        <Text style={{ color: C.encre, fontWeight: 700 }}>Question {f.numero}</Text>
        {f.chapitre ? ` · ${pourPdf(f.chapitre)}` : ""}
        {f.notion ? ` · ${pourPdf(f.notion)}` : ""}
      </Text>
      {f.erreur && <Rubrique libelle="Erreur" couleur={C.negatif} texte={f.erreur} />}
      {f.amelioration && <Rubrique libelle="À reprendre" couleur={C.positif} texte={f.amelioration} />}
      {f.methode && <Rubrique libelle="Méthode" couleur={C.primaire} texte={f.methode} />}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Document
// ---------------------------------------------------------------------------

function DocumentBilan({ bilan }: { bilan: BilanAssemble }) {
  const titre = `${bilan.eleve.prenom} ${bilan.eleve.nom}`;
  return (
    <Document title={`Bilan ${titre} — ${bilan.session}`} author="Parkours">
      <Page size="A4" style={s.page}>
        <View style={s.bandeau}>
          <Text style={s.bandeauSur}>Bilan des concours blancs</Text>
          <Text style={s.bandeauNom}>{titre}</Text>
          <Text style={s.bandeauSous}>
            {bilan.session}
            {bilan.cohorte ? ` · ${bilan.cohorte.nom}` : ""}
          </Text>
        </View>

        <View style={s.corps}>
          <View style={s.encadre} wrap={false}>
            <Text style={s.encadreTitre}>En quelques mots</Text>
            <Text style={{ fontSize: 9.5, color: C.encre }}>{pourPdf(bilan.enQuelquesMots)}</Text>
          </View>

          <Text style={s.titreSection}>Tes résultats</Text>
          <TableauResultats colonnes={bilan.colonnes} />
          <Text style={[s.petit, { marginTop: 4 }]}>
            Note sur 20, en vert à partir de 15, en rouge sous 8. Place : ton rang parmi les élèves du groupe
            qui ont composé. Acquis : réussites sur questions posées. À reprendre : nombre de fautes.
          </Text>
          <CommentairesEpreuves colonnes={bilan.colonnes} />

          {bilan.plan.length > 0 && (
            <View break>
              <Text style={[s.titreSection, { fontSize: 14, marginTop: 24 }]}>Ton plan de travail</Text>
              <Text style={s.intro}>
                Pour chaque épreuve, tes trois points à reprendre les plus fréquents, avec des exemples tirés de tes
                copies : la notion, l&apos;erreur commise, et comment ne plus la refaire. Toutes tes fautes sont
                détaillées dans ton bilan en ligne et tes copies corrigées.
              </Text>
              {bilan.plan.map((e) => (
                <View key={e.epreuve} style={{ marginBottom: 6 }}>
                  {e.points.map((p, i) => (
                    <PointDuPlanPdf
                      key={`${p.domaine}-${p.libelle}`}
                      p={p}
                      rang={i + 1}
                      epreuve={i === 0 ? e.epreuve : undefined}
                    />
                  ))}
                  {e.autresPoints.length > 0 && (
                    <Text style={[s.petit, { marginBottom: 6 }]}>
                      <Text style={{ fontWeight: 700, color: C.texte }}>Autres points à reprendre : </Text>
                      {pourPdf(e.autresPoints.map((p) => `${p.libelle} (${p.fautes} fautes)`).join(", "))} — détail dans ton
                      bilan en ligne.
                    </Text>
                  )}
                </View>
              ))}
            </View>
          )}
          {/* Oraux en fin de document, après le plan de travail des écrits
              (retours de la responsable des prépas, novembre 2026). */}
          {bilan.oraux.oraux.length > 0 && (
            <View break>
              <Text style={s.titreSection}>
                Oraux blancs
                {bilan.oraux.complet && bilan.oraux.noteGlobale !== null
                  ? ` — note globale ${virgule(bilan.oraux.noteGlobale, "/20")}`
                  : ""}
              </Text>
              {bilan.oraux.oraux.map((o) => (
                <View key={o.nom} style={s.carte} wrap={false}>
                  <View style={[s.ligne, { justifyContent: "space-between", alignItems: "flex-end" }]}>
                    <Text style={{ fontSize: 10, fontWeight: 700, color: C.encre, flex: 1 }}>
                      {o.nom}
                      {o.contexte ? <Text style={{ fontWeight: 400, color: C.pale }}> — {o.contexte}</Text> : null}
                    </Text>
                    <Text style={{ fontSize: 12, fontWeight: 800, color: C.encre }}>
                      {o.note === null ? "non évalué" : `${virgule(o.note)}/${o.maximum}`}
                      <Text style={{ fontSize: 7.5, fontWeight: 400, color: C.pale }}>
                        {o.note === null
                          ? ""
                          : o.ponderation > 0
                            ? `  ${Math.round(o.ponderation * 100)} %`
                            : "  hors moyenne"}
                      </Text>
                    </Text>
                  </View>
                  {o.note !== null && (
                    <>
                      <View style={[s.ligne, { flexWrap: "wrap", marginTop: 5 }]}>
                        {o.criteres.map((critere) => (
                          <View
                            key={critere.libelle}
                            style={[s.ligne, { width: "50%", paddingRight: 10, marginBottom: 2, alignItems: "center" }]}
                          >
                            <Text style={{ flex: 1, fontSize: 8 }}>{critere.libelle}</Text>
                            <View style={{ width: 40, height: 4, backgroundColor: C.doux, borderRadius: 2, marginRight: 4 }}>
                              {critere.note !== null && (
                                <View
                                  style={{
                                    height: 4,
                                    borderRadius: 2,
                                    width: `${(critere.note / critere.maximum) * 100}%`,
                                    backgroundColor: C.primaire,
                                  }}
                                />
                              )}
                            </View>
                            <Text style={{ width: 30, fontSize: 8, textAlign: "right" }}>
                              {critere.note === null ? "—" : `${virgule(critere.note)}/${critere.maximum}`}
                            </Text>
                          </View>
                        ))}
                      </View>
                      {o.pointFort && <Rubrique libelle="Point fort" couleur={C.positif} texte={o.pointFort} />}
                      {o.progresPrioritaire && (
                        <Rubrique libelle="À progresser" couleur={C.negatif} texte={o.progresPrioritaire} />
                      )}
                      {o.commentaireJury && <Rubrique libelle="Jury" couleur={C.primaire} texte={o.commentaireJury} />}
                    </>
                  )}
                </View>
              ))}
            </View>
          )}

        </View>

        <View style={s.piedDePage} fixed>
          <Text>
            Parkours · {titre} · {bilan.session}
          </Text>
          <Text render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} />
        </View>
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
