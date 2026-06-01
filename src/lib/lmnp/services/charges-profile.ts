import type {
  ChargesAmortizationSuggestion,
  ChargesCategoryData,
  ChargesExtractionData,
  ChargesExpenseLine,
  DeclarationDraft,
  Extraction,
  ExpenseCategory,
  LmnpDocument,
  Property,
} from "../types";
import {
  buildAmortizationSuggestionsFromCategories,
  mergeSuggestionsIntoDecisions,
} from "./charges-amortization-intelligence";
import { buildDocumentDerivedChargeCategories } from "./charges/charges-document-extraction";

export type { ChargesCategoryData, ChargesExtractionData, ChargesExpenseLine };

const CATEGORY_LABELS: Record<ExpenseCategory, string> = {
  property_tax: "Taxe foncière",
  insurance: "Assurances",
  condo: "Charges copropriété",
  works_deductible: "Travaux déductibles",
  management_fees: "Frais de gestion",
  other: "Autres charges",
};

export function formatCurrency(value: number): string {
  console.log("[charges-amount-debug]", {
    rawAmount: value,
    normalizedAmount: Math.round(value * 100) / 100,
    displayedAmount: new Intl.NumberFormat("fr-FR", {
      style: "currency",
      currency: "EUR",
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    }).format(value),
  });
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(value);
}

export function categoryLabel(category: ExpenseCategory): string {
  return CATEGORY_LABELS[category];
}

export function isChargesDocument(doc: LmnpDocument, linkedDocumentIds?: string[]): boolean {
  if (linkedDocumentIds?.includes(doc.id)) return true;
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

export function countChargesDocuments(
  documents: LmnpDocument[],
  linkedDocumentIds?: string[],
): number {
  return documents.filter((doc) => isChargesDocument(doc, linkedDocumentIds)).length;
}

export function resolveChargesDocuments(
  documents: LmnpDocument[],
  linkedDocumentIds?: string[],
): LmnpDocument[] {
  const resolved = [...documents]
    .filter((doc) => isChargesDocument(doc, linkedDocumentIds))
    .sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt));
  // TEMPORARY AUDIT LOG — remove after root-cause is confirmed
  console.log("[charges-resolve-docs]", {
    totalDocuments: documents.length,
    chargeDocumentIds: linkedDocumentIds ?? [],
    resolvedDocs: resolved.map((doc) => ({
      id: doc.id,
      fileName: doc.fileName,
      status: doc.status,
      category: doc.category,
      documentType: doc.documentType,
      inLinkedIds: linkedDocumentIds?.includes(doc.id) ?? false,
      matchedBy:
        linkedDocumentIds?.includes(doc.id)
          ? "linkedId"
          : doc.category === "charges"
            ? "category"
            : doc.documentType === "property_tax" ||
                doc.documentType === "insurance_invoice" ||
                doc.documentType === "condo_charges" ||
                doc.documentType === "works_invoice"
              ? "documentType"
              : "fileNameRegex",
    })),
  });
  return resolved;
}

function propertyLabel(property: Property | undefined, fallback: string): string {
  if (property?.label?.trim()) return property.label.trim();
  if (property?.city?.trim()) {
    return `Appartement ${property.city}${property.address ? ` ${property.address.split(" ")[0]}` : ""}`;
  }
  return fallback;
}

function line(
  partial: Omit<ChargesExpenseLine, "id"> & { id?: string },
): ChargesExpenseLine {
  return {
    id: partial.id ?? `line-${Math.random().toString(36).slice(2, 9)}`,
    ...partial,
  };
}

function category(
  partial: {
    id?: string;
    category: ExpenseCategory;
    label?: string;
    annualTotal?: number;
    propertyId?: string;
    propertyLabel?: string;
    lines: ChargesExpenseLine[];
    recurring?: boolean;
  },
): ChargesCategoryData {
  const annualTotal =
    partial.annualTotal ?? partial.lines.reduce((sum, item) => sum + item.amount, 0);
  return {
    id: partial.id ?? `cat-${partial.category}`,
    label: partial.label ?? categoryLabel(partial.category),
    category: partial.category,
    annualTotal,
    propertyId: partial.propertyId,
    propertyLabel: partial.propertyLabel,
    lines: partial.lines,
    recurring: partial.recurring ?? partial.lines.some((item) => item.recurring),
  };
}

