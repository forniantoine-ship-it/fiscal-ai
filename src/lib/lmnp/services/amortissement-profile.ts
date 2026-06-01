import type {
  AmortissementAllocation,
  AmortissementComponent,
  AmortissementVentilationData,
  DeclarationDraft,
  DocumentType,
  LmnpDocument,
} from "../types";
import type { PersistedWorkspace } from "../store/persistence";
import type { DocumentAnalysisResult } from "../ocr/map-to-extractions";
import { moneyFromEuros } from "../types/values";
import type { ExtractDocumentResult } from "@/lib/ai/document-types";
import {
  assessExpenseAmortizationCandidate,
  suggestionToAmortissementComponent,
} from "./charges-amortization-intelligence";

export type { AmortissementAllocation, AmortissementComponent, AmortissementVentilationData };

export type ExtractedInvoice = {
  id: string;
  label: string;
  supplier?: string;
  amount: number;
  category: string;
  allocation: AmortissementAllocation;
  durationYears: number;
  type: "travaux" | "mobilier";
  purchaseDate?: string;
};

export type AmortissementUploadKind = "continuity" | "travaux" | "mobilier";

const CONTINUITY_PATTERN =
  /liasse|amortissement|tableau|export|comptable|fiscal|2033|2031|bilan/i;
const TRAVAUX_PATTERN = /travaux|renovation|r[eé]nov|devis|facture|chantier|plomberie|peinture/i;
const MOBILIER_PATTERN = /mobilier|meuble|cuisine|canap[eé]|lit|ikea|electro|ameublement|equipement/i;

export function isContinuityDocument(doc: LmnpDocument): boolean {
  return doc.category === "amortissement" && CONTINUITY_PATTERN.test(doc.fileName);
}

export function isTravauxDocument(doc: LmnpDocument): boolean {
  if (isContinuityDocument(doc)) return false;
  return (
    doc.documentType === "works_invoice" ||
    doc.category === "charges" ||
    TRAVAUX_PATTERN.test(doc.fileName)
  );
}

export function isMobilierDocument(doc: LmnpDocument): boolean {
  if (isContinuityDocument(doc)) return false;
  return (
    doc.documentType === "furniture_invoice" ||
    (doc.category === "amortissement" && !CONTINUITY_PATTERN.test(doc.fileName)) ||
    MOBILIER_PATTERN.test(doc.fileName)
  );
}

export function countAmortissementDocuments(
  documents: LmnpDocument[],
  kind: AmortissementUploadKind,
): number {
  const matcher =
    kind === "continuity"
      ? isContinuityDocument
      : kind === "travaux"
        ? isTravauxDocument
        : isMobilierDocument;
  return documents.filter(matcher).length;
}

export function formatCurrency(value: number): string {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(value);
}

export function allocationLabel(allocation: AmortissementAllocation): string {
  if (allocation === "charge-immediate") return "Charge immédiate";
  if (allocation === "non-amortizable") return "Non amortissable";
  return "Immobilisation";
}

export function suggestAllocation(amount: number, label?: string): AmortissementAllocation {
  if (label) {
    const assessment = assessExpenseAmortizationCandidate(
      { label, amount },
      "works_deductible",
    );
    if (assessment?.eligible) return "immobilisation";
    return "charge-immediate";
  }
  return "charge-immediate";
}

function computeAnnual(amount: number, durationYears: number, allocation: AmortissementAllocation): number {
  if (allocation !== "immobilisation" || durationYears <= 0) return 0;
  return Math.round(amount / durationYears);
}

export const MOCK_EXTRACTED_INVOICES: ExtractedInvoice[] = [
  {
    id: "inv-cuisine",
    label: "Cuisine IKEA",
    supplier: "IKEA",
    amount: 2300,
    category: "Cuisine",
    allocation: "immobilisation",
    durationYears: 10,
    type: "mobilier",
    purchaseDate: "2024-03-12",
  },
  {
    id: "inv-canape",
    label: "Canapé",
    supplier: "Maisons du Monde",
    amount: 890,
    category: "Mobilier",
    allocation: "immobilisation",
    durationYears: 7,
    type: "mobilier",
    purchaseDate: "2024-05-08",
  },
  {
    id: "inv-peinture",
    label: "Peinture salon",
    supplier: "Artisan Dupuis",
    amount: 420,
    category: "Travaux",
    allocation: "charge-immediate",
    durationYears: 0,
    type: "travaux",
    purchaseDate: "2024-06-20",
  },
  {
    id: "inv-fenetres",
    label: "Remplacement fenêtres",
    supplier: "Leroy Merlin",
    amount: 4800,
    category: "Travaux",
    allocation: "immobilisation",
    durationYears: 15,
    type: "travaux",
    purchaseDate: "2024-02-15",
  },
];

// ---------------------------------------------------------------------------
// Extraction mappers — convert server ExtractDocumentResult to the types
// needed by APPLY_DOCUMENT_ANALYSIS and the ventilation workflow.
// ---------------------------------------------------------------------------

