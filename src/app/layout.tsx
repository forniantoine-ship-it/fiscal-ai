import type { Metadata } from "next";
import { DM_Sans, Fraunces } from "next/font/google";
import type { CSSProperties } from "react";

import { brand } from "@/design-system/theme/colors";

import "./globals.css";

const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-display",
  weight: ["400", "500"],
  display: "swap",
});

const dmSans = DM_Sans({
  subsets: ["latin"],
  variable: "--font-sans",
  weight: ["400", "500", "600"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Fiscal AI — Votre déclaration LMNP, enfin simple",
  description:
    "Déposez vos documents. L'IA prépare automatiquement votre déclaration LMNP. Vérifiez simplement avant de générer votre liasse fiscale.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="fr"
      className={`${fraunces.variable} ${dmSans.variable}`}
      style={{
        "--brand-light-blue": brand.lightBlue,
        "--brand-moonstone": brand.moonstone,
        "--brand-saffron": brand.saffron,
        "--brand-gunmetal": brand.gunmetal,
      } as CSSProperties}
    >
      <body className="font-sans antialiased">{children}</body>
    </html>
  );
}
