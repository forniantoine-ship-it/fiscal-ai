/**
 * Deterministic INPI extraction fixture tests.
 * Run: npx tsx src/lib/documents/extractors/extract-inpi.test.ts
 */
import { runExtractInpiFixtureTests } from "./extract-inpi.fixtures";

const result = runExtractInpiFixtureTests();
console.log(`extract-inpi fixtures: ${result.passed}/${result.total} passed`);
if (result.passed !== result.total) {
  process.exit(1);
}
