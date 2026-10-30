/**
 * Monte un scénario complet de concours blancs, prêt à l'envoi.
 *
 *   node --env-file=.env.local scripts/scenario-concours-blancs.mjs <session-id>
 *
 * Complète une session existante : épreuves manquantes, camarades fictifs pour
 * que moyenne et rang aient un sens, copies jouées, correction, oraux évalués,
 * bilans générés et validés.
 *
 * Ce que le script ne fait pas : envoyer les bilans. L'envoi passe par le
 * back-office, et c'est voulu — c'est lui qui rend le PDF, applique le mail
 * type et consigne les destinataires. Le reproduire ici testerait une copie
 * du code au lieu du code.
 *
 * Idempotent : relancer ne duplique rien.
 */

import { createClient } from "@supabase/supabase-js";
import { corriger } from "../src/lib/correction-cb.ts";
import { ORAUX_PAR_FILIERE, noteEpreuveOrale } from "../src/lib/oraux.ts";

const SESSION = process.argv[2];
if (!SESSION) {
  console.error("Usage : node --env-file=.env.local scripts/scenario-concours-blancs.mjs <session-id>");
  process.exit(1);
}

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

/** Épreuves de test à ajouter si elles manquent, avec leur barème. */
const A_AJOUTER = [
  { externe: "SES-MAT-TEST26", concours: "SÉSAME", matiere: "Mathématiques", duree: 40, bonne: 1, mauvaise: 0 },
  { externe: "SES-FR-TEST26", concours: "SÉSAME", matiere: "Français", duree: 30, bonne: 1, mauvaise: 0 },
  { externe: "SES-EC-TEST26", concours: "SÉSAME", matiere: "Enjeux contemporains", duree: 30, bonne: 1, mauvaise: 0 },
];

const CAMARADES = [
  { prenom: "Alice", nom: "Témoin", email: "alice.temoin@example.test", justes: 0.85 },
  { prenom: "Bruno", nom: "Témoin", email: "bruno.temoin@example.test", justes: 0.5 },
];

const maintenant = new Date();
const ouverture = new Date(maintenant.getTime() - 2 * 3600_000).toISOString();
const fermeture = new Date(maintenant.getTime() + 7 * 24 * 3600_000).toISOString();

// ---------------------------------------------------------------------------
console.log("\n1. Cohorte et destinataires");
// ---------------------------------------------------------------------------
const { data: epreuvesSession } = await db
  .from("epreuves_cb")
  .select("id, epreuve_id_externe, matiere, statut, points_bonne, points_mauvaise, points_abstention, note_sur, regles, epreuve_cb_cohortes(cohorte_id)")
  .eq("session_cb_id", SESSION);

const cohorteId = (epreuvesSession ?? [])
  .flatMap((e) => (e.epreuve_cb_cohortes ?? []).map((c) => c.cohorte_id))
  .find(Boolean);
if (!cohorteId) {
  console.error("Aucune cohorte assignée aux épreuves de cette session.");
  process.exit(1);
}

const { data: cohorte } = await db
  .from("cohortes")
  .select("id, nom, filiere")
  .eq("id", cohorteId)
  .single();
console.log(`  cohorte : ${cohorte.nom} (${cohorte.filiere})`);

// Le parent du compte de test reçoit le bilan au même titre que l'élève :
// c'est le parcours réel, et cela fait parvenir le message aux deux adresses.
const { data: eleveReel } = await db
  .from("users")
  .select("id, prenom, nom, email, email_parent")
  .eq("email", "pauldemaupeou.us@gmail.com")
  .maybeSingle();
if (!eleveReel) {
  console.error("Le compte pauldemaupeou.us@gmail.com est introuvable.");
  process.exit(1);
}

if (eleveReel.email_parent !== "paul@parkours.fr") {
  await db.from("users").update({ email_parent: "paul@parkours.fr" }).eq("id", eleveReel.id);
  console.log("  email parent → paul@parkours.fr");
}
await db.from("users").update({ cohorte_id: cohorteId }).eq("id", eleveReel.id);

const eleves = [eleveReel.id];

for (const c of CAMARADES) {
  let { data: existant } = await db.from("users").select("id").eq("email", c.email).maybeSingle();
  if (!existant) {
    const { data: compte, error } = await db.auth.admin.createUser({
      email: c.email,
      password: crypto.randomUUID(),
      email_confirm: true,
    });
    if (error) throw new Error(`${c.email} : ${error.message}`);
    await db.from("users").insert({
      id: compte.user.id,
      email: c.email,
      role: "eleve",
      nom: c.nom,
      prenom: c.prenom,
      cohorte_id: cohorteId,
      email_verifie: true,
    });
    existant = { id: compte.user.id };
    console.log(`  camarade fictif créé : ${c.prenom} ${c.nom}`);
  } else {
    await db.from("users").update({ cohorte_id: cohorteId }).eq("id", existant.id);
  }
  eleves.push(existant.id);
}

