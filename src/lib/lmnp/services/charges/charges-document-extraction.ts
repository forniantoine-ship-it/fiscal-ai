/**
 * Document-derived charges extraction (OCR extractions → classifier → parsers → normalizer).
 * No mock/demo categories.
 */

import type {
  ChargesCategoryData,
  ChargesExpenseLine,
  Extraction,
  LmnpDocument,
  Property,
} from "@/lib/lmnp/types/domain";
import type { NormalizedValue } from "@/lib/lmnp/types/values";
import type { ChargeDocumentType } from "@/lib/lmnp/services/classify-charge-document";
import { classifyChargeDocument } from "@/lib/lmnp/services/classify-charge-document";
import type { FieldKey } from "@/lib/lmnp/types/field-keys";
import {
  normalizeChargeTransactions,
  rawTransactionsFromCopro,
  rawTransactionsFromInsurance,
  rawTransactionsFromTaxeFonciere,
  type NormalizedChargeTransaction,
  type RawChargeTransaction,
} from "./normalize-charge-transactions";
import { parseCoproprieteDocument } from "./parse-copropriete-document";
import { parseInsuranceDocument } from "./parse-insurance-document";
import { parseTaxeFonciereDocument } from "./parse-taxe-fonciere-document";
import { logTaxeFonciereRuntime } from "./taxe-fonciere-runtime-debug";
import {
  buildChargeReadingOrchestrationContext,
  buildParserDispatchConfig,
  logChargeReadingOrchestration,
} from "./charge-reading-orchestrator";

const CHARGE_CATEGORY_UI_LABELS: Record<string, string> = {
  assurance_habitation: "Assurance habitation",
  charges_copro: "Charges copropriété",
  fonds_travaux: "Fonds de travaux",
  avance_tresorerie: "Avance de trésorerie",
  taxe_fonciere: "Taxe foncière",
  facture_artisan: "Facture artisan",
  facture_energie: "Facture énergie",
};

const FIELD_KEY_TO_CHARGE_TYPE: Partial<Record<FieldKey, string>> = {
  "expense.insurance": "assurance_habitation",
  "expense.propertyTax": "taxe_fonciere",
  "expense.condo": "charges_copro",
  "expense.worksDeductible": "facture_artisan",
  "expense.other": "facture_energie",
};

const DOCUMENT_TYPE_HINTS: Partial<Record<LmnpDocument["documentType"], string>> = {
  insurance_invoice: "assurance habitation prime annuelle",
  property_tax: "taxe fonciere avis imposition",
  condo_charges: "charges copropriete appel de fonds syndic",
  works_invoice: "facture artisan travaux",
};

/** Aligns with isChargesDocument — linked ids OR charge category/type/filename heuristics. */
function matchesChargeDocumentScope(
  doc: LmnpDocument,
  chargeDocumentIds?: string[],
): boolean {
  if (chargeDocumentIds?.includes(doc.id)) return true;
  return (
    doc.category === "charges" ||
    doc.documentType === "property_tax" ||
    doc.documentType === "insurance_invoice" ||
    doc.documentType === "condo_charges" ||
    doc.documentType === "works_invoice" ||
    /taxe|fonci[eè]re|assurance|syndic|copro|edf|cfe|gestion|comptab|internet|facture|charge/i.test(
      doc.fileName,
    )
  );
}

function eurosFromValue(value: NormalizedValue): number | null {
  if (value.type !== "money") return null;
  return Math.round(value.amountCents) / 100;
}

function dateFromValue(value: NormalizedValue): string | undefined {
  if (value.type !== "date") return undefined;
  return value.date;
}

export function buildClassifierCorpusFromExtractions(
  doc: LmnpDocument,
  docExtractions: Extraction[],
): string {
  if (doc.chargeParserCorpus?.trim()) {
    return [doc.fileName, DOCUMENT_TYPE_HINTS[doc.documentType] ?? "", doc.chargeParserCorpus]
      .filter(Boolean)
      .join("\n");
  }

  const parts = [doc.fileName, DOCUMENT_TYPE_HINTS[doc.documentType] ?? ""];
  for (const extraction of docExtractions) {
    if (extraction.displayLabel) parts.push(extraction.displayLabel);
    parts.push(extraction.rawValue);
  }
  return parts.filter(Boolean).join("\n");
}

function classifyDocument(doc: LmnpDocument, docExtractions: Extraction[]): ChargeDocumentType {
  const corpus = buildClassifierCorpusFromExtractions(doc, docExtractions);
  const result = classifyChargeDocument({
    rawText: corpus,
    fileName: doc.fileName,
    logTraces: false,
  });
  if (
    result.type === "taxe_fonciere" ||
    doc.documentType === "property_tax" ||
    /taxe|fonci[eè]re|avis.*imp[oô]t/i.test(doc.fileName)
  ) {
    logTaxeFonciereRuntime("taxe_fonciere_document_classification", {
      documentId: doc.id,
      fileName: doc.fileName,
      workspaceDocumentType: doc.documentType,
      detectedChargeType: result.type,
      classifierConfidence: result.confidence,
      corpusLength: corpus.length,
      corpusPreview: corpus.slice(0, 280),
      hasChargeParserCorpus: Boolean(doc.chargeParserCorpus?.trim()),
    });
  }
  if (result.type !== "inconnu") return result.type;
  if (doc.documentType === "unknown") return "inconnu";
  if (doc.documentType === "insurance_invoice") return "insurance_habitation";
  if (doc.documentType === "property_tax") return "taxe_fonciere";
  if (doc.documentType === "condo_charges") return "charges_copropriete";
  if (doc.documentType === "works_invoice") return "facture_artisan";
  return "inconnu";
}