function recoveredFromCredit(draft?: DeclarationDraft, primaryLabel?: string): ChargesCategoryData[] {
  const financing = draft?.creditFinancing;
  if (!draft?.creditConfirmedAt || !financing) return [];

  const items: ChargesCategoryData[] = [];

  if (financing.summary.annualInsurance > 0) {
    items.push(
      category({
        id: "cat-recovered-credit-insurance",
        category: "insurance",
        label: "Assurance emprunt (étape Crédit)",
        propertyLabel: primaryLabel,
        lines: [
          line({
            label: "Assurance emprunt (étape Crédit)",
            amount: financing.summary.annualInsurance,
            recoverable: true,
            recurring: true,
            source: "credit",
          }),
        ],
      }),
    );
  }

  return items;
}

function recoveredFromRevenus(draft?: DeclarationDraft): ChargesCategoryData[] {
  const extraction = draft?.revenusExtraction;
  if (!draft?.revenusConfirmedAt || !extraction) return [];

  const feeLines: ChargesExpenseLine[] = extraction.properties
    .filter((property) => property.detectedFees > 0)
    .map((property) =>
      line({
        label: `Frais plateforme — ${property.label}`,
        amount: property.detectedFees,
        propertyLabel: property.label,
        recoverable: true,
        source: "revenus",
      }),
    );

  if (!feeLines.length) return [];

  const total = feeLines.reduce((sum, item) => sum + item.amount, 0);
  return [
    category({
      id: "cat-revenus-fees",
      category: "other",
      label: "Frais détectés (Revenus)",
      annualTotal: total,
      lines: feeLines,
    }),
  ];
}

/** Whether Crédit / Revenus / Amortissement steps would contribute recovery rows. */
export function hasCrossStepRecoveryAvailable(
  draft?: DeclarationDraft,
  primaryLabel = "Bien locatif",
): boolean {
  return (
    recoveredFromCredit(draft, primaryLabel).length > 0 ||
    recoveredFromRevenus(draft).length > 0 ||
    recoveredFromAmortissement(draft, primaryLabel).length > 0
  );
}

function recoveredFromAmortissement(draft?: DeclarationDraft, primaryLabel?: string): ChargesCategoryData[] {
  const ventilation = draft?.amortissementVentilation;
  if (!draft?.amortissementConfirmedAt || !ventilation) return [];

  const immediate = ventilation.components.filter((item) => item.allocation === "charge-immediate");
  if (!immediate.length) return [];

  const lines = immediate.map((item) =>
    line({
      label: item.label,
      amount: item.amount,
      propertyLabel: primaryLabel,
      recoverable: true,
      source: "amortissement",
    }),
  );

  return [
    category({
      id: "cat-amortissement-immediate",
      category: "works_deductible",
      label: "Travaux en charge immédiate",
      annualTotal: lines.reduce((sum, item) => sum + item.amount, 0),
      propertyLabel: primaryLabel,
      lines,
    }),
  ];
}

export type ChargesExtractionSource = "documents" | "recovered" | "draft_restore";

export type ChargesExtractionBuildContext = {
  documents?: LmnpDocument[];
  extractions?: Extraction[];
  chargeDocumentIds?: string[];
  /** When true, include recoveredFromCredit / Revenus / Amortissement. */
  includeCrossStepRecovery?: boolean;
  /** Skip build (empty result) while uploaded charge docs exist but none are analyzed yet. */
  requireAnalyzedDocuments?: boolean;
};