/** Map the server-side document family string to the local DocumentType enum. */
function mapDocumentFamilyToType(rawType: string): DocumentType {
  switch (rawType) {
    case "furniture_invoice":
      return "furniture_invoice";
    case "travaux_invoice":
    case "works_invoice":
      return "works_invoice";
    case "notary_act":
      return "notary_deed";
    case "loan_offer":
      return "loan_schedule";
    case "property_tax":
      return "property_tax";
    case "insurance_document":
      return "insurance_invoice";
    default:
      return "unknown";
  }
}

/** Choose the amortissement-domain field key for a given document type. */
function amortissementFieldKey(
  type: DocumentType,
): "amort.furnitureAnnual" | "amort.buildingAnnual" {
  return type === "furniture_invoice" ? "amort.furnitureAnnual" : "amort.buildingAnnual";
}

/**
 * Map a single `runBulkDocumentExtraction` result to the `DocumentAnalysisResult`
 * shape expected by `APPLY_DOCUMENT_ANALYSIS`.
 *
 * The doc's original category is preserved so that amortissement documents
 * are never accidentally re-categorised as "charges" by the generic
 * DOCUMENT_TYPE_TO_CATEGORY table (which maps works_invoice → "charges").
 */
export function mapExtractionResultToAnalysisResult(
  doc: LmnpDocument,
  result: ExtractDocumentResult,
): DocumentAnalysisResult {
  const documentType = mapDocumentFamilyToType(result.documentType);
  const fieldKey = amortissementFieldKey(documentType);
  const amount = result.structuredData.amount_ttc ?? result.structuredData.amount_ht ?? 0;
  const confidence = Math.min(99, Math.max(0, Math.round(result.confidenceScore)));

  return {
    documentType,
    // Preserve the original category — critical for works_invoice docs that live
    // in the amortissement step, not the charges step.
    category: doc.category,
    extractions: [
      {
        id: crypto.randomUUID(),
        documentId: doc.id,
        fiscalYearId: doc.fiscalYearId,
        fieldKey,
        rawValue: String(amount),
        normalizedValue: moneyFromEuros(amount),
        confidence,
        status: "pending_validation",
      },
    ],
  };
}

/**
 * Map a single `runBulkDocumentExtraction` result to an `ExtractedInvoice`
 * so the ventilation workflow can use real data instead of mock fixtures.
 *
 * Only call this for non-continuity documents (travaux / mobilier invoices).
 */
export function mapExtractionResultToInvoice(
  doc: LmnpDocument,
  result: ExtractDocumentResult,
): ExtractedInvoice {
  const invoiceType = isMobilierDocument(doc) ? "mobilier" : "travaux";
  const amount = result.structuredData.amount_ttc ?? result.structuredData.amount_ht ?? 0;
  const allocation = suggestAllocation(amount, doc.fileName);
  const durationYears = invoiceType === "mobilier" ? 10 : 15;

  return {
    id: doc.id,
    label: doc.fileName,
    supplier:
      result.structuredData.supplier ?? result.structuredData.organization ?? undefined,
    amount,
    category: invoiceType === "mobilier" ? "Mobilier" : "Travaux",
    allocation,
    durationYears,
    type: invoiceType,
    purchaseDate: result.structuredData.invoice_date ?? undefined,
  };
}

function baseDossierComponents(acquisitionPrice = 185000): AmortissementComponent[] {
  const terrain = Math.round(acquisitionPrice * 0.15);
  const buildable = acquisitionPrice - terrain;

  const rows: Omit<AmortissementComponent, "id" | "annualAmortization">[] = [
    {
      label: "Terrain",
      category: "Terrain",
      ventilationPercent: 15,
      amount: terrain,
      durationYears: 0,
      allocation: "non-amortizable",
      source: "dossier",
    },
    {
      label: "Gros œuvre",
      category: "Structure",
      ventilationPercent: 35,
      amount: Math.round(buildable * 0.35),
      durationYears: 50,
      allocation: "immobilisation",
      source: "dossier",
    },
    {
      label: "Étanchéité",
      category: "Structure",
      ventilationPercent: 8,
      amount: Math.round(buildable * 0.08),
      durationYears: 25,
      allocation: "immobilisation",
      source: "dossier",
    },
    {
      label: "Réseaux",
      category: "Technique",
      ventilationPercent: 12,
      amount: Math.round(buildable * 0.12),
      durationYears: 20,
      allocation: "immobilisation",
      source: "dossier",
    },
    {
      label: "Agencements",
      category: "Finitions",
      ventilationPercent: 18,
      amount: Math.round(buildable * 0.18),
      durationYears: 15,
      allocation: "immobilisation",
      source: "dossier",
    },
    {
      label: "Mobilier",
      category: "Mobilier",
      ventilationPercent: 7,
      amount: Math.round(buildable * 0.07),
      durationYears: 10,
      allocation: "immobilisation",
      source: "dossier",
    },
    {
      label: "Électroménager",
      category: "Mobilier",
      ventilationPercent: 5,
      amount: Math.round(buildable * 0.05),
      durationYears: 7,
      allocation: "immobilisation",
      source: "dossier",
    },
  ];

  return rows.map((row, index) => ({
    ...row,
    id: `dossier-${index}`,
    annualAmortization: computeAnnual(row.amount, row.durationYears, row.allocation),
    practicedAmortization: computeAnnual(row.amount, row.durationYears, row.allocation),
    vnc: row.allocation === "immobilisation" ? row.amount : undefined,
    remainingYears: row.durationYears > 0 ? row.durationYears : undefined,
  }));
}

