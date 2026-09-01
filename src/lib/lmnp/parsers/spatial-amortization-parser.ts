/**
 * @deprecated Use `spatial-amortization-node.ts` (CLI) or `spatial-amortization-browser.ts` (upload).
 * Legacy CLI entry only — do not import from client or server app code.
 *
 *   npx tsx src/lib/lmnp/parsers/spatial-amortization-parser.ts path/to/amortization.pdf
 */

import { parseSpatialAmortizationPdf } from "./spatial-amortization-node";

const LOG_PREFIX = "[spatial-amortization-parser]";

function readPdfPathFromCli(): string {
  const pdfPath = process.argv[2];
  if (!pdfPath) {
    throw new Error(
      "Provide a PDF file path.\n" +
        "  npx tsx src/lib/lmnp/parsers/spatial-amortization-node.ts path/to/amortization.pdf",
    );
  }
  return pdfPath;
}

function isDirectExecution(): boolean {
  const entry = process.argv[1] ?? "";
  return entry.includes("spatial-amortization-parser");
}

if (isDirectExecution()) {
  const pdfPath = readPdfPathFromCli();
  parseSpatialAmortizationPdf(pdfPath).catch((error: unknown) => {
    console.error(LOG_PREFIX, "error", error);
    process.exitCode = 1;
  });
}
