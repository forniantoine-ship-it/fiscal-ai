/**
 * Lot 5.4-B — schéma Vision structuré pour lignes PDF registre d'amortissements.
 * Pattern aligné classify-tax-package-liasse-page.ts : contrat pur, aucun
 * import OpenAI ici (testable sans réseau). Fail closed : payload invalide
 * → aucune ligne (jamais une valeur inventée).
 */

import { z } from "zod";

import type {
  DepreciationRegisterPdfRow,
  DepreciationRegisterPdfRowType,
} from "./depreciation-register-pdf-row";

const OPTIONAL_STRING_JSON = { type: ["string", "null"] } as const;

export const DEPRECIATION_REGISTER_VISION_JSON_SCHEMA = {
  name: "depreciation_register_pdf_rows_v1",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["rows"],
    properties: {
      rows: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: [
            "rowType",
            "assetRef",
            "label",
            "acquisitionDateRaw",
            "startDateRaw",
            "grossCostRaw",
            "openingCumulativeRaw",
            "dotationRaw",
            "closingCumulativeRaw",
            "vncRaw",
            "methodRaw",
            "durationRaw",
            "exitDateRaw",
            "exitLabelRaw",
            "scopeLabel",
            "rawSnippet",
          ],
          properties: {
            rowType: {
              type: "string",
              enum: ["asset", "exit", "subtotal", "total", "unrecognized"],
              description:
                "asset = immobilisation candidate. exit = sortie explicite (mise au rebut, cession...). subtotal = sous-total par compte. total = total global du document (Total / Total Sorties / Total Hors Sorties). unrecognized = ligne détectée mais non classifiable.",
            },
            assetRef: { ...OPTIONAL_STRING_JSON, description: "Référence/numéro immobilisation tel qu'imprimé." },
            label: { ...OPTIONAL_STRING_JSON, description: "Désignation telle qu'imprimée." },
            acquisitionDateRaw: { ...OPTIONAL_STRING_JSON, description: "Date d'acquisition telle qu'imprimée." },
            startDateRaw: { ...OPTIONAL_STRING_JSON, description: "Date de mise en service / début amortissement si distincte, telle qu'imprimée." },
            grossCostRaw: { ...OPTIONAL_STRING_JSON, description: "Valeur d'entrée / valeur brute telle qu'imprimée." },
            openingCumulativeRaw: { ...OPTIONAL_STRING_JSON, description: "Amortissement cumulé au début de l'exercice tel qu'imprimé — null si absent du document, jamais 0." },
            dotationRaw: { ...OPTIONAL_STRING_JSON, description: "Dotation de l'exercice telle qu'imprimée." },
            closingCumulativeRaw: { ...OPTIONAL_STRING_JSON, description: "Amortissement cumulé en fin d'exercice tel qu'imprimé." },
            vncRaw: { ...OPTIONAL_STRING_JSON, description: "Valeur nette comptable telle qu'imprimée." },
            methodRaw: { ...OPTIONAL_STRING_JSON, description: "Mode d'amortissement tel qu'imprimé (ex. L, D, N)." },
            durationRaw: { ...OPTIONAL_STRING_JSON, description: "Durée telle qu'imprimée (ex. « 05 - 00 », « 5 ans »)." },
            exitDateRaw: { ...OPTIONAL_STRING_JSON, description: "Uniquement rowType=exit — date de sortie telle qu'imprimée." },
            exitLabelRaw: { ...OPTIONAL_STRING_JSON, description: "Uniquement rowType=exit — motif/libellé de sortie tel qu'imprimé." },
            scopeLabel: { ...OPTIONAL_STRING_JSON, description: "Uniquement rowType=subtotal|total — libellé de portée tel qu'imprimé (ex. « Total Hors Sorties »)." },
            rawSnippet: { type: "string", description: "Texte brut exact de la ligne source, sans reformulation." },
          },
        },
      },
    },
  },
} as const;

