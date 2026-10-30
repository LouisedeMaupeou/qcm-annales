/**
 * Recette de bout en bout du module concours blancs (§9 : « rejouer une
 * session avec 3 élèves fictifs et comparer notes/rangs aux calculs
 * manuels »).
 *
 *   node --env-file=.env.local scripts/recette-concours-blancs.mjs [--garder]
 *
 * Le script monte une session complète en base, simule trois copies dont il
 * connaît d'avance le résultat, puis compare ce que calculent les modules du
 * site à une arithmétique posée à la main dans ce fichier. Tout est supprimé
 * à la fin, sauf avec --garder.
 *
 * Ce qu'il couvre : l'enchaînement des données (cohorte → session → épreuve →
 * passage → réponses → correction → bilan), les contraintes de la base, et
 * les calculs de correction et de bilan.
 *
 * Ce qu'il ne couvre pas : les écrans, et les fonctions serveur qui les
 * servent — elles importent `server-only` et ne sont pas chargeables ici.
 * Cette recette valide le cœur, pas l'interface.
 */

import { createClient } from "@supabase/supabase-js";
import { corriger } from "../src/lib/correction-cb.ts";
import { moyenne, niveauEpreuve, rang } from "../src/lib/bilan-cb.ts";

const GARDER = process.argv.includes("--garder");
const MARQUE = "Recette automatique";

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

let echecs = 0;
const verifier = (libelle, obtenu, attendu) => {
  const ok = JSON.stringify(obtenu) === JSON.stringify(attendu);
  if (!ok) echecs += 1;
  console.log(
    `  ${ok ? "✓" : "✗"} ${libelle}` + (ok ? ` = ${JSON.stringify(obtenu)}` : ` — obtenu ${JSON.stringify(obtenu)}, attendu ${JSON.stringify(attendu)}`),
  );
};

const nettoyer = async (ids) => {
  if (ids.session) await db.from("sessions_cb").delete().eq("id", ids.session);
  for (const u of ids.eleves ?? []) {
    await db.from("users").delete().eq("id", u);
    await db.auth.admin.deleteUser(u).catch(() => {});
  }
  if (ids.cohorte) await db.from("cohortes").delete().eq("id", ids.cohorte);
};

const ids = { eleves: [] };

