/**
 * TEMPORARY — per-line regex diagnostics inside countTableLikeLines.
 * Remove once freeze root cause is confirmed.
 */

const REGEX_SLOW_THRESHOLD_MS = 50;

export function logTableLineDebug(payload: Record<string, unknown>): void {
  console.log("[table-line-debug]", payload);
}

export function logRegexSlow(payload: {
  regexName: string;
  lineIndex: number;
  lineLength: number;
  elapsedMs: number;
  preview?: string;
}): void {
  console.log("[regex-slow]", payload);
}

export function timedRegexCall<T>(
  regexName: string,
  lineIndex: number,
  lineLength: number,
  preview: string,
  fn: () => T,
): T {
  const start = performance.now();
  const result = fn();
  const elapsedMs = Math.round(performance.now() - start);
  if (elapsedMs > REGEX_SLOW_THRESHOLD_MS) {
    logRegexSlow({
      regexName,
      lineIndex,
      lineLength,
      elapsedMs,
      preview: preview.slice(0, 120),
    });
  }
  return result;
}
