import type { DocumentTunnel } from "@/lib/documents/types/document-tunnel";
import type { DocumentType } from "@/lib/documents/types/document-type";

/**
 * Product tunnels — who owns which fiscal fields.
 * Prevents cross-tunnel hallucinations: extract only what belongs to the current tunnel
 * and only when visible in the uploaded document. The user remains the final validator.
 */

export type FiscalTunnel = "activite" | "logement" | "credit" | "mobilier";

/** UI copy — establishment address (Activité tunnel, NOT logement). */
export const ACTIVITE_ESTABLISHMENT_ADDRESS_LABEL =
  "Adresse de l'établissement (si différente)";

export const FISCAL_TUNNEL_TO_DOCUMENT_TUNNEL: Record<FiscalTunnel, DocumentTunnel> = {
  activite: "inpi",
  logement: "logement",
  credit: "credit_immobilier",
  mobilier: "factures_mobilier",
};

/** Canonical field keys used across GPT schemas, forms, and extractors. */
export type CanonicalFieldKey =
  // — Activité (INPI) —
  | "firstName"
  | "lastName"
  | "siren"
  | "email"
  | "telephone"
  | "personalAddress"
  | "personalCity"
  | "personalPostalCode"
  | "establishmentAddress"
  | "establishmentCity"
  | "establishmentPostalCode"
  // — Logement —
  | "propertyAddress"
  | "propertyCity"
  | "propertyPostalCode"
  | "propertyAddressLine2"
  | "acquisitionDate"
  | "acquisitionPrice"
  | "surfaceArea"
  | "propertyType"
  // — Crédit —
  | "loanPrincipal"
  | "loanRate"
  | "loanTermMonths"
  | "monthlyPayment"
  | "annualInterest"
  | "lenderName"
  | "loanScheduleDate"
  // — Mobilier / charges —
  | "invoiceAmount"
  | "invoiceDate"
  | "supplierName"
  | "invoiceVat"
  | "furnitureDescription";

export type TunnelFieldOwnership = {
  tunnel: FiscalTunnel;
  field: CanonicalFieldKey;
  /** GPT / extractor key when different from canonical */
  aliases?: string[];
  sourceOfTruth: string[];
};

export const TUNNEL_RESPONSIBILITIES: Record<
  FiscalTunnel,
  { owns: string[]; mustNotExtract: string[]; sourceOfTruth: string[] }
> = {
  activite: {
    owns: [
      "Operator identity (first/last name)",
      "Fiscal registration (SIREN)",
      "Personal / correspondence address",
      "Establishment administrative address (if different)",
      "Email and phone",
      "Product regime: LMNP réel simplifié (fixed — not extracted)",
    ],
    mustNotExtract: [
      "Rental property address (logement)",
      "Acquisition price or date",
      "Loan / mortgage data",
      "Accounting ledger lines",
      "Furniture or works invoices",
    ],
    sourceOfTruth: ["INPI extract", "Kbis", "SIREN/SIRET récapitulatif"],
  },
  logement: {
    owns: [
      "Property address (rental unit)",
      "Acquisition date and price",
      "Surface, property type",
    ],
    mustNotExtract: [
      "SIREN/SIRET",
      "Entrepreneur establishment address from INPI",
      "Loan interest",
      "Invoice amounts",
    ],
    sourceOfTruth: ["Acte notarié", "Compromis", "Taxe foncière", "Pièce d'acquisition"],
  },
  credit: {
    owns: [
      "Loan principal, rate, term",
      "Annual interest",
      "Lender name",
      "Amortization schedule dates",
    ],
    mustNotExtract: [
      "Property acquisition deed fields",
      "INPI identity",
      "Furniture invoices",
    ],
    sourceOfTruth: ["Offre de prêt", "Échéancier", "Tableau d'amortissement"],
  },
  mobilier: {
    owns: ["Invoice amount", "Date", "Supplier", "VAT", "Line descriptions"],
    mustNotExtract: [
      "SIREN/SIRET",
      "Property address",
      "Loan data",
      "INPI entrepreneur address",
    ],
    sourceOfTruth: ["Factures", "Reçus", "Tickets"],
  },
};

