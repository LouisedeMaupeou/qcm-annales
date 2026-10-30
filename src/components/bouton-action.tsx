"use client";

/**
 * Bouton d'action qui confirme visuellement sa réussite.
 *
 * Beaucoup d'écrans du back-office enregistrent sans quitter la page : le
 * seul retour était un bandeau de texte, qu'on rate quand on a les yeux sur
 * le bouton qu'on vient de cliquer. Le bouton passe donc au vert et change de
 * libellé une fois l'action acceptée par le serveur.
 *
 * Le vert dit « pris en compte », jamais « cliqué » : il ne s'allume que sur
 * un succès confirmé par le serveur. Il reste allumé jusqu'à la soumission
 * suivante, qui le remet au neutre le temps du traitement.
 */
export function BoutonAction({
  succes,
  enCours,
  variante = "primaire",
  libelleSucces = "Enregistré",
  libelleEnCours,
  disabled,
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  succes?: boolean;
  enCours?: boolean;
  variante?: "primaire" | "secondaire";
  libelleSucces?: string;
  libelleEnCours?: string;
}) {
  const base =
    "cursor-pointer rounded-full px-7 py-3 font-extrabold transition disabled:cursor-wait disabled:opacity-60";

  const couleur = succes
    ? "bg-positif text-white hover:bg-positif"
    : variante === "primaire"
      ? "bg-primaire text-white hover:bg-primaire-fonce"
      : "border-2 border-primaire text-primaire hover:bg-fond-doux";

  return (
    <button
      type="submit"
      disabled={disabled ?? enCours}
      aria-live="polite"
      className={`${base} ${couleur}`}
      {...props}
    >
      {enCours ? (libelleEnCours ?? "…") : succes ? `✓ ${libelleSucces}` : children}
    </button>
  );
}
