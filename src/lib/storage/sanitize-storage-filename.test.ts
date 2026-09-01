/**
 * Storage filename sanitizer tests.
 * Run: npx tsx src/lib/storage/sanitize-storage-filename.test.ts
 */
import {
  buildStorageObjectPath,
  sanitizeStorageFilename,
} from "@/lib/storage/sanitize-storage-filename";

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

  console.log("sanitize-storage-filename");

  test("removes accents and lowercases French loan offer filename", () => {
    assert(
      sanitizeStorageFilename("Offre de prêt MORLAIX Romain.pdf") ===
        "offre-de-pret-morlaix-romain.pdf",
      `got ${sanitizeStorageFilename("Offre de prêt MORLAIX Romain.pdf")}`,
    );
  });

  test("replaces spaces with hyphens", () => {
    assert(
      sanitizeStorageFilename("Tableau amortissement 2025.xlsx") ===
        "tableau-amortissement-2025.xlsx",
      "spaces normalized",
    );
  });

  test("strips unsafe characters", () => {
    assert(
      sanitizeStorageFilename('Acte (notarié) — copie #1.pdf') ===
        "acte-notarie-copie-1.pdf",
      "unsafe chars removed",
    );
  });

  test("preserves extension", () => {
    assert(
      sanitizeStorageFilename("scan.PDF") === "scan.pdf",
      "extension kept",
    );
  });

  test("handles ligatures", () => {
    assert(
      sanitizeStorageFilename("Cœur bœuf.pdf") === "coeur-boeuf.pdf",
      "ligatures transliterated",
    );
  });

  test("buildStorageObjectPath keeps display filename separate", () => {
    const original = "Offre de prêt MORLAIX Romain.pdf";
    const built = buildStorageObjectPath("user-123", original);
    assert(built.displayFilename === original, "display preserved");
    assert(
      built.storagePath.startsWith("user-123/") &&
        built.storagePath.endsWith("offre-de-pret-morlaix-romain.pdf"),
      `unexpected path ${built.storagePath}`,
    );
  });

  return { passed, total };
}

const result = runTests();
console.log(`sanitize-storage-filename: ${result.passed}/${result.total} passed`);
if (result.passed !== result.total) {
  process.exit(1);
}
