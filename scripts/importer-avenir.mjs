import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "node:fs";
import { basename } from "node:path";
import { lirePages } from "./lire-pdf.mjs";

/**
 * Import des annales du Concours Avenir (sessions 2025 et 2026).
 *
 *   node --env-file=.env.local scripts/importer-avenir.mjs <dossier-des-pdf>
 *
 * Idempotent : les annales existantes sont supprimées puis recréées (cascade).
 *
 * Périmètre
 * ---------
 * Seule l'épreuve d'anglais est transcrite. Les sujets de mathématiques (A et
 * B), de sciences (A) et de physique (B) contiennent bien du texte, mais leur
 * notation scientifique est bidimensionnelle : linéarisée à l'extraction,
 * « u_n = (n³+1)/(2n³+5) » ressort en fragments empilés et « 5,97×10²⁴ kg »
 * devient « 5,97.10kg ». S'y ajoutent des figures absentes. C'est le cas
 * dégradé du §10.4 ; leur transcription relève d'une saisie humaine, via
 * l'import XLSX du back-office. Leurs PDF sont archivés et rattachés.
 *
 * Droits de reproduction (§8.9)
 * -----------------------------
 * Les corrigés de la session 2025 portent « Propriété exclusive du Concours
 * Avenir. Reproduction interdite. ». L'import a été autorisé explicitement par
 * le responsable du projet, qui a déclaré disposer des droits nécessaires.
 *
 * Barème
 * ------
 * Les sujets officiels donnent le barème, et il a changé entre les sessions :
 * +3 / −1 / 0 en 2025, +1 / −1 / 0 en 2026. Le schéma ne portant qu'un barème
 * par concours × épreuve, c'est celui de la session courante (2026) qui est
 * retenu : l'élève s'entraîne à la stratégie qui sera la sienne le jour du
 * concours. Décision prise avec le responsable du projet.
 */

const NOM_CONCOURS = "Avenir";

const SESSIONS = [
  {
    annee: 2025,
    anglaisSujet: "CA_annales_anglais_sujet_officiel_2425.pdf",
    anglaisCorrige: "CA_annales_anglais_reponses_sujets_officiels_2425.pdf",
    colonneCorrige: "ANGLAIS A",
    autres: [
      "CA_annales_mathematiques_A_sujet_officiel_2425.pdf",
      "CA_annales_mathematiques_B_sujet_officiel_2425.pdf",
      "CA_annales_mathematiques_reponses_sujets_officiels_2425.pdf",
      "CA_annales_sciences_A_sujet_officiel_2425.pdf",
      "CA_annales_physique_B_sujet_officiel_2425.pdf",
      "CA_annales_sciences_reponses_sujets_officiels_2425.pdf",
    ],
  },
  {
    annee: 2026,
    anglaisSujet: "CA_annales_anglais_sujet_officiel_2526.pdf",
    anglaisCorrige: "CA_annales_anglais_reponses_sujets_officiels_2526.pdf",
    colonneCorrige: null, // tableau à une seule colonne
    autres: [
      "CA_annales_mathematiques_A_sujet_officiel_2526.pdf",
      "CA_annales_mathematiques_reponses_sujets_officiels_2526.pdf",
      "CA_annales_sciences_A_sujet_officiel_2526.pdf",
      "CA_annales_sciences_reponses_sujets_officiels_2526.pdf",
    ],
  },
];

// Épreuves créées pour toutes les sessions, y compris celles sans question :
// elles apparaissent alors « Bientôt » côté élève, ce qui est honnête.
const EPREUVES = [
  "Anglais",
  "Mathématiques A",
  "Mathématiques B",
  "Sciences A",
  "Physique B",
];

const BAREME = {
  points_bonne: 1,
  points_mauvaise: -1,
  points_abstention: 0,
  regle_speciale:
    "Une seule réponse correcte par question. Le barème de la session 2025 était de +3 par bonne réponse ; celui de 2026, retenu ici, est de +1.",
  source_officielle:
    "Sujet officiel du Concours Avenir, épreuve d'anglais, session du 2 mai 2026, encadré « Barème valable pour toutes les questions »",
};

const dossier = process.argv[2];
if (!dossier) {
  console.error("Usage : node --env-file=.env.local scripts/importer-avenir.mjs <dossier>");
  process.exit(1);
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const cle = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !cle) {
  console.error("NEXT_PUBLIC_SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY requis.");
  process.exit(1);
}

