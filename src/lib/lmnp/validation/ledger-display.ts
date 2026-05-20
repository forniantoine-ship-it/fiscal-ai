import type { DocumentType, LedgerEntry, LmnpDocument } from "../types";
import { DOCUMENT_TYPE_SHORT_LABEL } from "../constants/document-tab-mapping";
import { FIELD_REGISTRY, type FieldKey } from "../types/field-keys";

export function getLedgerOriginBadge(origin: LedgerEntry["origin"]): {
  label: string;
  className: string;
} {
  switch (origin) {
    case "ai_validated":
      return {
        label: "Confirmé par vous",
        className: "bg-emerald-500/15 text-emerald-400 ring-emerald-500/30",
      };
    case "ai_auto_synced":
    case "ai_extracted":
      return {
        label: "Ajouté par l’IA",
        className: "bg-blue-500/15 text-blue-400 ring-blue-500/30",
      };
    case "manual_edit":
      return {
        label: "Corrigé par vous",
        className: "bg-amber-500/15 text-amber-400 ring-amber-500/30",
      };
    default:
      return {
        label: "Saisi par vous",
        className: "bg-white/5 text-zinc-400 ring-white/10",
      };
  }
}

export function getTabLabelForField(fieldKey: FieldKey): string {
  const tab = FIELD_REGISTRY[fieldKey].tab;
  const labels: Record<string, string> = {
    activite: "Activité",
    recettes: "Recettes",
    depenses: "Dépenses",
    immobilisations: "Immobilisations",
    emprunts: "Emprunts",
  };
  return labels[tab] ?? tab;
}

export function formatLedgerSourceLine(params: {
  document?: LmnpDocument | null;
  documentType?: DocumentType;
  fileName?: string;
}): string {
  const typeLabel =
    (params.documentType && DOCUMENT_TYPE_SHORT_LABEL[params.documentType]) ||
    (params.document?.documentType && DOCUMENT_TYPE_SHORT_LABEL[params.document.documentType]);
  const fileName = params.fileName ?? params.document?.fileName;

  if (typeLabel && fileName) return `${typeLabel} · ${fileName}`;
  if (fileName) return fileName;
  if (typeLabel) return typeLabel;
  return "Document source";
}
