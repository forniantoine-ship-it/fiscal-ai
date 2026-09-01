/**
 * Cross-tunnel governed field prefill tests.
 * Run: npx tsx src/lib/documents/cross-tunnel-prefill.test.ts
 */
import {
  hydrateCreditFormFromGovernedFields,
  processGovernedExtraction,
  readGovernedFieldStore,
} from "@/lib/lmnp/services/governed-field-prefill";
import { lockGovernedField } from "@/lib/documents/cross-tunnel-prefill";
import type { DeclarationDraft } from "@/lib/lmnp/types";

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

function runTests(): { passed: number; total: number } {
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

  console.log("cross-tunnel-prefill");

  test("Step 1 — logement upload infers credit fields silently", () => {
    const draft: DeclarationDraft = { completedSteps: [] };

    const step1 = processGovernedExtraction({
      draft,
      sourceTunnel: "logement",
      documentId: "doc-offre-1",
      sourceDocument: "offre_pret",
      extractedBy: "gpt",
      payload: {
        loanAmount: 250_000,
        bankName: "Crédit Agricole",
      },
    });

    const loanMeta = step1.governedFields.loanPrincipal;
    const bankMeta = step1.governedFields.lenderName;

    assert(Boolean(loanMeta), "loanPrincipal stored");
    assert(Boolean(bankMeta), "lenderName stored");
    assert(loanMeta!.sourceTunnel === "logement", "sourceTunnel = logement");
    assert(loanMeta!.ownershipTunnel === "credit", "ownershipTunnel = credit");
    assert(loanMeta!.crossTunnelInferred === true, "crossTunnelInferred = true");
    assert(loanMeta!.manuallyValidated === false, "not manually validated");

    const creditForm = hydrateCreditFormFromGovernedFields({
      ...draft,
      governedFields: step1.governedFields,
    });
    assert(creditForm.loans[0]?.borrowedAmount === "250000", "prefills borrowedAmount");
    assert(creditForm.loans[0]?.bank === "Crédit Agricole", "prefills bank");
  });

  test("Step 2 — authoritative credit upload overwrites inferred values", () => {
    const draft: DeclarationDraft = {
      completedSteps: [],
      governedFields: processGovernedExtraction({
        draft: { completedSteps: [] },
        sourceTunnel: "logement",
        documentId: "doc-offre-1",
        sourceDocument: "offre_pret",
        extractedBy: "gpt",
        payload: { loanAmount: 250_000, bankName: "Crédit Agricole" },
      }).governedFields,
    };

    const step2 = processGovernedExtraction({
      draft,
      sourceTunnel: "credit",
      documentId: "doc-amort-1",
      sourceDocument: "loan_schedule",
      extractedBy: "gpt",
      payload: { loanAmount: 245_000 },
    });

    const loanMeta = step2.governedFields.loanPrincipal;
    assert(loanMeta!.value === 245_000, "loanPrincipal overwritten");
    assert(loanMeta!.sourceTunnel === "credit", "now sourced from credit tunnel");
    assert(loanMeta!.crossTunnelInferred === false, "no longer cross-tunnel inferred");
  });

  test("Step 3 — manually validated field blocks automatic overwrite", () => {
    let store = processGovernedExtraction({
      draft: { completedSteps: [] },
      sourceTunnel: "credit",
      documentId: "doc-1",
      sourceDocument: "loan_schedule",
      extractedBy: "gpt",
      payload: { loanAmount: 245_000 },
    }).governedFields;

    store = lockGovernedField(store, "loanPrincipal", 243_000);

    const blocked = processGovernedExtraction({
      draft: { completedSteps: [], governedFields: store },
      sourceTunnel: "credit",
      documentId: "doc-2",
      sourceDocument: "loan_schedule",
      extractedBy: "gpt",
      payload: { loanAmount: 240_000 },
    });

    assert(blocked.governedFields.loanPrincipal!.value === 243_000, "value locked at user edit");
    assert(blocked.governedFields.loanPrincipal!.manuallyValidated === true, "manuallyValidated set");
    assert(blocked.appliedFields.length === 0, "no fields applied on blocked overwrite");
  });

  test("Rule A — cross-tunnel only prefills empty fields", () => {
    const draft: DeclarationDraft = {
      completedSteps: [],
      creditFinancing: {
        loans: [
          {
            id: "loan-1",
            bank: "BNP",
            loanType: "amortissable",
            borrowedAmount: 200_000,
            rate: 2.1,
            durationMonths: 240,
            monthlyPayment: 1000,
            insurance: 50,
            fees: 0,
            startDate: "2020-01-01",
            firstPaymentDate: "2020-02-01",
            remainingCapital: 180_000,
          },
        ],
        summary: {
          fiscalYearLabel: "2024",
          annualInterest: 4000,
          annualInsurance: 600,
          annualFinancingCharges: 4600,
          remainingCapital: 180_000,
        },
        installments: [],
      },
    };

    const result = processGovernedExtraction({
      draft,
      sourceTunnel: "logement",
      documentId: "doc-offre-2",
      sourceDocument: "offre_pret",
      extractedBy: "gpt",
      payload: { loanAmount: 250_000 },
    });

    assert(result.appliedFields.length === 0, "does not store over existing form value");
    assert(result.governedFields.loanPrincipal === undefined, "loanPrincipal not stored");
  });

  test("readGovernedFieldStore hydrates from draft", () => {
    const draft: DeclarationDraft = {
      completedSteps: [],
      governedFields: {
        siren: {
          value: "123456789",
          sourceTunnel: "activite",
          sourceDocument: "inpi",
          extractedBy: "gpt",
          ownershipTunnel: "activite",
          manuallyValidated: false,
          updatedAt: "2026-01-01T00:00:00.000Z",
          crossTunnelInferred: false,
        },
      },
    };

    const store = readGovernedFieldStore(draft);
    assert(store.siren?.value === "123456789", "reads governed store");
  });

  return { passed, total };
}

const result = runTests();
console.log(`cross-tunnel-prefill: ${result.passed}/${result.total} passed`);
if (result.passed !== result.total) {
  process.exit(1);
}
