import { NextResponse } from "next/server";

import { buildClientSummaryDocument } from "@/lib/lmnp/services/declaration/build-client-summary-document";
import { resolveFinalDeclarabilityState } from "@/lib/lmnp/services/declaration/final-declarability";
import { renderAide2042Pdf } from "@/lib/lmnp/services/declaration/render-aide-2042-pdf";
import {
  defaultResolveDeliveryAccess,
  type DeliveryAccessResolver,
} from "@/lib/lmnp/services/payment/delivery-access";
import { assembleLiasseFromRfs } from "@/runtime/capabilities/rfs/projection/assemble-liasse-from-rfs";
import type { FiscalRepresentation } from "@/runtime/capabilities/rfs/types";

/**
 * Payment V1 — livraison finale de l'aide 2042-C-PRO, servie par le serveur
 * comme le Cerfa : AUTH → PROPRIÉTÉ → ENTITLEMENT PAYÉ → DÉCLARABILITÉ → PDF.
 * Le rendu (jsPDF) et le contenu (`buildClientSummaryDocument`) sont inchangés :
 * seul l'endroit où ils s'exécutent change, pour qu'aucun téléchargement final
 * ne contourne le paiement.
 */
type RequestBody = {
  rfs?: unknown;
  activityStartDate?: unknown;
  authToken?: unknown;
  dossierId?: unknown;
  fiscalYear?: unknown;
};

export async function handleAide2042PdfRequest(
  request: Request,
  resolveAccess: DeliveryAccessResolver = defaultResolveDeliveryAccess,
) {
  let body: RequestBody;
  try {
    body = (await request.json()) as RequestBody;
  } catch {
    return NextResponse.json({ error: "Corps de requête JSON invalide." }, { status: 400 });
  }
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Corps de requête JSON invalide." }, { status: 400 });
  }

  const access = await resolveAccess({
    authToken: body.authToken,
    dossierId: body.dossierId,
    fiscalYear: body.fiscalYear,
    fiscalYearOpening: (body as { fiscalYearOpening?: unknown }).fiscalYearOpening,
  });
  if (!access.ok) return access.response;

  const rfs = body.rfs;
  if (!rfs || typeof rfs !== "object") {
    return NextResponse.json({ error: "rfs requis (FiscalRepresentation)." }, { status: 400 });
  }
  const typedRfs = rfs as FiscalRepresentation;
  if (access.fiscalYear !== undefined && typedRfs.exercice !== access.fiscalYear) {
    return NextResponse.json(
      { error: "La déclaration ne correspond pas à l'exercice payé.", code: "fiscal_year_mismatch" },
      { status: 403 },
    );
  }

  try {
    if (!resolveFinalDeclarabilityState(assembleLiasseFromRfs(typedRfs)).deliverable) {
      return NextResponse.json({ status: "blocked", reason: "internal_projection_issue" }, { status: 422 });
    }
    const activityStartDate = typeof body.activityStartDate === "string" ? body.activityStartDate : undefined;
    const doc = renderAide2042Pdf(buildClientSummaryDocument(typedRfs, { activityStartDate }));
    return new NextResponse(new Uint8Array(doc.output("arraybuffer")), {
      status: 200,
      headers: { "Content-Type": "application/pdf" },
    });
  } catch (err) {
    console.error("[api/lmnp/declaration/aide-2042-pdf]", err);
    return NextResponse.json({ error: "Erreur serveur lors de la génération du PDF." }, { status: 500 });
  }
}
