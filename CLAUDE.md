@AGENTS.md

# Admissible — repères pour Claude Code

Plateforme d'entraînement gratuit aux annales de concours post-bac (écoles de
commerce et d'ingénieurs), qui sert aussi de plateforme de **concours blancs**
à la prépa Parkours. En production sur <https://admissible.parkours.fr>
(Vercel + Supabase, déploiement automatique à chaque push sur `main`).

## Où lire avant d'écrire

| Document | Ce qu'il contient |
|---|---|
| [`README.md`](README.md) | stack, démarrage local, scripts d'import, règles d'architecture, variables d'environnement, ce qui reste à faire avant une vraie mise en production |
| [`docs/specifications-plateforme-qcm-annales-v1.2.md`](docs/specifications-plateforme-qcm-annales-v1.2.md) | **source de vérité fonctionnelle du socle**. Les références `§x.y` du code et des commits y renvoient |
| [`docs/specifications-module-concours-blancs-v1.0.md`](docs/specifications-module-concours-blancs-v1.0.md) | source de vérité du **module concours blancs** (étapes 9 à 15, suite du §12 du socle). Les commentaires qui s'y rapportent le disent : « module concours blancs, §5 » |
| [`docs/memoire-projet.md`](docs/memoire-projet.md) | état réel des imports concours par concours, pièges rencontrés, décisions prises hors specs, configuration de prod |

Les specs primeront toujours sur l'habitude ou sur un souvenir de conversation :
pour une règle produit, aller les lire.

## Emplacement et commandes

Le code est dans `C:\Users\paul\dev\qcm-annales` (hors OneDrive depuis le
19/07/2026 : OneDrive synchronisait `node_modules`, d'où des builds lents et des
erreurs `EPERM`/`EBUSY`). Les sessions Claude Code démarrent parfois ailleurs, et
le répertoire courant du shell est réinitialisé entre deux appels : **toujours se
placer explicitement dans le dossier**.

Node n'a pas été installé avant ce projet et le `PATH` n'est pas rafraîchi dans
les nouveaux shells PowerShell, d'où le préfixe :

```powershell
$env:Path = [Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [Environment]::GetEnvironmentVariable("Path","User")
Set-Location C:\Users\paul\dev\qcm-annales
```

```powershell
npm run dev     # serveur local (Turbopack) — ne type-checke pas
npm run build   # next build : le seul contrôle de typage complet
npm test        # ~60 tests node:test sur src/**/*.test.ts
npm run lint
```

`preview_start` et `.claude/launch.json` cherchent au mauvais endroit quand la
session démarre hors du dossier : lancer le serveur via PowerShell en
arrière-plan.

## Trois règles de travail

**1. Un `next build` avant chaque push qui touche du TypeScript.** `next dev`
(Turbopack) ne fait pas le type-check complet : une erreur de typage passe
inaperçue en local et **casse le build de production sur Vercel** (arrivé le
04/08/2026 sur la page `/health`). `next build` tourne sans les variables de
prod — le contrôle strict de `src/lib/env.ts` ne s'active que si
`VERCEL_ENV=production` ou `VERIFIER_PROD=1`. Les erreurs `tsc` dans les
`*.test.ts` (imports en `.ts`) sont préexistantes et n'affectent pas le build.

**2. Une étape du §12 à la fois.** Livrer l'étape, la faire vérifier
concrètement (serveur local, page de contrôle), présenter les arbitrages pris,
puis **s'arrêter et attendre l'accord explicite**. Demande de l'utilisateur au
lancement du projet ; les specs elles-mêmes prévoient que chaque étape soit
livrable et testable indépendamment.

**3. Le SQL n'est couvert par aucun contrôle local.** Pas de PostgreSQL local
(Docker absent) : le build et les tests ne voient que le TypeScript. Une
migration ne se découvre fausse qu'au `npx supabase db push`, **sur la base de
production**. Donc relire les migrations à la main, et ne jamais réécrire un
fichier SQL avec `String.replace()` en JavaScript — un `$$` dans la chaîne de
remplacement devient un seul `$` et casse la délimitation des corps de fonction
PL/pgSQL (déjà arrivé : `syntax error at or near "$"`). `cat -A` ajoute lui-même
un `$` en fin de ligne, il ne sert à rien pour vérifier des `$$`.

## Invariants à ne pas casser

- **Les élèves n'accèdent jamais directement à `questions` ni à
  `reponses_possibles`.** `reponses_possibles.est_correcte` contient le corrigé :
  exposée via PostgREST, elle serait lisible par n'importe quel élève avec son
  propre jeton. Le contenu jouable passe exclusivement par
  `src/lib/session-entrainement.ts`, qui retire `est_correcte` et les
  explications non relues. La notation se fait côté serveur.
- **Le statut d'un bloc est dérivé, pas écrit à la main.** Un bloc est tiré
  entier ou pas du tout (§2.2) : il n'est jouable que si toutes ses questions le
  sont. Un trigger maintient l'invariante quel que soit le chemin d'écriture
  (seed, import, relecture, signalement).
- **Les questions de concours blancs sont isolées de l'entraînement libre.**
  Elles vivent sous des blocs **sans annale** (`blocs.annale_id` nullable +
  `epreuve_id_externe`) et l'entraînement libre les exclut par trois filtres
  (`src/lib/session-entrainement.ts` et les deux pages `entrainement`), plus
  `epreuves.visible_public` et le trigger de statut de bloc. **Toute requête de
  contenu public doit garder ces filtres.**
- **`BilanV10` (écran) et `bilan-pdf.tsx` (pièce jointe email) évoluent
  ensemble.** Mêmes données, seule la présentation est dupliquée — jamais un
  calcul.
- **`xlsx` vient du CDN SheetJS, pas de npm**, où le paquet est figé à une
  version vulnérable (pollution de prototype à l'ouverture d'un fichier, soit
  exactement le chemin de l'import en masse). Le déploiement doit pouvoir
  joindre `cdn.sheetjs.com`.

## Conventions

- **Tout en français** : interface, libellés, noms de colonnes et de fonctions,
  commentaires, messages de commit.
- **Messages de commit** : sujet court en français, sous la forme
  « Sujet : ce qui change », puis un corps en prose qui explique **pourquoi** —
  ce que l'ancien comportement faisait de travers, ce que le nouveau fait, et les
  garde-fous. Pas de préfixe type `feat:`. Terminer par la ligne
  `Co-Authored-By:` de l'agent.
- **Import de contenu** : toujours passer par `--simulation` d'abord quand le
  script le propose ; les scripts d'import sont idempotents (clé
  `id_question_externe` pour les concours blancs).
- Une question importée d'une source dégradée entre en statut `a_verifier`
  (visible dans `/admin/relecture`, invisible à l'entraînement tant qu'un humain
  ne l'a pas validée), jamais publiée directement.
