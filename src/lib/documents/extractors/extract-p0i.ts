import {
  CONFIDENCE_THRESHOLDS,
  createConfidenceScore,
} from "../types/confidence-score";
import type { ExtractedField } from "../types/extraction-result";
import type { ExtractionResult } from "../types/extraction-result";
import { EXTRACTION_SCHEMA_VERSION, type DocumentExtractor, type ExtractorContext } from "./extractor.types";

export type P0iExtractedData = {
  adresseEtablissement?: string;
  acquisitionDate?: string;
  salePrice?: number;
  surfaceM2?: number;
};

export const P0I_EXTRACTOR_ID = "extractor.p0i";

const ADRESSE_RE =
  /\b(?:adresse|situation\s+du\s+bien|d[ée]signation\s+du\s+bien)\s*:?\s*([^\n;|]{8,120})/i;
const DATE_RE =
  /\b(?:date\s+(?:de\s+)?(?:vente|acquisition|acte))\s*:?\s*(\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}|\d{4}[/.-]\d{1,2}[/.-]\d{1,2})\b/i;
const PRICE_RE = /\b(?:prix|montant)\s*(?:de\s+vente|total)?\s*:?\s*([\d\s.,]+)\s*(?:€|eur)?/i;
const SURFACE_RE = /\b(?:surface|superficie)\s*:?\s*([\d.,]+)\s*m[²2]/i;

function normalizeDate(raw: string): string | undefined {
  const trimmed = raw.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  const slash = trimmed.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/);
  if (slash) {
    const day = slash[1].padStart(2, "0");
    const month = slash[2].padStart(2, "0");
    const year = slash[3].length === 2 ? `20${slash[3]}` : slash[3];
    return `${year}-${month}-${day}`;
  }
  return undefined;
}

function parseEuroAmount(raw: string): number | undefined {
  const normalized = raw.replace(/\s/g, "").replace(",", ".");
  const n = Number.parseFloat(normalized);
  return Number.isFinite(n) ? n : undefined;
}

export const extractP0i: DocumentExtractor<P0iExtractedData> = {
  id: P0I_EXTRACTOR_ID,
  documentType: "p0i",
  version: "0.2.0",
  supportedSchemaVersion: EXTRACTION_SCHEMA_VERSION,
  async extract(context: ExtractorContext): Promise<ExtractionResult<P0iExtractedData>> {
    console.log("[extraction] p0i start", {
      documentId: context.documentId,
      fileName: context.fileName,
      textLength: context.rawText.length,
    });

    const blob = `${context.rawText}\n${context.fileName}`;
    const data: P0iExtractedData = {};
    const factors: string[] = [];
    const fields: ExtractedField[] = [];

    const adresseMatch = blob.match(ADRESSE_RE);
    if (adresseMatch) {
      data.adresseEtablissement = adresseMatch[1].trim().replace(/\s{2,}/g, " ");
      factors.push("adresse:label");
      fields.push({
        key: "adresseEtablissement",
        label: "Adresse établissement",
        value: data.adresseEtablissement,
        confidence: createConfidenceScore(0.76, ["adresse:label"]),
        evidence: adresseMatch[0],
      });
    }

    const dateMatch = blob.match(DATE_RE);
    if (dateMatch) {
      data.acquisitionDate = normalizeDate(dateMatch[1]);
      factors.push("date:regex");
      fields.push({
        key: "acquisitionDate",
        label: "Date acquisition",
        value: data.acquisitionDate,
        confidence: createConfidenceScore(0.74, ["date:regex"]),
        evidence: dateMatch[0],
      });
    }

    const priceMatch = blob.match(PRICE_RE);
    if (priceMatch) {
      data.salePrice = parseEuroAmount(priceMatch[1]);
      if (data.salePrice !== undefined) {
        factors.push("price:regex");
        fields.push({
          key: "salePrice",
          label: "Prix de vente",
          value: data.salePrice,
          confidence: createConfidenceScore(0.72, ["price:regex"]),
          evidence: priceMatch[0],
        });
      }
    }

    const surfaceMatch = blob.match(SURFACE_RE);
    if (surfaceMatch) {
      data.surfaceM2 = parseEuroAmount(surfaceMatch[1]);
      if (data.surfaceM2 !== undefined) {
        factors.push("surface:regex");
        fields.push({
          key: "surfaceM2",
          label: "Surface",
          value: data.surfaceM2,
          confidence: createConfidenceScore(0.7, ["surface:regex"]),
          evidence: surfaceMatch[0],
        });
      }
    }

    const avgConfidence =
      fields.length > 0
        ? fields.reduce((sum, f) => sum + f.confidence.value, 0) / fields.length
        : 0;

    const needsReview =
      fields.length === 0 ||
      avgConfidence < CONFIDENCE_THRESHOLDS.review ||
      !data.adresseEtablissement;

    const result: ExtractionResult<P0iExtractedData> = {
      documentType: "p0i",
      extractorId: P0I_EXTRACTOR_ID,
      fields,
      data,
      confidence: createConfidenceScore(avgConfidence, factors),
      needsReview,
      explainability: [`file:${context.fileName}`, ...factors],
      schemaVersion: EXTRACTION_SCHEMA_VERSION,
    };

    console.log("[extraction] p0i complete", {
      documentId: context.documentId,
      fieldCount: fields.length,
      confidence: avgConfidence,
      needsReview,
    });

    return result;
  },
};