function fallbackRawTransactions(
  doc: LmnpDocument,
  docExtractions: Extraction[],
  chargeType: string,
): RawChargeTransaction[] {
  const primary = docExtractions.find(
    (e) => e.normalizedValue.type === "money" && e.fieldKey.startsWith("expense."),
  ) ?? docExtractions.find((e) => e.normalizedValue.type === "money");

  if (!primary) return [];

  const amount = eurosFromValue(primary.normalizedValue);
  if (amount === null || amount <= 0) return [];

  const supplier = docExtractions.find((e) => e.ocrFieldKey === "supplierName");
  const dateExtraction = docExtractions.find(
    (e) => e.ocrFieldKey === "invoiceDate" || e.normalizedValue.type === "date",
  );

  const category =
    chargeType && chargeType !== "inconnu"
      ? chargeType
      : (FIELD_KEY_TO_CHARGE_TYPE[primary.fieldKey as FieldKey] ?? chargeType);

  return [
    {
      category,
      label:
        primary.displayLabel ??
        supplier?.rawValue ??
        doc.fileName.replace(/\.[^.]+$/, ""),
      amount,
      date: dateExtraction ? dateFromValue(dateExtraction.normalizedValue) : undefined,
      fournisseur:
        supplier?.normalizedValue.type === "text"
          ? supplier.normalizedValue.text
          : undefined,
      sourceDocument: doc.fileName,
      extractionConfidence: primary.confidence,
    },
  ];
}

function parseDocumentToRawTransactions(
  doc: LmnpDocument,
  docExtractions: Extraction[],
): RawChargeTransaction[] {
  const chargeType = classifyDocument(doc, docExtractions);
  const corpus = buildClassifierCorpusFromExtractions(doc, docExtractions);

  const readingCtx = buildChargeReadingOrchestrationContext({
    document: doc,
    corpus,
    chargeDocumentType: chargeType,
    extractions: docExtractions,
  });
  const dispatchConfig = buildParserDispatchConfig(readingCtx.readingMode);
  logChargeReadingOrchestration(readingCtx, dispatchConfig, "before_parser_dispatch");

  if (chargeType === "insurance_habitation") {
    const parsed = parseInsuranceDocument(corpus, {
      logTraces: false,
      arbitrationMode: dispatchConfig.arbitrationMode,
    });
    if (parsed.data) {
      return rawTransactionsFromInsurance(parsed.data, doc.fileName, parsed.data.montantTTC);
    }
  }

  if (
    chargeType === "charges_copropriete" ||
    chargeType === "fonds_travaux" ||
    chargeType === "avance_tresorerie"
  ) {
    const parsed = parseCoproprieteDocument(corpus, {
      sourceDocument: doc.fileName,
      logTraces: false,
    });
    if (parsed.transactions.length > 0) {
      return rawTransactionsFromCopro(parsed.transactions);
    }
  }

  if (chargeType === "inconnu") {
    if (!dispatchConfig.allowOcrFallback) return [];
    return fallbackRawTransactions(doc, docExtractions, "facture_energie");
  }

  if (chargeType === "taxe_fonciere") {
    logTaxeFonciereRuntime("parseTaxeFonciereDocument_entry", {
      documentId: doc.id,
      fileName: doc.fileName,
      corpusLength: corpus.length,
      hasChargeParserCorpus: Boolean(doc.chargeParserCorpus?.trim()),
      readingMode: dispatchConfig.readingMode,
      tableContainsTargetData: readingCtx.readingMode.tableContainsTargetData,
    });
    const parsed = parseTaxeFonciereDocument(corpus, {
      logTraces: false,
      arbitrationMode: dispatchConfig.arbitrationMode,
    });
    if (parsed.data) {
      const raw = rawTransactionsFromTaxeFonciere(
        parsed.data,
        doc.fileName,
        parsed.data.montantPayable,
      );
      logTaxeFonciereRuntime("parseDocumentToRawTransactions", {
        documentId: doc.id,
        fileName: doc.fileName,
        path: "taxe_fonciere_parser",
        montantPayable: parsed.data.montantPayable,
        rawAmount: raw[0]?.amount ?? raw[0]?.montantTTC ?? null,
      });
      return raw;
    }
    logTaxeFonciereRuntime("fallback_ocr_amount", {
      documentId: doc.id,
      fileName: doc.fileName,
      reason: "taxe_fonciere_parser_incomplete",
      parseErrors: parsed.errors,
      allowOcrFallback: dispatchConfig.allowOcrFallback,
    });
  }

  if (!dispatchConfig.allowOcrFallback) return [];
  return fallbackRawTransactions(doc, docExtractions, chargeType);
}