/** Known demo labels from legacy mockUploadedCategories — never restore from draft. */
const LEGACY_MOCK_LINE_PATTERNS: RegExp[] = [
  /^axa habitation$/i,
  /^avis taxe fonci[eè]re 2025$/i,
  /^agence de gestion$/i,
  /^appel charges t1 2025$/i,
  /^abonnement internet$/i,
  /^cuisine [eé]quip[eé]e$/i,
  /^r[eé]fection salle de bain$/i,
  /^retouche peinture salon$/i,
];

export function isLegacyMockChargeLine(line: ChargesExpenseLine): boolean {
  if (line.source !== "upload") return false;
  return LEGACY_MOCK_LINE_PATTERNS.some((pattern) => pattern.test(line.label.trim()));
}

export function isRecoveredChargeCategory(cat: ChargesCategoryData): boolean {
  return cat.lines.every((entry) => entry.source && entry.source !== "upload");
}

export function purgeLegacyMockCategories(
  categories: ChargesCategoryData[],
): ChargesCategoryData[] {
  return categories
    .map((cat) => {
      const lines = cat.lines.filter((entry) => !isLegacyMockChargeLine(entry));
      if (lines.length === 0) return null;
      const annualTotal = lines.reduce((sum, entry) => sum + entry.amount, 0);
      return { ...cat, lines, annualTotal };
    })
    .filter((cat): cat is ChargesCategoryData => cat !== null);
}

export function purgeRecoveredCategories(
  categories: ChargesCategoryData[],
): ChargesCategoryData[] {
  return categories.filter((cat) => !isRecoveredChargeCategory(cat));
}

export function shouldIncludeCrossStepRecovery(
  draft: DeclarationDraft | undefined,
  documents: LmnpDocument[],
  chargeDocumentIds?: string[],
  explicitInclude?: boolean,
): boolean {
  const uploadedCount = countChargesDocuments(documents, chargeDocumentIds);
  if (uploadedCount === 0) return true;
  return Boolean(explicitInclude ?? draft?.chargesCrossStepRecoveryEnabled);
}

export function createEmptyChargesExtraction(): ChargesExtractionData {
  return {
    categories: [],
    recoveredFromOtherSteps: 0,
    amortizationSuggestions: [],
    summary: {
      totalCharges: 0,
      categoryCount: 0,
      recoverableTotal: 0,
      nonRecoverableTotal: 0,
    },
  };
}

export function logChargesAuthority(payload: {
  source: ChargesExtractionSource;
  authoritative: boolean;
  replacedPreviousExtraction: boolean;
  categoryCount?: number;
  uploadedDocumentCount?: number;
  analyzedDocumentCount?: number;
  includeCrossStepRecovery?: boolean;
}): void {
  console.log("[charges-authority]", payload);
}

export function logChargesExtractionTrace(payload: {
  source: ChargesExtractionSource;
  categoryCount: number;
  uploadedDocumentCount: number;
  documentCategoryCount?: number;
  recoveredCategoryCount?: number;
}): void {
  console.log("[charges-extraction]", payload);
}

export function logChargesLoopGuard(payload: {
  skippedBecauseEqual: boolean;
  triggeredBy: string;
}): void {
  console.log("[charges-loop-guard]", payload);
}

/** Stable semantic fingerprint — ignores volatile line/suggestion ids. */
export function chargesExtractionFingerprint(data: ChargesExtractionData): string {
  const normalized = normalizeChargesExtraction(data);

  const categories = [...normalized.categories]
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((cat) => ({
      id: cat.id,
      category: cat.category,
      label: cat.label,
      annualTotal: cat.annualTotal,
      propertyLabel: cat.propertyLabel ?? "",
      lines: [...cat.lines]
        .sort((a, b) =>
          `${a.label}|${a.amount}|${a.source ?? ""}`.localeCompare(
            `${b.label}|${b.amount}|${b.source ?? ""}`,
          ),
        )
        .map((line) => ({
          label: line.label,
          amount: line.amount,
          source: line.source ?? "",
          date: line.date ?? "",
          recoverable: line.recoverable,
          recurring: line.recurring ?? false,
          vatAmount: line.vatAmount ?? null,
        })),
    }));

  const suggestions = [...normalized.amortizationSuggestions]
    .sort((a, b) => a.expenseLineId.localeCompare(b.expenseLineId))
    .map((item) => ({
      expenseLineId: item.expenseLineId,
      label: item.label,
      amount: item.amount,
      status: item.status,
      workType: item.workType,
      amortCategory: item.amortCategory,
      durationYears: item.durationYears,
      propertyLabel: item.propertyLabel ?? "",
    }));

  return JSON.stringify({
    summary: normalized.summary,
    recoveredFromOtherSteps: normalized.recoveredFromOtherSteps,
    categories,
    suggestions,
  });
}