const RegisterVisionRowZod = z.object({
  rowType: z.enum(["asset", "exit", "subtotal", "total", "unrecognized"]),
  assetRef: z.string().nullable(),
  label: z.string().nullable(),
  acquisitionDateRaw: z.string().nullable(),
  startDateRaw: z.string().nullable(),
  grossCostRaw: z.string().nullable(),
  openingCumulativeRaw: z.string().nullable(),
  dotationRaw: z.string().nullable(),
  closingCumulativeRaw: z.string().nullable(),
  vncRaw: z.string().nullable(),
  methodRaw: z.string().nullable(),
  durationRaw: z.string().nullable(),
  exitDateRaw: z.string().nullable(),
  exitLabelRaw: z.string().nullable(),
  scopeLabel: z.string().nullable(),
  rawSnippet: z.string(),
});

export const DepreciationRegisterVisionPayloadZodSchema = z.object({
  rows: z.array(RegisterVisionRowZod),
});

export function buildDepreciationRegisterVisionSystemPrompt(): string {
  return [
    "Tu lis une page d'un registre/tableau d'amortissements comptable français (immobilisations).",
    "Réponds uniquement via le schéma JSON fourni — une entrée par ligne visible du tableau.",
    "Recopie chaque cellule EXACTEMENT telle qu'imprimée (chaîne brute) — aucun calcul, aucune conversion, aucune interprétation.",
    "Une cellule vide/absente sur le document → null, jamais 0 ni une valeur devinée.",
    "rowType=asset pour une ligne immobilisation normale.",
    "rowType=exit uniquement si une sortie/cession/mise au rebut est explicitement indiquée sur cette ligne — jamais déduit.",
    "rowType=subtotal pour un sous-total par compte/section ; rowType=total pour un total global du document (ex. Total, Total Sorties, Total Hors Sorties).",
    "Si un en-tête de compte PCG est imprimé (ex. « Compte 21540000 »), émets une ligne subtotal avec scopeLabel recopiant ce libellé — ne l'omets pas.",
    "rowType=unrecognized si une ligne contient des données mais ne correspond à aucun des cas ci-dessus — ne l'ignore pas, classe-la ainsi plutôt que de l'omettre.",
    "N'invente aucune ligne, aucun total, aucune valeur. En cas de doute sur une cellule, laisse-la null plutôt que de deviner.",
  ].join("\n");
}

const DepreciationRegisterVisionShapeZodSchema = z.object({
  rows: z.array(z.unknown()),
});

/**
 * Valide le payload Vision. Forme racine invalide ({rows:[...]} absent) →
 * aucune ligne (fail closed). Une ligne individuellement invalide dans un
 * payload par ailleurs valide est écartée seule (fail closed par ligne) —
 * elle n'efface jamais les autres lignes correctement lues de la même page.
 * Jamais une ligne inventée ni une valeur par défaut.
 */
export function parseDepreciationRegisterVisionPayload(
  raw: unknown,
  pageNumber: number,
): DepreciationRegisterPdfRow[] {
  const shape = DepreciationRegisterVisionShapeZodSchema.safeParse(raw);
  if (!shape.success) return [];

  const validRows = shape.data.rows
    .map((row) => RegisterVisionRowZod.safeParse(row))
    .filter((r): r is { success: true; data: z.infer<typeof RegisterVisionRowZod> } => r.success)
    .map((r) => r.data);

  return validRows.map((row): DepreciationRegisterPdfRow => ({
    rowType: row.rowType as DepreciationRegisterPdfRowType,
    pageNumber,
    assetRef: row.assetRef ?? undefined,
    label: row.label ?? undefined,
    acquisitionDateRaw: row.acquisitionDateRaw ?? undefined,
    startDateRaw: row.startDateRaw ?? undefined,
    grossCostRaw: row.grossCostRaw ?? undefined,
    openingCumulativeRaw: row.openingCumulativeRaw ?? undefined,
    dotationRaw: row.dotationRaw ?? undefined,
    closingCumulativeRaw: row.closingCumulativeRaw ?? undefined,
    vncRaw: row.vncRaw ?? undefined,
    methodRaw: row.methodRaw ?? undefined,
    durationRaw: row.durationRaw ?? undefined,
    exitDateRaw: row.exitDateRaw ?? undefined,
    exitLabelRaw: row.exitLabelRaw ?? undefined,
    scopeLabel: row.scopeLabel ?? undefined,
    rawSnippet: row.rawSnippet,
  }));
}
