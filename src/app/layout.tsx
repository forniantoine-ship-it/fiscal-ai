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
  title: "Fiscal AI — Votre déclaration LMNP, enfin simple",
  description:
    "Déposez vos documents, validez l’essentiel, générez votre déclaration LMNP. 149 € TTC, télétransmission EDI incluse.",
  keywords: [
    "déclaration LMNP",
    "liasse LMNP",
    "location meublée",
    "télétransmission EDI",
    "déclaration LMP",
  ],
  openGraph: {
    title: "Fiscal AI — Votre déclaration LMNP, enfin simple",
    description:
      "Un parcours guidé : documents, préparation automatique, validation, déclaration. 149 € TTC, EDI inclus.",
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
      <body className="min-h-screen antialiased">
        <div className="gradient-mesh min-h-screen">{children}</div>
      </body>
    </html>
  );
}
