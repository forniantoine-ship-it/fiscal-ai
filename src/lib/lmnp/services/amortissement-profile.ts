import type {
  AmortissementAllocation,
  AmortissementComponent,
  AmortissementVentilationData,
  DeclarationDraft,
  LmnpDocument,
} from "../types";
import type { PersistedWorkspace } from "../store/persistence";

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

export function suggestAllocation(amount: number): AmortissementAllocation {
  return amount < 600 ? "charge-immediate" : "immobilisation";
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

  const components = [...base, ...invoiceComponents];
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
