import type { DocumentType, FiscalYear, LedgerEntry, LmnpDocument, Property, ValidationItem } from "../types";
import { DOCUMENT_REQUIREMENTS, type DocumentRequirement } from "../constants/documents";
import { buildEngineContext } from "../engine/context";

export type ChecklistItemStatus = "present" | "missing" | "recommended";

export interface DocumentChecklistItem {
  id: string;
  documentType: DocumentType;
  label: string;
  level: DocumentRequirement["level"];
  status: ChecklistItemStatus;
  hint?: string;
}

export function computeDocumentChecklist(params: {
  fiscalYear: FiscalYear;
  properties: Property[];
  documents: LmnpDocument[];
  validationItems: ValidationItem[];
  ledgerEntries: LedgerEntry[];
}): DocumentChecklistItem[] {
  const ctx = buildEngineContext(
    params.fiscalYear,
    params.properties,
    params.documents,
    params.validationItems,
    params.ledgerEntries,
    [],
  );

  const applicable = DOCUMENT_REQUIREMENTS.filter((req) => {
    if (!req.regimes.includes(ctx.flags.regime)) return false;
    if (req.condition === "reel_only" && ctx.flags.regime !== "reel") return false;
    if (req.level === "conditional" && req.condition === "has_loan" && !ctx.flags.hasLoan) {
      return false;
    }
    return true;
  });

  const seen = new Set<string>();
  const items: DocumentChecklistItem[] = [];

  for (const req of applicable) {
    const key = `${req.documentType}-${req.level}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const present = params.documents.some(
      (d) => d.documentType === req.documentType && d.status === "analyzed",
    );

    let status: ChecklistItemStatus;
    if (present) {
      status = "present";
    } else if (req.level === "recommended") {
      status = "recommended";
    } else {
      status = "missing";
    }

    items.push({
      id: key,
      documentType: req.documentType,
      label: req.label,
      level: req.level,
      status,
      hint:
        req.level === "conditional"
          ? "Requis si vous avez un emprunt"
          : req.level === "recommended"
            ? "Recommandé pour un dossier complet"
            : undefined,
    });
  }

  return items.sort((a, b) => {
    const order = { missing: 0, recommended: 1, present: 2 };
    return order[a.status] - order[b.status];
  });
}

export function countMissingRequired(items: DocumentChecklistItem[]): number {
  return items.filter((i) => i.status === "missing" && i.level !== "recommended").length;
}
