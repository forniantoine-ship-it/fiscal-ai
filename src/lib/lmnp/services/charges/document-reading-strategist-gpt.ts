/**
 * GPT document reading strategist for heterogeneous charge documents.
 *
 * Role: determine WHERE business truth is located — NOT extract amounts.
 * GPT receives structural hints + candidate summaries only in mixed mode.
 * GPT must NEVER rewrite parser output or invent values.
 */

import OpenAI from "openai";

import type { ChargeDocumentType } from "@/lib/lmnp/services/classify-charge-document";
import { logDocumentReadingModeDebug } from "./document-reading-mode-debug";
import type {
  CandidatePoolId,
  DocumentReadingMode,
  DocumentReadingModeDecision,
  DocumentStructureHints,
  DominantSource,
} from "./document-reading-mode-types";
import { resolveDocumentReadingMode } from "./document-reading-mode-resolver";

const DEFAULT_MODEL = "gpt-4o-mini";

export type ReadingStrategistCandidateSummary = {
  candidateId: string;
  amount: number;
  context: string;
  poolId: CandidatePoolId;
};

export type ReadingStrategistInput = {
  corpusPreview: string;
  fileName?: string;
  chargeDocumentType: ChargeDocumentType;
  structuralHints: DocumentStructureHints;
  deterministicDecision: DocumentReadingModeDecision;
  /** Only passed in mixed_layout — GPT never sees full document in other modes. */
  candidateSummaries?: ReadingStrategistCandidateSummary[];
};

export type ReadingStrategistResult = {
  readingMode: DocumentReadingMode;
  dominantSource: DominantSource;
  tableContainsTargetData: boolean | null;
  routingReason: string;
  preferredCandidatePool: CandidatePoolId | null;
  /** When semantic arbitration applies — must reference an existing candidateId. */
  selectedCandidateId: string | null;
};

const STRATEGIST_JSON_SCHEMA = {
  name: "charge_reading_strategy",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    required: [
      "readingMode",
      "dominantSource",
      "tableContainsTargetData",
      "routingReason",
      "preferredCandidatePool",
      "selectedCandidateId",
    ],
    properties: {
      readingMode: {
        type: "string",
        enum: [
          "structured_table",
          "invoice",
          "narrative_contract",
          "fiscal_notice",
          "mixed_layout",
        ],
      },
      dominantSource: {
        type: "string",
        enum: ["parser", "semantic", "hybrid"],
      },
      tableContainsTargetData: {
        type: ["boolean", "null"],
      },
      routingReason: { type: "string" },
      preferredCandidatePool: {
        type: ["string", "null"],
        enum: [
          "table_amounts",
          "payable_section",
          "label_anchored",
          "ocr_fields",
          "narrative_premium",
          "fiscal_matrix",
          "invoice_total",
          null,
        ],
      },
      selectedCandidateId: { type: ["string", "null"] },
    },
  },
} as const;

function getOpenAI(): OpenAI {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY non configurée.");
  }
  return new OpenAI({ apiKey });
}

function getModel(): string {
  return (
    process.env.OPENAI_CHARGE_READING_MODEL ??
    process.env.OPENAI_EXTRACTION_MODEL ??
    process.env.OPENAI_OCR_MODEL ??
    DEFAULT_MODEL
  );
}

function buildStrategistSystemPrompt(): string {
  return `Tu es un stratège de lecture documentaire pour des charges LMNP (factures, avis fiscaux, assurances).

RÔLE: déterminer OÙ se trouve la vérité métier (montant cible) — PAS extraire de montants.

RÈGLES STRICTES:
- Tu ne génères JAMAIS de nouveaux montants.
- Tu ne réécris JAMAIS la structure du document.
- Tu ne supprimes JAMAIS de lignes ou de candidats parser.
- En mode mixed_layout, tu ne vois que les candidats parser fournis — choisis uniquement un candidateId existant ou null.
- Les tableaux fiscaux (valeur locative, revenu cadastral, taux) ne contiennent souvent PAS le montant payable.
- Pour une facture, le montant payable TTC / net à payer prime sur la TVA et les détails.
- Pour une assurance, la prime annuelle contractuelle prime sur les composantes et prorata.

MODES DE LECTURE:
- structured_table: vérité dans le tableau, parser souverain
- invoice: facture payable, montant TTC/net à payer prioritaire
- narrative_contract: contrat textuel, compréhension sémantique dominante
- fiscal_notice: avis fiscal, le montant payable peut être hors matrice fiscale
- mixed_layout: parser extrait d'abord, tu guides quel pool de candidats domine`;
}

function buildStrategistUserPrompt(input: ReadingStrategistInput): string {
  const lines = [
    `Type charge détecté: ${input.chargeDocumentType}`,
    input.fileName ? `Fichier: ${input.fileName}` : "",
    "",
    "Indices structurels:",
    JSON.stringify(input.structuralHints, null, 2),
    "",
    "Décision déterministe (baseline):",
    JSON.stringify(
      {
        mode: input.deterministicDecision.detectedReadingMode,
        tableContainsTargetData: input.deterministicDecision.tableContainsTargetData,
        pools: input.deterministicDecision.candidatePoolsSelected,
      },
      null,
      2,
    ),
    "",
    `Aperçu corpus (${Math.min(input.corpusPreview.length, 1200)} chars):`,
    input.corpusPreview.slice(0, 1200),
  ];

  if (input.candidateSummaries?.length) {
    lines.push("", "Candidats parser (mixed_layout — sélection uniquement parmi ces ids):");
    lines.push(JSON.stringify(input.candidateSummaries, null, 2));
  }

  return lines.filter(Boolean).join("\n");
}