function invoiceToComponent(invoice: ExtractedInvoice): AmortissementComponent {
  return {
    id: invoice.id,
    label: invoice.label,
    category: invoice.category,
    ventilationPercent: 0,
    amount: invoice.amount,
    durationYears: invoice.durationYears,
    annualAmortization: computeAnnual(invoice.amount, invoice.durationYears, invoice.allocation),
    allocation: invoice.allocation,
    practicedAmortization: computeAnnual(invoice.amount, invoice.durationYears, invoice.allocation),
    vnc: invoice.allocation === "immobilisation" ? invoice.amount : undefined,
    remainingYears: invoice.durationYears > 0 ? invoice.durationYears : undefined,
    source: invoice.type === "travaux" ? "travaux" : "mobilier",
  };
}

export function buildVentilationFromDossier(
  workspace: PersistedWorkspace,
  invoices: ExtractedInvoice[] = MOCK_EXTRACTED_INVOICES,
): AmortissementVentilationData {
  const acquisitionPrice = workspace.declarationDraft?.propertyBackgroundExtraction?.acquisitionPrice ?? 185000;
  const base = baseDossierComponents(acquisitionPrice);
  const invoiceComponents = invoices
    .filter((inv) => inv.allocation === "immobilisation")
    .map(invoiceToComponent);

  const transferredDecisions =
    workspace.declarationDraft?.chargesAmortizationDecisions?.filter(
      (item) => item.status === "transferred",
    ) ?? [];
  const fromChargesComponents = transferredDecisions.map((item) =>
    suggestionToAmortissementComponent(item),
  );

  const components = [...base, ...invoiceComponents, ...fromChargesComponents];
  const travauxTotal = invoices.filter((i) => i.type === "travaux").reduce((sum, i) => sum + i.amount, 0);
  const mobilierTotal = invoices.filter((i) => i.type === "mobilier").reduce((sum, i) => sum + i.amount, 0);
  const amortizable = components.filter((c) => c.allocation === "immobilisation");
  const averageDurationYears =
    amortizable.length > 0
      ? Math.round(
          amortizable.reduce((sum, c) => sum + c.durationYears, 0) / amortizable.length,
        )
      : 0;

  return {
    components,
    summary: {
      componentCount: amortizable.length,
      travauxTotal,
      mobilierTotal,
      averageDurationYears,
    },
  };
}

export function ventilationFromDraft(draft?: DeclarationDraft): AmortissementVentilationData | undefined {
  return draft?.amortissementVentilation;
}

export function isAmortissementVentilationIncomplete(data?: AmortissementVentilationData): boolean {
  if (!data?.components.length) return true;
  return data.components.some(
    (c) =>
      c.allocation === "immobilisation" &&
      (c.durationYears <= 0 || c.amount <= 0 || !c.label.trim()),
  );
}

export function recalculateVentilationSummary(
  components: AmortissementComponent[],
): AmortissementVentilationData["summary"] {
  const travauxTotal = components
    .filter((c) => c.source === "travaux")
    .reduce((sum, c) => sum + c.amount, 0);
  const mobilierTotal = components
    .filter((c) => c.source === "mobilier" || c.category === "Mobilier" || c.category === "Cuisine")
    .reduce((sum, c) => sum + c.amount, 0);
  const amortizable = components.filter((c) => c.allocation === "immobilisation");
  const averageDurationYears =
    amortizable.length > 0
      ? Math.round(
          amortizable.reduce((sum, c) => sum + c.durationYears, 0) / amortizable.length,
        )
      : 0;

  return {
    componentCount: amortizable.length,
    travauxTotal,
    mobilierTotal,
    averageDurationYears,
  };
}

export function updateComponent(
  components: AmortissementComponent[],
  id: string,
  patch: Partial<AmortissementComponent>,
): AmortissementComponent[] {
  return components.map((component) => {
    if (component.id !== id) return component;
    const next = { ...component, ...patch };
    next.annualAmortization = computeAnnual(next.amount, next.durationYears, next.allocation);
    if (next.allocation === "immobilisation") {
      next.vnc = next.vnc ?? next.amount;
      next.remainingYears = next.durationYears;
    } else {
      next.vnc = undefined;
      next.remainingYears = undefined;
    }
    return next;
  });
}
