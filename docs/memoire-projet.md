# Mémoire de projet — Admissible

Ce document conserve dans le dépôt ce qui ne se lit ni dans le code, ni dans les
specs, ni dans l'historique git : **l'état réel des imports de contenu concours
par concours, les pièges rencontrés, et les décisions prises hors specs**. Il a
été écrit le **27/11/2026** à partir de la mémoire de travail accumulée en
session, pour qu'elle survive au changement de compte.

Il ne remplace pas les sources de vérité : [`README.md`](../README.md) pour la
technique, [les specs du socle](specifications-plateforme-qcm-annales-v1.2.md) et
[celles du module concours blancs](specifications-module-concours-blancs-v1.0.md)
pour le produit, [`CLAUDE.md`](../CLAUDE.md) pour les règles de travail.

> Les dates ci-dessous sont celles des sessions de travail. Les chiffres sont
> ceux constatés en base à ce moment-là : les vérifier en base avant de s'en
> servir pour une décision.

---

## 1. Production et envoi d'emails

Le site est en ligne sur **<https://admissible.parkours.fr>** (Vercel + un projet
Supabase distant ; la référence du projet est dans les variables Vercel).

**Resend : seul le domaine `admissible.parkours.fr` est vérifié.** Le domaine
racine `parkours.fr` est en statut « failed » → tout envoi depuis une adresse
`@parkours.fr` est refusé, et **fait échouer l'inscription** : le code annule le
compte si l'email de confirmation ne part pas
(`src/app/inscription/actions.ts`). Donc `EMAIL_EXPEDITEUR` doit rester sur
`admissible.parkours.fr` (l'adresse n'a pas besoin d'être une vraie boîte).

Autres points de configuration qui ont coûté du temps :

- `NEXT_PUBLIC_SITE_URL` = l'URL publique, de type « Config » sur Vercel et non
  « Sensitive ».
- **Toujours redéployer après avoir modifié une variable d'environnement.**

L'inscription en double opt-in a été testée de bout en bout le **27/08/2026** :
formulaire → email de confirmation → activation → connexion. Champs
obligatoires : prénom, nom, date de naissance, ville, établissement, email, mot
de passe, email et téléphone du parent.

**Reste à surveiller :** la délivrabilité réelle (tester une vraie adresse Gmail
ou Outlook, envisager DMARC et un `Reply-To` vers la boîte de la prépa).

### Travailler depuis une session cloud, sans le PC (depuis le 27/11/2026)

L'utilisateur accède difficilement au PC qui portait jusqu'ici les migrations et
les scripts. Une session Claude Code cloud peut désormais tout faire :

- **Environnement cloud « qcm-annales »** (personnel) : hôtes autorisés
  `cdn.sheetjs.com` (sans lui, `npm ci` échoue sur `xlsx`) et l'hôte du projet
  Supabase (`<ref>.supabase.co`, la référence se lit avec
  `GET https://api.supabase.com/v1/projects`).
- **Jeton d'accès personnel Supabase** enregistré comme secret réseau pour
  `api.supabase.com` (jamais dans le dépôt ni dans le chat). Il donne l'API de
  gestion : `POST /v1/projects/<ref>/database/query` exécute du SQL.
- **Migrations** : appliquer le fichier dans une transaction, **et** l'inscrire
  dans `supabase_migrations.schema_migrations (version, name, statements)`,
  sinon un futur `supabase db push` la rejouerait. Toujours lire l'historique
  avant, pour vérifier que la base est au niveau de `main`.
- **Faire tourner le site sur les vraies données** (aperçus de bilans) : les clés
  s'obtiennent par `GET /v1/projects/<ref>/api-keys?reveal=true`, écrites dans
  `.env.local` (ignoré par git) sans jamais les afficher ; lancer `next dev` avec
  `NODE_USE_ENV_PROXY=1 NODE_EXTRA_CA_CERTS=/root/.ccr/ca-bundle.crt`, sinon le
  `fetch` de Node ne passe pas par le proxy et la base semble vide. Les pages
  d'aperçu temporaires se placent sous `/auth/…` (préfixe public du proxy
  d'authentification) et ne se commitent jamais. **`src/app/auth/` contient
  aussi la vraie route `confirmer/`** (confirmation des emails) : ne supprimer
  que le sous-dossier d'aperçu (`src/app/auth/zz-…`), jamais `src/app/auth`
  entier — c'est arrivé le 27/11, rattrapé avant la mise en ligne.
- **Déploiement** : un push sur `main` déploie en production (deux projets
  Vercel, « qcm-annales » et « admissibleparkours »). L'utilisateur valide chaque
  mise en ligne explicitement ; le travail avance sur une branche en attendant.
  L'état du déploiement se lit sans accès Vercel :
  `gh api repos/LouisedeMaupeou/qcm-annales/commits/<sha>/status`.

---

## 2. Module concours blancs (prépa Parkours)

Spécifications : [`docs/specifications-module-concours-blancs-v1.0.md`](specifications-module-concours-blancs-v1.0.md),
étapes 9 à 15 (suite du §12 du socle).

Au **28/10/2026** : étapes **9** (cohortes et rôle `responsable_prepa`), **10**
(importeur CSV/XLSX au format Parkours), **11** (sessions et épreuves blanches)
et **12** (passage élève) écrites. **490 questions et 257 figures en
production**, dont une centaine en file de relecture. Les étapes 9 à 11 sont
fusionnées dans `main`. Restaient alors les étapes **13 à 15** : correction,
bilans au format V10, oraux. L'historique git depuis cette date porte la suite du
travail (correction, bilans, oraux, résultats aux familles) : le lire plutôt que
se fier à ce paragraphe.

Import : `node --env-file=.env.local scripts/importer-concours-blancs.mjs <csv> <zips...> [--simulation]`,
idempotent sur `id_question_externe`.

Le piège structurel à ne jamais casser (isolation de l'entraînement libre) est
décrit dans [`CLAUDE.md`](../CLAUDE.md).

**Après le bilan (27/11/2026, demande de la responsable des prépas)** : dès que
le bilan d'une session est envoyé à un élève, chacune de ses épreuves se
rouvre. Il relit sa copie corrigée (`/concours-blancs/<épreuve>/corrige` :
réponse cochée, bonne réponse, chapitre, notion, correction) et refait
l'épreuve **à volonté**, sans limite de temps, avec le corrigé **à la fin
seulement**. Les reprises vivent dans `reprises_cb` / `reprise_reponses`, jamais
dans `passages` : rien de ce qui calcule une note, un rang ou un bilan ne les
lit. Elles sont notées par la même règle que la copie officielle
(`chargerCadreCorrection`), et servies par le même chemin expurgé
(`chargerQuestionsJouables`). Une rédaction n'est pas notée en reprise : on
montre l'attendu.

**Bilan V11 (27/11/2026, retours de la responsable des prépas sur les bilans
de Noël).** Écran (`src/components/bilan-v10.tsx`) et PDF (`src/lib/bilan-pdf.tsx`)
ont la même structure ; le calcul est dans `src/lib/bilan-cb.ts`, testé.

- **Hiérarchie du référentiel SÉSAME** : domaine = « Chapitre / compétence »
  (`questions.chapitre`), chapitre = « Notion commune » (`sous_chapitre`),
  notion = « Sous-notion précise » (`notions`), erreur commise = « Feedback
  réponse X » de la proposition cochée (`reponses_possibles.retroaction`),
  à reprendre = « Révision ciblée » (`travail_a_realiser`), méthode =
  « Méthode de résolution » (`questions.methode`). Chargés en base le 27/11 pour
  la session de Noël (220 questions, 876 retours ; 4 propositions réécrites
  depuis le référentiel n'ont pas de retour, volontairement).
- **Page 1** : bandeau, « En quelques mots », tableau de synthèse — une ligne
  par épreuve : note, moyenne du groupe, place, questions attendues /
  réussies / ratées / sans réponse (« sans réponse » n'est pas « ratée »),
  acquis, à reprendre. Toutes filières. Portrait, police **Rubik**.
- **Un thème n'est classé qu'à partir de 3 questions.** Acquis : ≥ 3
  réussites et ≥ 75 %, au plus 4. À reprendre : faux plus de 2 fois. Constat
  sur Noël : 10 chapitres de maths sur 11 n'ont qu'une ou deux questions — en
  maths, presque rien n'est classable ; **les prochains référentiels devraient
  viser 3 questions par chapitre**.
- **Langues** (FR, ANG, DE, ES) : analyse par **domaine** (Grammaire, Lexique,
  Compréhension, Civilisation…) et non par chapitre, pour que « Grammaire »
  apparaisse dès 3 fautes toutes notions confondues. Décision « à tester »
  de la responsable.
- **Plan de travail** : une section **par épreuve composée**, dans l'ordre du
  tableau ; les **3 points** les plus fautifs, **2 exemples** chacun (notion,
  erreur, à reprendre, méthode). Sans point faux plus de 2 fois : les fautes
  en « points à surveiller » (ambre). Constats calculés une fois
  (`constatsEpreuve`) : épreuve non traitée, aucune faute, > 25 % sans
  réponse. **Aucune faute ne disparaît** : à l'écran, chaque point déplie
  toutes ses fautes ; le PDF renvoie au bilan en ligne. Tout détailler donnait
  20 pages pour un élève en difficulté.
- **Oraux à la fin**, après le plan. « À travailler en priorité » supprimé
  (doublon du plan).
- **« En quelques mots »** se pré-remplit depuis le tableau (résultat,
  points solides, à reprendre — maths et français d'abord —, alerte sans
  réponse). Un texte enregistré par la responsable le remplace ; vider le
  champ pour revenir au calcul.
- **Back-office** : bouton « Bilans » sur chaque fiche cohorte →
  `/admin/prepa/<cohorte>/bilans` (Voir / modifier, PDF).

---

## 3. État des imports, concours par concours

Règle commune : une question issue d'une source dégradée entre en statut
`a_verifier` / `statut_extraction a_verifier` → visible dans `/admin/relecture`,
**invisible à l'entraînement** tant qu'un humain ne l'a pas validée.

Les PDF sources sont hors dépôt, dans `C:\Users\paul\OneDrive\Bureau\Annales\`.

### Méthode de transcription (valable pour tous les concours)

Les PDF de maths et de sciences ont souvent une couche texte, mais la **notation
2D ne survit pas à l'extraction brute** (racines, fractions, exposants aplatis).
La méthode qui a marché : rendre chaque page en PNG avec **poppler `pdftoppm`**
(binaire installé dans le dossier temporaire de session depuis
`oschwartz10612/poppler-windows`), puis **transcrire visuellement** page par page
avec la notation de l'application (`^` exposant, `_` indice, `Σ_(...)^(...)`,
`√(...)`). Les bonnes réponses sont assignées par index depuis les corrigés
officiels. Les questions dont la compréhension dépend d'une figure portent
`⚠ FIGURE REQUISE` ou sont écartées.

### GEIPI Polytech

**QCM de maths 2023–2026 importé le 04/08/2026** : 115 questions, 33 exercices,
publiées, `origine=extraite`. (Une ancienne version du README le classait parmi
les concours non importés ; c'est corrigé.)

- Périmètre : **le QCM de maths seulement**. Les épreuves maths-problèmes, NSI,
  PC, SI, SVT sont rédactionnelles (type `redaction`, V2).
- Modélisation retenue, dite **« option B »** : chaque affirmation = une question
  `choix_unique` à deux propositions « Vrai »/« Faux », notée indépendamment ;
  les affirmations d'un même exercice sont réunies dans un **bloc** (tiré entier,
  §2.2). Préférée à un `vrai_faux` multi-propositions pour que le barème +1/−1
  s'applique **par affirmation** — un `vrai_faux` score « tout ou rien » sur
  l'exercice entier.
- Barème GEIPI : **+1 / −1 / 0**. Le plancher par exercice de GEIPI (le total
  d'un exercice ne descend jamais sous 0) **n'est pas exprimable dans le modèle**
  — écart assumé.
- **À confirmer :** l'année **2024** vient d'un `QCM-Correction-V1.pdf` qui ne
  porte aucune année en interne ; attribuée à 2024 par élimination.

**Sciences GEIPI — QCM dérivés (08/2026)** : les épreuves NSI / PC / SI / SVT
sont des problèmes rédigés à réponse libre (« Document réponses »), donc
inimportables telles quelles. L'utilisateur a choisi d'en **dériver des QCM
inédits** : **97 questions Vrai/Faux rédigées** (`origine=manuelle`), inspirées
des thèmes réels de chaque annale, en relecture, dans quatre nouvelles épreuves
— Physique-Chimie 30, SVT 23, NSI 24, Sciences de l'ingénieur 20, réparties sur
2023–2026. Script `scripts/importer-geipi-sciences.mjs`. **Ce ne sont pas les
annales originales** mais de l'entraînement dérivé. Un vrai type « exercice
rédactionnel » reste à développer (V2) pour charger les problèmes d'origine.

### Concours Avenir

Importé le **27/08/2026**. Total de l'épreuve Avenir : **Anglais 90,
Mathématiques 171, Physique 120, NSI 80, SI 74, SVT 75**.

- Les trois sujets de maths (A 2026, A 2025, B 2025) sont regroupés sous **une
  seule épreuve « Mathématiques »** : à la demande de l'utilisateur, pas de
  distinction A/B, pas d'année dans les libellés ni les commentaires. L'année ne
  subsiste que dans le badge « Avenir 20xx » de la liste de relecture (colonne
  `annales.annee`, `NOT NULL`, partagée avec l'anglais) et dans le texte de
  certains énoncés, où elle est légitime.
- L'épreuve « Sciences A » a été **éclatée en quatre épreuves** par discipline
  (Physique, NSI, SI, SVT) ; les **20 questions dépendant d'une figure ont été
  supprimées**.
- Scripts : `scripts/importer-avenir-maths.mjs`,
  `scripts/importer-avenir-sciences.mjs` (idempotents, relisent les JSON de
  transcription).
- Barème Avenir : +1 / −1 / 0.
- **Advance maths reste non importé** : PDF scannés, OCR impossible ici.

### ACCÈS

- **Anglais (08/2026) : 274 questions** Vrai/Faux à 4 items, importées en
  relecture depuis 5 PDF (cahiers 2021–2024 + annale 2025). Deux parseurs,
  parce que les formats diffèrent : `scripts/parser-acces-anglais.mjs` (annale
  2025, « VRAI FAUX + 4 items ») et `scripts/parser-acces-anglais-cahier.mjs`
  (cahiers, « ■■ Question N / A) B) C) D) » + « Tableau des bonnes réponses »).
  Import : `scripts/importer-acces-anglais.mjs`. Répartition : 2021 = 40,
  2022 = 50, 2023 = 50, 2024 = 75, 2025 = 59. Grammaire et compréhension écrite
  (le passage est inclus dans l'énoncé).
  - **10 anciennes questions d'anglais** (2025, Q1–Q10) font doublon avec cette
    relecture mais **ont été jouées en session** → non supprimables (clé
    étrangère `session_questions`). À retirer manuellement si besoin.
- **Maths** (« Raisonnement logique et mathématiques ») : complètes. Les manques
  sont les questions à figure, volontairement écartées.
  - **Décalage d'un an des cahiers** : un « Cahier d'entraînement ACCÈS AAAA »
    contient le concours **AAAA−1**. Donc cahier-2022 = concours 2021, etc., et
    seul le **cahier-2021 = concours 2020** était absent de la base. Ses 10
    questions (5 logique, 5 mathématique) ont été importées en relecture sous une
    **annale 2020** (`scripts/importer-acces-maths-2020.mjs`). Le problème
    Q11–Q15 (plan d'un terrain) n'est pas importé : figure essentielle.

### Puissance Alpha

Commencé le **04/08/2026**.

- **Droits :** chaque PDF porte « © {année} Puissance Alpha — toute utilisation
  même partielle dans un cadre autre que Puissance Alpha est interdite
  (art. L111-1 CPI) ». L'utilisateur a **explicitement confirmé disposer des
  droits de reproduction** — **à documenter par écrit avant toute mise en ligne
  publique** (§8.9), comme pour Avenir.
- **Filières séparées** : « Mathématiques – QCM (générale) » et
  « Mathématiques – QCM (technologique) » sont deux épreuves distinctes. Barème
  officiel **+1 / −0,5 / 0**.
- **Choix d'import « partiel fiable » (option A)** : n'importer que les
  affirmations reconstruites **sans ambiguïté** depuis sujet + corrigé, écarter
  et lister le reste. Modélisation option B comme GEIPI. Tout en relecture, vu la
  source dégradée.
- Maths : 2024 technologique (24 affirmations gardées sur 36), puis maths
  générale complétées (124 questions en base, par saisie XLSX lors de sessions
  ultérieures).
- **Sciences appliquées, filière générale (08/2026)**, séparées en trois
  épreuves — « NSI – QCM (générale) », « SVT – QCM (générale) »,
  « Physique-Chimie – QCM (générale) » ; SI non importé (hors demande). Script
  `scripts/importer-pa-sciences.mjs`. **Total 125 questions en relecture**
  (NSI 33, SVT 51, Physique-Chimie 41) :
  - **2025 générale** (couche texte exploitable) : NSI 23, SVT 36,
    Physique-Chimie 22 = 81. Le tronc commun est réparti par thème (IA → NSI,
    drépanocytose et climat → SVT, réseau électrique et ozone → Physique).
  - **2022 générale** (sciences en images, donc rendu poppler + transcription) :
    NSI 10, SVT 15, Physique-Chimie 19 = 44. Beaucoup d'affirmations écartées
    (graphes, montages, profils sismiques, courbes de titrage, photos MET).
    Pièges des corrigés 2022 : **les corrigés NSI ne couvrent pas les exercices
    1 à 3**, la physique commence à l'exercice 22, et le **corrigé SVT de
    l'exercice 19 (sauge) est un copier-coller erroné de l'exercice 20** → ex. 19
    non importé.
  - 2024 technologique : parties STI2D/STAV/STL, hors périmètre de la demande.
- **Bloqué :** le **QCM de maths 2022 et 2025 filière générale** est
  **entièrement en images**, sujet comme corrigé (le texte n'extrait que les
  titres d'exercices). À reprendre avec un OCR, ou depuis une transcription
  fournie par l'utilisateur (§8.9).

### SÉSAME

En base : « SESAME – Raisonnement & compétences (aptitudes numériques) —
entraînement » (60 questions, antérieure, non touchée), plus deux épreuves
créées en **08/2026** sous l'**annale 2026** (concours blanc 2025-2026), type
`choix_unique`, en relecture : **« Enjeux contemporains » (40)** et
**« Français » (40)**. Script `scripts/importer-sesame-qcm.mjs`.

**Les corrigés ne sont pas fournis dans les PDF.** L'utilisateur a choisi « je
détermine les réponses » et « ignorer les scannés » : les réponses ont donc été
**déterminées automatiquement**, et `commentaire_extraction` le signale
(« RÉPONSE DÉTERMINÉE AUTOMATIQUEMENT … À VÉRIFIER »).

- **Français** : grammaire, orthographe, vocabulaire, littérature → réponses
  fiables car objectives. Sauf **Q17** (pluriels composés, réforme de 1990 :
  plusieurs formes acceptables) et **Q20** (deux phrases correctes), ambiguës.
- **Enjeux contemporains** (actualité, 38 questions restantes) : **réponses peu
  fiables**, marquées « ⚠ à confirmer en priorité » pour Q1, Q5, Q22, Q23, Q25,
  Q26, Q29, Q37. Deux questions défectueuses (Q34 Nobel de littérature 2024 et
  Q35 Emmy 2025 — la bonne réponse était absente des options) ont été
  **supprimées** à la demande de l'utilisateur.

Note technique : la table `epreuves` utilise **`ordre_affichage`**, pas `ordre`.

---

## 4. Pièges techniques déjà payés

- **Supprimer des lignes avec `.in("id", [des centaines d'UUID])` dépasse la
  limite d'URL de PostgREST et échoue en silence** — d'où une accumulation de
  doublons. Supprimer par lots de 100 au plus, ou par `.eq(colonne, …)`.
- **Une question déjà jouée n'est pas supprimable** : `session_questions` la
  référence.
- **Une copie de concours blanc retient l'identifiant de la proposition
  cochée** (`passage_reponses.reponse.reponseId`), sans clé étrangère. Jusqu'au
  27/11/2026, l'import concours blancs supprimait et recréait les propositions :
  un réimport après une session détachait silencieusement les copies de leurs
  réponses (les points déjà calculés restaient, mais plus moyen de dire quelle
  réponse l'élève avait cochée). L'import met désormais à jour en place, rang
  par rang. Pour compléter une session passée, préférer
  `scripts/enrichir-referentiel-sesame.mjs`, qui vérifie aussi les copies
  orphelines.
- **`next dev` ne type-checke pas** : voir la règle 1 de [`CLAUDE.md`](../CLAUDE.md).
- **Aucun contrôle local du SQL** : voir la règle 3 de [`CLAUDE.md`](../CLAUDE.md),
  avec le piège des `$$` et de `String.replace()`.
- **Le rendu d'images de PDF n'est pas disponible par défaut** sur cette machine :
  il faut installer poppler dans le dossier temporaire de session. (En session
  cloud, `pdftoppm` est présent.)
- **@react-pdf : un bloc insécable (`wrap={false}`) dans un bloc sécable fait
  superposer le texte en bas de page.** Rendre insécable la carte entière.
- **Polices du PDF** : la version « latin » de Rubik n'a ni flèches, ni grec,
  ni opérateurs (√, ≤, ℝ) — repli sur Noto Sans Math ; exposants, indices et
  « ≠ » restent mal rendus par les deux et sont réécrits par `pourPdf`
  (u(n+1), x^(-1)). Les fichiers sont lus sur disque au rendu : ils doivent
  figurer dans `outputFileTracingIncludes` (`next.config.ts`), sinon Vercel ne
  les déploie pas.
- **Un CSV sans BOM UTF-8 est lu en Latin-1 par SheetJS** : accents abîmés à
  l'import (« RÃ©soudre »). Les XLSX ne sont pas touchés. Non corrigé.

---

## 5. Points juridiques et produit en suspens

- **Documenter par écrit les droits de reproduction** obtenus auprès des
  concours (Puissance Alpha et Avenir au minimum) **avant toute publication
  publique** de leurs questions — §8.9 des specs du socle.
- **Copie corrigée en ligne** : afficher l'erreur commise propre à la réponse
  cochée (`reponses_possibles.retroaction`), comme le plan du bilan ; elle ne
  montre aujourd'hui que la correction générale.
- **Bilan de Beatriz (Noël)** : son « En quelques mots » enregistré suit
  l'ancienne logique ; le vider pour qu'il se régénère.
- **Vérifier en relecture** toutes les réponses déterminées automatiquement, en
  priorité celles d'« Enjeux contemporains » de SÉSAME.
- La liste complète de ce qui reste avant une vraie mise en production est dans
  le README, section « À faire avant une mise en production réelle ».
