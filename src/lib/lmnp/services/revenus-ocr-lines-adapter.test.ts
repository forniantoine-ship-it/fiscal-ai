import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { adaptGptLinesToRevenueRawLines } from "./revenus-ocr-lines-adapter";
import { hashDocumentContent } from "./revenue-batch-hash";
import type { LmnpDocument } from "../types";
import type { RevenusGptLine } from "@/lib/documents/gpt/schemas/revenus-lines.schema";

/**
 * Cycle 17 — P4 : sourceFileName était posé sur le chemin Excel/CSV (Cycle
 * 15B) mais jamais sur le chemin OCR/vision/documentaire (GPT fallback), qui
 * produit ses RevenueRawLine via adaptGptLinesToRevenueRawLines. Sans nom de
 * fichier, hashDocumentContent ne pouvait pas distinguer "même document
 * réimporté" de "deux documents différents aux transactions identiques par
 * coïncidence" — les deux produisaient la même empreinte.
 */
function baseDocument(fileName: string): LmnpDocument {
  return {
    id: "doc-1",
    fileName,
    category: "revenus",
    status: "uploaded",
  } as LmnpDocument;
}

function gptLine(overrides: Partial<RevenusGptLine> = {}): RevenusGptLine {
  return {
    date: "10/06/2025",
    label: "Loyer juin",
    amount: 1000,
    direction: "credit",
    confidence: 90,
    isSummaryRow: false,
    ...overrides,
  } as RevenusGptLine;
}

describe("Cycle 17 — P4 : sourceFileName sur le chemin OCR/vision", () => {
  it("adaptGptLinesToRevenueRawLines pose sourceFileName sur chaque ligne produite", () => {
    const document = baseDocument("quittance-juin.pdf");
    const [line] = adaptGptLinesToRevenueRawLines([gptLine()], document, "rent_receipt");
    assert.equal(line!.sourceFileName, "quittance-juin.pdf");
  });

  it("deux documents de contenu identique mais de noms différents produisent des empreintes différentes (jamais fusionnés à tort)", () => {
    const lineTemplate = gptLine();
    const linesA = adaptGptLinesToRevenueRawLines([lineTemplate], baseDocument("quittance-A.pdf"), "rent_receipt");
    const linesB = adaptGptLinesToRevenueRawLines([lineTemplate], baseDocument("quittance-B.pdf"), "rent_receipt");

    const hashA = hashDocumentContent(linesA);
    const hashB = hashDocumentContent(linesB);
    assert.notEqual(hashA, hashB, "deux documents distincts (noms différents) ne doivent jamais partager la même empreinte");
  });

  it("le même document (même nom, même contenu) produit la même empreinte (dédup toujours fonctionnelle)", () => {
    const lineTemplate = gptLine();
    const linesA = adaptGptLinesToRevenueRawLines([lineTemplate], baseDocument("quittance-A.pdf"), "rent_receipt");
    const linesA2 = adaptGptLinesToRevenueRawLines([lineTemplate], baseDocument("quittance-A.pdf"), "rent_receipt");

    assert.equal(hashDocumentContent(linesA), hashDocumentContent(linesA2));
  });
});
