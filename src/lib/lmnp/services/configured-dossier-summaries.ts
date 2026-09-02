import type { ActiviteFormValues } from "@/components/lmnp/activite/ActiviteProfileFields";
import type { ConfiguredSummaryRow } from "@/components/lmnp/shared/ConfiguredDossierCard";
import type { LogementFormValues } from "@/lib/lmnp/services/logement-profile";
import type { CreditFormValues } from "@/lib/lmnp/services/credit-profile";
import { formatCurrency as formatCreditCurrency } from "@/lib/lmnp/services/credit-profile";
import { formatCurrency as formatRevenusCurrency, describeSourceTypes } from "@/lib/lmnp/services/revenus-profile";
import { formatCurrency as formatChargesCurrency, categoryLabel } from "@/lib/lmnp/services/charges-profile";
import { formatCurrency as formatAmortCurrency } from "@/lib/lmnp/services/amortissement-profile";
import type {
  AmortissementVentilationData,
  ChargesExtractionData,
  DeclarationDraft,
  FiscalRegime,
  LmnpDocument,
  Property,
  PropertyBackgroundExtraction,
  RevenusExtractionData,
} from "@/lib/lmnp/types";

const PROPERTY_TYPE_LABELS: Record<string, string> = {
  appartement: "Appartement",
  maison: "Maison",
  "meuble-tourisme": "Meublé tourisme",
  "chambre-hote": "Chambre d'hôte",
  "non-classe": "Non classé",
};

const REGIME_SHORT_LABELS: Record<string, string> = {
  "micro-bic": "Micro-BIC",
  "reel-simplifie": "Réel simplifié",
  "reel-normal": "Réel normal",
  reel: "Réel",
};

function formatFrenchDate(iso?: string): string {
  if (!iso?.trim()) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(date);
}

function formatSiren(value?: string): string {
  const digits = (value ?? "").replace(/\D/g, "");
  if (digits.length !== 9) return value?.trim() || "—";
  return `${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6, 9)}`;
}

function regimeShortLabel(regime?: string): string {
  if (!regime) return "—";
  return REGIME_SHORT_LABELS[regime] ?? regime;
}

function propertyTypeLabel(type?: string): string {
  if (!type) return "—";
  return PROPERTY_TYPE_LABELS[type] ?? type;
}

