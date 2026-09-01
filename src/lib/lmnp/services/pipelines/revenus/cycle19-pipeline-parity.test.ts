import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { runSpreadsheetRevenuePipeline } from "./spreadsheet-revenue-pipeline";
import { parseStructuredRevenueTable } from "@/lib/lmnp/services/revenus-structured-table-parser";
import { sessionFromPipelineLines, gridSummary } from "@/lib/lmnp/services/revenue-gpt-ui-prefill";
import { buildRevenusAssistantFromSession } from "@/lib/lmnp/services/revenus-upload-to-assistant-bridge";
import { produceFiscalResult } from "@/runtime/capabilities/f006/produce-fiscal-result";
import * as XLSX from "xlsx";
import type { RevenueRawLine } from "@/lib/lmnp/types";

const PROP = { id: "p1", label: "Bien", address: "1 rue", city: "Paris", postalCode: "75000" } as const;
const FY = 2025;

/**
 * Cycle 19 — parité inter-pipelines. Jeu de référence couvrant toutes les
 * natures de revenu (10 colonnes), poussé jusqu'à `produceFiscalResult()`
 * pour chaque pipeline réellement exécutable (Excel/CSV/ODS/texte libre
 * PDF-Documentaire-Vision). Le total exact du jeu de référence est 3100€
 * (1000+350+250+150+100+500+300+200+150+100) — chaque pipeline doit produire
 * EXACTEMENT ce montant, avec la MÊME répartition par nature.
 */
const REF_ROWS: (string | number)[][] = [
  ["Mois", "Date", "Loyer", "Airbnb", "Booking", "Abritel", "Vrbo", "GLI", "Visale", "Indemnité", "Remboursement", "CAF"],
  ["Janvier", "10/01/2025", 1000, 350, 250, 150, 100, 500, 300, 200, 150, 100],
];

async function toResult(lines: RevenueRawLine[]) {
  const session = sessionFromPipelineLines([PROP], FY, new Map([[PROP.id, lines]]), "ocr_lines");
  const grid = gridSummary(session).totalRevenue;
  const bridge = buildRevenusAssistantFromSession(session, FY, "2020-01-01");
  const f = produceFiscalResult({
    exerciceFiscal: FY,
    activite: { dateMiseEnService: "2020-01-01" },
    revenusAssistant: bridge.revenusAssistant,
    chargesAssistant: { exerciceFiscal: FY, totalDeductible: 0, totalPreExploitation: 0 },
    financementCharges: { exerciceFiscal: FY, totalChargesFinancementExercice: 0, totalInteretsPreExploitation: 0 },
    amortissementAssistant: { exerciceFiscal: FY, totalDotations: 0, status: "validated" },
    logementAmortissement: { computedAt: "2025-01-01T00:00:00.000Z" },
  });
  return { grid, revenusAssistant: bridge.revenusAssistant, f006: f.result?.recettes.total };
}

function assertReference(result: Awaited<ReturnType<typeof toResult>>, label: string) {
  assert.equal(result.grid, 3100, `${label} — grille`);
  assert.equal(result.revenusAssistant.totalRecettes, 3100, `${label} — totalRecettes`);
  assert.equal(result.revenusAssistant.loyersEncaisses, 1250, `${label} — loyersEncaisses (1000 loyer + 150 remboursement + 100 CAF)`);
  assert.equal(result.revenusAssistant.recettesPlateforme, 850, `${label} — recettesPlateforme (350+250+150+100)`);
  assert.equal(result.revenusAssistant.indemnitesAssurance, 1000, `${label} — indemnitesAssurance (500+300+200)`);
  assert.equal(result.f006, 3100, `${label} — F-006`);
}

describe("Cycle 19 — parité stricte entre pipelines (même jeu de référence, même résultat)", () => {
  it("Excel", async () => {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(REF_ROWS), "Feuil1");
    const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
    const file = new File([new Uint8Array(buf)], "ref.xlsx", {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    const result = await runSpreadsheetRevenuePipeline(
      { file, documentId: "d-xlsx", fileName: file.name, fiscalYear: FY, sourceType: "bank_statement" } as any,
      [],
    );
    assertReference(await toResult(result.lines), "Excel");
  });

  it("CSV", async () => {
    const csvText =
      "Mois,Date,Loyer,Airbnb,Booking,Abritel,Vrbo,GLI,Visale,Indemnité,Remboursement,CAF\n" +
      "Janvier,10/01/2025,1000,350,250,150,100,500,300,200,150,100\n";
    const file = new File([csvText], "ref.csv", { type: "text/csv" });
    const result = await runSpreadsheetRevenuePipeline(
      { file, documentId: "d-csv", fileName: file.name, fiscalYear: FY, sourceType: "bank_statement" } as any,
      [],
    );
    assertReference(await toResult(result.lines), "CSV");
  });

  it("ODS", async () => {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(REF_ROWS), "Feuil1");
    const buf = XLSX.write(wb, { type: "buffer", bookType: "ods" }) as Buffer;
    const file = new File([new Uint8Array(buf)], "ref.ods", {
      type: "application/vnd.oasis.opendocument.spreadsheet",
    });
    const result = await runSpreadsheetRevenuePipeline(
      { file, documentId: "d-ods", fileName: file.name, fiscalYear: FY, sourceType: "bank_statement" } as any,
      [],
    );
    assertReference(await toResult(result.lines), "ODS");
  });

  it("PDF structuré / Documentaire / Vision (texte libre, chemin partagé parseStructuredRevenueTable)", async () => {
    const text =
      "Janvier\nLoyer: 1000\nAirbnb: 350\nBooking: 250\nAbritel: 150\nVrbo: 100\n" +
      "GLI: 500\nVisale: 300\nIndemnité: 200\nRemboursement: 150\nCAF: 100";
    const parsed = parseStructuredRevenueTable(text, FY, "d-pdf", "documentary_pdf");
    assertReference(await toResult(parsed.lines), "PDF/Documentaire/Vision");
  });

  // OCR (repli GPT, adaptGptLinesToRevenueRawLines / requestRevenusGptExtraction) :
  // non testable ici — nécessite un appel réel à l'API GPT, indisponible dans cet
  // environnement de test. Le chemin structuré partagé (ci-dessus), qui s'exécute
  // AVANT tout repli GPT pour Documentaire/Vision/PDF, est en revanche vérifié.
});
