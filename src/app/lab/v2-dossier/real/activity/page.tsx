import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { V3ActivityRoute } from "@/lab/v2-dossier/V3ActivityRoute";
import { isV3RealTestRouteEnabled } from "@/lab/v2-dossier/v3-real-route-access";

export const metadata: Metadata = {
  title: "Laboratoire V3.1 · Activité",
  robots: { index: false, follow: false },
};

export default function RealV2DossierActivityPage() {
  // R14.1's production gate applies here too — same lab surface as /lab/v2-dossier/real.
  if (process.env.NODE_ENV === "production" && !isV3RealTestRouteEnabled()) notFound();
  return <V3ActivityRoute />;
}
