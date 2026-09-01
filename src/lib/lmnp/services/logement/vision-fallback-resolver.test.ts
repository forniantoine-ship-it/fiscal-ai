import { resolveVisionFallback } from "./vision-fallback-resolver";

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

assert(
  !resolveVisionFallback({
    fileName: "acte-vente.pdf",
    documentIntent: "acquisition",
    invalidCorpusDetected: false,
    extractedTextLength: 5000,
    semanticExtractionSuccess: true,
    semanticNormalizedFieldCount: 3,
  }).activate,
  "healthy text path blocks vision",
);

assert(
  resolveVisionFallback({
    fileName: "acte-vente.pdf",
    documentIntent: "acquisition",
    invalidCorpusDetected: true,
    extractedTextLength: 0,
    semanticExtractionSuccess: false,
    semanticNormalizedFieldCount: 0,
    ocrFailureReason: "OCR failed",
  }).activate,
  "invalid corpus + OCR failure activates vision for acquisition",
);

assert(
  !resolveVisionFallback({
    fileName: "tableau-amortissement.pdf",
    documentIntent: "financing",
    invalidCorpusDetected: true,
    extractedTextLength: 0,
    semanticExtractionSuccess: false,
    semanticNormalizedFieldCount: 0,
    ocrFailureReason: "OCR failed",
  }).activate,
  "financing intent blocked from vision",
);

assert(
  !resolveVisionFallback({
    fileName: "loyers.xlsx",
    documentIntent: "acquisition",
    invalidCorpusDetected: false,
    extractedTextLength: 0,
    semanticExtractionSuccess: false,
    semanticNormalizedFieldCount: 0,
    isSpreadsheet: true,
  }).activate,
  "spreadsheet blocked from vision",
);

assert(
  resolveVisionFallback({
    fileName: "attestation-vente.pdf",
    documentIntent: "acquisition",
    invalidCorpusDetected: false,
    extractedTextLength: 200,
    semanticExtractionSuccess: false,
    semanticNormalizedFieldCount: 0,
    ocrQualityAcceptable: false,
  }).activate,
  "empty canonical extraction activates vision",
);

console.log("[test:vision-fallback-resolver] all assertions passed");