export function areChargesExtractionsEqual(
  a: ChargesExtractionData | undefined,
  b: ChargesExtractionData | undefined,
): boolean {
  if (!a && !b) return true;
  if (!a || !b) return false;
  return chargesExtractionFingerprint(a) === chargesExtractionFingerprint(b);
}

function countAnalyzedChargeDocuments(
  documents: LmnpDocument[],
  chargeDocumentIds?: string[],
): number {
  return documents.filter(
    (doc) => doc.status === "analyzed" && isChargesDocument(doc, chargeDocumentIds),
  ).length;
}

export function recalculateChargesSummary(
  categories: ChargesCategoryData[],
  recoveredFromOtherSteps: number,
): ChargesExtractionData["summary"] {
  const recoverableTotal = categories.reduce(
    (sum, cat) => sum + cat.lines.filter((entry) => entry.recoverable).reduce((s, e) => s + e.amount, 0),
    0,
  );
  const totalCharges = categories.reduce((sum, cat) => sum + cat.annualTotal, 0);
  return {
    totalCharges,
    categoryCount: categories.length,
    recoverableTotal,
    nonRecoverableTotal: Math.max(0, totalCharges - recoverableTotal),
  };
}

export function buildChargesExtraction(
  properties: Property[],
  draft?: DeclarationDraft,
  context?: ChargesExtractionBuildContext,
): ChargesExtractionData {
  const primary = properties[0];
  const primaryLabel = propertyLabel(primary, "Bien locatif");
  const documents = context?.documents ?? [];
  const extractions = context?.extractions ?? [];
  const chargeDocumentIds = context?.chargeDocumentIds ?? draft?.chargesDocumentIds;
  const linkedUploadedCount = countChargesDocuments(documents, chargeDocumentIds);
  const analyzedDocumentCount = countAnalyzedChargeDocuments(documents, chargeDocumentIds);

  if (
    context?.requireAnalyzedDocuments &&
    linkedUploadedCount > 0 &&
    analyzedDocumentCount === 0
  ) {
    return createEmptyChargesExtraction();
  }

  const analyzedDocuments = documents.filter(
    (doc) => doc.status === "analyzed" && isChargesDocument(doc, chargeDocumentIds),
  );

  console.log("[charges-debug-extraction-input]", {
    extractionDocs: analyzedDocuments.map((doc) => ({
      id: doc.id,
      fileName: doc.fileName,
      documentType: doc.documentType,
    })),
    chargeDocumentIds: chargeDocumentIds ?? [],
    requireAnalyzedDocuments: context?.requireAnalyzedDocuments ?? false,
    linkedUploadedCount,
    analyzedDocumentCount,
  });

  const documentCategories = buildDocumentDerivedChargeCategories({
    documents,
    extractions,
    chargeDocumentIds,
    properties,
  });

  const includeRecovery = shouldIncludeCrossStepRecovery(
    draft,
    documents,
    chargeDocumentIds,
    context?.includeCrossStepRecovery,
  );

  const recovered = includeRecovery
    ? [
        ...recoveredFromCredit(draft, primaryLabel),
        ...recoveredFromRevenus(draft),
        ...recoveredFromAmortissement(draft, primaryLabel),
      ]
    : [];
  const recoveredCount = recovered.reduce((sum, cat) => sum + cat.lines.length, 0);

  const categories = [...documentCategories, ...recovered];

  const source: ChargesExtractionSource =
    documentCategories.length > 0
      ? "documents"
      : recovered.length > 0
        ? "recovered"
        : "documents";

  logChargesExtractionTrace({
    source,
    categoryCount: categories.length,
    uploadedDocumentCount: analyzedDocumentCount,
    documentCategoryCount: documentCategories.length,
    recoveredCategoryCount: recovered.length,
  });

  const uploadOnlyCategories = purgeRecoveredCategories(categories);
  const amortizationSuggestions = buildAmortizationSuggestionsFromCategories(
    linkedUploadedCount > 0 && !includeRecovery ? uploadOnlyCategories : categories,
    draft?.chargesAmortizationDecisions,
  );

  return {
    categories,
    recoveredFromOtherSteps: recoveredCount,
    amortizationSuggestions,
    summary: recalculateChargesSummary(categories, recoveredCount),
  };
}

