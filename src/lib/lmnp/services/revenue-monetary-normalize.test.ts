import { normalizeMonetaryValue } from "./revenue-monetary-normalize";
import { parseMonetaryCellWithHeader } from "./revenus-column-semantics";

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

function assertAmount(raw: string, expected: number, label: string): void {
  const normalized = normalizeMonetaryValue(raw);
  assert(normalized?.parsedAmount === expected, `${label}: expected ${expected}, got ${normalized?.parsedAmount}`);
}

assertAmount("420,00 €", 420, "french comma decimal");
assertAmount("420.00 €", 420, "international dot decimal");
assertAmount("€420.00", 420, "leading euro");
assertAmount("1 200.50 €", 1200.5, "space thousands dot decimal");
assertAmount("1,200.50 €", 1200.5, "comma thousands dot decimal");
assertAmount("1200", 1200, "plain integer");
assertAmount("1.200,50 €", 1200.5, "european thousands comma decimal");

const parsed = parseMonetaryCellWithHeader("420.00 €", "Loyer mensuel", {
  monetaryHeaderOverride: true,
});
assert(parsed?.amount === 420, "parseMonetaryCellWithHeader international");

const parsedFrench = parseMonetaryCellWithHeader("420,00 €", "Loyer", {
  monetaryHeaderOverride: true,
});
assert(parsedFrench?.amount === 420, "parseMonetaryCellWithHeader french");

console.log("[revenue-monetary-normalize.test] all assertions passed");
