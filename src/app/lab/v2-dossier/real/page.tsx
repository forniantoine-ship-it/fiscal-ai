import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { RealWorkspaceRoute } from "@/lab/v2-dossier/RealWorkspaceRoute";

export const metadata: Metadata = {
  title: "Laboratoire V3.1 · Dossier réel",
  robots: { index: false, follow: false },
};

export default function RealV2DossierPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <RealWorkspaceRoute />;
}