// ---------------------------------------------------------------------------
console.log("\n2. Épreuves de la session");
// ---------------------------------------------------------------------------
const presentes = new Set((epreuvesSession ?? []).map((e) => e.epreuve_id_externe));

for (const a of A_AJOUTER) {
  if (presentes.has(a.externe)) continue;

  const { data: concours } = await db.from("concours").select("id").eq("nom", a.concours).single();
  const { data: ref } = await db
    .from("epreuves")
    .select("id")
    .eq("concours_id", concours.id)
    .eq("nom", a.matiere)
    .maybeSingle();
  if (!ref) {
    console.log(`  ⚠ ${a.externe} : épreuve « ${a.matiere} » absente du référentiel`);
    continue;
  }

  const { data: questions } = await db
    .from("questions")
    .select("id, ordre_epreuve, points_defaut")
    .eq("epreuve_id_externe", a.externe)
    .neq("statut", "depubliee")
    .limit(1000);
  if (!questions?.length) {
    console.log(`  ⚠ ${a.externe} : aucune question importée`);
    continue;
  }

  const { data: creee, error } = await db
    .from("epreuves_cb")
    .insert({
      session_cb_id: SESSION,
      epreuve_id_externe: a.externe,
      concours_id: concours.id,
      epreuve_id: ref.id,
      matiere: a.matiere,
      duree_minutes: a.duree,
      fenetre_debut: ouverture,
      fenetre_fin: fermeture,
      points_bonne: a.bonne,
      points_mauvaise: a.mauvaise,
      points_abstention: 0,
      note_sur: 20,
      statut: "publiee",
    })
    .select("id")
    .single();
  if (error) {
    console.log(`  ⚠ ${a.externe} : ${error.message}`);
    continue;
  }

  await db.from("epreuve_cb_questions").insert(
    questions.map((q) => ({
      epreuve_cb_id: creee.id,
      question_id: q.id,
      ordre: Number(q.ordre_epreuve),
      points: Number(q.points_defaut ?? 1),
    })),
  );
  await db.from("epreuve_cb_cohortes").insert({ epreuve_cb_id: creee.id, cohorte_id: cohorteId });
  console.log(`  ${a.externe} ajoutée : ${questions.length} questions`);
}

// Fenêtre ouverte sur toutes les épreuves publiées de la session.
await db
  .from("epreuves_cb")
  .update({ fenetre_debut: ouverture, fenetre_fin: fermeture })
  .eq("session_cb_id", SESSION)
  .eq("statut", "publiee");

const { data: epreuves } = await db
  .from("epreuves_cb")
  .select("id, epreuve_id_externe, matiere, points_bonne, points_mauvaise, points_abstention, note_sur, regles")
  .eq("session_cb_id", SESSION)
  .eq("statut", "publiee");

console.log(`  ${epreuves.length} épreuves publiées : ${epreuves.map((e) => e.epreuve_id_externe).join(", ")}`);

// ---------------------------------------------------------------------------
console.log("\n3. Copies jouées et corrigées");
// ---------------------------------------------------------------------------
const profils = new Map([
  [eleves[0], 0.72],
  [eleves[1], 0.85],
  [eleves[2], 0.5],
]);

for (const epreuve of epreuves) {
  const { data: liens } = await db
    .from("epreuve_cb_questions")
    .select("ordre, points, questions(id, type, bloc_id, auto_correction, reponses_possibles(id, est_correcte))")
    .eq("epreuve_cb_id", epreuve.id)
    .order("ordre")
    .limit(1000);

  const questions = liens.map((l) => ({
    id: l.questions.id,
    type: l.questions.type,
    ordre: Number(l.ordre),
    blocId: l.questions.bloc_id,
    poids: Number(l.points ?? 1),
    autoCorrection: l.questions.auto_correction !== false,
    propositions: l.questions.reponses_possibles.map((p) => ({ id: p.id, estCorrecte: p.est_correcte })),
  }));

  const bareme = {
    pointsBonne: Number(epreuve.points_bonne),
    pointsMauvaise: Number(epreuve.points_mauvaise),
    pointsAbstention: Number(epreuve.points_abstention),
    noteSur: Number(epreuve.note_sur),
    regles: epreuve.regles ?? {},
  };

  for (const [userId, reussite] of profils) {
    const { data: deja } = await db
      .from("passages")
      .select("id, statut")
      .eq("epreuve_cb_id", epreuve.id)
      .eq("user_id", userId)
      .maybeSingle();
    if (deja?.statut === "corrige") continue;

    const passageId =
      deja?.id ??
      (
        await db
          .from("passages")
          .insert({ epreuve_cb_id: epreuve.id, user_id: userId })
          .select("id")
          .single()
      ).data.id;

    const copie = new Map();
    const reponses = [];
    questions.forEach((q, i) => {
      // Les N premières questions justes, le reste faux : déterministe, et le
      // taux de réussite obtenu est exactement celui demandé. La version
      // précédente comparait i/100 au taux, ce qui rendait toutes les copies
      // parfaites dès que l'épreuve faisait moins de 100 questions.
      const juste = i / questions.length < reussite;
      const bonne = q.propositions.find((p) => p.estCorrecte);
      const mauvaise = q.propositions.find((p) => !p.estCorrecte);
      const choix = juste ? bonne : mauvaise;
      if (!choix) return;
      const valeur = { reponseId: choix.id };
      copie.set(q.id, valeur);
      reponses.push({ passage_id: passageId, question_id: q.id, reponse: valeur });
    });

    await db.from("passage_reponses").delete().eq("passage_id", passageId);
    if (reponses.length) await db.from("passage_reponses").insert(reponses);

    const r = corriger(questions, copie, bareme);

    for (const q of r.parQuestion) {
      await db
        .from("passage_reponses")
        .update({ statut: q.statut, points: q.points })
        .eq("passage_id", passageId)
        .eq("question_id", q.questionId);
    }

    await db
      .from("passages")
      .update({
        statut: "corrige",
        remis_at: new Date().toISOString(),
        temps_passe: 1800,
        note: r.points,
        note_sur_20: r.noteSur20,
        nb_bonnes: r.nbBonnes,
        nb_fausses: r.nbFausses,
        nb_abstentions: r.nbAbstentions,
      })
      .eq("id", passageId);
  }

  const { data: notes } = await db
    .from("passages")
    .select("note_sur_20")
    .eq("epreuve_cb_id", epreuve.id);
  console.log(
    `  ${epreuve.epreuve_id_externe.padEnd(16)} notes : ${notes.map((n) => n.note_sur_20).join(" · ")}`,
  );
}

