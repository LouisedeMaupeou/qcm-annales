"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { BoutonLien, styleBouton } from "@/components/bouton";
import { PiedDePage } from "@/components/pied-de-page";

// Page marketing sans données serveur : elle est prérendue en HTML statique au
// build malgré le "use client". Le composant est client uniquement parce que le
// bouton « Comment ça marche ? » vit dans le hero et pilote une section située
// plus bas — l'état doit être partagé entre les deux.

const CONCOURS = [
  {
    filiere: "Écoles de commerce",
    items: [
      { nom: "ACCÈS", detail: "ESDES · ESSCA · IÉSEG" },
      { nom: "SÉSAME", detail: "14 programmes post-bac" },
    ],
  },
  {
    filiere: "Écoles d'ingénieurs",
    items: [
      { nom: "Avenir", detail: "7 écoles" },
      { nom: "Advance", detail: "4 écoles" },
      { nom: "Puissance Alpha", detail: "17 écoles" },
      { nom: "GEIPI Polytech", detail: "36 écoles publiques" },
    ],
  },
];

const ETAPES = [
  {
    titre: "Choisis ton concours et ta matière",
    texte:
      "Logique, maths, anglais, enjeux contemporains… tu t'entraînes exactement sur les épreuves de ton concours.",
  },
  {
    titre: "Joue une session",
    texte:
      "Des questions tirées des annales officielles, dans le vrai format de l'épreuve : choix unique ou vrai/faux, exercices liés servis ensemble.",
  },
  {
    titre: "Progresse chapitre par chapitre",
    texte:
      "Correction immédiate, explication quand tu te trompes, et un tableau de bord qui te montre où tu gagnes des points.",
  },
];

const BAREMES = [
  { concours: "Avenir", bonne: "+1", mauvaise: "−1" },
  { concours: "Advance", bonne: "+2", mauvaise: "−0,5" },
  { concours: "Puissance Alpha", bonne: "+1", mauvaise: "−0,5" },
  { concours: "SÉSAME", bonne: "+1", mauvaise: "0" },
];

const PARENTS = [
  {
    titre: "Gratuit, vraiment",
    texte:
      "L'entraînement est en accès libre : pas de carte bancaire, pas d'abonnement caché.",
  },
  {
    titre: "Des données protégées",
    texte:
      "Consentement explicite au moment de l'inscription et suppression du compte en un clic, à tout moment.",
  },
  {
    titre: "Un entraînement sérieux",
    texte:
      "Des annales officielles, les vrais barèmes et un suivi de progression — pour réviser dans les conditions du concours.",
  },
];

