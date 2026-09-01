/**
 * Insurance habitation parser tests (fixtures + edge cases).
 * Run: npm run test:insurance-parser
 */
import {
  INSURANCE_OCR_FIXTURES,
  INSURANCE_OCR_INVALID_FIXTURES,
} from "./parse-insurance-document.fixtures";
import {
  parseInsuranceDocument,
  type InsuranceChargeDocument,
} from "./parse-insurance-document";
import { parseFrenchCurrencyAmount, normalizeChargeDateValue } from "./charge-parse-utils";

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

  console.log("\n[insurance-parser] unit tests\n");

  test("parseFrenchCurrencyAmount accepts French spacing", () => {
    assertEqual(parseFrenchCurrencyAmount("428,50"), 428.5, "comma decimals");
    assertEqual(parseFrenchCurrencyAmount("1 234,56"), 1234.56, "thousands space");
    assertEqual(parseFrenchCurrencyAmount("512,00"), 512, "round euros");
  });

  test("parseFrenchCurrencyAmount rejects malformed values", () => {
    assertEqual(parseFrenchCurrencyAmount("ABC"), null, "letters");
    assertEqual(parseFrenchCurrencyAmount(""), null, "empty");
    assertEqual(parseFrenchCurrencyAmount("0,50"), null, "below min");
  });

  test("normalizeChargeDateValue handles textual months", () => {
    assertEqual(normalizeChargeDateValue("01 janvier 2025"), "01/01/2025", "janvier");
    assertEqual(normalizeChargeDateValue("31/12/2025"), "31/12/2025", "numeric");
  });

  for (const fixture of INSURANCE_OCR_FIXTURES) {
    test(`fixture ${fixture.id}: ${fixture.description}`, () => {
      const { data, errors, traces } = parseInsuranceDocument(fixture.rawText, {
        logTraces: false,
      });

      assert(data !== null, `expected data, errors=${errors.join(", ")}`);
      assert(traces.length > 0, "expected runtime traces");

      const doc = data as InsuranceChargeDocument;
      assertEqual(doc.type, "assurance_habitation", "type");
      assertEqual(doc.fournisseur, fixture.expected.fournisseur, "fournisseur");
      assertClose(doc.montantTTC, fixture.expected.montantTTC, "montantTTC");
      assertEqual(doc.periodeDebut, fixture.expected.periodeDebut, "periodeDebut");
      assertEqual(doc.periodeFin, fixture.expected.periodeFin, "periodeFin");
      assertEqual(doc.adresseBien, fixture.expected.adresseBien, "adresseBien");
      assertEqual(doc.deductible, fixture.expected.deductible, "deductible");
    });
  }

  for (const fixture of INSURANCE_OCR_INVALID_FIXTURES) {
    test(`invalid fixture ${fixture.id} returns null`, () => {
      const { data, errors } = parseInsuranceDocument(fixture.rawText, {
        logTraces: false,
      });
      assert(data === null, "expected null data");
      assert(errors.length > 0, "expected errors");
    });
  }

  test("parseInsuranceDocument emits traces on success", () => {
    const sample = INSURANCE_OCR_FIXTURES[0]!.rawText;
    const { traces } = parseInsuranceDocument(sample, { logTraces: false });
    const steps = traces.map((t) => t.step);
    assert(steps.includes("normalize"), "normalize trace");
    assert(steps.includes("amount"), "amount trace");
    assert(steps.includes("period"), "period trace");
    assert(steps.includes("result"), "result trace");
  });

  test("empty OCR returns empty_ocr_text error", () => {
    const { data, errors } = parseInsuranceDocument("   ", { logTraces: false });
    assert(data === null, "null data");
    assert(errors.includes("empty_ocr_text"), "empty error");
  });

  const { passed: p, total: t } = { passed, total };
  console.log(`\n[insurance-parser] ${p}/${t} passed\n`);
  if (p !== t) process.exit(1);
  return { passed: p, total: t };
}

runTests();