const db = createClient(url, cle, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const verifier = (erreur, contexte) => {
  if (erreur) {
    console.error(`✗ ${contexte} : ${erreur.message}`);
    process.exit(1);
  }
};

const chemin = (f) => `${dossier}\\${f}`;

// ---------------------------------------------------------------------------
// Extraction du corrigé
// ---------------------------------------------------------------------------
/**
 * Les corrigés sont des tableaux « N° | réponse », parfois à plusieurs colonnes
 * (une par épreuve). `colonne` désigne l'en-tête à retenir ; null signifie
 * qu'il n'y a qu'une colonne de réponses.
 */
function extraireCorrige(texte, colonne) {
  const lignes = texte.split("\n").map((l) => l.trim());
  const reponses = new Map();

  let rangColonne = 0;
  if (colonne) {
    const entete = lignes.find((l) => l.includes(colonne));
    if (!entete) throw new Error(`colonne « ${colonne} » absente du corrigé`);
    // Les libellés d'épreuves suivent « N° QUESTIONS » ; on compte les colonnes
    // en repérant celles qui précèdent celle qu'on cherche.
    const apres = entete.slice(entete.indexOf("QUESTIONS") + "QUESTIONS".length);
    const colonnes = apres.split(/\s{1,}(?=[A-ZÉÈ])/).map((s) => s.trim()).filter(Boolean);
    rangColonne = colonnes.findIndex((c) => c.startsWith(colonne));
    if (rangColonne < 0) rangColonne = 0;
  }

  for (const ligne of lignes) {
    // « 12 C » ou « 12 A B » selon le nombre de colonnes.
    const m = ligne.match(/^(\d{1,3})\s+((?:[A-D]\s*)+)$/);
    if (!m) continue;
    const numero = Number(m[1]);
    const lettres = m[2].trim().split(/\s+/);
    const lettre = lettres[rangColonne];
    if (lettre) reponses.set(numero, lettre.toLowerCase());
  }

  return reponses;
}

// ---------------------------------------------------------------------------
// Extraction des questions d'anglais
// ---------------------------------------------------------------------------
/** Découpe un bloc de texte en énoncé + 4 propositions a. b. c. d. */
function decouperPropositions(bloc) {
  const positions = [];
  let depuis = 0;
  for (const lettre of ["a", "b", "c", "d"]) {
    // Marqueur précédé d'un début de texte ou d'une espace. L'espace qui suit
    // le point est facultative : le sujet 2026 écrit « d.regardless » et
    // « d.to » sans espace. Le regard en avant exige une lettre, pour ne pas
    // confondre le marqueur avec un nombre décimal au fil du texte.
    const regex = new RegExp(`(^|\\s)${lettre}\\.\\s*(?=[^\\s\\d])`, "g");
    regex.lastIndex = depuis;
    const m = regex.exec(bloc);
    if (!m) return null;
    positions.push({ lettre, debut: m.index + m[1].length, apres: regex.lastIndex });
    depuis = regex.lastIndex;
  }

  const enonce = bloc.slice(0, positions[0].debut).replace(/\s+/g, " ").trim();
  const propositions = positions.map((p, i) => ({
    lettre: p.lettre,
    texte: bloc
      .slice(p.apres, i + 1 < positions.length ? positions[i + 1].debut : bloc.length)
      .replace(/\s+/g, " ")
      .trim(),
  }));

  return { enonce, propositions };
}

function extraireAnglais(pages) {
  const texte = pages
    .join("\n")
    .split("\n")
    .filter(
      (l) =>
        !/^CONCOURS AVENIR/.test(l.trim()) &&
        !/^Page \d+ sur \d+$/.test(l.trim()) &&
        l.trim() !== "",
    )
    .join("\n");

  const iPartie2 = texte.search(/Part\s*2\s*[–-]\s*Reading Comprehension/i);
  if (iPartie2 < 0) throw new Error("section « Part 2 » introuvable");

  const partie1 = texte.slice(0, iPartie2);
  const partie2 = texte.slice(iPartie2);

  // Le passage de compréhension court du titre de section à la première question.
  const iPremiereQuestion = partie2.search(/(?:^|\n)\d{1,2}\.\s/);
  const passage = partie2
    .slice(partie2.indexOf("\n") + 1, iPremiereQuestion)
    .replace(/\s+/g, " ")
    .trim();

  const decouperQuestions = (source, section) => {
    const morceaux = source.split(/(?:^|\n)(?=\d{1,2}\.\s)/);
    const questions = [];
    for (const morceau of morceaux) {
      const m = morceau.match(/^(\d{1,2})\.\s([\s\S]*)$/);
      if (!m) continue;
      const numero = Number(m[1]);
      if (numero < 1 || numero > 60) continue;
      const decoupe = decouperPropositions(m[2]);
      questions.push({
        numero,
        section,
        enonce: decoupe?.enonce ?? m[2].replace(/\s+/g, " ").trim(),
        propositions: decoupe?.propositions ?? [],
      });
    }
    return questions;
  };

  return {
    passage,
    questions: [
      ...decouperQuestions(partie1, "Grammar & Vocabulary"),
      ...decouperQuestions(partie2.slice(iPremiereQuestion), "Reading Comprehension"),
    ],
  };
}

// ---------------------------------------------------------------------------
// Concours, épreuves, barème
// ---------------------------------------------------------------------------
const { data: concours, error: eConcours } = await db
  .from("concours")
  .select("id")
  .eq("nom", NOM_CONCOURS)
  .single();
verifier(eConcours, `concours ${NOM_CONCOURS} introuvable`);

const epreuves = {};
for (const [i, nom] of EPREUVES.entries()) {
  const { data, error } = await db
    .from("epreuves")
    .upsert(
      { concours_id: concours.id, nom, ordre_affichage: i + 1 },
      { onConflict: "concours_id,nom" },
    )
    .select("id")
    .single();
  verifier(error, `épreuve ${nom}`);
  epreuves[nom] = data.id;
}

// §2 : le barème est désormais sourcé et daté, il n'est plus « à vérifier ».
const { error: eBareme } = await db
  .from("baremes")
  .update({ ...BAREME, verifie_le: new Date().toISOString().slice(0, 10) })
  .eq("concours_id", concours.id)
  .is("epreuve_id", null);
verifier(eBareme, "mise à jour du barème");

// ---------------------------------------------------------------------------
// Sessions
// ---------------------------------------------------------------------------
let totalPubliees = 0;
let totalRelecture = 0;

for (const session of SESSIONS) {
  console.log(`\n── Session ${session.annee} ─────────────────────────────`);

  const attendus = [session.anglaisSujet, session.anglaisCorrige, ...session.autres];
  for (const f of attendus) {
    if (!existsSync(chemin(f))) {
      console.error(`✗ Fichier introuvable : ${f}`);
      process.exit(1);
    }
  }

  const corrigeTexte = (await lirePages(chemin(session.anglaisCorrige))).join("\n");
  const corrige = extraireCorrige(corrigeTexte, session.colonneCorrige);

  const { passage, questions } = extraireAnglais(
    await lirePages(chemin(session.anglaisSujet)),
  );

  console.log(
    `  corrigé : ${corrige.size} réponses · sujet : ${questions.length} questions extraites`,
  );

  // --- Contrôles ----------------------------------------------------------
  for (const q of questions) {
    const reserves = [];
    if (q.propositions.length !== 4) {
      reserves.push(`${q.propositions.length} propositions extraites au lieu de 4`);
    }
    if (!q.enonce) reserves.push("énoncé vide à l'extraction");
    // Un marqueur de proposition resté dans l'énoncé signale un découpage
    // manqué : la question serait servie avec ses réponses dans la consigne.
    if (/(^|\s)[a-d]\.\s*[A-Za-z]/.test(q.enonce)) {
      reserves.push("découpage douteux : l'énoncé contient encore un marqueur de proposition");
    }

    q.reponse = corrige.get(q.numero) ?? null;
    if (!q.reponse) reserves.push(`aucune réponse n° ${q.numero} au corrigé`);
    else if (!q.propositions.some((p) => p.lettre === q.reponse)) {
      reserves.push(
        `le corrigé indique « ${q.reponse.toUpperCase()} » mais cette proposition est absente`,
      );
    }

    q.reserves = reserves;
    q.publiable = reserves.length === 0;
  }

  const doublons = questions
    .map((q) => q.numero)
    .filter((n, i, tab) => tab.indexOf(n) !== i);
  if (doublons.length) {
    console.log(`  ⚠ numéros en double : ${[...new Set(doublons)].join(", ")}`);
  }

  // --- Annale --------------------------------------------------------------
  await db.from("annales").delete().eq("concours_id", concours.id).eq("annee", session.annee);

  const { data: annale, error: eAnnale } = await db
    .from("annales")
    .insert({
      concours_id: concours.id,
      annee: session.annee,
      statut: "publie",
      format_source: "deux_documents", // sujet et corrigé séparés
    })
    .select("id")
    .single();
  verifier(eAnnale, `annale ${session.annee}`);

  for (const f of attendus) {
    const contenu = new Blob([readFileSync(chemin(f))], { type: "application/pdf" });
    const destination = `${concours.id}/${session.annee}/${basename(f)}`;
    const { error: eUp } = await db.storage
      .from("annales")
      .upload(destination, contenu, { contentType: "application/pdf", upsert: true });
    verifier(eUp, `téléversement ${f}`);

    const { error: eDoc } = await db.from("annale_documents").insert({
      annale_id: annale.id,
      type: /reponses/i.test(f) ? "corrections" : "questions",
      fichier_url: destination,
    });
    verifier(eDoc, `rattachement ${f}`);
  }
  console.log(`  ${attendus.length} PDF archivés`);

  // --- Blocs et questions --------------------------------------------------
  // Partie I : questions indépendantes, un bloc chacune.
  // Partie 2 : un seul bloc portant le texte support, servi entier et dans
  // l'ordre (§2.2) — un extrait de compréhension n'a pas de sens amputé.
  let ordre = 0;

  const inserer = async (blocId, q, rang) => {
    const { data: question, error: eQ } = await db
      .from("questions")
      .insert({
        bloc_id: blocId,
        type: "choix_unique",
        enonce: q.enonce,
        chapitre: q.section,
        explication: null,
        explication_origine: null,
        explication_relue: false,
        statut: q.publiable ? "publie" : "a_verifier",
        statut_extraction: q.publiable ? "ok" : "a_verifier",
        commentaire_extraction: q.reserves.length
          ? `Question ${q.numero}. ${q.reserves.join(" ")}`
          : `Question ${q.numero} du sujet officiel.`,
        confiance_extraction: null,
        auto_publiee: false,
        origine: "extraite",
        ordre_dans_bloc: rang,
      })
      .select("id")
      .single();
    verifier(eQ, `question ${q.numero}`);

    const { error: eR } = await db.from("reponses_possibles").insert(
      q.propositions.map((p, i) => ({
        question_id: question.id,
        texte: p.texte,
        est_correcte: p.lettre === q.reponse,
        ordre: i + 1,
      })),
    );
    verifier(eR, `propositions ${q.numero}`);

    if (q.publiable) totalPubliees++;
    else totalRelecture++;
  };

  for (const q of questions.filter((x) => x.section === "Grammar & Vocabulary")) {
    const { data: bloc, error } = await db
      .from("blocs")
      .insert({
        annale_id: annale.id,
        epreuve_id: epreuves.Anglais,
        enonce_commun: null,
        ordre: ordre++,
        statut: "brouillon",
      })
      .select("id")
      .single();
    verifier(error, `bloc question ${q.numero}`);
    await inserer(bloc.id, q, 0);
  }

  const comprehension = questions.filter((x) => x.section === "Reading Comprehension");
  if (comprehension.length > 0) {
    const { data: bloc, error } = await db
      .from("blocs")
      .insert({
        annale_id: annale.id,
        epreuve_id: epreuves.Anglais,
        enonce_commun: passage,
        ordre: ordre++,
        statut: "brouillon",
      })
      .select("id")
      .single();
    verifier(error, "bloc compréhension écrite");

    for (const [rang, q] of comprehension.entries()) {
      await inserer(bloc.id, q, rang);
    }
    console.log(
      `  compréhension écrite : 1 bloc de ${comprehension.length} questions ` +
        `(texte support de ${passage.length} caractères)`,
    );
  }

  const publiees = questions.filter((q) => q.publiable).length;
  console.log(
    `  ${publiees} questions publiées · ${questions.length - publiees} en relecture`,
  );
}

console.log(
  [
    "",
    `✓ Concours Avenir importé — sessions ${SESSIONS.map((s) => s.annee).join(" et ")}`,
    `  ${totalPubliees} questions publiées · ${totalRelecture} en file de relecture`,
    `  Barème mis à jour : +1 / −1 / 0, sourcé sur le sujet officiel 2026`,
    "",
    "  Mathématiques, sciences et physique : aucune question importée. Leur",
    "  notation scientifique ne survit pas à la linéarisation du texte et les",
    "  figures sont absentes. Les PDF sont archivés pour une saisie manuelle.",
  ].join("\n"),
);
