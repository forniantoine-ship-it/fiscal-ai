import type { GovernedFieldStore } from "@/lib/documents/types/governed-field";
import type { LogementActeExtraction } from "@/lib/documents/gpt/schemas/logement-acte.schema";
import type { CanonicalFieldKey } from "@/lib/documents/tunnel-field-ownership";
import {
  runLogementGptPipeline,
  type LogementGptPipelineResult,
} from "@/lib/lmnp/services/logement-gpt-pipeline";
import type { LmnpDocument } from "@/lib/lmnp/types";
import {
  shouldResumeF010,
  type F010FieldKey,
  type F010PersistedState,
  type F010State,
} from "@/runtime/assistants/f010-logement/types";
import type { TypeBien } from "@/runtime";

import { acteExtractionToF010Prefill, type F010ActePrefill } from "./acte-to-assistant";

/**
 * Cycle 1 — adaptateur/orchestrateur pur entre le pipeline documentaire partagé
 * (Tunnel A) et l'Assistant F-010. Ne réimplémente ni OCR, ni GPT, ni détection de
 * corpus, ni fallback Vision — délègue entièrement à `runLogementGptPipeline`.
 * Aucune machine d'état, aucune logique conversationnelle : ce fichier ne connaît
 * pas `F010Step`/`F010Action` et ne doit jamais en dépendre.
 */

// ---------------------------------------------------------------------------
// UPLOAD → PIPELINE
// ---------------------------------------------------------------------------

/**
 * Construit un `LmnpDocument` minimal, identique à ce que produirait le reducer
 * pour ce même upload (`UPLOAD_DOCUMENTS`), pour un usage synchrone immédiat par
 * le pipeline — sans dépendre d'une relecture du store React (évite la course
 * entre le commit du `dispatch` et l'appel du pipeline).
 */
export function buildF010SyntheticDocument(params: {
  id: string;
  fiscalYearId: string;
  file: File;
}): LmnpDocument {
  const { id, fiscalYearId, file } = params;
  return {
    id,
    fiscalYearId,
    fileName: file.name,
    mimeType: file.type || "application/octet-stream",
    sizeBytes: file.size,
    category: "autre",
    documentType: "unknown",
    status: "uploaded",
    uploadedAt: new Date().toISOString(),
  };
}

export type RunF010DocumentAnalysisParams = {
  file: File;
  document: LmnpDocument;
  fiscalYear?: number;
};

/**
 * Seule voie d'analyse documentaire pour F-010 (contrainte Cycle 1 #1). Délègue
 * intégralement à `runLogementGptPipeline` — OCR résilient, détection de corpus
 * invalide et fallback Vision sont hérités tels quels, jamais recréés ici.
 */
export async function runF010DocumentAnalysis(
  params: RunF010DocumentAnalysisParams,
): Promise<LogementGptPipelineResult> {
  const { file, document, fiscalYear } = params;
  return runLogementGptPipeline({
    document,
    getFile: (id) => (id === document.id ? file : undefined),
    fiscalYear,
  });
}

// ---------------------------------------------------------------------------
// EXTRACTION → PROJECTION F010 EXISTANTE
// ---------------------------------------------------------------------------

/**
 * Ré-export direct — la projection acte → F010 (`acteExtractionToF010Prefill`)
 * n'est pas modifiée par le Cycle 1, seulement réutilisée.
 */
export { acteExtractionToF010Prefill, type F010ActePrefill };

// ---------------------------------------------------------------------------
// GOUVERNANCE CROSS-TUNNEL — champs Crédit (contrainte #6)
// ---------------------------------------------------------------------------

/**
 * Champs de `LogementActeExtraction` possédés par Crédit (F-011), renommés vers
 * les clés canoniques attendues par `ingestExtractionIntoStore`. Miroir du
 * mapping privé `CREDIT_FIELD_SOURCES` de `logement-gpt-ui-prefill.ts` (non
 * exporté) — dupliqué ici volontairement plutôt que de coupler ce fichier à un
 * module interne au Tunnel A. Ces champs ne doivent jamais atteindre `F010State`.
 */
const F010_CREDIT_CANONICAL_PAYLOAD_KEYS: Partial<Record<keyof LogementActeExtraction, CanonicalFieldKey>> = {
  loanAmount: "loanPrincipal",
  bankName: "lenderName",
  loanDurationMonths: "loanTermMonths",
  monthlyPayment: "monthlyPayment",
  interestRate: "loanRate",
};

