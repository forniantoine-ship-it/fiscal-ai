/**
 * Structured revenue table parser tests.
 * Run: npx tsx src/lib/lmnp/services/revenus-structured-table-parser.test.ts
 */
import { isDateLikeValue, looksLikeCalendarInteger } from "./revenus-column-semantics";
import { aggregateTransactionsToGrid } from "./revenue-transactions";
import { structuredLinesToTransactions } from "./revenue-transaction-pipeline";
import {
  coalesceAmountCurrencyTokens,
  isNormalizedMonetaryCell,
  splitTableRow,
} from "./revenus-table-row-tokens";
import { parseStructuredRevenueTable } from "./revenus-structured-table-parser";

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

function assertEqual<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

function assertDeepEqual(actual: unknown, expected: unknown, message: string): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${message}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

const LOYERS_PDF_OCR_TEXT = `Mois Loyer Date Complement Date
Janvier
Février
Mars 420,00 € 15/03/2025
Avril 420,00 € 08/04/2025 100,00 € 14/04/2025
Mai 420,00 € 08/05/2025 100,00 € 15/05/2025
Juin 420,00 € 10/06/2025 100,00 € 05/06/2025
Juillet 420,00 € 09/07/2025 100,00 € 09/07/2025
Aout 420,00 € 10/08/2025 100,00 € 04/08/2025
Septembre 420,00 € 08/09/2025 100,00 € 18/09/2025
Octobre 420,00 € 06/10/2025 100,00 € 09/10/2025
Novembre 420,00 € 06/11/2025 100,00 € 25/11/2025
Décembre 420,00 € 08/12/2025 100,00 € 05/12/2025`;

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

  console.log("revenus-table-row-tokens / splitTableRow");

  test("coalesces amount and € into one cell", () => {
    assertDeepEqual(
      splitTableRow("Avril 420,00 € 08/04/2025 100,00 € 14/04/2025", true),
      ["Avril", "420,00 €", "08/04/2025", "100,00 €", "14/04/2025"],
      "Avril row alignment",
    );
  });

  // TODO: future support for OCR-split thousands amounts (e.g. merge "1" + "250,50" + "€").
  test("preserves current behavior when OCR splits thousands across tokens", () => {
    assertDeepEqual(
      splitTableRow("Mai 1 250,50 € 08/05/2025", true),
      ["Mai", "1", "250,50 €", "08/05/2025"],
      "no multi-token thousands reconstruction yet",
    );
  });

  test("coalesces thousands when OCR keeps amount in one token", () => {
    assertDeepEqual(
      splitTableRow("Mai 1 250,50 € 08/05/2025".replace("1 250,50", "1250,50"), true),
      ["Mai", "1250,50 €", "08/05/2025"],
      "single-token thousands amount with €",
    );
  });

  test("leaves rows without currency suffix untouched", () => {
    assertDeepEqual(
      splitTableRow("Avril 420 08/04/2025 100", true),
      ["Avril", "420", "08/04/2025", "100"],
      "plain numeric cells without €",
    );
  });

  test("leaves already normalized monetary cells untouched", () => {
    assert(isNormalizedMonetaryCell("420,00 €"), "normalized euro cell");
    assertDeepEqual(
      coalesceAmountCurrencyTokens(["420,00 €", "08/04/2025"]),
      ["420,00 €", "08/04/2025"],
      "already normalized cell",
    );
  });

  test("does not double-coalesce normalized cells", () => {
    const once = coalesceAmountCurrencyTokens(["420,00", "€"]);
    const twice = coalesceAmountCurrencyTokens(once);
    assertDeepEqual(once, twice, "double coalesce is idempotent");
    assertDeepEqual(once, ["420,00 €"], "single coalesce result");
  });

  test("tolerates malformed OCR spacing before coalesce", () => {
    assertDeepEqual(
      splitTableRow("Avril  420,00   €   08/04/2025", true),
      ["Avril", "420,00 €", "08/04/2025"],
      "extra spaces between tokens",
    );
  });

  test("supports EUR suffix", () => {
    assertDeepEqual(
      splitTableRow("Avril 420,00 EUR 08/04/2025", true),
      ["Avril", "420,00 EUR", "08/04/2025"],
      "EUR suffix",
    );
  });

  test("supports EUR TTC suffix", () => {
    assertDeepEqual(
      splitTableRow("Avril 100,00 EUR TTC 08/04/2025", true),
      ["Avril", "100,00 EUR TTC", "08/04/2025"],
      "EUR TTC suffix",
    );
  });

  console.log("revenus-structured-table-parser / Loyers.pdf regression");

  test("maps loyer and complément for the same month row", () => {
    const parsed = parseStructuredRevenueTable(LOYERS_PDF_OCR_TEXT, 2025, "loyers-pdf", "excel");
    assert(parsed.detected, "structured table detected");
    const avrilLines = parsed.lines.filter((line) => line.monthLabel === "Avril");
    assertEqual(avrilLines.find((line) => line.sourceColumnHeader === "Loyer")?.amount, 420, "Avril loyer");
    assertEqual(
      avrilLines.find((line) => line.sourceColumnHeader === "Complément")?.amount,
      100,
      "Avril complément",
    );
  });

  test("keeps complément on autres revenus in the aggregated grid", () => {
    const parsed = parseStructuredRevenueTable(LOYERS_PDF_OCR_TEXT, 2025, "loyers-pdf", "excel");
    const grid = aggregateTransactionsToGrid(structuredLinesToTransactions(parsed.lines, 2025), 2025);
    const avril = grid.find((row) => row.monthKey === "2025-04");
    const octobre = grid.find((row) => row.monthKey === "2025-10");
    assertEqual(avril?.loyers, 420, "Avril loyers grid");
    assertEqual(avril?.autresRevenus, 100, "Avril autres revenus grid");
    assertEqual(octobre?.loyers, 420, "Octobre loyers grid");
    assertEqual(octobre?.autresRevenus, 100, "Octobre autres revenus grid");
  });

  test("maps complément via monthLabel when transaction date is missing", () => {
    const lines = parseStructuredRevenueTable(
      "Mois Loyer Date Complement Date\nAvril 420,00 € 08/04/2025 100,00 € 14/04/2025",
      2025,
      "loyers-pdf",
      "excel",
    ).lines.map((line) =>
      line.sourceColumnHeader === "Complément" ? { ...line, date: null } : line,
    );
    const grid = aggregateTransactionsToGrid(structuredLinesToTransactions(lines, 2025), 2025);
    const avril = grid.find((row) => row.monthKey === "2025-04");
    assertEqual(avril?.loyers, 420, "Avril loyers grid without complement date");
    assertEqual(avril?.autresRevenus, 100, "Avril autres revenus via monthLabel fallback");
  });

  test("never injects OCR dates into monetary line amounts", () => {
    const parsed = parseStructuredRevenueTable(LOYERS_PDF_OCR_TEXT, 2025, "loyers-pdf", "excel");
    for (const line of parsed.lines) {
      const rawAmount = String(line.amount);
      assert(!isDateLikeValue(rawAmount), `line amount looks like date: ${rawAmount}`);
      assert(!looksLikeCalendarInteger(rawAmount), `line amount looks calendar-like: ${rawAmount}`);
      assert(line.amount <= 50_000, `unreasonable amount: ${line.amount}`);
    }
  });

  test("header mapping stays stable for Loyers.pdf OCR header row", () => {
    const headerCells = splitTableRow("Mois Loyer Date Complement Date", true);
    assertDeepEqual(
      headerCells,
      ["Mois", "Loyer", "Date", "Complement", "Date"],
      "header cells",
    );
  });

  test("keeps empty months empty in the grid", () => {
    const parsed = parseStructuredRevenueTable(LOYERS_PDF_OCR_TEXT, 2025, "loyers-pdf", "excel");
    const grid = aggregateTransactionsToGrid(structuredLinesToTransactions(parsed.lines, 2025), 2025);
    const janvier = grid.find((row) => row.monthKey === "2025-01");
    const fevrier = grid.find((row) => row.monthKey === "2025-02");
    assertEqual(janvier?.loyers, 0, "Janvier loyers empty");
    assertEqual(janvier?.autresRevenus, 0, "Janvier autres revenus empty");
    assertEqual(fevrier?.loyers, 0, "Février loyers empty");
    assertEqual(fevrier?.autresRevenus, 0, "Février autres revenus empty");
  });

  test("Mars has loyer only because source OCR row has no complément", () => {
    const parsed = parseStructuredRevenueTable(LOYERS_PDF_OCR_TEXT, 2025, "loyers-pdf", "excel");
    const marsLines = parsed.lines.filter((line) => line.monthLabel === "Mars");
    assertEqual(marsLines.length, 1, "Mars line count");
    assertEqual(marsLines[0]?.sourceColumnHeader, "Loyer", "Mars only loyer in source");
    assertEqual(marsLines[0]?.amount, 420, "Mars loyer amount");
  });

  test("does not hallucinate values outside OCR rows", () => {
    const parsed = parseStructuredRevenueTable(LOYERS_PDF_OCR_TEXT, 2025, "loyers-pdf", "excel");
    const allowedAmounts = new Set([420, 100]);
    for (const line of parsed.lines) {
      assert(allowedAmounts.has(line.amount), `unexpected OCR amount: ${line.amount}`);
    }
  });

  // Cycle 19 — extractColumnAmounts (repli texte libre, atteint quand aucun
  // tableau structuré n'est détecté) avait son propre jeu de mots-clés,
  // indépendant du reste du système : "Airbnb"/"GLI"/"Visale"/"Remboursement"/
  // "CAF" etc. n'y étaient jamais reconnus — invisibles, sans anomalie, alors
  // que "Loyer" seul fonctionnait déjà. Reproduit avec un texte narratif
  // réaliste (un montant par ligne, aucun tableau à colonnes détecté).
  const FREE_TEXT_ALL_NATURES = `Janvier
Loyer: 1000
Airbnb: 350
Booking: 250
Abritel: 150
Vrbo: 100
GLI: 500
Visale: 300
Indemnité: 200
Remboursement: 150
CAF: 100`;

  test("Cycle 19 — le repli texte libre reconnaît désormais toutes les natures de revenu, pas seulement Loyer", () => {
    const parsed = parseStructuredRevenueTable(FREE_TEXT_ALL_NATURES, 2025, "narratif-1", "documentary_pdf");
    const total = parsed.lines.reduce((sum, line) => sum + line.amount, 0);
    assertEqual(total, 3100, "total des 10 natures de revenu");
    const headers = parsed.lines.map((l) => l.sourceColumnHeader).sort();
    assertDeepEqual(
      headers,
      ["Abritel", "Airbnb", "Booking", "GLI", "Indemnité", "Loyer", "Remboursement", "Visale", "Vrbo", "Complément"].sort(),
      "chaque nature doit produire sa propre ligne, aucune ne doit être absente",
    );
  });

  test("Cycle 19 — deux valeurs sur une même ligne texte libre restent correctement délimitées (non-régression)", () => {
    const parsed = parseStructuredRevenueTable(
      `Janvier\nLoyer: 1000 Airbnb: 350`,
      2025,
      "narratif-2",
      "documentary_pdf",
    );
    const loyer = parsed.lines.find((l) => l.sourceColumnHeader === "Loyer");
    const airbnb = parsed.lines.find((l) => l.sourceColumnHeader === "Airbnb");
    assertEqual(loyer?.amount, 1000, "loyer isolé, pas '1000 Airbnb'");
    assertEqual(airbnb?.amount, 350, "airbnb correctement délimité");
  });

  return { passed, total };
}

const result = runTests();
console.log(`revenus-structured-table-parser: ${result.passed}/${result.total} passed`);
if (result.passed !== result.total) {
  process.exit(1);
}
