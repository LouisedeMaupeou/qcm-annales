import { createClient } from "@supabase/supabase-js";

/**
 * Audit des questions Puissance Alpha « orphelines » : celles dont l'énoncé
 * renvoie à un élément (fonction, suite, item a/b/c/d, figure…) absent de ce que
 * l'élève voit réellement, c'est-à-dire chapeau du bloc + énoncé de la question.
 *
 * Heuristique, donc à prendre comme un ordre de grandeur, pas au décimal près.
 * Classement volontairement prudent : en cas de doute, on penche vers
 * « orpheline » plutôt que de laisser passer une question injouable.
 */

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);

const { data, error } = await db
  .from("questions")
  .select(
    "id, enonce, statut, blocs!inner(enonce_commun, annales!inner(annee, concours!inner(nom)))",
  )
  .eq("statut", "publie");

if (error) {
  console.error(error.message);
  process.exit(1);
}

const pa = data.filter(
  (q) => q.blocs?.annales?.concours?.nom === "Puissance Alpha",
);

// Le chapeau définit-il un contexte, ou n'est-ce qu'un titre d'exercice ?
const chapeauDefinit = (chapeau) => {
  if (!chapeau || !chapeau.trim()) return false;
  const sansTitre = chapeau
    .replace(/^\s*(s[ée]rie\s+[a-z]\s*[–-]\s*)?exercice\s*n?°?\s*\d+\s*:?/i, "")
    .trim();
  if (sansTitre.length < 15) return false; // il ne restait qu'un titre
  return /=|d[ée]fini|consid[èe]r|soit\s|on pose|mod[ée]lis|not[ée]e|\(x\)|\(t\)|\(n\)/i.test(
    chapeau,
  );
};

// L'énoncé renvoie-t-il à un antécédent ?
const referenceItem = (t) =>
  /\b[a-d]\)/.test(t) ||
  /(affirmation|proposition|question|item|r[ée]ponse)\s+(pr[ée]c[ée]dent|\b[a-d]\b)/i.test(t) ||
  /(pr[ée]c[ée]dent|ci-dessus|ci-avant)/i.test(t);

// L'énoncé se définit-il lui-même son contexte ? (« la parabole d'équation
// y = … », « f(x) = ln(2x+1) », « la fonction h(x) = x + 1/x, définie sur… »)
const texteDefinit = (t) =>
  /=|d[ée]fini|d['’]équation|consid[èe]r|soit\s|on pose|mod[ée]lis|\(x\)|\(t\)|\(n\)/i.test(
    t,
  );

const referenceSymbole = (t) =>
  /\b(la fonction|cette fonction|la suite|cette suite|la courbe|la parabole|la droite|le repère|ce nombre|cet? intervalle)\b/i.test(t) ||
  /\bf['′]?\s*\(|\bg\s*\(|\bh\s*\(|\(u[ₙn]\)|\(v[ₙn]\)|\(d[ₙn]\)|\(w[ₙn]\)/.test(t) ||
  /^\s*[fghPY]\b/.test(t) || // énoncé qui commence par « f est… », « P(X…) »
  /\bP\s*\(\s*[XY]/.test(t);

const categories = { autonome: [], orphelineItem: [], orphelineSymbole: [] };

for (const q of pa) {
  const chapeau = q.blocs?.enonce_commun ?? "";
  const enonce = q.enonce ?? "";
  const vu = `${chapeau}\n${enonce}`;

  if (referenceItem(enonce)) {
    // Renvoi à un item frère (b), affirmation précédente…) jamais montré.
    categories.orphelineItem.push(q);
  } else if (
    referenceSymbole(enonce) &&
    !chapeauDefinit(chapeau) &&
    !texteDefinit(enonce)
  ) {
    categories.orphelineSymbole.push(q);
  } else {
    categories.autonome.push(q);
  }
  void vu;
}

const ex = (arr, n = 4) =>
  arr.slice(0, n).map((q) => {
    const chap = (q.blocs?.enonce_commun ?? "(pas de chapeau)").slice(0, 55);
    return `      • [${q.blocs?.annales?.annee}] chapeau: « ${chap} » → énoncé: « ${q.enonce.slice(0, 60)} »`;
  });

console.log(`Puissance Alpha — ${pa.length} questions publiées\n`);
console.log(`  AUTONOMES (jouables telles quelles) : ${categories.autonome.length}`);
console.log(
  `  ORPHELINES renvoi à un item a/b/c/d ou « précédent » : ${categories.orphelineItem.length}`,
);
console.log(ex(categories.orphelineItem).join("\n"));
console.log(
  `\n  ORPHELINES symbole non défini (chapeau titre seul/absent) : ${categories.orphelineSymbole.length}`,
);
console.log(ex(categories.orphelineSymbole).join("\n"));

const orph = categories.orphelineItem.length + categories.orphelineSymbole.length;
console.log(
  `\n  => ${orph} orphelines sur ${pa.length} (${Math.round((orph / pa.length) * 100)} %)`,
);
