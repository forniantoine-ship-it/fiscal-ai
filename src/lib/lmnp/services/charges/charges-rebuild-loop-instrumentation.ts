/**
 * TEMPORARY — ultra-light rebuild loop diagnostics.
 * Remove once the post-analysis freeze root cause is confirmed.
 */

export type ChargesRebuildDiagPhase = "build" | "apply" | "persist";

export type ChargesRebuildDiagOutcome =
  | "skipped_equal"
  | "skipped_fingerprint"
  | "skipped_apply_equal"
  | "dispatched";

let rebuildCounter = 0;
let lastLogAt = 0;

function fpTag(fingerprint: string): string {
  let hash = 0;
  for (let i = 0; i < fingerprint.length; i += 1) {
    hash = (hash * 31 + fingerprint.charCodeAt(i)) | 0;
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

export function resetChargesRebuildDiag(): void {
  rebuildCounter = 0;
  lastLogAt = 0;
}

export function logChargesRebuildDiag(payload: {
  phase: ChargesRebuildDiagPhase;
  source: string;
  fingerprint?: string;
  prevFingerprint?: string | null;
  outcome?: ChargesRebuildDiagOutcome;
}): void {
  const now = performance.now();
  const deltaMs = lastLogAt > 0 ? Math.round(now - lastLogAt) : 0;
  lastLogAt = now;
  rebuildCounter += 1;

  const fingerprint = payload.fingerprint;
  const prevFingerprint = payload.prevFingerprint ?? undefined;
  const fp = fingerprint ? fpTag(fingerprint) : undefined;
  const prevFp = prevFingerprint ? fpTag(prevFingerprint) : undefined;

  console.log("[charges-rebuild-diag]", {
    n: rebuildCounter,
    deltaMs,
    phase: payload.phase,
    source: payload.source,
    fp,
    prevFp,
    fpStable:
      fingerprint && prevFingerprint !== undefined
        ? fingerprint === prevFingerprint
        : undefined,
    outcome: payload.outcome,
  });
}
