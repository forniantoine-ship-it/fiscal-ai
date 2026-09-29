import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { V3Prototype } from "@/lab/v3-dossier/V3Prototype";

export const metadata: Metadata = {
  title: "Laboratoire V3 · L’Assistant du Réel",
  robots: { index: false, follow: false },
};

/**
 * Route isolée du LAB, jamais liée depuis la navigation réelle.
 * Données fictives ; aucun moteur, aucune persistance, aucun appel réseau.
 */
export default function V3DossierLabPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <V3Prototype />;
}
