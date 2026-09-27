import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { V2Prototype } from "@/lab/v2-dossier/V2Prototype";

export const metadata: Metadata = {
  title: "Laboratoire V3.1 · L’Assistant du Réel",
  robots: { index: false, follow: false },
};

export default function V2DossierPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <V2Prototype />;
}
