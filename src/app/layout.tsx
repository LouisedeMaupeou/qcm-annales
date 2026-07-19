import type { Metadata } from "next";
import { Nunito } from "next/font/google";
import "./globals.css";
import { BandeauCookies } from "@/components/bandeau-cookies";

// next/font télécharge et sert la police depuis notre propre domaine. Le
// prototype la chargeait depuis fonts.googleapis.com, ce qui transmet l'IP du
// visiteur à Google avant tout consentement — précisément ce que le bandeau
// cookies est censé éviter (§8.6).
const nunito = Nunito({
  variable: "--font-nunito",
  subsets: ["latin"],
  weight: ["500", "700", "800", "900"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Admissible — Entraîne-toi sur les vraies annales des concours post-bac",
  description:
    "Des annales officielles des 6 grands concours post-bac, corrigées et expliquées, avec les vrais barèmes et ta progression matière par matière. Gratuit.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr" className={`${nunito.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col font-sans">
        {children}
        <BandeauCookies />
      </body>
    </html>
  );
}
