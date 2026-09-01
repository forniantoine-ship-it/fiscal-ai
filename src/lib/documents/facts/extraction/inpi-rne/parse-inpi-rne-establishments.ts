import type { DocumentFact } from "../../document-fact";
import { createDocumentFact, createFactId } from "../../document-fact";
import type { FactType } from "../../fact-type-registry";
import {
  cleanLabelValue,
  findLabelValue,
  normalizeSiret,
  parseMultilineAddress,
} from "./inpi-rne-text";

export const DETERMINISTIC_INPI_RNE_EXTRACTOR_ID = "deterministic-inpi-rne-v1";

export type ParsedEstablishment = {
  entityId: string;
  type: string;
  status: string;
  siret: string;
  activityStartDate?: string;
  closureDate?: string;
  address?: string;
  companyNature?: string;
  apeCode?: string;
  activityLabel?: string;
  snippets: Partial<Record<string, string>>;
};

function pushScopedFact(
  facts: DocumentFact[],
  input: {
    documentId: string;
    entityId: string;
    type: FactType;
    value: string;
    evidence: string;
    scope?: "establishment";
  },
): void {
  facts.push(
    createDocumentFact({
      id: createFactId(input.type, input.documentId, input.entityId),
      type: input.type,
      documentId: input.documentId,
      entityId: input.entityId,
      scope: input.scope ?? "establishment",
      value: input.value,
      status: "extracted",
      origin: "document",
      fieldSource: "extracted",
      evidence: { snippet: input.evidence },
      extractorId: DETERMINISTIC_INPI_RNE_EXTRACTOR_ID,
      requiresConfirmation: false,
    }),
  );
}

function deriveEstablishmentStatus(typeLabel: string): string {
  const normalized = cleanLabelValue(typeLabel).toLowerCase();
  if (normalized.includes("fermé") || normalized.includes("ferme")) return "fermé";
  if (normalized.includes("principal")) return "actif";
  if (normalized.includes("secondaire")) return "actif";
  return cleanLabelValue(typeLabel);
}

export function parseInpiRneEstablishments(text: string): ParsedEstablishment[] {
  const marker = /Type d'établissement\s*:/gi;
  const matches = [...text.matchAll(marker)];
  if (matches.length === 0) return [];

  const establishments: ParsedEstablishment[] = [];

  for (let index = 0; index < matches.length; index++) {
    const start = matches[index]!.index ?? 0;
    const end = index + 1 < matches.length ? matches[index + 1]!.index ?? text.length : text.length;
    const block = text.slice(start, end);

    const typeMatch = block.match(/Type d'établissement\s*:\s*(.+)/i);
    const typeLabel = cleanLabelValue(typeMatch?.[1] ?? "");
    if (!typeLabel) continue;

    const siretMatch = findLabelValue(block, /Siret\s*:\s*([0-9\s]{14,17})/i);
    const siret = siretMatch ? normalizeSiret(siretMatch.value) : undefined;
    if (!siret) continue;

    const activityStart = findLabelValue(block, /Date début d['']activité\s*:\s*(\d{2}\/\d{2}\/\d{4})/i);
    const status = deriveEstablishmentStatus(typeLabel);
    const closureSource =
      status === "fermé"
        ? `${index > 0 ? text.slice(Math.max(0, start - 280), start) : ""}${block}`
        : block;
    const closure =
      status === "fermé"
        ? findLabelValue(
            closureSource,
            /(?:Cet établissement a été fermé le|fermé le)\s*(\d{2}\/\d{2}\/\d{4})/i,
          )
        : null;
    const nature = findLabelValue(block, /Nature de l['']établissement\s*:\s*(.+)/i);
    const ape = findLabelValue(block, /Code APE\s*:\s*([0-9]{4}[A-Z][^\n]*)/i);
    const activity = findLabelValue(block, /Activité\s*:\s*(.+)/i);

    const addressMatch = block.match(/Adresse\s*:\s*/i);
    const address = addressMatch
      ? parseMultilineAddress(block, (addressMatch.index ?? 0) + addressMatch[0].length)
      : null;

    const snippets: ParsedEstablishment["snippets"] = {
      type: typeMatch?.[0]?.trim(),
      siret: siretMatch?.snippet,
      activityStart: activityStart?.snippet,
      closure: closure?.snippet,
      address: address?.snippet,
    };

    establishments.push({
      entityId: siret,
      type: typeLabel,
      status,
      siret,
      activityStartDate: activityStart?.value,
      closureDate: closure?.value,
      address: address?.value,
      companyNature: nature?.value,
      apeCode: ape?.value.split(/\s-/)[0]?.trim(),
      activityLabel: activity?.value,
      snippets,
    });
  }

  return establishments;
}

export function establishmentFactsFromParsed(
  parsed: ParsedEstablishment,
  documentId: string,
): DocumentFact[] {
  const facts: DocumentFact[] = [];

  pushScopedFact(facts, {
    documentId,
    entityId: parsed.entityId,
    type: "registry.siret",
    value: parsed.siret,
    evidence: parsed.snippets.siret ?? `SIRET ${parsed.siret}`,
  });

  pushScopedFact(facts, {
    documentId,
    entityId: parsed.entityId,
    type: "establishment.type",
    value: parsed.type,
    evidence: parsed.snippets.type ?? parsed.type,
  });

  pushScopedFact(facts, {
    documentId,
    entityId: parsed.entityId,
    type: "establishment.status",
    value: parsed.status,
    evidence: parsed.snippets.type ?? parsed.type,
  });

  if (parsed.activityStartDate) {
    pushScopedFact(facts, {
      documentId,
      entityId: parsed.entityId,
      type: "establishment.activity_start_date",
      value: parsed.activityStartDate,
      evidence: parsed.snippets.activityStart ?? parsed.activityStartDate,
    });
  }

  if (parsed.closureDate) {
    pushScopedFact(facts, {
      documentId,
      entityId: parsed.entityId,
      type: "establishment.closure_date",
      value: parsed.closureDate,
      evidence: parsed.snippets.closure ?? parsed.closureDate,
    });
  }

  if (parsed.address) {
    pushScopedFact(facts, {
      documentId,
      entityId: parsed.entityId,
      type: "address.establishment",
      value: parsed.address,
      evidence: parsed.snippets.address ?? parsed.address,
    });
  }

  return facts;
}
