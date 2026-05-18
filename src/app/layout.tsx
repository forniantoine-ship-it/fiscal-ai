import type { Metadata } from "next";
import { DM_Sans, Instrument_Serif } from "next/font/google";
import "./globals.css";

const dmSans = DM_Sans({
  variable: "--font-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const instrumentSerif = Instrument_Serif({
  variable: "--font-display",
  subsets: ["latin"],
  weight: "400",
});

export const metadata: Metadata = {
  title: "Fiscal AI — Optimisation fiscale intelligente en France",
  description:
    "Assistant IA pour réduire légalement vos impôts en France. Analyse personnalisée, dispositifs conformes au CGI et accompagnement expert.",
  keywords: [
    "optimisation fiscale",
    "impôts France",
    "assistant fiscal IA",
    "réduction impôts légale",
  ],
  openGraph: {
    title: "Fiscal AI — Optimisation fiscale intelligente",
    description:
      "Réduisez vos impôts légalement grâce à l'IA et l'expertise fiscale française.",
    locale: "fr_FR",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr" className={`${dmSans.variable} ${instrumentSerif.variable}`}>
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
