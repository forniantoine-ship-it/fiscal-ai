import type { RevenusGptLine } from "@/lib/documents/gpt/schemas/revenus-lines.schema";
import type { LmnpDocument, RevenueRawLine, RevenueRawLineSourceType } from "../types";
import { isDateDerivedAmount, isDateLikeValue, parseMonetaryCellWithHeader } from "./revenus-column-semantics";
import { categoryFromColumnHeader } from "./revenus-row-mapping";

const SUMMARY_LINE_PATTERNS =
  /\b(total|sous[\s-]?total|solde|cumul|balance|r[eé]capitulatif|montant total|report|somme)\b/i;

export function inferRevenusSourceType(document: LmnpDocument): RevenueRawLineSourceType {
  const name = document.fileName.toLowerCase();
  const ext = name.split(".").pop() ?? "";

  if (["csv", "xlsx", "xls"].includes(ext)) return "excel";
  if (/airbnb|booking|abritel|vrbo|platform/.test(name)) return "platform_export";
  if (/quittance|loyer|rent receipt/.test(name)) return "rent_receipt";
  if (/attestation|caution|d[eé]p[oô]t/.test(name)) return "attestation";
  return "bank_statement";
}

function isSummaryLabel(label: string | undefined): boolean {
  if (!label?.trim()) return false;
  return SUMMARY_LINE_PATTERNS.test(label.normalize("NFD").replace(/[\u0300-\u036f]/g, ""));
}

export function adaptGptLinesToRevenueRawLines(
  lines: RevenusGptLine[],
  document: LmnpDocument,
  sourceType: RevenueRawLineSourceType,
): RevenueRawLine[] {
  const adapted: RevenueRawLine[] = [];

  for (const line of lines) {
    if (line.isSummaryRow || isSummaryLabel(line.label)) continue;

    const mappedHeader =
      line.sourceColumnHeader ??
      (line.label && categoryFromColumnHeader(line.label) ? line.label : undefined);

    const monetaryCheck = mappedHeader
      ? parseMonetaryCellWithHeader(String(line.amount), mappedHeader)
      : null;

    if (
      mappedHeader &&
      !monetaryCheck &&
      (isDateLikeValue(String(line.amount)) || isDateDerivedAmount(line.amount, String(line.amount)))
    ) {
      continue;
    }

    adapted.push({
      id: crypto.randomUUID(),
      date: line.date ?? null,
      label: line.label ?? mappedHeader ?? "Flux détecté",
      amount: line.amount,
      direction: line.direction,
      sourceDocumentId: document.id,
      sourceType,
      confidence: mappedHeader ? Math.max(line.confidence, 95) : line.confidence,
      sourceColumnHeader: mappedHeader,
      structuredTable: Boolean(mappedHeader),
    });
  }

  return adapted;
}

export function mergeRawLinesByProperty(
  properties: Array<{ id: string }>,
  documentLines: RevenueRawLine[],
): Map<string, RevenueRawLine[]> {
  const map = new Map<string, RevenueRawLine[]>();
  for (const property of properties) {
    map.set(property.id, []);
  }

  const primaryId = properties[0]?.id;
  if (!primaryId) return map;

  map.set(primaryId, [...(map.get(primaryId) ?? []), ...documentLines]);
  return map;
}
