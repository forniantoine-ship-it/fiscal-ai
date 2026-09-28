import type { PersistedWorkspace } from "@/lib/lmnp/store/persistence";
import { buildDossierSteps, buildMissingItems } from "@/lib/lmnp/services/validation-profile";
import {
  resolveExternalOpeningProofFromFiscalYear,
  resolvePriorHistoryEligibility,
  type PriorHistoryEligibility,
} from "@/lib/lmnp/services/declaration/prior-history-eligibility";
import { GENERATION_PRICE_TTC } from "@/lib/lmnp/services/payment/price";
import { isMultiProperty, type V3PrototypeSource } from "./read-model";
import { v3CorrectionHrefForResolvedScope, type V3CorrectionScope } from "./correction-scope";

/**
 * R13.1 — honest generation-state vocabulary. `declarationGeneratedAt`
 * proves only "a generation ran, and no invalidation the reducer recognizes
 * has happened since" — never numeric freshness (that requires a live
 * F006/F007/RFS preview via resolveDeclarationGenerationGate, which this
 * read model must never call). Never use fresh/current/up_to_date/ready.
 */
export type V3GenerationState = "never_generated" | "generated_since_last_known_invalidation";

export interface V3FinalizationLastGeneration {
  generatedAt: string;
  versionNumber: number;
  /** Only forms this specific generation actually produced — never all 5/9 assumed. */
  formulairesGeneres: string[];
  formulairesManquants: string[];
}

export interface V3FinalizationReadModel {
  dossierComplete: boolean;
  multiProperty: boolean;
  blockers: string[];
  /** Verbatim existing authority (prior-history-eligibility.ts) — never reconstructed. */
  priorHistory: PriorHistoryEligibility;
  generationState: V3GenerationState;
  lastGeneration: V3FinalizationLastGeneration | null;
  /** GENERATION_PRICE_TTC formatted — the one canonical, already-wired product price. */
  priceLabel: string;
  /**
   * Null whenever the R12.1A scope can't be safely resolved for this owner
   * (ambiguous/multi-property/closed exercise) — never a fallback URL.
   * Presence alone does NOT mean "ready to generate": the real gate inside
   * the owner screen still decides that.
   */
  finalizeHref: string | null;
}

export type V3FinalizationCtaKind =
  | "multi_property"
  | "dossier_incomplete"
  | "prior_history_unresolved"
  | "ready_to_finalize"
  | "already_generated";

export interface V3FinalizationCta {
  kind: V3FinalizationCtaKind;
  actionLabel: string | null;
  actionHref: string | null;
}

/**
 * Picks ONE state-appropriate action — never a hard "ready"/"you can generate"
 * claim (the owner screen's real gate decides that). Multi-property and an
 * unresolved scope both collapse to no action at all, never a guessed route.
 */
export function resolveV3FinalizationCta(
  finalization: V3FinalizationReadModel,
  firstUserAction: { label: string; href: string } | undefined,
): V3FinalizationCta {
  if (finalization.multiProperty) return { kind: "multi_property", actionLabel: null, actionHref: null };
  if (!finalization.dossierComplete) {
    return { kind: "dossier_incomplete", actionLabel: firstUserAction?.label ?? null, actionHref: firstUserAction?.href ?? null };
  }
  if (!finalization.priorHistory.eligible) {
    return { kind: "prior_history_unresolved", actionLabel: finalization.finalizeHref ? "Continuer" : null, actionHref: finalization.finalizeHref };
  }
  if (finalization.generationState === "never_generated") {
    return { kind: "ready_to_finalize", actionLabel: finalization.finalizeHref ? "Finaliser ma déclaration" : null, actionHref: finalization.finalizeHref };
  }
  return { kind: "already_generated", actionLabel: finalization.finalizeHref ? "Voir ma déclaration" : null, actionHref: finalization.finalizeHref };
}

export function resolveV3Finalization(
  source: V3PrototypeSource,
  correctionScope: V3CorrectionScope | null,
): V3FinalizationReadModel | undefined {
  if (source.mode !== "real") return undefined;
  return buildV3FinalizationReadModel(source.workspace, correctionScope);
}

function buildV3FinalizationReadModel(
  workspace: PersistedWorkspace,
  correctionScope: V3CorrectionScope | null,
): V3FinalizationReadModel {
  const draft = workspace.declarationDraft;
  const blockers = buildMissingItems(buildDossierSteps(draft, workspace.fiscalYear.year)).map(item => item.label);
  const multiProperty = isMultiProperty(workspace);

  const externalOpeningProof = resolveExternalOpeningProofFromFiscalYear(workspace.fiscalYear);
  const priorHistory = resolvePriorHistoryEligibility(workspace.fiscalYear, externalOpeningProof);

  const generationState: V3GenerationState = workspace.fiscalYear.declarationGeneratedAt
    ? "generated_since_last_known_invalidation"
    : "never_generated";

  // Same resolution as buildV3DeclarationReadModel's currentVersion — never a second source.
  const versions = draft?.declarationVersions ?? [];
  const currentVersion = draft?.declaration?.currentVersionId
    ? versions.find(version => version.id === draft.declaration!.currentVersionId)
    : versions.at(-1);
  const lastGeneration: V3FinalizationLastGeneration | null = currentVersion ? {
    generatedAt: currentVersion.generatedAt,
    versionNumber: currentVersion.versionNumber,
    formulairesGeneres: currentVersion.liasseRfs.formulairesGeneres,
    formulairesManquants: currentVersion.liasseRfs.formulairesManquants,
  } : null;

  // "/documents" is property-required (R12.1A OWNER_ROUTES) — a multi-property or
  // otherwise-unresolved scope makes this null, never a first-dossier/first-year guess.
  const base = v3CorrectionHrefForResolvedScope("/documents", correctionScope);
  const finalizeHref = base ? `${base}&step=validation` : null;

  return {
    dossierComplete: blockers.length === 0,
    multiProperty,
    blockers,
    priorHistory,
    generationState,
    lastGeneration,
    priceLabel: `${GENERATION_PRICE_TTC} €`,
    finalizeHref,
  };
}