// ---------------------------------------------------------------------------
console.log("\n4. Oraux blancs");
// ---------------------------------------------------------------------------
for (const modele of ORAUX_PAR_FILIERE[cohorte.filiere]) {
  let { data: epreuveOrale } = await db
    .from("epreuves_orales")
    .select("id")
    .eq("session_cb_id", SESSION)
    .eq("filiere", cohorte.filiere)
    .eq("cle", modele.cle)
    .maybeSingle();

  if (!epreuveOrale) {
    const { data: creee, error } = await db
      .from("epreuves_orales")
      .insert({
        session_cb_id: SESSION,
        filiere: cohorte.filiere,
        cle: modele.cle,
        nom: modele.nom,
        ponderation: modele.ponderation,
        contexte: modele.contexte,
        ordre: modele.ordre,
      })
      .select("id")
      .single();
    if (error) throw new Error(`oral ${modele.cle} : ${error.message}`);
    await db.from("grilles_oral").insert({ epreuve_orale_id: creee.id, criteres: modele.criteres });
    epreuveOrale = creee;
  }

  // Une grille remplie pour l'élève réel, afin que la section Oraux blancs
  // du bilan soit complète. Notes volontairement contrastées.
  const notes = {};
  modele.criteres.forEach((c, i) => {
    notes[String(i)] = Math.max(0, c.maximum - (i % 3) * 0.5);
  });
  const note = noteEpreuveOrale(modele.criteres, notes);

  await db.from("evaluations_orales").upsert(
    {
      epreuve_orale_id: epreuveOrale.id,
      user_id: eleveReel.id,
      contexte: `${modele.contexte} — session de test`,
      notes_criteres: notes,
      note,
      point_fort: "Prend la parole sans monopoliser et reformule les autres.",
      progres_prioritaire: "Structurer l'argumentation avant de se lancer.",
      commentaire_jury:
        "Posture solide et sincère ; à confirmer sur un sujet moins familier.",
      statut: "validee",
    },
    { onConflict: "epreuve_orale_id,user_id" },
  );
  console.log(`  ${modele.nom.padEnd(24)} ${note}/20 · ${Math.round(modele.ponderation * 100)} %`);
}

// ---------------------------------------------------------------------------
console.log("\n5. Bilan prêt à l'envoi");
// ---------------------------------------------------------------------------
const { data: bilan } = await db
  .from("bilans")
  .upsert(
    { session_cb_id: SESSION, user_id: eleveReel.id },
    { onConflict: "session_cb_id,user_id" },
  )
  .select("id, statut")
  .single();

const textes = {};
for (const e of epreuves) {
  textes[e.id] = {
    forces: "Automatismes solides sur les questions directes.",
    ameliorations: "Les questions à plusieurs étapes restent coûteuses en temps.",
    methode: "Bonne gestion du temps, vérification parfois trop rapide.",
    conseils: "Refaire les questions manquées en explicitant chaque étape.",
  };
}

await db
  .from("bilans")
  .update({
    analyse_epreuves: textes,
    en_quelques_mots: null,
    statut: "valide",
    valide_le: new Date().toISOString(),
  })
  .eq("id", bilan.id);

console.log(`  bilan ${bilan.id} → validé, prêt à envoyer`);
console.log(`  destinataires : ${eleveReel.email} + paul@parkours.fr (parent)`);
console.log(`\n  Envoi : /admin/prepa/bilans/${bilan.id}\n`);
