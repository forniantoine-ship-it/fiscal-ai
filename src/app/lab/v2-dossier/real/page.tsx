import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { RealWorkspaceRoute } from "@/lab/v2-dossier/RealWorkspaceRoute";
import { readRequestedPropertyId, readV3ReturnQuery } from "@/lab/v2-dossier/correction-scope";
import { isV3RealTestRouteEnabled } from "@/lab/v2-dossier/v3-real-route-access";
import { readExplicitDossierId } from "@/lib/lmnp/dossier/explicit-dossier-id";

export const metadata: Metadata = {
  title: "Laboratoire V3.1 · Dossier réel",
  robots: { index: false, follow: false },
};

export default async function RealV2DossierPage({ searchParams }: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  // R14.1 — production stays blocked by default; only ENABLE_V3_REAL_TEST_ROUTE=true opens it.
  if (process.env.NODE_ENV === "production" && !isV3RealTestRouteEnabled()) notFound();
  const raw = await searchParams;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(raw)) {
    if (Array.isArray(value)) value.forEach(item => params.append(key, item));
    else if (value !== undefined) params.append(key, value);
  }
  // MB-MULTI-UX-1 — le bien actif vient de l'URL (source de vérité unique) ; valeur invalide = refus, jamais « le premier bien ».
  const requested = readRequestedPropertyId(params);
  return <RealWorkspaceRoute
    key={params.toString()}
    expectedReturn={requested.kind === "invalid" ? { kind: "invalid" } : readV3ReturnQuery(params)}
    requestedDossierId={readExplicitDossierId(params)}
    requestedPropertyId={requested.kind === "property" ? requested.propertyId : undefined}
  />;
}