/**
 * GPT reading strategist — refines reading mode for ambiguous charge documents.
 * Falls back to deterministic decision on failure.
 */
export async function resolveReadingStrategyWithGpt(
  input: ReadingStrategistInput,
): Promise<ReadingStrategistResult & { usedGpt: boolean }> {
  const fallback: ReadingStrategistResult = {
    readingMode: input.deterministicDecision.detectedReadingMode,
    dominantSource: input.deterministicDecision.dominantSource,
    tableContainsTargetData: input.deterministicDecision.tableContainsTargetData,
    routingReason: input.deterministicDecision.routingReason,
    preferredCandidatePool: input.deterministicDecision.candidatePoolsSelected[0] ?? null,
    selectedCandidateId: null,
  };

  if (input.deterministicDecision.detectedReadingMode !== "mixed_layout" && !input.candidateSummaries?.length) {
    return { ...fallback, usedGpt: false };
  }

  try {
    const openai = getOpenAI();
    const completion = await openai.chat.completions.create({
      model: getModel(),
      temperature: 0,
      messages: [
        { role: "system", content: buildStrategistSystemPrompt() },
        { role: "user", content: buildStrategistUserPrompt(input) },
      ],
      response_format: {
        type: "json_schema",
        json_schema: STRATEGIST_JSON_SCHEMA,
      },
    });

    const content = completion.choices[0]?.message?.content;
    if (!content) return { ...fallback, usedGpt: false };

    const parsed = JSON.parse(content) as ReadingStrategistResult;

    if (
      parsed.selectedCandidateId &&
      input.candidateSummaries &&
      !input.candidateSummaries.some((c) => c.candidateId === parsed.selectedCandidateId)
    ) {
      parsed.selectedCandidateId = null;
      parsed.routingReason = `${parsed.routingReason} [rejected_invented_candidate_id]`;
    }

    logDocumentReadingModeDebug("gpt_strategist", input.deterministicDecision, {
      gptReadingMode: parsed.readingMode,
      gptTableContainsTargetData: parsed.tableContainsTargetData,
      gptRoutingReason: parsed.routingReason,
      selectedCandidateId: parsed.selectedCandidateId,
    });

    return { ...parsed, usedGpt: true };
  } catch (err) {
    console.log("[document-reading-mode-debug]", {
      stage: "gpt_strategist_failed",
      reason: err instanceof Error ? err.message : String(err),
      fallbackMode: fallback.readingMode,
    });
    return { ...fallback, usedGpt: false };
  }
}

/**
 * Convenience: resolve reading mode deterministically, optionally refine with GPT.
 */
export async function resolveDocumentReadingModeWithStrategy(params: {
  corpus: string;
  fileName?: string;
  chargeDocumentType: ChargeDocumentType;
  workspaceDocumentType?: string;
  candidateSummaries?: ReadingStrategistCandidateSummary[];
  enableGpt?: boolean;
}): Promise<DocumentReadingModeDecision & { gptStrategy?: ReadingStrategistResult }> {
  const deterministic = resolveDocumentReadingMode({
    corpus: params.corpus,
    fileName: params.fileName,
    chargeDocumentType: params.chargeDocumentType,
    workspaceDocumentType: params.workspaceDocumentType,
  });

  if (!params.enableGpt) {
    return deterministic;
  }

  const gptResult = await resolveReadingStrategyWithGpt({
    corpusPreview: params.corpus,
    fileName: params.fileName,
    chargeDocumentType: params.chargeDocumentType,
    structuralHints: deterministic.structuralHints,
    deterministicDecision: deterministic,
    candidateSummaries: params.candidateSummaries,
  });

  if (!gptResult.usedGpt) {
    return deterministic;
  }

  const refined: DocumentReadingModeDecision = {
    ...deterministic,
    detectedReadingMode: gptResult.readingMode,
    dominantSource: gptResult.dominantSource,
    tableContainsTargetData: gptResult.tableContainsTargetData,
    routingReason: `gpt:${gptResult.routingReason}`,
    semanticGuidanceEnabled:
      gptResult.dominantSource !== "parser" || gptResult.selectedCandidateId !== null,
    candidatePoolsSelected: gptResult.preferredCandidatePool
      ? [
          gptResult.preferredCandidatePool,
          ...deterministic.candidatePoolsSelected.filter(
            (pool) => pool !== gptResult.preferredCandidatePool,
          ),
        ]
      : deterministic.candidatePoolsSelected,
  };

  logDocumentReadingModeDebug("resolve_with_gpt", refined, {
    selectedCandidateId: gptResult.selectedCandidateId,
  });

  return { ...refined, gptStrategy: gptResult };
}
