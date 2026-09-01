/**
 * TEMPORARY — granular tracing inside charge document reading-mode resolution.
 * Remove once freeze root cause is confirmed.
 */

export type ReadingModeTraceExtra = Record<string, number | string | boolean | null>;

let anchorMs = 0;
let lastMs = 0;

export function resetReadingModeTraceClock(): void {
  anchorMs = performance.now();
  lastMs = anchorMs;
}

export function countCorpusLines(corpus: string): number {
  if (!corpus) return 0;
  return corpus.split(/\n+/).length;
}

export function logReadingModeTrace(
  stage: string,
  corpusLength: number | null,
  extra?: ReadingModeTraceExtra,
): void {
  const now = performance.now();
  const elapsedMs = Math.round(now - anchorMs);
  const deltaMs = Math.round(now - lastMs);
  lastMs = now;

  console.log("[reading-mode-trace]", {
    stage,
    elapsedMs,
    deltaMs,
    corpusLength,
    ...extra,
  });
}
