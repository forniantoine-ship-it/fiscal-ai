import {
  formatSpreadsheetMappingDebugBlock,
  normalizeSpreadsheetHeader,
  recognizeSpreadsheetHeaders,
} from "./spreadsheet-header-recognition";

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

// Header normalization
assert(normalizeSpreadsheetHeader(" Loyer (€) ") === "loyer", "strip punctuation and spaces");
assert(normalizeSpreadsheetHeader("Date paiement") === "date paiement", "keep inner spaces");
assert(normalizeSpreadsheetHeader("LOYER") === "loyer", "lowercase");

// Rent + month mapping
const gridA = [
  ["Mois", "Loyer mensuel", "Complément", "Date encaissement"],
  ["Janvier", "950", "120", "05/01/2025"],
  ["Février", "950", "", "03/02/2025"],
];

const auditA = recognizeSpreadsheetHeaders(gridA);
assert(auditA !== null, "grid A should match");
assert(auditA!.selectedMapping.rent?.matchedAlias === "loyer mensuel", "rent alias");
assert(auditA!.selectedMapping.rent?.confidenceScore >= 92, "rent score");
assert(auditA!.selectedMapping.month?.matchedField === "month", "month field");
assert(auditA!.selectedMapping.paymentDate?.matchedField === "paymentDate", "date field");

// Synonym headers without strict legacy names
const gridB = [
  ["Période", "Montant loyer", "Revenu complémentaire"],
  ["Mars", "1100", "50"],
];

const auditB = recognizeSpreadsheetHeaders(gridB);
assert(auditB !== null, "grid B should match");
assert(auditB!.selectedMapping.rent?.rawHeader === "Montant loyer", "montant loyer maps rent");

const debugBlock = formatSpreadsheetMappingDebugBlock(auditB!.selectedMapping);
assert(debugBlock.includes("rent ->"), "debug block lists rent");

console.log("[spreadsheet-header-recognition.test] all assertions passed");
