import type {
  ChargesAmortizationSuggestion,
  ChargesCategoryData,
  ChargesExtractionData,
  ChargesExpenseLine,
  DeclarationDraft,
  ExpenseCategory,
  LmnpDocument,
  Property,
} from "../types";
import {
  buildAmortizationSuggestionsFromCategories,
  mergeSuggestionsIntoDecisions,
} from "./charges-amortization-intelligence";

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
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
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
  return [...documents]
    .filter((doc) => isChargesDocument(doc, linkedDocumentIds))
    .sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt));
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
        category: "insurance",
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

function mockUploadedCategories(primary?: Property): ChargesCategoryData[] {
  const label = propertyLabel(primary, "Appartement Bordeaux Gambetta");

  return [
    category({
      category: "insurance",
      propertyLabel: label,
      lines: [
        line({
          label: "AXA Habitation",
          amount: 420,
          vatAmount: 70,
          date: "2025-01-15",
          propertyLabel: label,
          recoverable: true,
          recurring: true,
          source: "upload",
        }),
      ],
    }),
    category({
      category: "property_tax",
      propertyLabel: label,
      lines: [
        line({
          label: "Avis taxe foncière 2025",
          amount: 1280,
          date: "2025-09-01",
          propertyLabel: label,
          recoverable: true,
          recurring: true,
          source: "upload",
        }),
      ],
    }),
    category({
      category: "management_fees",
      propertyLabel: label,
      lines: [
        line({
          label: "Agence de gestion",
          amount: 690,
          vatAmount: 115,
          date: "2025-03-10",
          propertyLabel: label,
          recoverable: true,
          recurring: true,
          source: "upload",
        }),
      ],
    }),
    category({
      category: "condo",
      propertyLabel: label,
      lines: [
        line({
          label: "Appel charges T1 2025",
          amount: 340,
          date: "2025-04-01",
          propertyLabel: label,
          recoverable: true,
          source: "upload",
        }),
      ],
    }),
    category({
      category: "other",
      propertyLabel: label,
      lines: [
        line({
          id: "line-internet",
          label: "Abonnement internet",
          amount: 480,
          date: "2025-12-01",
          propertyLabel: label,
          recoverable: true,
          recurring: true,
          source: "upload",
        }),
        line({
          id: "line-cuisine-equipee",
          label: "Cuisine équipée",
          amount: 4200,
          date: "2025-04-12",
          propertyLabel: label,
          recoverable: true,
          source: "upload",
        }),
        line({
          id: "line-sdb",
          label: "Réfection salle de bain",
          amount: 1850,
          date: "2025-06-18",
          propertyLabel: label,
          recoverable: true,
          source: "upload",
        }),
        line({
          id: "line-peinture",
          label: "Retouche peinture salon",
          amount: 450,
          date: "2025-08-03",
          propertyLabel: label,
          recoverable: true,
          source: "upload",
        }),
      ],
    }),
  ];
}

function mergeCategories(groups: ChargesCategoryData[]): ChargesCategoryData[] {
  const map = new Map<string, ChargesCategoryData>();

  for (const item of groups) {
    const key = `${item.category}-${item.propertyLabel ?? "default"}`;
    const existing = map.get(key);
    if (!existing) {
      map.set(key, { ...item, lines: [...item.lines] });
      continue;
    }
    const lines = [...existing.lines, ...item.lines];
    map.set(key, {
      ...existing,
      lines,
      annualTotal: lines.reduce((sum, entry) => sum + entry.amount, 0),
      recurring: existing.recurring || item.recurring,
    });
  }

  return [...map.values()];
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
): ChargesExtractionData {
  const primary = properties[0];
  const primaryLabel = propertyLabel(primary, "Appartement Bordeaux Gambetta");

  const recovered = [
    ...recoveredFromCredit(draft, primaryLabel),
    ...recoveredFromRevenus(draft),
    ...recoveredFromAmortissement(draft, primaryLabel),
  ];
  const recoveredCount = recovered.reduce((sum, cat) => sum + cat.lines.length, 0);

  const categories = mergeCategories([...recovered, ...mockUploadedCategories(primary)]);
  const amortizationSuggestions = buildAmortizationSuggestionsFromCategories(
    categories,
    draft?.chargesAmortizationDecisions,
  );

  return {
    categories,
    recoveredFromOtherSteps: recoveredCount,
    amortizationSuggestions,
    summary: recalculateChargesSummary(categories, recoveredCount),
  };
}

export function resolveChargesAmortizationDecisions(
  extraction: ChargesExtractionData,
  draft?: DeclarationDraft,
): ChargesAmortizationSuggestion[] {
  return mergeSuggestionsIntoDecisions(
    draft?.chargesAmortizationDecisions,
    extraction.amortizationSuggestions,
  );
}

export function chargesFromDraft(draft?: DeclarationDraft): ChargesExtractionData | undefined {
  const raw = draft?.chargesExtraction;
  if (!raw) return undefined;
  if (raw.amortizationSuggestions?.length) {
    return {
      ...raw,
      amortizationSuggestions: resolveChargesAmortizationDecisions(raw, draft),
    };
  }
  return {
    ...raw,
    amortizationSuggestions: buildAmortizationSuggestionsFromCategories(
      raw.categories,
      draft?.chargesAmortizationDecisions,
    ),
  };
}

export function isChargesExtractionIncomplete(data: ChargesExtractionData): boolean {
  return data.categories.some((cat) => cat.lines.some((entry) => !entry.date && entry.source === "upload"));
}
