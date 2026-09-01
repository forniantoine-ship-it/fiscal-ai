import { z } from "zod";

import {
  ACTIVITE_INPI_GPT_OWNED_KEYS,
  sanitizeGptPayloadForTunnel,
} from "@/lib/documents/tunnel-field-ownership";

/**
 * Activité (INPI) GPT schema — entrepreneur identity + fiscal registration only.
 * Product: LMNP réel simplifié. No SIRET, activity date, regime, or LMP in UI.
 */

export const activiteInpiGptResponseSchema = z.object({
  nom: z.string().nullable(),
  prenom: z.string().nullable(),
  siren: z.string().nullable(),
  email: z.string().nullable(),
  telephone: z.string().nullable(),
  adresseEntrepreneur: z.string().nullable(),
  adresseEtablissement: z.string().nullable(),
});

export type ActiviteInpiGptResponse = z.infer<typeof activiteInpiGptResponseSchema>;

export type ActiviteInpiGptData = {
  nom?: string;
  prenom?: string;
  siren?: string;
  email?: string;
  telephone?: string;
  adresseEntrepreneur?: string;
  adresseEtablissement?: string;
};

export type ActiviteGptExtractionResult = {
  success: boolean;
  data: ActiviteInpiGptData;
  reasoning?: string;
  missingFields?: string[];
  rawResponse?: unknown;
  /**
   * Per-field provenance is attached downstream in `activite-gpt-ui-prefill.ts`
   * after optional OCR grounding (Phase 2).
   */
};

export const ACTIVITE_INPI_GPT_FIELD_KEYS = ACTIVITE_INPI_GPT_OWNED_KEYS;

export type ActiviteInpiGptFieldKey = (typeof ACTIVITE_INPI_GPT_FIELD_KEYS)[number];

function normalizeNullableString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeSiren(value: unknown): string | null {
  const raw = normalizeNullableString(value);
  if (!raw) return null;
  const digits = raw.replace(/\D/g, "");
  return digits.length === 9 ? digits : raw.replace(/\s/g, "");
}

export function normalizeActiviteInpiGptResponse(raw: unknown): ActiviteInpiGptResponse {
  const { data: sanitized } = sanitizeGptPayloadForTunnel(
    "activite",
    raw,
    ACTIVITE_INPI_GPT_OWNED_KEYS,
  );

  if (!sanitized || typeof sanitized !== "object" || Object.keys(sanitized).length === 0) {
    return emptyActiviteInpiGptResponse();
  }

  const data = sanitized as Record<string, unknown>;
  return {
    nom: normalizeNullableString(data.nom),
    prenom: normalizeNullableString(data.prenom),
    siren: normalizeSiren(data.siren),
    email: normalizeNullableString(data.email),
    telephone: normalizeNullableString(data.telephone),
    adresseEntrepreneur: normalizeNullableString(data.adresseEntrepreneur),
    adresseEtablissement: normalizeNullableString(data.adresseEtablissement),
  };
}

function emptyActiviteInpiGptResponse(): ActiviteInpiGptResponse {
  return {
    nom: null,
    prenom: null,
    siren: null,
    email: null,
    telephone: null,
    adresseEntrepreneur: null,
    adresseEtablissement: null,
  };
}

export function toActiviteInpiGptData(response: ActiviteInpiGptResponse): ActiviteInpiGptData {
  const data: ActiviteInpiGptData = {};
  for (const key of ACTIVITE_INPI_GPT_FIELD_KEYS) {
    const value = response[key];
    if (value) data[key] = value;
  }
  return data;
}

export function listMissingActiviteFields(data: ActiviteInpiGptData): string[] {
  return ACTIVITE_INPI_GPT_FIELD_KEYS.filter((key) => !data[key]);
}