try {
  // -------------------------------------------------------------------------
  console.log("\n1. Cohorte et élèves fictifs");
  // -------------------------------------------------------------------------
  const { data: cohorte, error: eCohorte } = await db
    .from("cohortes")
    .insert({ nom: MARQUE, filiere: "ingenieur", millesime: 2026 })
    .select("id")
    .single();
  if (eCohorte) throw new Error(`cohorte : ${eCohorte.message}`);
  ids.cohorte = cohorte.id;

  // Domaine .test : réservé par l'IANA, aucun message ne peut partir.
  const fictifs = [
    { prenom: "Alice", nom: "Recette", email: "alice.recette@example.test" },
    { prenom: "Bruno", nom: "Recette", email: "bruno.recette@example.test" },
    { prenom: "Chloé", nom: "Recette", email: "chloe.recette@example.test" },
  ];

  for (const f of fictifs) {
    const { data: compte, error } = await db.auth.admin.createUser({
      email: f.email,
      password: crypto.randomUUID(),
      email_confirm: true,
    });
    if (error) throw new Error(`compte ${f.email} : ${error.message}`);
    ids.eleves.push(compte.user.id);

    const { error: eProfil } = await db.from("users").insert({
      id: compte.user.id,
      email: f.email,
      role: "eleve",
      nom: f.nom,
      prenom: f.prenom,
      cohorte_id: ids.cohorte,
      email_verifie: true,
    });
    if (eProfil) throw new Error(`profil ${f.email} : ${eProfil.message}`);
  }
  verifier("élèves créés et rattachés", ids.eleves.length, 3);

  // -------------------------------------------------------------------------
  console.log("\n2. Session et épreuve blanche");
  // -------------------------------------------------------------------------
  const { data: session, error: eSession } = await db
    .from("sessions_cb")
    .insert({ nom: MARQUE, statut: "ouverte" })
    .select("id")
    .single();
  if (eSession) throw new Error(`session : ${eSession.message}`);
  ids.session = session.id;

  const EPREUVE = "AV-MAT-TEST26";
  const BAREME = { pointsBonne: 3, pointsMauvaise: -1, pointsAbstention: 0, noteSur: 20, regles: {} };

  const { data: concours } = await db.from("concours").select("id").eq("nom", "Avenir").single();
  const { data: epreuveRef } = await db
    .from("epreuves")
    .select("id")
    .eq("concours_id", concours.id)
    .eq("nom", "Mathématiques")
    .single();

  const { data: questions } = await db
    .from("questions")
    .select("id, type, bloc_id, auto_correction, ordre_epreuve, reponses_possibles(id, est_correcte)")
    .eq("epreuve_id_externe", EPREUVE)
    .neq("statut", "depubliee")
    .order("ordre_epreuve")
    .limit(1000);

  const { data: epreuveCb, error: eEpreuve } = await db
    .from("epreuves_cb")
    .insert({
      session_cb_id: ids.session,
      epreuve_id_externe: EPREUVE,
      concours_id: concours.id,
      epreuve_id: epreuveRef.id,
      matiere: "Mathématiques",
      duree_minutes: 90,
      fenetre_debut: new Date(Date.now() - 3600_000).toISOString(),
      fenetre_fin: new Date(Date.now() + 3600_000).toISOString(),
      points_bonne: BAREME.pointsBonne,
      points_mauvaise: BAREME.pointsMauvaise,
      points_abstention: BAREME.pointsAbstention,
      note_sur: 20,
      statut: "publiee",
    })
    .select("id")
    .single();
  if (eEpreuve) throw new Error(`épreuve : ${eEpreuve.message}`);

  await db.from("epreuve_cb_questions").insert(
    questions.map((q) => ({
      epreuve_cb_id: epreuveCb.id,
      question_id: q.id,
      ordre: Number(q.ordre_epreuve),
      points: 1,
    })),
  );
  await db
    .from("epreuve_cb_cohortes")
    .insert({ epreuve_cb_id: epreuveCb.id, cohorte_id: ids.cohorte });

  verifier("questions placées dans l'épreuve", questions.length, 45);

  // -------------------------------------------------------------------------
  console.log("\n3. Trois copies au résultat connu d'avance");
  // -------------------------------------------------------------------------
  // Alice répond juste partout ; Bruno se trompe une fois sur deux ; Chloé ne
  // traite que les dix premières et s'abstient sur le reste.
  const profils = [
    { nom: "Alice", justes: 45, fausses: 0 },
    { nom: "Bruno", justes: 23, fausses: 22 },
    { nom: "Chloé", justes: 10, fausses: 0 },
  ];

  const resultats = [];

  for (const [i, profil] of profils.entries()) {
    const userId = ids.eleves[i];

    const { data: passage, error: ePassage } = await db
      .from("passages")
      .insert({ epreuve_cb_id: epreuveCb.id, user_id: userId })
      .select("id")
      .single();
    if (ePassage) throw new Error(`passage ${profil.nom} : ${ePassage.message}`);

    const reponses = [];
    const copie = new Map();
    questions.forEach((q, rang) => {
      const bonne = q.reponses_possibles.find((p) => p.est_correcte);
      const mauvaise = q.reponses_possibles.find((p) => !p.est_correcte);
      let valeur = null;
      if (rang < profil.justes) valeur = { reponseId: bonne.id };
      else if (rang < profil.justes + profil.fausses) valeur = { reponseId: mauvaise.id };
      if (valeur) {
        reponses.push({ passage_id: passage.id, question_id: q.id, reponse: valeur });
        copie.set(q.id, valeur);
      }
    });
    if (reponses.length > 0) await db.from("passage_reponses").insert(reponses);

    const pour = questions.map((q) => ({
      id: q.id,
      type: q.type,
      ordre: Number(q.ordre_epreuve),
      blocId: q.bloc_id,
      poids: 1,
      autoCorrection: q.auto_correction !== false,
      propositions: q.reponses_possibles.map((p) => ({ id: p.id, estCorrecte: p.est_correcte })),
    }));

    const r = corriger(pour, copie, BAREME);
    resultats.push({ ...profil, ...r, userId, passageId: passage.id });

    await db
      .from("passages")
      .update({
        statut: "corrige",
        remis_at: new Date().toISOString(),
        note: r.points,
        note_sur_20: r.noteSur20,
        nb_bonnes: r.nbBonnes,
        nb_fausses: r.nbFausses,
        nb_abstentions: r.nbAbstentions,
      })
      .eq("id", passage.id);
  }

  // Arithmétique posée à la main, indépendamment du code testé.
  //   Alice : 45 × 3            = 135 ; 135/135 → 20,00
  //   Bruno : 23 × 3 − 22 × 1   =  47 ;  47/135 →  6,96
  //   Chloé : 10 × 3            =  30 ;  30/135 →  4,44
  verifier("Alice — points", resultats[0].points, 135);
  verifier("Alice — note", resultats[0].noteSur20, 20);
  verifier("Bruno — points", resultats[1].points, 47);
  verifier("Bruno — note", resultats[1].noteSur20, 6.96);
  verifier("Chloé — points", resultats[2].points, 30);
  verifier("Chloé — note", resultats[2].noteSur20, 4.44);
  verifier("Chloé — abstentions", resultats[2].nbAbstentions, 35);

  // -------------------------------------------------------------------------
  console.log("\n4. Moyenne, rangs et niveaux de maîtrise");
  // -------------------------------------------------------------------------
  const notes = resultats.map((r) => r.noteSur20);
  // (20 + 6,96 + 4,44) / 3 = 10,466… → 10,47
  verifier("moyenne du groupe", moyenne(notes), 10.47);
  verifier("rang Alice", rang(notes[0], notes), 1);
  verifier("rang Bruno", rang(notes[1], notes), 2);
  verifier("rang Chloé", rang(notes[2], notes), 3);
  verifier("niveau Alice", niveauEpreuve(notes[0]), "Bonne maîtrise de l'épreuve");
  verifier(
    "niveau Chloé",
    niveauEpreuve(notes[2]),
    "Acquisition à construire, reprise des bases nécessaire",
  );

  // -------------------------------------------------------------------------
  console.log("\n5. Invariants tenus par la base");
  // -------------------------------------------------------------------------
  const { error: eDouble } = await db
    .from("passages")
    .insert({ epreuve_cb_id: epreuveCb.id, user_id: ids.eleves[0] });
  verifier("tentative unique refusée", eDouble?.code, "23505");

  const { data: bilan, error: eBilan } = await db
    .from("bilans")
    .insert({ session_cb_id: ids.session, user_id: ids.eleves[0] })
    .select("id, statut")
    .single();
  if (eBilan) throw new Error(`bilan : ${eBilan.message}`);
  verifier("bilan créé à l'état généré", bilan.statut, "genere");

  const { error: eBilanDouble } = await db
    .from("bilans")
    .insert({ session_cb_id: ids.session, user_id: ids.eleves[0] });
  verifier("un seul bilan par élève et par session", eBilanDouble?.code, "23505");

  // -------------------------------------------------------------------------
  console.log("\n6. Étanchéité avec l'entraînement libre");
  // -------------------------------------------------------------------------
  const { count: fuite } = await db
    .from("questions")
    .select("id, blocs!inner(statut, annale_id)", { count: "exact", head: true })
    .eq("statut", "publie")
    .eq("blocs.statut", "publie")
    .is("blocs.annale_id", null);
  verifier("sujets de concours blancs jouables en entraînement", fuite, 0);
} catch (e) {
  echecs += 1;
  console.error(`\n✗ ${e.message}`);
} finally {
  if (GARDER) {
    console.log(`\n— données conservées (--garder) : cohorte et session « ${MARQUE} »`);
  } else {
    await nettoyer(ids);
    const { count } = await db
      .from("sessions_cb")
      .select("id", { count: "exact", head: true })
      .eq("nom", MARQUE);
    console.log(`\nNettoyage : ${count === 0 ? "✓ rien ne subsiste" : "✗ résidu en base"}`);
  }
}

console.log(echecs === 0 ? "\n✓ recette au vert\n" : `\n✗ ${echecs} échec(s)\n`);
process.exit(echecs === 0 ? 0 : 1);