/**
 * Construit le payload à passer à `ingestExtractionIntoStore` pour les 5 champs
 * crédit d'un acte notarié. Fonction pure — ne dispatch rien, ne touche aucun
 * store ; l'appelant est responsable de l'ingestion et du `dispatch`.
 */
export function buildF010CreditGovernancePayload(
  extraction: LogementActeExtraction,
): Record<string, unknown> {
  const payload: Record<string, unknown> = {};
  for (const [rawKey, canonicalKey] of Object.entries(F010_CREDIT_CANONICAL_PAYLOAD_KEYS) as [
    keyof LogementActeExtraction,
    CanonicalFieldKey,
  ][]) {
    const value = extraction[rawKey];
    if (value !== undefined && value !== null) payload[canonicalKey] = value;
  }
  return payload;
}

// ---------------------------------------------------------------------------
// GOUVERNANCE — verrouillage des champs F010 confirmés (contrainte #7)
// ---------------------------------------------------------------------------

/**
 * Champs F010 qui possèdent un équivalent canonique partagé dans
 * `tunnel-field-ownership.ts`. `fraisNotaire` n'a AUCUNE clé canonique dans ce
 * registre aujourd'hui (ni pour Logement ni ailleurs) — il ne peut donc pas être
 * verrouillé via `lockGovernedField` sans étendre ce registre partagé, ce qui est
 * hors périmètre du Cycle 1. Signalé, non inventé.
 */
export const F010_FIELD_TO_CANONICAL: Partial<
  Record<"prixAcquisition" | "dateAcquisition" | "surface" | "typeBien", CanonicalFieldKey>
> = {
  prixAcquisition: "acquisitionPrice",
  dateAcquisition: "acquisitionDate",
  surface: "surfaceArea",
  typeBien: "propertyType",
};

export type F010ConfirmedBienFields = {
  prixAcquisition?: number;
  dateAcquisition?: string;
  surface?: number;
  typeBien?: string;
};

/**
 * Calcule les paires (champ canonique, valeur) à verrouiller quand l'utilisateur
 * confirme `collect_bien` — pure, ne dispatch rien. L'appelant applique chaque
 * paire via `lockGovernedField` puis dispatch le store résultant.
 */
export function buildF010ConfirmedFieldLocks(
  fields: F010ConfirmedBienFields,
): Array<{ field: CanonicalFieldKey; value: unknown }> {
  const locks: Array<{ field: CanonicalFieldKey; value: unknown }> = [];
  for (const [key, canonical] of Object.entries(F010_FIELD_TO_CANONICAL) as [
    keyof F010ConfirmedBienFields,
    CanonicalFieldKey,
  ][]) {
    const value = fields[key];
    if (value === undefined || value === "") continue;
    locks.push({ field: canonical, value });
  }
  return locks;
}

/**
 * Un champ canonique est-il déjà verrouillé (confirmé manuellement, par F010 ou
 * par un autre tunnel) ? Volontairement distinct de `canPrefillFormField`
 * (cross-tunnel-prefill.ts) : cette dernière ajoute la règle A ("ne préremplir
 * qu'un champ vide"), pensée pour le formulaire persistant du Tunnel A — elle
 * régresserait le préremplissage F010 (ex. `typeBien` a toujours une valeur par
 * défaut non vide, `prixAcquisition` est réécrit à chaque nouvel essai d'upload
 * tant que `collect_bien` n'est pas soumis). Ici on ne veut vérifier que le
 * verrou, jamais la vacuité du champ local.
 */
export function isCanonicalFieldLocked(store: GovernedFieldStore, field: CanonicalFieldKey): boolean {
  return Boolean(store[field]?.manuallyValidated);
}

// ---------------------------------------------------------------------------
// EXTRACTION → RECOVERY (contrainte #4 : jamais LOGEMENT_CORE_FIELD_KEYS)
// ---------------------------------------------------------------------------

export type F010ExtractionState = "success" | "partial" | "failed";

/**
 * Champs "cœur" propres à F010 — jamais `LOGEMENT_CORE_FIELD_KEYS` du Tunnel A
 * (qui inclut `city`/`postalCode`, absents de `F010State`/`F010ActePrefill`).
 * `prixAcquisition`/`dateAcquisition` sont les deux seuls champs réellement
 * obligatoires dans l'écran `collect_bien` actuel (bouton désactivé sans eux).
 */
export const F010_CORE_PREFILL_KEYS: readonly (keyof F010ActePrefill)[] = [
  "prixAcquisition",
  "dateAcquisition",
] as const;

