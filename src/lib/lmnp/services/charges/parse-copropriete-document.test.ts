/**
 * Copropriété parser tests (fixtures + fiscal rules).
 * Run: npm run test:copro-parser
 */
import {
  COPRO_OCR_FIXTURES,
  COPRO_OCR_SKIP_FIXTURES,
} from "./parse-copropriete-document.fixtures";
import {
  classifyCoproLabel,
  normalizeCoproTransaction,
  parseCoproprieteDocument,
  type CoproParsedTransaction,
} from "./parse-copropriete-document";

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

function assertTransactionEqual(
  actual: CoproParsedTransaction,
  expected: CoproParsedTransaction,
  prefix: string,
): void {
  assertEqual(actual.category, expected.category, `${prefix} category`);
  assertEqual(actual.label, expected.label, `${prefix} label`);
  assertClose(actual.amount, expected.amount, `${prefix} amount`);
  assertEqual(actual.deductible, expected.deductible, `${prefix} deductible`);
  assertEqual(actual.amortizable, expected.amortizable, `${prefix} amortizable`);
  assertEqual(actual.sourceDocument, expected.sourceDocument, `${prefix} sourceDocument`);
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

  console.log("\n[copro-parser] unit tests\n");

  test("classifyCoproLabel separates fonds travaux from charges", () => {
    assertEqual(classifyCoproLabel("FONDS TRAVAUX (ALUR)"), "fonds_travaux", "fonds");
    assertEqual(classifyCoproLabel("CHARGES BATIMENT"), "charges_copro", "batiment");
    assertEqual(classifyCoproLabel("AVANCE DE TRESORERIE"), "avance_tresorerie", "avance");
  });

  test("normalizeCoproTransaction: avance not deductible", () => {
    const tx = normalizeCoproTransaction({
      label: "AVANCE DE TRESORERIE",
      amount: 150,
      sourceDocument: "test.pdf",
    });
    assert(tx !== null, "tx");
    assertEqual(tx!.deductible, false, "deductible");
    assertEqual(tx!.category, "avance_tresorerie", "category");
  });

  test("normalizeCoproTransaction: charges_copro deductible", () => {
    const tx = normalizeCoproTransaction({
      label: "CHARGES COMMUNES GENERALES",
      amount: 245.6,
      sourceDocument: "test.pdf",
    });
    assert(tx !== null, "tx");
    assertEqual(tx!.deductible, true, "deductible");
    assertEqual(tx!.amortizable, false, "amortizable");
  });

  test("normalizeCoproTransaction: fonds_travaux not deductible", () => {
    const tx = normalizeCoproTransaction({
      label: "FONDS DE TRAVAUX",
      amount: 89.2,
      category: "fonds_travaux",
      sourceDocument: "test.pdf",
    });
    assert(tx !== null, "tx");
    assertEqual(tx!.deductible, false, "deductible");
    assertEqual(tx!.category, "fonds_travaux", "category");
  });

  for (const fixture of COPRO_OCR_FIXTURES) {
    test(`fixture ${fixture.id}: ${fixture.description}`, () => {
      const { transactions, traces, errors } = parseCoproprieteDocument(
        fixture.rawText,
        { sourceDocument: fixture.sourceDocument, logTraces: false },
      );

      assert(traces.length > 0, "traces required");
      assertEqual(transactions.length, fixture.expected.length, "transaction count");
      if (errors.length > 0 && fixture.expected.length > 0) {
        assert(false, `unexpected errors: ${errors.join(", ")}`);
      }

      for (let i = 0; i < fixture.expected.length; i++) {
        assertTransactionEqual(
          transactions[i]!,
          fixture.expected[i]!,
          `tx[${i}]`,
        );
      }
    });
  }

  test("fixture elorn: ignores TOTAL and SOUS-TOTAL lines", () => {
    const { transactions } = parseCoproprieteDocument(
      COPRO_OCR_FIXTURES[0]!.rawText,
      { logTraces: false },
    );
    const labels = transactions.map((t) => t.label.toUpperCase());
    assert(!labels.some((l) => l.startsWith("TOTAL")), "no total line");
    assert(!labels.some((l) => l.startsWith("SOUS-TOTAL")), "no sous-total");
  });

  test("fonds travaux not merged into charges_copro category", () => {
    const { transactions } = parseCoproprieteDocument(COPRO_OCR_FIXTURES[0]!.rawText, {
      logTraces: false,
    });
    const fonds = transactions.filter((t) => t.category === "fonds_travaux");
    const charges = transactions.filter((t) => t.category === "charges_copro");
    assertEqual(fonds.length, 1, "one fonds travaux");
    assertEqual(charges.length, 3, "three charges_copro");
  });

  for (const fixture of COPRO_OCR_SKIP_FIXTURES) {
    test(`skip fixture ${fixture.id}: no transactions from totals only`, () => {
      const { transactions, errors } = parseCoproprieteDocument(fixture.rawText, {
        sourceDocument: fixture.sourceDocument,
        logTraces: false,
      });
      assertEqual(transactions.length, 0, "empty transactions");
      assert(errors.length > 0, "errors present");
    });
  }

  test("parseCoproprieteDocument emits line-level traces", () => {
    const { traces } = parseCoproprieteDocument(COPRO_OCR_FIXTURES[0]!.rawText, {
      logTraces: false,
    });
    const steps = traces.map((t) => t.step);
    assert(steps.includes("lines"), "lines");
    assert(steps.includes("line-extract"), "line-extract");
    assert(steps.includes("transaction"), "transaction");
    assert(steps.includes("result"), "result");
  });

  const { passed: p, total: t } = { passed, total };
  console.log(`\n[copro-parser] ${p}/${t} passed\n`);
  if (p !== t) process.exit(1);
  return { passed: p, total: t };
}

runTests();