function mapNormalizedToCategoryGroups(
  transactions: NormalizedChargeTransaction[],
  doc: LmnpDocument,
  propertyLabel: string,
): ChargesCategoryData[] {
  const groups = new Map<string, NormalizedChargeTransaction[]>();

  for (const tx of transactions) {
    const key = tx.category;
    const list = groups.get(key) ?? [];
    list.push(tx);
    groups.set(key, list);
  }

  return [...groups.entries()].map(([chargeCategory, txs]) => {
    const lines: ChargesExpenseLine[] = txs.map((tx) => ({
      id: `line-${doc.id}-${chargeCategory}-${tx.label.slice(0, 12)}`,
      label: tx.label,
      amount: tx.amount,
      date: tx.date ?? tx.periodeDebut,
      propertyLabel,
      recoverable: tx.deductible,
      recurring: chargeCategory === "assurance_habitation",
      source: "upload" as const,
    }));

    const expenseCategory = txs[0]!.fiscalMetadata.expenseCategory;

    return {
      id: `cat-upload-${chargeCategory}-${doc.id}`,
      category: expenseCategory,
      label: CHARGE_CATEGORY_UI_LABELS[chargeCategory] ?? txs[0]!.label,
      annualTotal: lines.reduce((sum, entry) => sum + entry.amount, 0),
      propertyLabel,
      lines,
      recurring: lines.some((entry) => entry.recurring),
    };
  });
}

function mergeUploadCategories(groups: ChargesCategoryData[]): ChargesCategoryData[] {
  const map = new Map<string, ChargesCategoryData>();

  for (const item of groups) {
    const existing = map.get(item.id);
    if (!existing) {
      map.set(item.id, { ...item, lines: [...item.lines] });
      continue;
    }
    const lines = [...existing.lines, ...item.lines];
    map.set(item.id, {
      ...existing,
      lines,
      annualTotal: lines.reduce((sum, entry) => sum + entry.amount, 0),
      recurring: existing.recurring || item.recurring,
    });
  }

  return [...map.values()];
}

export type BuildDocumentChargesInput = {
  documents: LmnpDocument[];
  extractions: Extraction[];
  chargeDocumentIds?: string[];
  properties: Property[];
  /** TEMPORARY — diagnostic only; invoked outside per-document loops. */
  onCheckpoint?: (checkpoint: string, meta?: Record<string, number | string | boolean>) => void;
};

export function buildDocumentDerivedChargeCategories(
  input: BuildDocumentChargesInput,
): ChargesCategoryData[] {
  const { documents, extractions, chargeDocumentIds, properties, onCheckpoint } = input;
  const primary = properties[0];
  const propertyLabel =
    primary?.label?.trim() ||
    (primary?.city?.trim() ? `Appartement ${primary.city}` : "Bien locatif");

  const chargeDocs = documents.filter((doc) => {
    if (doc.status !== "analyzed") {
      return false;
    }
    if (!matchesChargeDocumentScope(doc, chargeDocumentIds)) {
      return false;
    }
    return true;
  });

  const allGroups: ChargesCategoryData[] = [];

  onCheckpoint?.("CHECKPOINT_C_AFTER_CLASSIFICATION", {
    chargeDocCount: chargeDocs.length,
  });

  for (const doc of chargeDocs) {
    const docExtractions = extractions.filter((e) => e.documentId === doc.id);
    const raw = parseDocumentToRawTransactions(doc, docExtractions);
    if (!raw.length) {
      continue;
    }

    const { transactions } = normalizeChargeTransactions(raw, { logTraces: false });
    if (!transactions.length) {
      continue;
    }

    const groups = mapNormalizedToCategoryGroups(transactions, doc, propertyLabel);
    const taxeFonciereLine = groups
      .flatMap((group) => group.lines)
      .find((line) => line.source === "upload" && /taxe\s+fonci/i.test(line.label));
    if (taxeFonciereLine || doc.documentType === "property_tax") {
      logTaxeFonciereRuntime("buildChargesExtraction_taxe_fonciere_lines", {
        documentId: doc.id,
        fileName: doc.fileName,
        hydratedAmount: taxeFonciereLine?.amount ?? groups[0]?.annualTotal ?? null,
        lines: groups.flatMap((group) =>
          group.lines.map((line) => ({ label: line.label, amount: line.amount, source: line.source })),
        ),
      });
    }
    allGroups.push(...groups);
  }

  onCheckpoint?.("CHECKPOINT_D_AFTER_PARSE", {
    chargeDocCount: chargeDocs.length,
  });

  const merged = mergeUploadCategories(allGroups);

  onCheckpoint?.("CHECKPOINT_E_AFTER_NORMALIZE", {
    groupCount: merged.length,
  });

  return merged;
}
