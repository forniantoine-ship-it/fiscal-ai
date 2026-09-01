/**
 * TEMPORARY — post-classification parser routing checkpoints.
 * Remove once parser misrouting / freeze root cause is confirmed.
 */

import type { ChargeDocumentType } from "@/lib/lmnp/services/classify-charge-document";

let anchorMs = 0;
let lastMs = 0;

export function resetPostClassifyTraceClock(): void {
  anchorMs = performance.now();
  lastMs = anchorMs;
}

export function logPostClassifyTrace(
  stage: string,
  meta?: Record<string, number | string | boolean | null>,
): void {
  const now = performance.now();
  const elapsedMs = Math.round(now - anchorMs);
  const deltaMs = Math.round(now - lastMs);
  lastMs = now;

  console.log("[post-classify-trace]", {
    stage,
    elapsedMs,
    deltaMs,
    ...meta,
  });
}

export function selectedParserForChargeType(chargeType: ChargeDocumentType): string {
  if (chargeType === "insurance_habitation") return "insurance_habitation";
  if (
    chargeType === "charges_copropriete" ||
    chargeType === "fonds_travaux" ||
    chargeType === "avance_tresorerie"
  ) {
    return "copropriete";
  }
  if (chargeType === "taxe_fonciere") return "taxe_fonciere";
  if (chargeType === "inconnu") return "inconnu";
  return "fallback_ocr";
}
