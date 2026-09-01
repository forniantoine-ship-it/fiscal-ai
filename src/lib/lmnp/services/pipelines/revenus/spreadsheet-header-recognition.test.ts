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

// Cycle 17 — P7 (découvert via le classeur adversarial) : une colonne
// "Remboursement" ne matchait aucun champ ici (absente de FIELD_ALIASES.complement,
// alors que revenus-header-classification.ts la reconnaît déjà comme "autres
// revenus" côté PDF/OCR) — le montant disparaissait de l'extraction Excel/CSV
// sans aucune trace ni anomalie.
const gridC = [
  ["Mois", "Loyer", "Remboursement"],
  ["Février", "1000", "50"],
];
const auditC = recognizeSpreadsheetHeaders(gridC);
assert(auditC !== null, "grid C (avec colonne Remboursement) should match");
assert(auditC!.selectedMapping.complement?.rawHeader === "Remboursement", "remboursement column mapped to complement field");

// Cycle 18 — audit adversarial : "Garantie loyers impayés" (synonyme
// développé de GLI, sans le sigle) ne matchait aucun alias "indemnity" et se
// faisait absorber par le champ "rent" via includes("loyer") à 85 — un
// versement d'assurance classé comme loyer. Vérifie aussi qu'une colonne
// "Loyer" séparée, présente en même temps, ne fait JAMAIS gagner "Garantie
// loyers impayés" sur les deux champs simultanément (double-comptage).
const gridD = [
  ["Mois", "Loyer", "Garantie loyers impayés"],
  ["Janvier", "1000", "500"],
];
const auditD = recognizeSpreadsheetHeaders(gridD);
assert(auditD !== null, "grid D should match");
assert(auditD!.selectedMapping.rent?.rawHeader === "Loyer", "Loyer reste la colonne loyer");
assert(
  auditD!.selectedMapping.indemnityColumns?.some((c) => c.rawHeader === "Garantie loyers impayés") === true,
  "Garantie loyers impayés est reconnue comme indemnité",
);
assert(
  auditD!.selectedMapping.rent?.rawHeader !== "Garantie loyers impayés",
  "Garantie loyers impayés ne doit jamais être ÉGALEMENT sélectionnée comme colonne loyer (double-comptage)",
);

console.log("[spreadsheet-header-recognition.test] all assertions passed");
