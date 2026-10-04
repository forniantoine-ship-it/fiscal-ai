import { NextResponse } from "next/server";

import { buildClientSummaryDocument } from "@/lib/lmnp/services/declaration/build-client-summary-document";
import { resolveFinalDeclarabilityState } from "@/lib/lmnp/services/declaration/final-declarability";
import { renderAide2042Pdf } from "@/lib/lmnp/services/declaration/render-aide-2042-pdf";
import {
  defaultResolveDeliveryAccess,
  type DeliveryAccessResolver,
} from "@/lib/lmnp/services/payment/delivery-access";
import { assembleLiasseFromRfs } from "@/runtime/capabilities/rfs/projection/assemble-liasse-from-rfs";
import type { MultiPropertyCapabilities } from "@/lib/lmnp/dossier/multi-property-activation";
import { resolveDeliveryAuthority, type DeliveryHandlerDeps } from "@/lib/lmnp/services/declaration/authoritative-delivery";

/**
 * Payment V1 — livraison finale de l'aide 2042-C-PRO, servie par le serveur
 * comme le Cerfa : AUTH → PROPRIÉTÉ → ENTITLEMENT PAYÉ → SNAPSHOT PERSISTÉ + `expectedRevision` → DOMAINE → GÉNÉRATION RECALCULÉE →
 * DÉCLARABILITÉ → PDF.
 *
 * MB-MULTI-SERVER-TRUST-2 — la RFS et la date de début d'activité viennent du dossier PERSISTÉ et du recalcul serveur, jamais du corps
 * de requête (qui ne porte plus que l'identité de la demande et la fraîcheur attendue). Même autorité que la route Cerfa
 * (`resolveDeliveryAuthority`) : mono et multi partagent la même architecture de confiance.
 */
type RequestBody = {
  authToken?: unknown;
  dossierId?: unknown;
  fiscalYear?: unknown;
  expectedRevision?: unknown;
};

export async function handleAide2042PdfRequest(
  request: Request,
  resolveAccess: DeliveryAccessResolver = defaultResolveDeliveryAccess,
  /** Tests uniquement : capacités multi injectées. En production, toujours `MULTI_PROPERTY_CAPABILITIES`. */
  multiPropertyCapabilities?: MultiPropertyCapabilities,
  /** Tests uniquement : lecteur de snapshot / pipeline injectés. En production : service role et pipeline réel. */
  deps: DeliveryHandlerDeps = {},
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
  });
  if (!access.ok) return access.response;

  // Une RFS multi supportée est, le jour de l'activation, celle de l'ACTIVITÉ consolidée (un seul 5NA/5NY) — jamais une RFS par bien.
  const authority = await resolveDeliveryAuthority(
    { dossierId: body.dossierId, fiscalYear: access.fiscalYear ?? body.fiscalYear, expectedRevision: body.expectedRevision },
    deps,
    multiPropertyCapabilities,
  );
  if (!authority.ok) return authority.response;
  const typedRfs = authority.rfs;

  try {
    if (!resolveFinalDeclarabilityState(assembleLiasseFromRfs(typedRfs)).deliverable) {
      return NextResponse.json({ status: "blocked", reason: "internal_projection_issue" }, { status: 422 });
    }
    const activityStartDate = authority.workspace.declarationDraft?.activityStartDate;
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