/** Fields owned exclusively by the Activité (INPI) tunnel — GPT + UI. */
export const ACTIVITE_OWNED_FIELDS: readonly CanonicalFieldKey[] = [
  "firstName",
  "lastName",
  "siren",
  "email",
  "telephone",
  "personalAddress",
  "personalCity",
  "personalPostalCode",
  "establishmentAddress",
  "establishmentCity",
  "establishmentPostalCode",
] as const;

/** GPT JSON keys for Activité INPI extraction (strict schema). */
export const ACTIVITE_INPI_GPT_OWNED_KEYS = [
  "nom",
  "prenom",
  "siren",
  "email",
  "telephone",
  "adresseEntrepreneur",
  "adresseEtablissement",
] as const;

export type ActiviteInpiGptOwnedKey = (typeof ACTIVITE_INPI_GPT_OWNED_KEYS)[number];

/**
 * Legacy / hallucinated keys that must never appear in Activité GPT output or UI prefill.
 * Property address belongs to the Logement tunnel only.
 */
export const ACTIVITE_FORBIDDEN_FIELD_ALIASES = [
  "logementAddress",
  "logementCity",
  "logementPostalCode",
  "propertyAddress",
  "propertyCity",
  "propertyPostalCode",
  "adresseLogement",
  "adresseBien",
  "bienLoue",
  "rentalAddress",
  "address",
  "city",
  "postalCode",
  "acquisitionPrice",
  "acquisitionDate",
  "loanAmount",
  "loanPrincipal",
  "annualInterest",
  "invoiceAmount",
] as const;

/** Authoritative owner tunnel per canonical field — single source of truth. */
export const FIELD_OWNERSHIP: Record<CanonicalFieldKey, FiscalTunnel> = {
  firstName: "activite",
  lastName: "activite",
  siren: "activite",
  email: "activite",
  telephone: "activite",
  personalAddress: "activite",
  personalCity: "activite",
  personalPostalCode: "activite",
  establishmentAddress: "activite",
  establishmentCity: "activite",
  establishmentPostalCode: "activite",
  propertyAddress: "logement",
  propertyCity: "logement",
  propertyPostalCode: "logement",
  propertyAddressLine2: "logement",
  acquisitionDate: "logement",
  acquisitionPrice: "logement",
  surfaceArea: "logement",
  propertyType: "logement",
  loanPrincipal: "credit",
  loanRate: "credit",
  loanTermMonths: "credit",
  monthlyPayment: "credit",
  annualInterest: "credit",
  lenderName: "credit",
  loanScheduleDate: "credit",
  invoiceAmount: "mobilier",
  invoiceDate: "mobilier",
  supplierName: "mobilier",
  invoiceVat: "mobilier",
  furnitureDescription: "mobilier",
};

/** GPT / extractor keys → canonical field keys. */
export const EXTRACTION_KEY_ALIASES: Record<string, CanonicalFieldKey> = {
  loanAmount: "loanPrincipal",
  borrowedAmount: "loanPrincipal",
  bankName: "lenderName",
  bank: "lenderName",
  lender: "lenderName",
  durationMonths: "loanTermMonths",
  loanTerm: "loanTermMonths",
  rate: "loanRate",
  ratePercent: "loanRate",
  nom: "lastName",
  prenom: "firstName",
  adresseEntrepreneur: "personalAddress",
  adresseEtablissement: "establishmentAddress",
  propertyAddress: "propertyAddress",
  address: "propertyAddress",
};

const FIELD_OWNER: Partial<Record<CanonicalFieldKey, FiscalTunnel>> = FIELD_OWNERSHIP;

export function canonicalFieldKey(rawKey: string): CanonicalFieldKey | undefined {
  if (rawKey in FIELD_OWNERSHIP) return rawKey as CanonicalFieldKey;
  return EXTRACTION_KEY_ALIASES[rawKey];
}

export function getFieldOwner(field: CanonicalFieldKey): FiscalTunnel | undefined {
  return FIELD_OWNER[field];
}

export function documentTunnelToFiscalTunnel(tunnel: DocumentTunnel): FiscalTunnel | undefined {
  const entry = Object.entries(FISCAL_TUNNEL_TO_DOCUMENT_TUNNEL).find(([, docTunnel]) => docTunnel === tunnel);
  return entry ? (entry[0] as FiscalTunnel) : undefined;
}

