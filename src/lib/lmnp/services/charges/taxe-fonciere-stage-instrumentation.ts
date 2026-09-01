/**
 * TEMPORARY — stage checkpoints for property_tax C→D freeze diagnosis.
 * Remove once the blocking sub-stage is confirmed.
 */

let anchorMs = 0;
let lastMs = 0;

export function isTaxeFonciereInstrumentedDoc(doc: {
  documentType?: string;
  fileName?: string;
}): boolean {
  return (
    doc.documentType === "property_tax" ||
    Boolean(doc.fileName && /taxe|fonci[eè]re/i.test(doc.fileName))
  );
}

export function resetTaxeFonciereStageClock(): void {
  anchorMs = performance.now();
  lastMs = anchorMs;
}

export function logTaxeFonciereStage(
  stage: string,
  meta?: Record<string, number | string | boolean | null>,
): void {
  const now = performance.now();
  const elapsedMs = Math.round(now - anchorMs);
  const deltaMs = Math.round(now - lastMs);
  lastMs = now;

  console.log("[charges-taxe-stage]", {
    stage,
    elapsedMs,
    deltaMs,
    ...meta,
  });
}
