import type {
  Extraction,
  FiscalYear,
  LedgerEntry,
  LmnpDocument,
  Property,
  ValidationItem,
} from "../types";

const STORAGE_KEY = "fiscal-ai-lmnp-workspace-v1";

export interface PersistedWorkspace {
  fiscalYear: FiscalYear;
  properties: Property[];
  documents: LmnpDocument[];
  extractions: Extraction[];
  validationItems: ValidationItem[];
  ledgerEntries: LedgerEntry[];
}

export function loadWorkspace(): PersistedWorkspace | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as PersistedWorkspace;
  } catch {
    return null;
  }
}

export function saveWorkspace(data: PersistedWorkspace): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

export function createDefaultWorkspace(): PersistedWorkspace {
  const now = new Date().toISOString();
  const propertyId = crypto.randomUUID();
  const fiscalYearId = crypto.randomUUID();

  return {
    fiscalYear: {
      id: fiscalYearId,
      year: new Date().getFullYear(),
      status: "draft",
      regime: "reel",
      propertyIds: [propertyId],
      createdAt: now,
      updatedAt: now,
    },
    properties: [
      {
        id: propertyId,
        label: "Mon bien locatif",
        address: "",
        city: "",
        postalCode: "",
      },
    ],
    documents: [],
    extractions: [],
    validationItems: [],
    ledgerEntries: [],
  };
}
