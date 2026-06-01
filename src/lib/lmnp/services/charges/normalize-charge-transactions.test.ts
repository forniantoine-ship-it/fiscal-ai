/**
 * Charge transaction normalizer tests.
 * Run: npm run test:charge-normalizer
 */
import { parseCoproprieteDocument } from "./parse-copropriete-document";
import {
  INSURANCE_OCR_FIXTURES,
} from "./parse-insurance-document.fixtures";
import { parseInsuranceDocument } from "./parse-insurance-document";
import {
  NORMALIZER_RAW_FIXTURES,
  NORMALIZER_REJECT_FIXTURES,
} from "./normalize-charge-transactions.fixtures";
import {
  normalizeChargeTransaction,
  normalizeChargeTransactions,
  rawTransactionsFromCopro,
  rawTransactionsFromInsurance,
  resolveChargeCategory,
} from "./normalize-charge-transactions";

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

function assertClose(actual: number, expected: number, message: string): void {
  if (Math.abs(actual - expected) > 0.001) {
    throw new Error(`${message}: expected ${expected}, got ${actual}`);
  }
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

  console.log("\n[charge-normalizer] unit tests\n");

  test("resolveChargeCategory maps classifier aliases", () => {
    assertEqual(resolveChargeCategory("charges_copropriete"), "charges_copro", "copro");
    assertEqual(resolveChargeCategory("insurance_habitation"), "assurance_habitation", "insurance");
    assertEqual(resolveChargeCategory("inconnu"), null, "unknown");
  });

  test("normalizeChargeTransaction parses French amount strings", () => {
    const tx = normalizeChargeTransaction({
      category: "charges_copro",
      label: "CHARGES BATIMENT",
      amount: "128,40",
      sourceDocument: "test.pdf",
    });
    assert(tx !== null, "tx");
    assertClose(tx!.amount, 128.4, "amount");
    assertEqual(tx!.deductible, true, "deductible");
  });

  test("fonds_travaux and avance_tresorerie are never deductible", () => {
    const fonds = normalizeChargeTransaction({
      category: "fonds_travaux",
      label: "FONDS TRAVAUX",
      amount: 89.2,
      deductible: true,
      sourceDocument: "t.pdf",
    });
    assertEqual(fonds!.deductible, false, "fonds");

    const avance = normalizeChargeTransaction({
      category: "avance_tresorerie",
      label: "AVANCE",
      amount: 150,
      deductible: true,
      sourceDocument: "t.pdf",
    });
    assertEqual(avance!.deductible, false, "avance");
  });

  test("facture_artisan amortizable when durable label and amount >= 600", () => {
    const big = normalizeChargeTransaction({
      category: "facture_artisan",
      label: "Rénovation salle de bain complète",
      amount: 4500,
      sourceDocument: "artisan.pdf",
    });
    assertEqual(big!.amortizable, true, "amortizable");

    const small = normalizeChargeTransaction({
      category: "facture_artisan",
      label: "Rénovation salle de bain",
      amount: 400,
      sourceDocument: "artisan.pdf",
    });
    assertEqual(small!.amortizable, false, "small not amortizable");
  });

  test("rejects malformed date", () => {
    const tx = normalizeChargeTransaction({
      category: "taxe_fonciere",
      label: "Taxe foncière",
      amount: 1200,
      date: "invalid",
      sourceDocument: "tf.pdf",
    });
    assert(tx === null, "rejected");
  });

  for (const fixture of NORMALIZER_RAW_FIXTURES) {
    test(`fixture ${fixture.id}`, () => {
      const { transactions, rejected, traces } = normalizeChargeTransactions(
        fixture.raw,
        { logTraces: false },
      );
      assertEqual(transactions.length, fixture.expectedCount, "count");
      assertEqual(rejected.length, 0, "rejected");
      assert(traces.length > 0, "traces");
      for (const tx of transactions) {
        assert(tx.extractionConfidence >= 0 && tx.extractionConfidence <= 100, "confidence");
        assert(tx.sourceTrace.sourceDocument.length > 0, "trace");
        assert(tx.fiscalMetadata.expenseCategory.length > 0, "fiscal");
      }
    });
  }

  test("batch rejects invalid rows", () => {
    const { transactions, rejected } = normalizeChargeTransactions(
      NORMALIZER_REJECT_FIXTURES,
      { logTraces: false },
    );
    assertEqual(transactions.length, 0, "accepted");
    assertEqual(rejected.length, 3, "rejected");
  });

  test("pipeline: copro parser → normalizer", () => {
    const { transactions: copro } = parseCoproprieteDocument(
      `
      CHARGES COMMUNES GENERALES 100,00
      FONDS TRAVAUX 50,00
      AVANCE DE TRESORERIE 30,00
      TOTAL 180,00
    `,
      { sourceDocument: "pipe.pdf", logTraces: false },
    );
    const raw = rawTransactionsFromCopro(copro);
    const { transactions } = normalizeChargeTransactions(raw, { logTraces: false });
    assertEqual(transactions.length, 3, "count");
    const cats = transactions.map((t) => t.category).sort();
    assertEqual(
      cats.join(","),
      "avance_tresorerie,charges_copro,fonds_travaux",
      "categories",
    );
  });

  test("pipeline: insurance parser → normalizer", () => {
    const { data } = parseInsuranceDocument(INSURANCE_OCR_FIXTURES[0]!.rawText, {
      logTraces: false,
    });
    assert(data !== null, "insurance");
    const raw = rawTransactionsFromInsurance(data!, "axa.pdf", 90);
    const { transactions } = normalizeChargeTransactions(raw, { logTraces: false });
    assertEqual(transactions.length, 1, "one tx");
    assertEqual(transactions[0]!.category, "assurance_habitation", "category");
    assertEqual(transactions[0]!.periodeDebut, "01/01/2025", "debut");
    assertEqual(transactions[0]!.extractionConfidence, 90, "confidence");
  });

  test("preserves line-level source trace", () => {
    const { transactions } = normalizeChargeTransactions(
      [
        {
          category: "charges_copro",
          label: "CHARGES ESCALIER",
          amount: 42,
          sourceDocument: "elorn.pdf",
          lineIndex: 6,
          rawLine: "CHARGES ESCALIER 42,00",
        },
      ],
      { logTraces: false },
    );
    assertEqual(transactions[0]!.sourceTrace.lineIndex, 6, "lineIndex");
    assertEqual(transactions[0]!.sourceTrace.rawLine, "CHARGES ESCALIER 42,00", "rawLine");
  });

  const { passed: p, total: t } = { passed, total };
  console.log(`\n[charge-normalizer] ${p}/${t} passed\n`);
  if (p !== t) process.exit(1);
  return { passed: p, total: t };
}

runTests();
