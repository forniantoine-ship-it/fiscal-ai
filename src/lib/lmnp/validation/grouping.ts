import type { Extraction, LmnpDocument, ValidationItem } from "../types";

export const DOCUMENT_TYPE_LABELS: Record<string, string> = {
  lease_contract: "Bail meublé",
  rent_receipt: "Quittance",
  rent_bank_statement: "Relevé de loyers",
  bank_statement: "Relevé bancaire",
  property_tax: "Taxe foncière",
  insurance_invoice: "Assurance PNO",
  condo_charges: "Charges copropriété",
  works_invoice: "Factures travaux",
  furniture_invoice: "Facture mobilier",
  loan_interest_certificate: "Attestation intérêts",
  loan_schedule: "Tableau d'amortissement",
  notary_deed: "Acte notarié",
  unknown: "Document",
};

export interface DocumentValidationGroup {
  document: LmnpDocument | null;
  documentId: string | null;
  items: ValidationItem[];
  extractions: Extraction[];
  pendingCount: number;
  preValidatedCount: number;
}

export function groupValidationByDocument(
  documents: LmnpDocument[],
  validationItems: ValidationItem[],
  extractions: Extraction[],
  filter?: (item: ValidationItem) => boolean,
): DocumentValidationGroup[] {
  const predicate = filter ?? (() => true);
  const filtered = validationItems.filter(predicate);

  const byDoc = new Map<string | null, ValidationItem[]>();

  for (const item of filtered) {
    const key = item.documentId ?? null;
    const list = byDoc.get(key) ?? [];
    list.push(item);
    byDoc.set(key, list);
  }

  const groups: DocumentValidationGroup[] = [];

  for (const [documentId, items] of byDoc) {
    const document = documentId ? documents.find((d) => d.id === documentId) ?? null : null;
    const extractionIds = new Set(items.flatMap((i) => i.extractionIds));
    const docExtractions = extractions.filter((e) => extractionIds.has(e.id));

    groups.push({
      document,
      documentId,
      items: items.sort((a, b) => b.confidence - a.confidence),
      extractions: docExtractions,
      pendingCount: items.filter((i) => i.status === "pending").length,
      preValidatedCount: items.filter(
        (i) => i.status === "pending" && i.confidence >= 95,
      ).length,
    });
  }

  return groups.sort((a, b) => {
    if (a.pendingCount !== b.pendingCount) return b.pendingCount - a.pendingCount;
    return (a.document?.fileName ?? "").localeCompare(b.document?.fileName ?? "");
  });
}
