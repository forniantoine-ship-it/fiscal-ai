/**
 * Taxe foncière parser tests.
 * Run: npm run test:taxe-fonciere-parser
 */
import { parseTaxeFonciereDocument } from "./parse-taxe-fonciere-document";
import { TAXE_FONCIERE_AMOUNT_FIELD } from "./taxe-fonciere-field-orchestration";

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

function assertClose(actual: number, expected: number, message: string): void {
  if (Math.abs(actual - expected) > 0.001) {
    throw new Error(`${message}: expected ${expected}, got ${actual}`);
  }
}

const TEXT_HEAVY_FIXTURE = `
Direction générale des Finances publiques
Avis de taxe foncière — Année 2025
Commune de Lyon
Propriétés bâties
Valeur locative cadastrale : 8 200 EUR
Net à payer : 1 245,50 EUR
`;

const TABLE_HEAVY_FIXTURE = `
DGFiP — Impôts locaux 2025
Commune de Bordeaux
Ligne impôt    Base        Taux    Montant
TF bâti        4200        12%     504,00
TEOM           180         8%      14,40
Total des impôts à payer                 518,40 EUR
`;

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

  console.log("\n[taxe-fonciere-parser] unit tests\n");

  test("text-heavy — selects net à payer over cadastral base", () => {
    const { data, amountFieldRanking } = parseTaxeFonciereDocument(TEXT_HEAVY_FIXTURE, {
      logTraces: false,
    });
    assert(data !== null, "parse ok");
    assertClose(data!.montantPayable, 1245.5, "montant");
    assert(amountFieldRanking?.targetField === TAXE_FONCIERE_AMOUNT_FIELD, "target field");
    assert(
      (amountFieldRanking?.candidates.length ?? 0) >= 2,
      "multiple candidates",
    );
  });

  test("table-heavy — extracts payable total from fiscal table", () => {
    const { data } = parseTaxeFonciereDocument(TABLE_HEAVY_FIXTURE, { logTraces: false });
    assert(data !== null, "parse ok");
    assertClose(data!.montantPayable, 518.4, "montant");
  });

  test("empty OCR — no invented amount", () => {
    const { data, errors } = parseTaxeFonciereDocument("   ", { logTraces: false });
    assert(data === null, "no data");
    assert(errors.includes("empty_ocr_text"), "empty error");
  });

  return { passed, total };
}

const { passed, total } = runTests();
console.log(`\n[taxe-fonciere-parser] ${passed}/${total} passed\n`);
if (passed !== total) process.exit(1);
