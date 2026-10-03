import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { V3PropertiesLabRoute } from "@/lab/v2-dossier/V3PropertiesLabRoute";
import { isV3RealTestRouteEnabled } from "@/lab/v2-dossier/v3-real-route-access";

export const metadata: Metadata = {
  title: "Laboratoire multi-biens · Mes biens",
  robots: { index: false, follow: false },
};

export default function RealV2DossierPropertiesLabPage() {
  // Même garde de production que /lab/v2-dossier/real : fermé par défaut, jamais lié depuis le parcours client.
  if (process.env.NODE_ENV === "production" && !isV3RealTestRouteEnabled()) notFound();
  return <V3PropertiesLabRoute />;
}
