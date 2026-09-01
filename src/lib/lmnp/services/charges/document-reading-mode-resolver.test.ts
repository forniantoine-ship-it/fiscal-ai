/**
 * DocumentReadingModeResolver tests.
 * Run: npm run test:document-reading-mode
 */
import { classifyChargeDocument } from "@/lib/lmnp/services/classify-charge-document";
import { detectDocumentStructureHints } from "./document-structure-signals";
import { resolveDocumentReadingMode } from "./document-reading-mode-resolver";

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

function assertEqual<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

const TAXE_FONCIERE_CORPUS = `
  AVIS DE TAXE FONCIERE 2024
  Direction generale des finances publiques
  Proprietes baties
  Valeur locative cadastrale 12 450 EUR
  Revenu cadastral 890 EUR
  Base d imposition 890 EUR
  Taux d imposition 25,53 %
  NET A PAYER 842,00 EUR
`;

const INSURANCE_NARRATIVE = `
  AXA ASSURANCE HABITATION
  Contrat multirisque habitation
  Prime annuelle TTC 428,50 EUR
  Responsabilite civile locative
  Periode du 01/01/2024 au 31/12/2024
`;

const EDF_INVOICE = `
  EDF
  Facture n 123456789
  Periode de consommation
  Total TTC 156,42 EUR
  TVA 20 % 26,07 EUR
  Net a payer 156,42 EUR
  Consommation 1 245 kWh
`;

const COPRO_TABLE = `
  SYNDIC COPROPRIETE LES OLIVIERS
  Appel de fonds charges courantes
  Entretien parties communes    120,00 EUR
  Eau froide                    45,00 EUR
  Ascenseur                     80,00 EUR
  Total appel de fonds           245,00 EUR
`;

// --- structure signals ---

const taxeHints = detectDocumentStructureHints(TAXE_FONCIERE_CORPUS);
assert(taxeHints.hasFiscalNoticeSignals, "taxe fonciere has fiscal signals");
assert(taxeHints.hasPayableSectionSignals, "taxe fonciere has payable section");
assert(taxeHints.hasFiscalMatrixSignals, "taxe fonciere has fiscal matrix");
assert(taxeHints.mixedLayoutSignals, "taxe fonciere is mixed layout");

const invoiceHints = detectDocumentStructureHints(EDF_INVOICE);
assert(invoiceHints.hasInvoiceStructure, "EDF has invoice structure");
assert(invoiceHints.hasPayableSectionSignals, "EDF has payable section");

const coproHints = detectDocumentStructureHints(COPRO_TABLE);
assert(coproHints.hasTabularLayout || coproHints.tableLineCount >= 1, "copro has tabular layout");

// --- reading mode resolution ---

const taxeDecision = resolveDocumentReadingMode({
  corpus: TAXE_FONCIERE_CORPUS,
  fileName: "taxe-fonciere-2024.pdf",
  chargeDocumentType: "taxe_fonciere",
});
assertEqual(taxeDecision.detectedReadingMode, "mixed_layout", "taxe fonciere mixed when matrix + payable");
assertEqual(taxeDecision.tableContainsTargetData, false, "fiscal matrix does not contain target");
assert(taxeDecision.semanticGuidanceEnabled, "taxe fonciere enables semantic guidance");
assert(
  taxeDecision.candidatePoolsSelected.includes("payable_section"),
  "taxe fonciere prioritizes payable section",
);

const insuranceDecision = resolveDocumentReadingMode({
  corpus: INSURANCE_NARRATIVE,
  fileName: "axa-assurance.pdf",
  chargeDocumentType: "insurance_habitation",
});
assertEqual(insuranceDecision.detectedReadingMode, "narrative_contract", "insurance is narrative");
assertEqual(insuranceDecision.dominantSource, "semantic", "insurance semantic dominant");
assert(insuranceDecision.semanticGuidanceEnabled, "insurance enables semantic guidance");

const invoiceDecision = resolveDocumentReadingMode({
  corpus: EDF_INVOICE,
  fileName: "edf-facture.pdf",
  chargeDocumentType: "facture_energie",
});
assertEqual(invoiceDecision.detectedReadingMode, "invoice", "EDF is invoice mode");
assertEqual(invoiceDecision.dominantSource, "hybrid", "invoice is hybrid");
assert(
  invoiceDecision.candidatePoolsSelected.includes("invoice_total"),
  "invoice prioritizes invoice_total pool",
);

const coproDecision = resolveDocumentReadingMode({
  corpus: COPRO_TABLE,
  fileName: "appel-fonds.pdf",
  chargeDocumentType: "charges_copropriete",
});
assertEqual(coproDecision.detectedReadingMode, "structured_table", "copro is structured table");
assertEqual(coproDecision.dominantSource, "parser", "copro parser dominant");
assert(!coproDecision.semanticGuidanceEnabled, "copro no semantic guidance");

// --- integration with classifier ---

const classified = classifyChargeDocument({
  rawText: TAXE_FONCIERE_CORPUS,
  fileName: "taxe-fonciere.pdf",
  logTraces: false,
});
const fromClassifier = resolveDocumentReadingMode({
  corpus: TAXE_FONCIERE_CORPUS,
  chargeDocumentType: classified.type,
});
assertEqual(fromClassifier.chargeDocumentType, classified.type, "preserves charge type");

console.log("[test:document-reading-mode] all assertions passed");
