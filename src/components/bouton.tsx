import Link from "next/link";

const BASE =
  "inline-flex cursor-pointer items-center gap-2 rounded-full font-extrabold no-underline transition active:translate-y-px";

const VARIANTES = {
  plein:
    "bg-primaire text-white shadow-[0_6px_18px_rgba(37,99,235,.28)] hover:bg-primaire-fonce",
  discret:
    "border-2 border-ligne bg-transparent font-bold text-encre hover:bg-fond-doux",
  clair: "bg-white/90 font-bold text-encre hover:bg-white",
} as const;

const TAILLES = {
  normale: "px-7 py-3.5 text-base",
  grande: "px-9 py-4 text-lg",
} as const;

type Props = {
  href: string;
  children: React.ReactNode;
  variante?: keyof typeof VARIANTES;
  taille?: keyof typeof TAILLES;
};

export function BoutonLien({
  href,
  children,
  variante = "plein",
  taille = "normale",
}: Props) {
  return (
    <Link
      href={href}
      className={`${BASE} ${VARIANTES[variante]} ${TAILLES[taille]}`}
    >
      {children}
    </Link>
  );
}

export const styleBouton = (
  variante: keyof typeof VARIANTES = "plein",
  taille: keyof typeof TAILLES = "normale",
) => `${BASE} ${VARIANTES[variante]} ${TAILLES[taille]}`;
