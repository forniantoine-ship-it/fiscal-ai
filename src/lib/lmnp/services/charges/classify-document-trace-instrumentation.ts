/**
 * TEMPORARY — lightweight checkpoints for classifyDocument freeze diagnosis.
 * Remove once the blocking sub-stage is confirmed.
 */

let anchorMs = 0;
let lastMs = 0;

export function resetClassifyTraceClock(): void {
  anchorMs = performance.now();
  lastMs = anchorMs;
}

export function logClassifyTrace(
  stage: string,
  meta?: Record<string, number | string | boolean | null>,
): void {
  const now = performance.now();
  const elapsedMs = Math.round(now - anchorMs);
  const deltaMs = Math.round(now - lastMs);
  lastMs = now;

  console.log("[classify-trace]", {
    stage,
    elapsedMs,
    deltaMs,
    ...meta,
  });
}
