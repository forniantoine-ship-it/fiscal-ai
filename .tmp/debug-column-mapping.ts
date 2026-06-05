import { loadSpatialPdfRows } from "../src/lib/lmnp/parsers/spatial-amortization-node";
import {
  collectGlobalHeaderMapping,
  computeColumnNumericStats,
  refineColumnRoleMapping,
  isProbableInstallmentRow,
  isTotalOrSubtotalRow,
} from "../src/lib/lmnp/parsers/spatial-amortization-core";

async function main() {
  const pdf =
    "/Users/forniantoine/Desktop/JEDECLAREMONMEUBLE/Déclaration appartement - Elsa BOUVARD/Tableau d'amortissement.pdf";
  const { rows } = await loadSpatialPdfRows(pdf);
  const dataRows = rows.filter((r) => isProbableInstallmentRow(r) && !isTotalOrSubtotalRow(r));
  const { mapping, detectedColumns } = collectGlobalHeaderMapping(rows);
  const stats = computeColumnNumericStats(dataRows);
  const global = refineColumnRoleMapping(mapping, stats, {});
  const amortMap = refineColumnRoleMapping(mapping, computeColumnNumericStats(dataRows.slice(50, 100)), {
    loanPhase: "amortization",
  });
  const defMap = refineColumnRoleMapping(mapping, computeColumnNumericStats(dataRows.slice(0, 20)), {
    loanPhase: "deferred",
  });

  console.log(JSON.stringify({ detectedColumns }, null, 2));
  for (const label of ["header", "global", "deferred", "amortization"] as const) {
    const m = label === "header" ? mapping : label === "global" ? global : label === "deferred" ? defMap : amortMap;
    console.log(
      label,
      Object.fromEntries([...m.entries()].sort((a, b) => a[0] - b[0])),
    );
  }
  for (const [idx, s] of [...stats.entries()].sort((a, b) => a[0] - b[0])) {
    console.log({
      col: idx,
      median: Math.round(s.median),
      zeroRatio: s.zeroRatio.toFixed(2),
      globalRole: global.get(idx),
      amortRole: amortMap.get(idx),
      defRole: defMap.get(idx),
    });
  }
}

main().catch(console.error);
