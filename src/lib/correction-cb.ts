/**
 * Correction d'une copie de concours blanc (module concours blancs, §5.3).
 *
 * Module pur : il reçoit la copie, les clés et le barème, il rend les points.
 * Aucun accès base, aucun réseau — c'est le cœur de la note d'un élève, il
 * doit se vérifier isolément.
 *
 * Trois règles ne s'expriment pas par le triplet bonne/mauvaise/abstention et
 * sont portées par `epreuves_cb.regles` :
 *
 *  - `tout_ou_rien_par_question` (analyse documentaire SÉSAME) — une question
 *    à trous se note en entier : toutes les cases justes, sinon zéro. Le
 *    regroupement se lit sur la partie entière de l'ordre, 13.01 et 13.02
 *    appartenant à la question 13.
 *  - `bonification_bloc_complet` (Puissance Alpha) — un exercice entièrement
 *    juste rapporte un point de plus.
 *  - `plancher_par_bloc` (GEIPI) — le total d'un exercice ne peut pas être
 *    strictement négatif.
 *
 * L'ordre d'application n'est pas indifférent : on note chaque question, on
 * applique le tout ou rien qui peut annuler un groupe, puis la bonification
 * d'exercice, et le plancher en dernier — sans quoi une bonification pourrait
 * servir à remonter un exercice que le plancher aurait déjà ramené à zéro.
 */

export type TypeQuestionCb = "choix_unique" | "choix_multiple" | "redaction";

export type QuestionACorriger = {
  id: string;
  type: TypeQuestionCb;
  /** Position dans l'épreuve ; sa partie entière groupe les sous-questions. */
  ordre: number;
  /** Exercice d'appartenance : porte le plancher et la bonification. */
  blocId: string;
  /** Pondération de la question (défaut 1). */
  poids: number;
  /** Faux = file de correction manuelle (rédaction, synthèse). */
  autoCorrection: boolean;
  propositions: { id: string; estCorrecte: boolean }[];
};

export type ReponseCopie = {
  reponseId?: string;
  reponseIds?: string[];
  texte?: string;
  abstention?: boolean;
} | null;

export type Bareme = {
  pointsBonne: number;
  pointsMauvaise: number;
  pointsAbstention: number;
  noteSur: number;
  regles: {
    tout_ou_rien_par_question?: boolean;
    bonification_bloc_complet?: number;
    plancher_par_bloc?: boolean;
    blocs_au_choix?: { obligatoires: number; a_choisir: number };
  };
};

export type StatutReponseCb = "correcte" | "incorrecte" | "abstention" | "a_corriger";

export type ResultatQuestion = {
  questionId: string;
  statut: StatutReponseCb;
  points: number;
};

export type ResultatCopie = {
  parQuestion: ResultatQuestion[];
  /** Points acquis automatiquement, bonifications et plancher compris. */
  points: number;
  /** Maximum atteignable sur le périmètre corrigé automatiquement. */
  pointsMax: number;
  noteSur20: number;
  nbBonnes: number;
  nbFausses: number;
  nbAbstentions: number;
  /** Questions laissées à la correction manuelle (§5.3). */
  nbACorriger: number;
};

/** Une réponse vide vaut abstention : ne rien cocher, c'est ne pas répondre. */
function estAbstention(reponse: ReponseCopie, type: TypeQuestionCb): boolean {
  if (!reponse) return true;
  if (reponse.abstention) return true;
  if (type === "redaction") return !reponse.texte?.trim();
  if (type === "choix_multiple") return (reponse.reponseIds ?? []).length === 0;
  return !reponse.reponseId;
}

/**
 * Juge une réponse. Un choix multiple n'est juste que si l'ensemble coché
 * correspond exactement à l'ensemble attendu — c'est la règle des concours :
 * une seule mauvaise coche annule la question.
 */
export function evaluer(
  question: QuestionACorriger,
  reponse: ReponseCopie,
): StatutReponseCb {
  if (!question.autoCorrection || question.type === "redaction") return "a_corriger";
  if (estAbstention(reponse, question.type)) return "abstention";

  const attendues = new Set(
    question.propositions.filter((p) => p.estCorrecte).map((p) => p.id),
  );

  if (question.type === "choix_multiple") {
    const cochees = new Set(reponse?.reponseIds ?? []);
    if (cochees.size !== attendues.size) return "incorrecte";
    for (const id of cochees) if (!attendues.has(id)) return "incorrecte";
    return "correcte";
  }

  // Un identifiant inconnu n'est pas une bonne réponse : on ne récompense pas
  // une requête forgée.
  return reponse?.reponseId && attendues.has(reponse.reponseId)
    ? "correcte"
    : "incorrecte";
}

const arrondir = (n: number) => Math.round(n * 100) / 100;