function parseAmount(value: string): number {
  const normalized = value.replace(/\s/g, "").replace(",", ".");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function monthsToYearsLabel(months: number): string {
  if (months <= 0) return "—";
  const years = Math.round(months / 12);
  return years === 1 ? "1 an" : `${years} ans`;
}

function detectPlatforms(documents: LmnpDocument[]): string[] {
  const platforms = new Set<string>();
  for (const doc of documents) {
    const name = doc.fileName.toLowerCase();
    if (/airbnb/.test(name)) platforms.add("Airbnb");
    if (/booking/.test(name)) platforms.add("Booking");
    if (/abritel|homeaway/.test(name)) platforms.add("Abritel");
    if (/leboncoin|lbc/.test(name)) platforms.add("Leboncoin");
  }
  if (!platforms.size) return ["Location directe"];
  return [...platforms];
}

function countChargeDocuments(extraction?: ChargesExtractionData): number {
  if (!extraction) return 0;
  return extraction.categories.reduce((sum, cat) => sum + cat.lines.length, 0);
}

function topChargeCategories(extraction?: ChargesExtractionData, limit = 3): string {
  if (!extraction?.categories.length) return "—";
  return extraction.categories
    .slice()
    .sort((a, b) => b.annualTotal - a.annualTotal)
    .slice(0, limit)
    .map((cat) => categoryLabel(cat.category))
    .join(" · ");
}

export function buildActiviteConfiguredSummary(values: ActiviteFormValues): ConfiguredSummaryRow[] {
  const rows: ConfiguredSummaryRow[] = [{ label: "Régime", value: "LMNP réel simplifié" }];

  if (values.firstName?.trim() || values.lastName?.trim()) {
    rows.push({
      label: "Exploitant",
      value: [values.firstName, values.lastName].filter(Boolean).join(" ").trim(),
    });
  }
  if (values.siren?.trim()) {
    rows.push({ label: "SIREN", value: formatSiren(values.siren) });
  }
  const personalCity = values.personalCity?.trim();
  if (personalCity) {
    rows.push({ label: "Ville", value: personalCity });
  }

  return rows;
}

export function buildLogementConfiguredSummary(
  values: LogementFormValues,
  background?: PropertyBackgroundExtraction,
): ConfiguredSummaryRow[] {
  const addressParts = [values.address, values.city].filter((part) => part?.trim());
  const rows: ConfiguredSummaryRow[] = [];

  if (addressParts.length) {
    rows.push({ label: "Adresse", value: addressParts.join(", ") });
  }
  const purchasePrice =
    parseAmount(values.propertyPurchasePrice) || background?.acquisitionPrice || 0;
  if (purchasePrice > 0) {
    rows.push({
      label: "Prix du bien (hors frais)",
      value: formatAmortCurrency(purchasePrice),
    });
  }
  if (values.acquisitionDate?.trim()) {
    rows.push({
      label: "Date d'acquisition",
      value: formatFrenchDate(values.acquisitionDate),
    });
  }
  rows.push({
    label: "Type de bien",
    value: propertyTypeLabel(values.propertyType),
  });

  return rows;
}

export function buildCreditConfiguredSummary(
  values: CreditFormValues,
  loansCount: number,
): { rows: ConfiguredSummaryRow[]; footnote?: string } {
  const primary = values.loans[0];
  if (!primary) {
    return { rows: [{ label: "Statut", value: "Aucun financement" }] };
  }

  const rows: ConfiguredSummaryRow[] = [
    { label: "Banque", value: primary.bank.trim() || "—" },
    {
      label: "Montant emprunté",
      value: formatCreditCurrency(parseAmount(primary.borrowedAmount)),
    },
    {
      label: "Mensualité",
      value: formatCreditCurrency(parseAmount(primary.monthlyPayment)),
    },
    {
      label: "Durée",
      value: monthsToYearsLabel(parseAmount(primary.durationMonths)),
    },
  ];

  const footnote =
    loansCount > 1 ? `${loansCount} financements détectés` : undefined;

  return { rows, footnote };
}

export function buildRevenusConfiguredSummary(
  extraction: RevenusExtractionData,
  documents: LmnpDocument[],
  fiscalYear: number,
): ConfiguredSummaryRow[] {
  return [
    {
      label: "Sources analysées",
      value: describeSourceTypes(documents).join(" · ") || "Mixte",
    },
    {
      label: "Revenus reconstitués",
      value: formatRevenusCurrency(extraction.summary.totalRevenue),
    },
    {
      label: "Événements détectés",
      value: String(extraction.summary.eventCount ?? extraction.summary.rentCount),
    },
    {
      label: "Période analysée",
      value: String(fiscalYear),
    },
  ];
}

export function buildChargesConfiguredSummary(extraction: ChargesExtractionData): {
  rows: ConfiguredSummaryRow[];
  footnote?: string;
} {
  const documentCount = countChargeDocuments(extraction);
  return {
    rows: [
      {
        label: "Charges détectées",
        value: formatChargesCurrency(extraction.summary.totalCharges),
      },
      {
        label: "Documents analysés",
        value: documentCount === 1 ? "1 facture" : `${documentCount} factures`,
      },
      {
        label: "Catégories principales",
        value: topChargeCategories(extraction),
      },
    ],
  };
}

export function buildAmortissementConfiguredSummary(
  ventilation: AmortissementVentilationData,
  acquisitionPrice?: number,
): ConfiguredSummaryRow[] {
  const amortizableAmount =
    acquisitionPrice ??
    ventilation.components
      .filter((component) => component.allocation === "immobilisation")
      .reduce((sum, component) => sum + component.amount, 0);

  const mobilierCount = ventilation.components.filter(
    (component) =>
      component.source === "mobilier" ||
      component.category === "Mobilier" ||
      component.category === "Cuisine" ||
      component.category === "Électroménager",
  ).length;

  return [
    {
      label: "Bien amortissable",
      value: formatAmortCurrency(amortizableAmount),
    },
    {
      label: "Mobilier détecté",
      value: mobilierCount === 1 ? "1 élément" : `${mobilierCount} éléments`,
    },
    {
      label: "Durée moyenne",
      value:
        ventilation.summary.averageDurationYears > 0
          ? `${ventilation.summary.averageDurationYears} ans`
          : "—",
    },
  ];
}

export function resolveActiviteDashboardSummary(
  draft: DeclarationDraft | undefined,
  property: Property | undefined,
  fiscalRegime: FiscalRegime,
): string | null {
  if (!draft?.inpiConfirmedAt) return null;
  const activity = draft.activityType ?? "LMNP";
  const regime = regimeShortLabel(fiscalRegime);
  const location = property?.city?.trim();
  if (!location) return `${activity} · ${regime}`;
  return `${activity} · ${regime} · ${location}`;
}

export function resolveLogementDashboardSummary(
  draft: DeclarationDraft | undefined,
  property: Property | undefined,
): string | null {
  if (!draft?.logementConfirmedAt || !property) return null;
  const type = propertyTypeLabel(property.propertyType);
  const city = property.city?.trim();
  const price = draft.propertyBackgroundExtraction?.acquisitionPrice;
  const parts = [type, city, price ? formatAmortCurrency(price) : null].filter(Boolean);
  return parts.join(" · ") || null;
}

export function resolveCreditDashboardSummary(draft: DeclarationDraft | undefined): string | null {
  if (draft?.creditDeclaredNoneAt && !draft.creditConfirmedAt) {
    return "Aucun crédit";
  }
  if (!draft?.creditConfirmedAt || !draft.creditFinancing?.loans.length) return null;
  const loan = draft.creditFinancing.loans[0];
  return `${formatCreditCurrency(loan.borrowedAmount)} · ${loan.bank}`;
}

export function resolveRevenusDashboardSummary(draft: DeclarationDraft | undefined): string | null {
  if (!draft?.revenusConfirmedAt || !draft.revenusExtraction) return null;
  return `${formatRevenusCurrency(draft.revenusExtraction.summary.totalRevenue)} détectés`;
}

export function resolveChargesDashboardSummary(draft: DeclarationDraft | undefined): string | null {
  if (draft?.chargesConfirmedAt && draft.chargesExtraction) {
    const docs = countChargeDocuments(draft.chargesExtraction);
    const total = formatChargesCurrency(draft.chargesExtraction.summary.totalCharges);
    return `${docs} documents · ${total}`;
  }
  // P0-3A (audit 2026-09-02) — parcours officiel : chargesAssistant (F-012) est
  // la source de vérité fiscale, chargesExtraction (legacy) peut être absente.
  if (draft?.chargesAssistant) {
    const total = formatChargesCurrency(draft.chargesAssistant.totalDeductible);
    return `${total} de charges déductibles`;
  }
  return null;
}

export function resolveAmortissementDashboardSummary(draft: DeclarationDraft | undefined): string | null {
  if (!draft?.amortissementConfirmedAt && !draft?.amortissementAssistant) return null;
  const total = draft.amortissementAssistant?.totalDotations;
  if (total) {
    return `${Math.round(total).toLocaleString("fr-FR")} € d'amortissements validés`;
  }
  return "Plan validé";
}
