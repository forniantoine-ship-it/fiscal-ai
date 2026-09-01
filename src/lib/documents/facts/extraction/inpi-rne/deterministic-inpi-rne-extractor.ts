import type { DocumentFact } from "../../document-fact";
import { createDocumentFact, createFactId } from "../../document-fact";
import type { DeterministicFactExtractor } from "../deterministic-fact-extractor";
import {
  establishmentFactsFromParsed,
  parseInpiRneEstablishments,
  DETERMINISTIC_INPI_RNE_EXTRACTOR_ID,
} from "./parse-inpi-rne-establishments";
import {
  findLabelValue,
  normalizeApeCode,
  normalizeInpiRneText,
  normalizeSiren,
  splitName,
} from "./inpi-rne-text";

function pushCompanyFact(
  facts: DocumentFact[],
  input: {
    documentId: string;
    type: Parameters<typeof createDocumentFact>[0]["type"];
    value: string;
    evidence: string;
  },
): void {
  facts.push(
    createDocumentFact({
      id: createFactId(input.type, input.documentId),
      type: input.type,
      documentId: input.documentId,
      scope: "company",
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

function extractCompanyFacts(text: string, documentId: string): DocumentFact[] {
  const facts: DocumentFact[] = [];
  const establishmentsMarker = text.search(/Établissements/i);
  const companyText = establishmentsMarker >= 0 ? text.slice(0, establishmentsMarker) : text;

  const fullName = findLabelValue(companyText, /Nom,\s*Prénom\(s\)\s*:\s*(.+)/i);
  if (fullName) {
    const parsedName = splitName(fullName.value);
    if (parsedName) {
      pushCompanyFact(facts, {
        documentId,
        type: "person.name.family",
        value: parsedName.family,
        evidence: fullName.snippet,
      });
      pushCompanyFact(facts, {
        documentId,
        type: "person.name.given",
        value: parsedName.given,
        evidence: fullName.snippet,
      });
    }
  }

  const siren = findLabelValue(companyText, /SIREN\s*(?:\(siège\))?\s*:\s*([0-9\s]{9,11})/i);
  if (siren) {
    const normalized = normalizeSiren(siren.value);
    if (normalized) {
      pushCompanyFact(facts, {
        documentId,
        type: "registry.siren",
        value: normalized,
        evidence: siren.snippet,
      });
    }
  }

  const immatriculation = findLabelValue(
    companyText,
    /Date d['']immatriculation\s*:\s*(\d{2}\/\d{2}\/\d{4})/i,
  );
  if (immatriculation) {
    pushCompanyFact(facts, {
      documentId,
      type: "registry.immatriculation_date",
      value: immatriculation.value,
      evidence: immatriculation.snippet,
    });
  }

  const activityStart = findLabelValue(companyText, /Début d['']activité\s*:\s*(\d{2}\/\d{2}\/\d{4})/i);
  if (activityStart) {
    pushCompanyFact(facts, {
      documentId,
      type: "registry.activity_start_date",
      value: activityStart.value,
      evidence: activityStart.snippet,
    });
  }

  const companyNature = findLabelValue(companyText, /Nature de l['']entreprise\s*:\s*(.+)/i);
  if (companyNature) {
    pushCompanyFact(facts, {
      documentId,
      type: "registry.company_nature",
      value: companyNature.value,
      evidence: companyNature.snippet,
    });
  }

  const legalForm = findLabelValue(companyText, /Forme juridique\s*:\s*(.+)/i);
  if (legalForm) {
    pushCompanyFact(facts, {
      documentId,
      type: "registry.legal_form",
      value: legalForm.value,
      evidence: legalForm.snippet,
    });
  }

  const mainActivity = findLabelValue(companyText, /Activité principale\s*:\s*(.+)/i);
  if (mainActivity) {
    pushCompanyFact(facts, {
      documentId,
      type: "registry.main_activity_label",
      value: mainActivity.value,
      evidence: mainActivity.snippet,
    });
  }

  const ape = findLabelValue(companyText, /Code APE\s*:\s*([0-9]{4}[A-Z][^\n]*)/i);
  if (ape) {
    const normalized = normalizeApeCode(ape.value);
    if (normalized) {
      pushCompanyFact(facts, {
        documentId,
        type: "registry.ape_code",
        value: normalized,
        evidence: ape.snippet,
      });
    }
  }

  const headquarters = findLabelValue(companyText, /Adresse du siège\s*:\s*(.+)/i);
  if (headquarters) {
    pushCompanyFact(facts, {
      documentId,
      type: "address.headquarters",
      value: headquarters.value,
      evidence: headquarters.snippet,
    });
  }

  return facts;
}

export function extractInpiRneDeterministicFacts(rawText: string, documentId: string): DocumentFact[] {
  const text = normalizeInpiRneText(rawText);
  const facts = extractCompanyFacts(text, documentId);

  for (const establishment of parseInpiRneEstablishments(text)) {
    facts.push(...establishmentFactsFromParsed(establishment, documentId));
  }

  return facts;
}

export { DETERMINISTIC_INPI_RNE_EXTRACTOR_ID };
export const deterministicInpiRneExtractor: DeterministicFactExtractor = {
  id: DETERMINISTIC_INPI_RNE_EXTRACTOR_ID,
  canHandle(rawText: string) {
    const normalized = normalizeInpiRneText(rawText).toLowerCase();
    return (
      normalized.includes("registre national des entreprises") ||
      normalized.includes("extrait des inscriptions") ||
      normalized.includes("data.inpi.fr")
    );
  },
  extract({ rawText, documentId }) {
    return extractInpiRneDeterministicFacts(rawText, documentId);
  },
};
