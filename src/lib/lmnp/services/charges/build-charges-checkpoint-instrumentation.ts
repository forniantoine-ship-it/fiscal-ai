/**
 * TEMPORARY — pinpoint checkpoints for buildChargesExtraction freeze diagnosis.
 * Remove once the blocking stage is identified.
 */

let lastCheckpointAt = 0;

export function logBuildChargesCheckpoint(
  checkpoint: string,
  meta?: Record<string, number | string | boolean>,
): void {
  const now = performance.now();
  const elapsedMs = lastCheckpointAt > 0 ? Math.round(now - lastCheckpointAt) : 0;
  lastCheckpointAt = now;

  console.log("[charges-build-checkpoint]", {
    checkpoint,
    elapsedMs,
    ts: Math.round(now),
    ...meta,
  });
}
