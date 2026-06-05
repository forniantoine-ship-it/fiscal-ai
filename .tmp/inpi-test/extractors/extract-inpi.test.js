"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * Deterministic INPI extraction fixture tests.
 * Run: npx tsx src/lib/documents/extractors/extract-inpi.test.ts
 */
const extract_inpi_fixtures_1 = require("./extract-inpi.fixtures");
const result = (0, extract_inpi_fixtures_1.runExtractInpiFixtureTests)();
console.log(`extract-inpi fixtures: ${result.passed}/${result.total} passed`);
if (result.passed !== result.total) {
    process.exit(1);
}
