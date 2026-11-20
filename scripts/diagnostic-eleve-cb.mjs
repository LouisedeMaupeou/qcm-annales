import { readFileSync } from "node:fs";

/**
 * Pourquoi un élève ne voit-il pas d'épreuve à composer ?
 *
 * Quatre conditions doivent tenir ensemble : l'élève appartient à une cohorte,
 * l'épreuve est publiée, elle est assignée à cette cohorte, et la fenêtre de
 * passage est ouverte. Ce script les vérifie une à une plutôt que de deviner.
 */

const email = process.argv[2];

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split(/\r?\n/)
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]),
);

const url = env.NEXT_PUBLIC_SUPABASE_URL;
const cle = env.SUPABASE_SERVICE_ROLE_KEY;

async function req(chemin) {
  const r = await fetch(`${url}/rest/v1/${chemin}`, {
    headers: { apikey: cle, Authorization: `Bearer ${cle}` },
  });
  if (!r.ok) throw new Error(`${r.status} ${await r.text()}`);
  return r.json();
}

const [eleve] = await req(
  `users?select=id,prenom,nom,email,role,cohorte_id,cohortes(nom)&email=eq.${encodeURIComponent(email)}`,
);
if (!eleve) {
  console.log(`Aucun compte pour ${email}.`);
  process.exit(0);
}

console.log(`${eleve.prenom} ${eleve.nom} <${eleve.email}> — rôle ${eleve.role}`);
console.log(`1. cohorte : ${eleve.cohortes?.nom ?? "AUCUNE"}${eleve.cohorte_id ? "" : "  ⟵ bloquant"}`);

const sessions = await req("sessions_cb?select=id,nom,statut&order=created_at");
console.log("\nSessions :");
for (const s of sessions) console.log(`   ${s.nom} — ${s.statut}`);

const epreuves = await req(
  "epreuves_cb?select=id,matiere,epreuve_id_externe,statut,fenetre_debut,fenetre_fin,session_cb_id,sessions_cb(nom)&order=epreuve_id_externe",
);

console.log("\nÉpreuves :");
const maintenant = Date.now();
for (const e of epreuves) {
  const cohortes = await req(
    `epreuve_cb_cohortes?select=cohorte_id,cohortes(nom)&epreuve_cb_id=eq.${e.id}`,
  );
  const questions = await req(
    `epreuve_cb_questions?select=question_id&epreuve_cb_id=eq.${e.id}&limit=500`,
  );
  const assignee = cohortes.some((c) => c.cohorte_id === eleve.cohorte_id);
  const debut = e.fenetre_debut ? new Date(e.fenetre_debut).getTime() : null;
  const fin = e.fenetre_fin ? new Date(e.fenetre_fin).getTime() : null;
  const fenetre =
    debut && maintenant < debut
      ? "à venir"
      : fin && maintenant > fin
        ? "fermée"
        : "ouverte";

  console.log(
    `   ${e.sessions_cb?.nom} › ${e.matiere} (${e.epreuve_id_externe})\n` +
      `      2. statut ${e.statut}${e.statut === "publiee" ? "" : "  ⟵ bloquant"}\n` +
      `      3. cohortes assignées : ${cohortes.map((c) => c.cohortes?.nom).join(", ") || "AUCUNE"}` +
      `${assignee ? "  (dont celle de l'élève)" : "  ⟵ bloquant pour cet élève"}\n` +
      `      4. fenêtre ${fenetre} — du ${e.fenetre_debut ?? "—"} au ${e.fenetre_fin ?? "—"}` +
      `${fenetre === "ouverte" ? "" : "  ⟵ bloquant"}\n` +
      `      questions : ${questions.length}${questions.length === 0 ? "  ⟵ épreuve vide" : ""}`,
  );
}
