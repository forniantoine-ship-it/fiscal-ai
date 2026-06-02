import { loadSpatialPdfRows } from "../spatial-amortization-node";
import { isProbableInstallmentRow, isTotalOrSubtotalRow } from "../spatial-amortization-core";
import { runAmortizationPipeline } from "./run-amortization-pipeline";

async function main(): Promise<void> {
  const pdfPath = process.argv[2] ?? ".tmp/spatial-bench/test.pdf";
  const { rows, totalPages } = await loadSpatialPdfRows(pdfPath);

  console.log("total rows", rows.length);
  const probable = rows.filter(
    (row) => !isTotalOrSubtotalRow(row) && isProbableInstallmentRow(row.columns),
  );
  console.log("probable on raw", probable.length);

  const result = runAmortizationPipeline(rows, {
    source: pdfPath,
    totalPages,
    enableDebugLogs: false,
  });

  console.log("pipeline installments", result.installments.length);
  const probableBucket = result.trace.stageB.reconstructedRows.filter((row) =>
    isProbableInstallmentRow(row.bucketColumns),
  );
  console.log("probable on bucket", probableBucket.length);
  if (probable.length > 0 && probableBucket.length === 0) {
    const rawIndex = rows.indexOf(probable[0]!);
    const recon = result.trace.stageB.reconstructedRows[rawIndex];
    console.log("raw sample columns", probable[0]!.columns);
    console.log("bucket sample", recon?.bucketColumns);
    console.log("aligned", recon?.bucketAligned);
  }
  console.log("stageD segments", result.trace.stageD.segments.length);
  console.log("stageE hypotheses", result.trace.stageE.hypotheses.length);
}

main().catch(console.error);
