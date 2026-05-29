import { ACTIVITE_REGIME_LABEL } from "@/lib/lmnp/constants/activite-product";
import {
  ACTIVITE_ESTABLISHMENT_ADDRESS_LABEL,
  buildActiviteTunnelPromptSection,
} from "@/lib/documents/tunnel-field-ownership";

const MAX_TEXT_LENGTH = 24_000;

export { ACTIVITE_ESTABLISHMENT_ADDRESS_LABEL };

export function buildActiviteInpiSystemPrompt(): string {
  return `You are an expert French LMNP accounting assistant.
You analyze French INPI / SIRET startup documents for the ACTIVITÉ tunnel only.

Product scope: ${ACTIVITE_REGIME_LABEL}. Do NOT extract LMP, micro-BIC, or other regimes.

${buildActiviteTunnelPromptSection()}

EXTRACTION RULES:
- Extract ONLY values explicitly present in the OCR text.
- NEVER invent or infer missing values.
- Return null for absent fields.
- Do NOT extract: SIRET, activity start date, rental start date, property address, loan data.

ADDRESS RULE:
1. adresseEntrepreneur — personal / correspondence address (maps to personal address in UI)
2. adresseEtablissement — establishment address if different ("${ACTIVITE_ESTABLISHMENT_ADDRESS_LABEL}")

Fields to extract when present:
- nom: family name
- prenom: first name
- siren: 9-digit SIREN only (not SIRET)
- email: contact email
- telephone: phone number
- adresseEntrepreneur: personal address (multiline)
- adresseEtablissement: establishment address (multiline, optional)

Return ONLY valid JSON matching the schema.`;
}

export function buildActiviteInpiUserPrompt(params: {
  fileName?: string;
  rawText: string;
}): string {
  const truncated =
    params.rawText.length > MAX_TEXT_LENGTH
      ? `${params.rawText.slice(0, MAX_TEXT_LENGTH)}\n\n[… texte tronqué …]`
      : params.rawText;

  const fileLine = params.fileName ? `Nom du fichier : ${params.fileName}\n\n` : "";

  return `Extract Activité-tunnel fields (LMNP réel simplifié) from this INPI document.
SIREN only — do not return SIRET. No activity dates. No property or loan data.

${fileLine}Texte OCR :
---
${truncated || "(aucun texte)"}
---

Use null for any field not explicitly present.`;
}

export const ACTIVITE_INPI_GPT_JSON_SCHEMA = {
  name: "activite_inpi_extraction",
  strict: true,
  schema: {
    type: "object",
    properties: {
      nom: { type: ["string", "null"], description: "Owned by ACTIVITE — family name" },
      prenom: { type: ["string", "null"], description: "Owned by ACTIVITE — first name" },
      siren: { type: ["string", "null"], description: "Owned by ACTIVITE — 9-digit SIREN" },
      email: { type: ["string", "null"], description: "Owned by ACTIVITE — email" },
      telephone: { type: ["string", "null"], description: "Owned by ACTIVITE — phone" },
      adresseEntrepreneur: {
        type: ["string", "null"],
        description: "Owned by ACTIVITE — personal address (NOT propertyAddress)",
      },
      adresseEtablissement: {
        type: ["string", "null"],
        description: "Owned by ACTIVITE — establishment address (optional)",
      },
    },
    required: [
      "nom",
      "prenom",
      "siren",
      "email",
      "telephone",
      "adresseEntrepreneur",
      "adresseEtablissement",
    ],
    additionalProperties: false,
  },
} as const;
