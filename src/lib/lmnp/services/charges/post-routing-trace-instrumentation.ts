/**
 * TEMPORARY — ultra-granular tracing between post_classify_routing and taxe parser entry.
 * Remove once freeze root cause is confirmed.
 */

import type { ChargeDocumentType } from "@/lib/lmnp/services/classify-charge-document";

export type PostRoutingTraceContext = {
  documentId: string;
  chargeType: ChargeDocumentType;
  corpusLength: number | null;
};

let anchorMs = 0;
let lastMs = 0;

export function resetPostRoutingTraceClock(): void {
  anchorMs = performance.now();
  lastMs = anchorMs;
}

export function logPostRoutingTrace(
  stage: string,
  ctx: PostRoutingTraceContext,
  extra?: Record<string, number | string | boolean | null>,
): void {
  const now = performance.now();
  const elapsedMs = Math.round(now - anchorMs);
  const deltaMs = Math.round(now - lastMs);
  lastMs = now;

  console.log("[post-routing-trace]", {
    stage,
    elapsedMs,
    deltaMs,
    documentId: ctx.documentId,
    chargeType: ctx.chargeType,
    corpusLength: ctx.corpusLength,
    ...extra,
  });
}
