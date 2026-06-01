/**
 * Charges extraction builder tests (no mock categories).
 * Run: npm run test:charges-profile
 */
import {
  buildChargesExtraction,
  chargesFromDraft,
  isLegacyMockChargeLine,
  purgeLegacyMockCategories,
  shouldIncludeCrossStepRecovery,
} from "./charges-profile";
import type { ChargesCategoryData, Extraction, LmnpDocument } from "../types";

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

function assertEqual<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected) {
    throw new Error(
      `${message}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
    );
  }
}

function runTests(): void {
  let passed = 0;
  let total = 0;

  function test(name: string, fn: () => void): void {
    total++;
    try {
      fn();
      passed++;
      console.log(`  ✓ ${name}`);
    } catch (err) {
      console.error(`  ✗ ${name}`);
      console.error(`    ${err instanceof Error ? err.message : err}`);
    }
  }

  console.log("\n[charges-profile] unit tests\n");

  test("buildChargesExtraction without documents returns no upload categories", () => {
    const result = buildChargesExtraction([], undefined, {
      documents: [],
      extractions: [],
    });
    assertEqual(result.categories.length, 0, "categories");
    assertEqual(result.summary.totalCharges, 0, "total");
    assertEqual(result.summary.categoryCount, 0, "categoryCount");
    const uploadLines = result.categories.flatMap((c) =>
      c.lines.filter((l) => l.source === "upload"),
    );
    assertEqual(uploadLines.length, 0, "upload lines");
  });

  test("purgeLegacyMockCategories removes demo upload lines", () => {
    const categories: ChargesCategoryData[] = [
      {
        id: "cat-mock",
        category: "other",
        label: "Autres charges",
        annualTotal: 4650,
        lines: [
          {
            id: "l1",
            label: "Cuisine équipée",
            amount: 4200,
            recoverable: true,
            source: "upload",
          },
          {
            id: "l2",
            label: "Réfection salle de bain",
            amount: 450,
            recoverable: true,
            source: "upload",
          },
        ],
      },
    ];
    const purged = purgeLegacyMockCategories(categories);
    assertEqual(purged.length, 0, "purged empty");
    assert(isLegacyMockChargeLine({ id: "x", label: "Cuisine équipée", amount: 1, recoverable: true, source: "upload" }), "legacy");
  });

  test("recovery gated when charge documents uploaded", () => {
    const doc: LmnpDocument = {
      id: "doc-1",
      fiscalYearId: "fy",
      fileName: "pno.pdf",
      mimeType: "application/pdf",
      sizeBytes: 1,
      category: "charges",
      documentType: "insurance_invoice",
      status: "uploaded",
      uploadedAt: new Date().toISOString(),
    };
    const draft = {
      completedSteps: [],
      creditConfirmedAt: "2025-01-01",
      creditFinancing: {
        loans: [],
        summary: {
          fiscalYearLabel: "2025",
          annualInsurance: 114,
          annualInterest: 0,
          remainingCapital: 0,
        },
        installments: [],
      },
      chargesDocumentIds: [doc.id],
    } as import("../types").DeclarationDraft;

    assertEqual(
      shouldIncludeCrossStepRecovery(draft, [doc], draft.chargesDocumentIds),
      false,
      "gated off",
    );

    const built = buildChargesExtraction([], draft, {
      documents: [doc],
      extractions: [],
      chargeDocumentIds: draft.chargesDocumentIds,
      requireAnalyzedDocuments: true,
    });
    assertEqual(built.categories.length, 0, "no recovery while pending analysis");

    const restored = chargesFromDraft(
      {
        ...draft,
        chargesExtraction: built,
      },
      { documents: [doc] },
    );
    assert(
      !restored?.categories.some((c) => c.label.includes("Assurance emprunt")),
      "no credit in restored",
    );
  });

  test("buildChargesExtraction uses OCR extraction for insurance document", () => {
    const docId = "doc-insurance-1";
    const doc: LmnpDocument = {
      id: docId,
      fiscalYearId: "fy-1",
      fileName: "axa-pno-2025.pdf",
      mimeType: "application/pdf",
      sizeBytes: 1000,
      category: "charges",
      documentType: "insurance_invoice",
      status: "analyzed",
      uploadedAt: new Date().toISOString(),
    };
    const extractions: Extraction[] = [
      {
        id: "ext-1",
        documentId: docId,
        fiscalYearId: "fy-1",
        fieldKey: "expense.insurance",
        rawValue: "428.50 EUR",
        normalizedValue: { type: "money", amountCents: 42850, currency: "EUR" },
        confidence: 88,
        status: "pending_validation",
        displayLabel: "Assurance (PNO)",
        ocrFieldKey: "totalAmount",
      },
      {
        id: "ext-2",
        documentId: docId,
        fiscalYearId: "fy-1",
        fieldKey: "property.label",
        rawValue: "AXA ASSURANCE",
        normalizedValue: { type: "text", text: "AXA ASSURANCE" },
        confidence: 80,
        status: "pending_validation",
        ocrFieldKey: "supplierName",
      },
    ];

    const result = buildChargesExtraction([], undefined, {
      documents: [doc],
      extractions,
      chargeDocumentIds: [docId],
    });

    assert(result.categories.length >= 1, "at least one category");
    assertEqual(
      result.categories.some((c) => c.lines.some((l) => l.source === "upload")),
      true,
      "upload source",
    );
    assert(
      !result.categories.some((l) => l.label === "Avis taxe foncière 2025"),
      "no mock taxe fonciere",
    );
    assert(
      !result.categories.some((c) => c.category === "management_fees"),
      "no mock frais de gestion",
    );
    assert(result.summary.totalCharges > 0, "positive total from document");
  });

  const { passed: p, total: t } = { passed, total };
  console.log(`\n[charges-profile] ${p}/${t} passed\n`);
  if (p !== t) process.exit(1);
}

runTests();