/** Champs F010 informatifs mais non bloquants. */
export const F010_SUPPLEMENTARY_PREFILL_KEYS: readonly (keyof F010ActePrefill)[] = [
  "typeBien",
  "surface",
  "fraisNotaire",
  "adresse",
] as const;

export type F010ExtractionOutcome = {
  state: F010ExtractionState;
  hasAnyPrefillField: boolean;
  missingCoreFields: (keyof F010ActePrefill)[];
};

export type DeriveF010ExtractionStateInput = {
  extractionSuccess: boolean;
  pipelineError: boolean;
  prefill: F010ActePrefill;
};

/**
 * Dérive l'état UX d'extraction propre à F010 — pure, testable isolément.
 * Ne réutilise jamais `deriveLogementExtractionState`/`LOGEMENT_CORE_FIELD_KEYS`
 * (Tunnel A), dont les champs cœur n'existent pas tous côté F010.
 */
export function deriveF010ExtractionState(
  input: DeriveF010ExtractionStateInput,
): F010ExtractionOutcome {
  const allKeys = [...F010_CORE_PREFILL_KEYS, ...F010_SUPPLEMENTARY_PREFILL_KEYS];
  const hasAnyPrefillField = allKeys.some((key) => input.prefill[key] !== undefined);
  const missingCoreFields = F010_CORE_PREFILL_KEYS.filter((key) => input.prefill[key] === undefined);

  if (!hasAnyPrefillField && (input.pipelineError || !input.extractionSuccess)) {
    return { state: "failed", hasAnyPrefillField: false, missingCoreFields };
  }
  if (missingCoreFields.length > 0) {
    return { state: "partial", hasAnyPrefillField, missingCoreFields };
  }
  return { state: "success", hasAnyPrefillField, missingCoreFields: [] };
}

// ---------------------------------------------------------------------------
// CYCLE 2 — PERSISTANCE ET REPRISE
// ---------------------------------------------------------------------------

export type F010LockAwarePrefillValues = {
  prix?: string;
  typeBien?: TypeBien;
  dateAcq?: string;
  surface?: string;
  frais?: string;
};

/**
 * Calcule les valeurs à appliquer aux champs locaux de `collect_bien` à partir
 * d'un prefill, en respectant les verrous déjà posés (Cycle 1). Fonction pure —
 * n'appelle aucun `setState`, utilisée à la fois par un upload frais et par la
 * reprise d'une extraction déjà connue (`pendingExtraction`), pour ne jamais
 * dupliquer cette logique entre les deux chemins.
 */
export function computeLockAwarePrefillValues(
  prefill: F010ActePrefill,
  governedStore: GovernedFieldStore,
): F010LockAwarePrefillValues {
  const values: F010LockAwarePrefillValues = {};
  if (prefill.prixAcquisition !== undefined && !isCanonicalFieldLocked(governedStore, "acquisitionPrice")) {
    values.prix = String(prefill.prixAcquisition);
  }
  if (
    prefill.typeBien &&
    prefill.typeBien !== "autre" &&
    !isCanonicalFieldLocked(governedStore, "propertyType")
  ) {
    values.typeBien = prefill.typeBien;
  }
  if (prefill.dateAcquisition && !isCanonicalFieldLocked(governedStore, "acquisitionDate")) {
    values.dateAcq = prefill.dateAcquisition;
  }
  if (prefill.surface !== undefined && !isCanonicalFieldLocked(governedStore, "surfaceArea")) {
    values.surface = String(prefill.surface);
  }
  // fraisNotaire n'a pas de clé canonique partagée (cf. F010_FIELD_TO_CANONICAL) —
  // aucun verrou possible, toujours appliqué si présent.
  if (prefill.fraisNotaire !== undefined) values.frais = String(prefill.fraisNotaire);
  return values;
}

export type RunF010UploadFlowResult = {
  pipelineResult: LogementGptPipelineResult;
  prefill: F010ActePrefill;
  outcome: F010ExtractionOutcome;
};

export type RunF010UploadFlowParams = {
  file: File;
  documentId: string;
  fiscalYearId: string;
  fiscalYear?: number;
  /**
   * Appelé de façon SYNCHRONE, avant tout appel OCR/GPT (règle Cycle 2 #1) —
   * c'est le point où l'appelant doit persister `analyzingDocumentId`.
   */
  onAnalysisStarting: (documentId: string) => void;
  /** Injectable pour les tests — par défaut `runF010DocumentAnalysis` (le pipeline réel). */
  analyze?: (params: RunF010DocumentAnalysisParams) => Promise<LogementGptPipelineResult>;
};

