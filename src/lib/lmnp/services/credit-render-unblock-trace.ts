/**
 * Timing trace from amortization conflict dispatch until showAnimation clears.
 * Logger: [credit-render-unblock]
 */

export type CreditRenderUnblockAnchor = {
  documentId: string;
  originStep: string;
  anchoredAt: number;
};

let anchor: CreditRenderUnblockAnchor | null = null;
let order = 0;

export function getCreditRenderUnblockAnchor(): CreditRenderUnblockAnchor | null {
  return anchor;
}

export function msSinceCreditRenderUnblockAnchor(): number | null {
  if (!anchor) return null;
  return performance.now() - anchor.anchoredAt;
}

export function resetCreditRenderUnblockAnchor(): void {
  anchor = null;
  order = 0;
  traceCreditRenderUnblock("anchor_reset", {});
}

/** Call once per upload analysis at conflict dispatch (does not reset if already anchored). */
export function markCreditRenderUnblockAnchor(originStep: string, documentId: string): void {
  if (!anchor) {
    anchor = {
      documentId,
      originStep,
      anchoredAt: performance.now(),
    };
    order = 0;
  }
  traceCreditRenderUnblock("anchor_marked", { originStep, documentId });
}

export function traceCreditRenderUnblock(
  event: string,
  payload: Record<string, unknown> = {},
): void {
  order += 1;
  const msSinceAnchor = msSinceCreditRenderUnblockAnchor();
  console.log("[credit-render-unblock]", {
    order,
    event,
    at: new Date().toISOString(),
    msSinceAnchor,
    anchorDocumentId: anchor?.documentId ?? null,
    anchorOriginStep: anchor?.originStep ?? null,
    ...payload,
  });
}

export function measureCreditRenderUnblockSync<T>(
  label: string,
  fn: () => T,
  extra?: Record<string, unknown>,
): T {
  const startedAt = performance.now();
  try {
    return fn();
  } finally {
    if (anchor) {
      traceCreditRenderUnblock(`sync_${label}`, {
        durationMs: Math.round((performance.now() - startedAt) * 100) / 100,
        ...extra,
      });
    }
  }
}

export async function measureCreditRenderUnblockAwait<T>(
  label: string,
  promise: Promise<T>,
  extra?: Record<string, unknown>,
): Promise<T> {
  const startedAt = performance.now();
  try {
    return await promise;
  } finally {
    if (anchor) {
      traceCreditRenderUnblock(`await_${label}`, {
        durationMs: Math.round((performance.now() - startedAt) * 100) / 100,
        ...extra,
      });
    }
  }
}

/** Log a runAnalysis segment even before conflict anchor exists. */
export function traceCreditRunAnalysisSegment(
  label: string,
  extra?: Record<string, unknown>,
): void {
  order += 1;
  console.log("[credit-render-unblock]", {
    order,
    event: `runAnalysis_${label}`,
    at: new Date().toISOString(),
    msSinceAnchor: msSinceCreditRenderUnblockAnchor(),
    ...extra,
  });
}