export function normalizeChargesExtraction(
  extraction: ChargesExtractionData,
): ChargesExtractionData {
  const categories = extraction.categories ?? [];
  const suggestions = extraction.amortizationSuggestions ?? [];
  const summary = extraction.summary ?? recalculateChargesSummary(categories, 0);

  return {
    ...extraction,
    categories,
    amortizationSuggestions: suggestions,
    recoveredFromOtherSteps: extraction.recoveredFromOtherSteps ?? 0,
    summary,
  };
}

export function buildChargesDraftPatch(
  extraction: ChargesExtractionData,
  draft?: DeclarationDraft,
): Pick<DeclarationDraft, "chargesExtraction" | "chargesAmortizationDecisions"> {
  const normalized = normalizeChargesExtraction(extraction);
  const chargesAmortizationDecisions = resolveChargesAmortizationDecisions(normalized, draft);

  return {
    chargesExtraction: {
      ...normalized,
      amortizationSuggestions: chargesAmortizationDecisions,
    },
    chargesAmortizationDecisions,
  };
}

export function resolveChargesAmortizationDecisions(
  extraction: ChargesExtractionData,
  draft?: DeclarationDraft,
): ChargesAmortizationSuggestion[] {
  const normalized = normalizeChargesExtraction(extraction);
  const merged = mergeSuggestionsIntoDecisions(
    draft?.chargesAmortizationDecisions,
    normalized.amortizationSuggestions,
  );

  if (merged.length > 0) return merged;

  return buildAmortizationSuggestionsFromCategories(
    normalized.categories,
    draft?.chargesAmortizationDecisions,
  );
}

export function chargesFromDraft(
  draft?: DeclarationDraft,
  options?: { documents?: LmnpDocument[] },
): ChargesExtractionData | undefined {
  const raw = draft?.chargesExtraction;
  if (!raw) return undefined;

  const normalized = normalizeChargesExtraction(raw);
  let categories = purgeLegacyMockCategories(normalized.categories ?? []);

  const documents = options?.documents ?? [];
  if (
    documents.length > 0 &&
    countChargesDocuments(documents, draft?.chargesDocumentIds) > 0 &&
    !shouldIncludeCrossStepRecovery(draft, documents, draft?.chargesDocumentIds)
  ) {
    categories = purgeRecoveredCategories(categories);
  }

  const purged: ChargesExtractionData = {
    ...normalized,
    categories,
    recoveredFromOtherSteps: categories
      .flatMap((cat) => cat.lines)
      .filter((line) => line.source && line.source !== "upload").length,
    summary: recalculateChargesSummary(
      categories,
      categories.flatMap((cat) => cat.lines).filter((line) => line.source && line.source !== "upload")
        .length,
    ),
  };

  return {
    ...purged,
    amortizationSuggestions:
      purged.amortizationSuggestions.length > 0
        ? resolveChargesAmortizationDecisions(purged, draft)
        : buildAmortizationSuggestionsFromCategories(
            categories,
            draft?.chargesAmortizationDecisions,
          ),
  };
}

export function isChargesExtractionIncomplete(data: ChargesExtractionData): boolean {
  return data.categories.some((cat) => cat.lines.some((entry) => !entry.date && entry.source === "upload"));
}