export function corriger(
  questions: QuestionACorriger[],
  reponses: Map<string, ReponseCopie>,
  bareme: Bareme,
): ResultatCopie {
  const statuts = new Map<string, StatutReponseCb>();
  const points = new Map<string, number>();

  // --- 1. Question par question -------------------------------------------
  for (const q of questions) {
    const statut = evaluer(q, reponses.get(q.id) ?? null);
    statuts.set(q.id, statut);

    const brut =
      statut === "correcte"
        ? bareme.pointsBonne
        : statut === "incorrecte"
          ? bareme.pointsMauvaise
          : bareme.pointsAbstention;

    points.set(q.id, statut === "a_corriger" ? 0 : brut * q.poids);
  }

  const auto = questions.filter((q) => statuts.get(q.id) !== "a_corriger");

  // --- 2. Tout ou rien par question à trous --------------------------------
  if (bareme.regles.tout_ou_rien_par_question) {
    const groupes = new Map<number, QuestionACorriger[]>();
    for (const q of auto) {
      const cle = Math.trunc(q.ordre);
      if (!groupes.has(cle)) groupes.set(cle, []);
      groupes.get(cle)!.push(q);
    }

    for (const membres of groupes.values()) {
      const toutesJustes = membres.every((q) => statuts.get(q.id) === "correcte");
      if (toutesJustes) continue;
      // « Sinon 0 » : la règle du concours ne retire rien, elle annule.
      for (const q of membres) points.set(q.id, 0);
    }
  }

  // --- 3. Par exercice : bonification puis plancher -------------------------
  const parBloc = new Map<string, QuestionACorriger[]>();
  for (const q of auto) {
    if (!parBloc.has(q.blocId)) parBloc.set(q.blocId, []);
    parBloc.get(q.blocId)!.push(q);
  }

  const totauxBloc = new Map<string, number>();
  for (const [blocId, membres] of parBloc) {
    let total = membres.reduce((s, q) => s + (points.get(q.id) ?? 0), 0);

    const bonification = bareme.regles.bonification_bloc_complet ?? 0;
    if (bonification && membres.every((q) => statuts.get(q.id) === "correcte")) {
      total += bonification;
    }

    if (bareme.regles.plancher_par_bloc) total = Math.max(0, total);

    totauxBloc.set(blocId, total);
  }

  // --- 4. Exercices au choix ------------------------------------------------
  // Puissance Alpha : 8 exercices maximum, dont les 4 fondamentaux. Un élève
  // qui en traite davantage ne doit pas être noté sur tout : on retient ses
  // meilleurs exercices traités, dans la limite autorisée.
  //
  // ⚠ Arbitrage : le sujet ne dit pas quoi faire d'un élève qui déborde. « Les
  // meilleurs » lui est favorable et reproduit ce qu'un correcteur humain
  // ferait ; à confirmer avec la responsable.
  const auChoix = bareme.regles.blocs_au_choix;
  let blocsRetenus = [...totauxBloc.keys()];

  if (auChoix) {
    const limite = auChoix.obligatoires + auChoix.a_choisir;
    const traites = blocsRetenus.filter((blocId) =>
      (parBloc.get(blocId) ?? []).some(
        (q) => statuts.get(q.id) !== "abstention",
      ),
    );
    blocsRetenus = traites
      .sort((a, b) => (totauxBloc.get(b) ?? 0) - (totauxBloc.get(a) ?? 0))
      .slice(0, limite);
  }

  const retenus = new Set(blocsRetenus);
  const questionsRetenues = auto.filter((q) => retenus.has(q.blocId));

  const totalPoints = blocsRetenus.reduce((s, b) => s + (totauxBloc.get(b) ?? 0), 0);
  const pointsMax = questionsRetenues.reduce(
    (s, q) => s + bareme.pointsBonne * q.poids,
    0,
  );

  // Un total négatif existe (points négatifs), une note négative n'a pas de
  // sens sur un bilan : plancher à zéro, comme le score du socle.
  const noteSur20 =
    pointsMax > 0
      ? Math.min(bareme.noteSur, Math.max(0, (totalPoints / pointsMax) * bareme.noteSur))
      : 0;

  const compter = (s: StatutReponseCb) =>
    questionsRetenues.filter((q) => statuts.get(q.id) === s).length;

  return {
    parQuestion: questions.map((q) => ({
      questionId: q.id,
      statut: statuts.get(q.id)!,
      // Une question hors périmètre retenu ne rapporte rien.
      points: retenus.has(q.blocId) || statuts.get(q.id) === "a_corriger"
        ? arrondir(points.get(q.id) ?? 0)
        : 0,
    })),
    points: arrondir(totalPoints),
    pointsMax: arrondir(pointsMax),
    noteSur20: arrondir(noteSur20),
    nbBonnes: compter("correcte"),
    nbFausses: compter("incorrecte"),
    nbAbstentions: compter("abstention"),
    nbACorriger: questions.filter((q) => statuts.get(q.id) === "a_corriger").length,
  };
}