export default function LandingPage() {
  const [marcheOuverte, setMarcheOuverte] = useState(false);
  const marche = useRef<HTMLDivElement>(null);

  return (
    <div className="mx-auto w-full max-w-[1100px] flex-1 px-[22px]">
      <header className="flex items-center justify-between gap-4 py-5">
        <Link href="/" className="text-encre no-underline">
          <span className="text-[1.4rem] leading-none font-black tracking-tight">
            Admissible<span className="text-primaire">.</span>
          </span>
          <small className="block text-[0.72rem] font-bold tracking-wider">
            un service Parkours
          </small>
        </Link>
        <BoutonLien href="/inscription">Je me lance !</BoutonLien>
      </header>

      {/* Hero */}
      <section className="relative mt-1.5 mb-16 flex flex-col items-start overflow-hidden rounded-carte bg-[linear-gradient(rgba(13,30,66,.62),rgba(13,30,66,.72)),url('/hero-eleves.jpg')] bg-cover bg-[center_32%] bg-no-repeat px-6 pt-11 pb-13 sm:px-12 sm:pt-16 sm:pb-18">
        <span className="mb-4 inline-block rounded-full bg-white/15 px-4 py-1.5 text-sm font-extrabold text-white backdrop-blur-[4px]">
          Concours post-bac · commerce &amp; ingénieur
        </span>
        <h1 className="mb-4 max-w-[22ch] text-[clamp(2.1rem,4.8vw,3.2rem)] font-black tracking-tight text-white [text-shadow:0_2px_14px_rgba(0,0,0,.25)]">
          Entraîne-toi sur les vraies annales. Gratuitement.
        </h1>
        <p className="mb-6 max-w-[52ch] text-lg text-white/95">
          Des annales officielles des 6 grands concours, corrigées et
          expliquées, avec les vrais barèmes et ta progression, matière par
          matière.
        </p>
        <div className="flex flex-wrap items-center gap-3.5">
          <BoutonLien href="/inscription" taille="grande">
            Je me lance !
          </BoutonLien>
          <button
            type="button"
            aria-expanded={marcheOuverte}
            aria-controls="marche-contenu"
            onClick={() => {
              const ouvre = !marcheOuverte;
              setMarcheOuverte(ouvre);
              if (ouvre)
                requestAnimationFrame(() =>
                  marche.current?.scrollIntoView({
                    behavior: "smooth",
                    block: "nearest",
                  }),
                );
            }}
            className={styleBouton("clair")}
          >
            Comment ça marche ?{" "}
            <span
              aria-hidden
              className={`transition-transform ${marcheOuverte ? "rotate-180" : ""}`}
            >
              ↓
            </span>
          </button>
        </div>
        <p className="mt-3.5 text-sm text-white/85">
          Gratuit · sans engagement · pensé pour réviser depuis ton téléphone
        </p>
      </section>

      {/* Concours couverts. Pas de logos officiels : noms en toutes lettres
          (§5.0, question de droits). */}
      <section
        aria-label="Concours couverts"
        className="mb-16 rounded-carte bg-fond-doux/95 p-6 sm:p-9"
      >
        <h2 className="mb-5 text-center text-[1.7rem] font-black">
          Les 6 grands concours, au même endroit
        </h2>
        {CONCOURS.map((groupe) => (
          <div key={groupe.filiere} className="mb-5 last:mb-0">
            <p className="mb-3 text-sm font-extrabold tracking-[.08em] text-primaire-fonce uppercase">
              {groupe.filiere}
            </p>
            <div className="grid grid-cols-[repeat(auto-fit,minmax(160px,1fr))] gap-3.5">
              {groupe.items.map((c) => (
                <div
                  key={c.nom}
                  className="rounded-[14px] border border-ligne bg-white px-4 py-5 text-center shadow-[0_4px_14px_rgba(18,38,58,.05)]"
                >
                  <div className="text-xl font-black tracking-tight text-encre">
                    {c.nom}
                  </div>
                  <div className="mt-1 text-[0.82rem] font-semibold">
                    {c.detail}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </section>

      {/* Comment ça marche — replié par défaut, piloté depuis le hero. */}
      <section className="pb-16 text-center" aria-label="Comment ça marche">
        <div id="marche-contenu" ref={marche} hidden={!marcheOuverte}>
          <div className="grid gap-4 text-left md:grid-cols-3">
            {ETAPES.map((etape, i) => (
              <div
                key={etape.titre}
                className="rounded-carte border border-ligne bg-white p-6 shadow-[0_4px_14px_rgba(18,38,58,.05)]"
              >
                <span className="mb-3 inline-flex size-[34px] items-center justify-center rounded-full bg-primaire font-black text-white">
                  {i + 1}
                </span>
                <h3 className="mb-1.5 text-lg font-extrabold">{etape.titre}</h3>
                <p className="text-[0.95rem]">{etape.texte}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Barèmes */}
      <section className="grid items-center gap-9 pb-16 md:grid-cols-[1.1fr_.9fr]">
        <div>
          <h2 className="mb-2.5 text-[1.7rem] font-black">
            Les vraies règles du jeu
          </h2>
          <p className="mb-5">
            La plupart des concours retirent des points en cas de mauvaise
            réponse. S&apos;entraîner sans cette règle, c&apos;est prendre de
            mauvais réflexes. Ici, chaque session applique le barème officiel de
            ton concours — et t&apos;apprend quand il vaut mieux ne pas
            répondre.
          </p>
          <BoutonLien href="/inscription">
            Tester avec le vrai barème
          </BoutonLien>
        </div>
        <div>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse overflow-hidden rounded-[14px] border border-ligne bg-white text-[0.95rem] font-bold">
              <caption className="sr-only">
                Exemples de barèmes officiels
              </caption>
              <thead>
                <tr>
                  <th className="border-b border-ligne bg-fond-doux px-4 py-3 text-left font-extrabold text-encre">
                    Concours
                  </th>
                  <th className="border-b border-ligne bg-fond-doux px-4 py-3 text-left font-extrabold text-encre">
                    Bonne
                  </th>
                  <th className="border-b border-ligne bg-fond-doux px-4 py-3 text-left font-extrabold text-encre">
                    Mauvaise
                  </th>
                </tr>
              </thead>
              <tbody>
                {BAREMES.map((b) => (
                  <tr key={b.concours} className="last:[&>td]:border-b-0">
                    <td className="border-b border-ligne px-4 py-3">
                      {b.concours}
                    </td>
                    <td className="border-b border-ligne px-4 py-3">
                      {b.bonne}
                    </td>
                    <td
                      className={`border-b border-ligne px-4 py-3 ${
                        b.mauvaise.startsWith("−") ? "text-negatif" : ""
                      }`}
                    >
                      {b.mauvaise}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {/* Le prototype annonçait ces barèmes comme « vérifiés sur les
              règlements officiels ». Ils ne le sont pas : le §2 des specs
              signale explicitement Avenir comme douteux, et la base les stocke
              avec verifie_le = NULL. Formulation corrigée en conséquence. */}
          <p className="mt-2 text-[0.8rem] opacity-80">
            Barèmes donnés à titre indicatif, en cours de vérification sur les
            règlements officiels de chaque session.
          </p>
        </div>
      </section>

      {/* Réassurance parents */}
      <section className="mb-18 grid gap-6 rounded-carte bg-fond-doux/95 p-8 md:grid-cols-3">
        <div className="md:col-span-3">
          <h2 className="text-[1.7rem] font-black">
            Parents, on a pensé à vous
          </h2>
        </div>
        {PARENTS.map((p) => (
          <div key={p.titre}>
            <h3 className="mb-1 text-[1.02rem] font-extrabold">{p.titre}</h3>
            <p className="text-[0.93rem]">{p.texte}</p>
          </div>
        ))}
      </section>

      <section className="pt-2 pb-20 text-center">
        <h2 className="mb-3 text-[clamp(1.6rem,3.4vw,2.2rem)] font-black">
          Ton concours se prépare maintenant.
        </h2>
        <p className="mb-6">
          Crée ton compte en deux minutes et joue ta première session dans la
          foulée.
        </p>
        <BoutonLien href="/inscription" taille="grande">
          Je me lance !
        </BoutonLien>
      </section>

      <PiedDePage />
    </div>
  );
}