export function fiscalTunnelFromUploadContext(params: {
  documentTunnel?: DocumentTunnel;
  category?: string;
}): FiscalTunnel {
  if (params.documentTunnel) {
    const mapped = documentTunnelToFiscalTunnel(params.documentTunnel);
    if (mapped) return mapped;
  }
  if (params.category === "emprunt") return "credit";
  return "logement";
}

export function sourceDocumentLabel(documentType?: DocumentType | string, documentId?: string): string {
  return documentType ?? documentId ?? "unknown";
}

export function isFieldOwnedByTunnel(field: CanonicalFieldKey, tunnel: FiscalTunnel): boolean {
  return FIELD_OWNER[field] === tunnel;
}

export function buildActiviteTunnelPromptSection(): string {
  const r = TUNNEL_RESPONSIBILITIES.activite;
  return `TUNNEL: ACTIVITÉ (INPI) — structured fiscal workflow
You may ONLY extract fields owned by this tunnel:
${r.owns.map((line) => `- ${line}`).join("\n")}

DO NOT extract (owned by other tunnels):
${r.mustNotExtract.map((line) => `- ${line}`).join("\n")}

Source-of-truth documents for this tunnel: ${r.sourceOfTruth.join(", ")}.
Do NOT infer values from other document types or from general LMNP knowledge.
Extract only values explicitly visible in the OCR text of the uploaded INPI document.`;
}

export function buildLogementTunnelPromptSection(): string {
  const r = TUNNEL_RESPONSIBILITIES.logement;
  return `TUNNEL: LOGEMENT — source of truth: ${r.sourceOfTruth.join(", ")}.
Owned: property address, acquisition data. NOT SIREN/INPI identity.`;
}

export function buildCreditTunnelPromptSection(): string {
  const r = TUNNEL_RESPONSIBILITIES.credit;
  return `TUNNEL: CRÉDIT — source of truth: ${r.sourceOfTruth.join(", ")}.
Owned: loan principal, rate, interest, schedule. NOT property deed or INPI identity.`;
}

export function buildMobilierTunnelPromptSection(): string {
  const r = TUNNEL_RESPONSIBILITIES.mobilier;
  return `TUNNEL: MOBILIER — source of truth: ${r.sourceOfTruth.join(", ")}.
Owned: invoice lines only. NOT property or registration data.`;
}

export type SanitizeTunnelPayloadResult = {
  data: Record<string, unknown>;
  strippedKeys: string[];
};

/**
 * Strips keys that do not belong to the tunnel (prevents cross-tunnel pollution from model hallucinations).
 */
export function sanitizeGptPayloadForTunnel(
  tunnel: FiscalTunnel,
  raw: unknown,
  allowedKeys: readonly string[],
): SanitizeTunnelPayloadResult {
  if (!raw || typeof raw !== "object") {
    return { data: {}, strippedKeys: [] };
  }

  const input = raw as Record<string, unknown>;
  const allowed = new Set<string>(allowedKeys);
  const forbidden = new Set<string>(
    tunnel === "activite" ? ACTIVITE_FORBIDDEN_FIELD_ALIASES : [],
  );

  const data: Record<string, unknown> = {};
  const strippedKeys: string[] = [];

  for (const [key, value] of Object.entries(input)) {
    if (forbidden.has(key)) {
      strippedKeys.push(key);
      continue;
    }
    if (!allowed.has(key)) {
      strippedKeys.push(key);
      continue;
    }
    data[key] = value;
  }

  if (strippedKeys.length > 0) {
    console.log("[tunnel-ownership] stripped cross-tunnel keys", {
      tunnel,
      strippedKeys,
    });
  }

  return { data, strippedKeys };
}

export function assertActiviteGptKeysOnly(keys: string[]): void {
  const allowed = new Set<string>(ACTIVITE_INPI_GPT_OWNED_KEYS);
  const invalid = keys.filter((k) => !allowed.has(k));
  if (invalid.length > 0) {
    console.warn("[tunnel-ownership] unexpected Activité GPT keys after sanitize", { invalid });
  }
}