/**
 * Orchestration complète upload → pipeline → extraction, avec un point
 * d'engagement synchrone (`onAnalysisStarting`) garanti avant l'attente
 * asynchrone — c'est ce qui rend "analyzingDocumentId persisté avant tout appel
 * OCR/GPT" vérifiable indépendamment du composant React qui l'utilise.
 */
export async function runF010UploadFlow(
  params: RunF010UploadFlowParams,
): Promise<RunF010UploadFlowResult> {
  const { file, documentId, fiscalYearId, fiscalYear, onAnalysisStarting } = params;
  const analyze = params.analyze ?? runF010DocumentAnalysis;
  const document = buildF010SyntheticDocument({ id: documentId, fiscalYearId, file });

  onAnalysisStarting(documentId);

  const pipelineResult = await analyze({ file, document, fiscalYear });
  const flatExtraction = pipelineResult.extraction.extraction;
  const prefill = acteExtractionToF010Prefill(flatExtraction);
  const outcome = deriveF010ExtractionState({
    extractionSuccess: pipelineResult.extraction.success,
    pipelineError: !pipelineResult.extraction.success,
    prefill,
  });

  return { pipelineResult, prefill, outcome };
}

// ---------------------------------------------------------------------------
// CYCLE 2 — décision de reprise (contrainte #5 : shouldResumeF010 avant tout
// repli "déjà complet")
// ---------------------------------------------------------------------------

export type F010ResumeDecision =
  | { kind: "start" }
  | { kind: "legacy_complete" }
  | { kind: "resume_analysis"; analyzingDocumentId: string }
  | { kind: "resume_pending_extraction"; pendingExtraction: F010ActePrefill }
  | { kind: "resume_step" };

export type ResolveF010ResumeDecisionParams = {
  persisted: F010PersistedState | undefined;
  /** `Boolean(declarationDraft?.logementConfirmedAt)` — calculé par l'appelant, jamais recalculé ici. */
  isLegacyComplete: boolean;
};

/**
 * Décide comment initialiser le panel F010 au montage. Pure, testable sans
 * React : encode à elle seule l'ordre imposé par la contrainte #5
 * (`shouldResumeF010` toujours vérifié avant le repli `logementConfirmedAt`),
 * pour que cet ordre ne dépende pas d'une relecture attentive du JSX.
 */
export function resolveF010ResumeDecision(
  params: ResolveF010ResumeDecisionParams,
): F010ResumeDecision {
  const { persisted, isLegacyComplete } = params;

  if (shouldResumeF010(persisted)) {
    if (persisted!.analyzingDocumentId && !persisted!.pendingExtraction) {
      return { kind: "resume_analysis", analyzingDocumentId: persisted!.analyzingDocumentId };
    }
    if (persisted!.pendingExtraction) {
      return { kind: "resume_pending_extraction", pendingExtraction: persisted!.pendingExtraction };
    }
    return { kind: "resume_step" };
  }

  if (isLegacyComplete) return { kind: "legacy_complete" };

  return { kind: "start" };
}

// ---------------------------------------------------------------------------
// CYCLE 4A — prochain champ manquant, seule fonction de ce jalon
// ---------------------------------------------------------------------------

/**
 * Ordre exact dans lequel F010 doit demander ses champs bloquants. `natureBien`
 * n'y figure plus (Cycle 4A) : jamais lu par `computeAmortizationPlan`, il ne
 * bloque plus la progression — son UI n'est pas encore modifiée ce jalon.
 */
const F010_MISSING_FIELD_ORDER: readonly F010FieldKey[] = [
  "prixAcquisition",
  "typeBien",
  "dateAcquisition",
  "fraisNotaire",
  "choixTraitementFrais",
  "montantMobilier",
  "ratioTerrain",
] as const;

export type F010MissingFieldResolution = { field: F010FieldKey | null };

/**
 * Détermine le prochain champ réellement manquant, dans l'ordre ci-dessus.
 * Pure : lit uniquement la présence/absence de chaque valeur dans `state`,
 * jamais sa provenance (`fieldSources`) ni son statut de confirmation
 * (`confirmed`) — un champ "manquant" est un champ dont la valeur est
 * `undefined`, point final. `montantMobilier: 0` est une valeur présente,
 * jamais traitée comme manquante.
 */
export function resolveNextMissingF010Field(
  state: Pick<F010State, (typeof F010_MISSING_FIELD_ORDER)[number]>,
): F010MissingFieldResolution {
  for (const field of F010_MISSING_FIELD_ORDER) {
    if (state[field] === undefined) {
      return { field };
    }
  }
  return { field: null };
}
