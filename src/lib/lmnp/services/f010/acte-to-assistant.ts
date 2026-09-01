import type { LogementActeExtraction } from "@/lib/documents/gpt/schemas/logement-acte.schema";
import type { TypeBien } from "@/runtime";

/**
 * Étape 4 — Adaptateur (pur) entre l'extraction GPT de l'acte notarié et les
 * entrées de l'Assistant Logement (F-010). Aucune IO : mapping testable.
 * La ventilation terrain/bâti n'est jamais extraite de l'acte (cas rare) —
 * l'Assistant proposera l'estimation SAV-003.
 */
export interface F010ActePrefill {
  prixAcquisition?: number;
  fraisNotaire?: number;
  dateAcquisition?: string;
  surface?: number;
  typeBien?: TypeBien;
  adresse?: string;
}

function mapTypeBien(raw?: string): TypeBien | undefined {
  if (!raw) return undefined;
  const value = raw.toLowerCase();
  if (/(maison|villa|pavillon)/.test(value)) return "maison";
  if (/(appartement|studio|immeuble|duplex|loft)/.test(value)) return "appartement";
  return "autre";
}

function joinAddress(extraction: LogementActeExtraction): string | undefined {
  const parts = [
    extraction.propertyAddress,
    [extraction.propertyPostalCode, extraction.propertyCity].filter(Boolean).join(" ").trim() ||
      undefined,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(", ") : undefined;
}

export function acteExtractionToF010Prefill(
  extraction: LogementActeExtraction,
): F010ActePrefill {
  return {
    prixAcquisition: extraction.propertyPurchasePrice,
    fraisNotaire: extraction.notaryFees,
    dateAcquisition: extraction.acquisitionDate,
    surface: extraction.surfaceM2,
    typeBien: mapTypeBien(extraction.propertyType),
    adresse: joinAddress(extraction),
  };
}
