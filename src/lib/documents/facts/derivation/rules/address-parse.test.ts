import assert from "node:assert/strict";

import { parseAddressComponents } from "./address-parse";

function run(name: string, fn: () => void) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
  } catch (error) {
    console.error(`  ✗ ${name}`);
    throw error;
  }
}

console.log("address-parse.test.ts");

run("splits city and country on single-line headquarters address", () => {
  const parsed = parseAddressComponents("353 RUE DE PREMARCHAND 33140 CADAUJAC FRANCE");

  assert.equal(parsed.line, "353 RUE DE PREMARCHAND");
  assert.equal(parsed.postalCode, "33140");
  assert.equal(parsed.city, "CADAUJAC");
  assert.equal(parsed.country, "FRANCE");
});

run("keeps multiline establishment address parsing unchanged", () => {
  const parsed = parseAddressComponents("353 RUE DE PREMARCHAND\n33140 , CADAUJAC - FRANCE");

  assert.equal(parsed.line, "353 RUE DE PREMARCHAND");
  assert.equal(parsed.postalCode, "33140");
  assert.equal(parsed.city, "CADAUJAC");
  assert.equal(parsed.country, "FRANCE");
});

console.log("All address-parse tests passed.");
