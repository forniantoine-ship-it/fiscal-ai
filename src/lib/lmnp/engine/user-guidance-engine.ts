/**
 * LMNP Business Engine — Smart User Guidance Engine
 *
 * Continuously surfaces contextual guidance messages to non-accountant users.
 * Messages are deterministic: same state → same messages.
 *
 * Core principle:
 *   The software should always feel transparent and explainable.
 *   The user should NEVER feel "the software is doing hidden accounting."
 *
 * Message types:
 *   fiscal_explanation  — why was this amortized / charged?
 *   risk_prevention     — this might be maintenance, not immobilizable
 *   confidence_signal   — how confident the AI is about a grouping
 *   missing_information — cannot determine category / needs user input
 *   tip                 — educational tip about LMNP
 *   action_required     — blocking: must act before proceeding
 */

import type {
  AccountingCategory,
  BusinessAsset,
  FiscalDecision,
  GuidanceMessage,
  GuidanceSeverity,
  GuidanceType,
  WorkGroup,
} from "./business-engine.types";
import { isDurationReasonable, getDurationRangeLabel } from "./fiscal-knowledge-rules";

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

let _idCounter = 0;
function makeId(prefix: string): string {
  return `${prefix}-${++_idCounter}`;
}

function guide(
  type: GuidanceType,
  severity: GuidanceSeverity,
  title: string,
  body: string,
  options?: Partial<Omit<GuidanceMessage, "id" | "type" | "severity" | "title" | "body">>,
): GuidanceMessage {
  return {
    id: makeId("guidance"),
    type,
    severity,
    title,
    body,
    actionable: options?.actionable ?? false,
    ...options,
  };
}

function fmtEur(amount: number): string {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(amount);
}

// ---------------------------------------------------------------------------
// WorkGroup guidance
// ---------------------------------------------------------------------------

/**
 * Generates guidance messages for a single WorkGroup proposal.
 * Shown in the WorkGroupProposalCard alongside the grouping explanation.
 */
export function generateWorkGroupGuidance(group: WorkGroup): GuidanceMessage[] {
  const messages: GuidanceMessage[] = [];

  // High confidence — reassure
  if (group.confidence >= 0.85) {
    messages.push(
      guide(
        "confidence_signal",
        "success",
        "Regroupement très probable",
        `L'IA est très confiante (${Math.round(group.confidence * 100)}%) que ces factures appartiennent au même projet.`,
        { relatedWorkGroupId: group.id },
      ),
    );
  }
  // Medium confidence — neutral signal
  else if (group.confidence >= 0.60) {
    messages.push(
      guide(
        "confidence_signal",
        "info",
        "Regroupement probable",
        `L'IA pense (${Math.round(group.confidence * 100)}%) que ces factures appartiennent au même projet. Vérifiez avant de confirmer.`,
        { relatedWorkGroupId: group.id },
      ),
    );
  }
  // Low confidence — warn
  else {
    messages.push(
      guide(
        "confidence_signal",
        "warning",
        "Regroupement incertain",
        `L'IA n'est pas certaine (${Math.round(group.confidence * 100)}%) de ce regroupement. Examinez attentivement les factures avant de confirmer.`,
        { relatedWorkGroupId: group.id },
      ),
    );
  }

  // Risk: category is "autre" — needs user input
  if (group.dominantCategory === "autre") {
    messages.push(
      guide(
        "missing_information",
        "warning",
        "Catégorie non déterminée",
        "Nous n'avons pas pu détecter la nature de ces dépenses. Sélectionnez la bonne catégorie avant de confirmer le groupe.",
        {
          actionable: true,
          actionLabel: "Choisir la catégorie",
          relatedWorkGroupId: group.id,
        },
      ),
    );
  }

  // Risk: multi-invoice group with mixed categories
  const categories = new Set(group.invoices.map((inv) => inv.detectedCategory));
  if (categories.size > 1) {
    messages.push(
      guide(
        "risk_prevention",
        "warning",
        "Catégories mixtes détectées",
        `Ces factures couvrent plusieurs catégories (${[...categories].join(", ")}). Vérifiez qu'elles appartiennent bien au même projet.`,
        { relatedWorkGroupId: group.id },
      ),
    );
  }

  // Tip: very large amount — encourage user validation
  if (group.totalAmount > 15000) {
    messages.push(
      guide(
        "tip",
        "info",
        "Montant important — vérification recommandée",
        `Ce groupe représente ${fmtEur(group.totalAmount)}. Pour un montant aussi élevé, vérifiez que toutes les factures concernent bien le même chantier.`,
        { relatedWorkGroupId: group.id },
      ),
    );
  }

  return messages;
}

// ---------------------------------------------------------------------------
// BusinessAsset guidance
// ---------------------------------------------------------------------------

/**
 * Generates guidance messages for a single BusinessAsset.
 * Shown in the AssetReviewCard to explain what the software decided and why.
 */
export function generateAssetGuidance(
  asset: BusinessAsset,
  decision: FiscalDecision,
): GuidanceMessage[] {
  const messages: GuidanceMessage[] = [];

  // Always explain the fiscal treatment (core transparency principle)
  if (asset.fiscalTreatment === "immobilisation") {
    const rangeLabel = getDurationRangeLabel(asset.category);
    messages.push(
      guide(
        "fiscal_explanation",
        "info",
        `Pourquoi ${decision.durationYears} ans ?`,
        `Pour la catégorie "${getCategoryLabelFr(asset.category)}", la durée recommandée est ${rangeLabel}. ` +
        `Nous avons proposé ${decision.durationYears} ans — vous pouvez l'ajuster.`,
        { relatedAssetId: asset.id, actionable: true, actionLabel: "Modifier la durée" },
      ),
    );
  } else {
    // Charge — explain why not immobilized
    if (asset.amount < 500) {
      messages.push(
        guide(
          "fiscal_explanation",
          "info",
          "Déduit directement cette année",
          `Ce bien coûte ${fmtEur(asset.amount)}, en-dessous du seuil de 500 €. Il est donc déduit intégralement en ${new Date().getFullYear()} plutôt qu'amorti sur plusieurs années.`,
          { relatedAssetId: asset.id },
        ),
      );
    }
  }

  // Risk: duration outside recommended range
  if (asset.fiscalTreatment === "immobilisation") {
    const warning = getDurationWarningText(asset.category, asset.amortizationYears);
    if (warning) {
      messages.push(
        guide(
          "risk_prevention",
          "warning",
          "Durée hors fourchette recommandée",
          warning,
          { relatedAssetId: asset.id, actionable: true, actionLabel: "Modifier" },
        ),
      );
    }
  }

  // Unvalidated — prompt user to validate
  if (!asset.userValidated) {
    messages.push(
      guide(
        "action_required",
        "blocking",
        "À valider",
        "Cet actif attend votre confirmation avant d'être inclus dans la déclaration.",
        {
          relatedAssetId: asset.id,
          actionable: true,
          actionLabel: "Valider",
        },
      ),
    );
  }

  // Category "autre" — needs human review
  if (asset.category === "autre") {
    messages.push(
      guide(
        "missing_information",
        "warning",
        "Catégorie à préciser",
        "Cet actif est classé en 'Autre'. Vérifiez s'il appartient à une catégorie plus précise (Travaux, Mobilier, Cuisine…).",
        { relatedAssetId: asset.id, actionable: true, actionLabel: "Modifier la catégorie" },
      ),
    );
  }

  return messages;
}

// ---------------------------------------------------------------------------
// Declaration-level guidance
// ---------------------------------------------------------------------------

/**
 * Generates global guidance for the full declaration state.
 * Returned as an ordered list: blocking first, then warnings, then info.
 */
export function generateDeclarationGuidance(
  assets: BusinessAsset[],
  decisions: FiscalDecision[],
  workGroups: WorkGroup[],
): GuidanceMessage[] {
  const messages: GuidanceMessage[] = [];
  const pendingGroups = workGroups.filter((g) => g.status === "proposed");
  const unvalidatedAssets = assets.filter((a) => !a.userValidated);

  // Blocking: pending group proposals
  if (pendingGroups.length > 0) {
    messages.push(
      guide(
        "action_required",
        "blocking",
        `${pendingGroups.length} regroupement${pendingGroups.length > 1 ? "s" : ""} en attente`,
        `L'IA a proposé ${pendingGroups.length} regroupement${pendingGroups.length > 1 ? "s" : ""} de factures. Confirmez ou refusez chaque proposition pour continuer.`,
        { actionable: true, actionLabel: "Voir les propositions" },
      ),
    );
  }

  // Blocking: unvalidated assets
  if (unvalidatedAssets.length > 0) {
    messages.push(
      guide(
        "action_required",
        "blocking",
        `${unvalidatedAssets.length} actif${unvalidatedAssets.length > 1 ? "s" : ""} à valider`,
        `${unvalidatedAssets.length} actif${unvalidatedAssets.length > 1 ? "s sont" : " est"} en attente de votre validation. Chaque actif doit être confirmé avant génération de la déclaration.`,
        { actionable: true, actionLabel: "Valider les actifs" },
      ),
    );
  }

  // Warning: "autre" category assets
  const uncategorized = assets.filter((a) => a.category === "autre");
  if (uncategorized.length > 0) {
    messages.push(
      guide(
        "risk_prevention",
        "warning",
        "Catégories à vérifier",
        `${uncategorized.length} actif${uncategorized.length > 1 ? "s sont" : " est"} classé${uncategorized.length > 1 ? "s" : ""} en 'Autre'. Nous recommandons de les recatégoriser avant la déclaration.`,
        { actionable: true, actionLabel: "Recatégoriser" },
      ),
    );
  }

  // Warning: durations outside recommended ranges
  const suspiciousDurations = assets.filter(
    (a) =>
      a.fiscalTreatment === "immobilisation" &&
      !isDurationReasonable(a.category, a.amortizationYears),
  );
  if (suspiciousDurations.length > 0) {
    messages.push(
      guide(
        "risk_prevention",
        "warning",
        "Durées d'amortissement à vérifier",
        `${suspiciousDurations.length} actif${suspiciousDurations.length > 1 ? "s ont" : " a"} une durée d'amortissement hors fourchette recommandée.`,
        { actionable: true, actionLabel: "Voir les actifs" },
      ),
    );
  }

  // Info: no assets yet
  if (assets.length === 0 && workGroups.length === 0) {
    messages.push(
      guide(
        "tip",
        "info",
        "Aucun actif pour le moment",
        "Téléversez vos factures de travaux et de mobilier pour que l'IA analyse et structure votre dossier automatiquement.",
      ),
    );
  }

  // Success: all validated
  if (assets.length > 0 && unvalidatedAssets.length === 0 && pendingGroups.length === 0) {
    messages.push(
      guide(
        "fiscal_explanation",
        "success",
        "Dossier prêt",
        "Tous vos actifs sont validés. Vous pouvez générer votre déclaration LMNP.",
      ),
    );
  }

  // Sort: blocking → warning → info → success
  const order: GuidanceSeverity[] = ["blocking", "warning", "info", "success"];
  return messages.sort(
    (a, b) => order.indexOf(a.severity) - order.indexOf(b.severity),
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getCategoryLabelFr(category: AccountingCategory): string {
  const labels: Record<AccountingCategory, string> = {
    immeuble: "Immeuble",
    travaux: "Travaux",
    mobilier: "Mobilier",
    electromenager: "Électroménager",
    cuisine: "Cuisine",
    assurance: "Assurance",
    taxe_fonciere: "Taxe foncière",
    autre: "Autre",
  };
  return labels[category] ?? category;
}

function getDurationWarningText(
  category: AccountingCategory,
  durationYears: number,
): string | null {
  if (isDurationReasonable(category, durationYears)) return null;
  const range = getDurationRangeLabel(category);
  return `La durée de ${durationYears} ans est hors de la fourchette recommandée pour cette catégorie (${range}). Vous pouvez la conserver, mais vérifiez qu'elle est justifiable.`;
}

/**
 * Returns a single most-important guidance message for a WorkGroup.
 * Used in compact list views (one-line alerts).
 */
export function getPrimaryGuidance(group: WorkGroup): GuidanceMessage | null {
  const messages = generateWorkGroupGuidance(group);
  const blocking = messages.find((m) => m.severity === "blocking");
  if (blocking) return blocking;
  const warning = messages.find((m) => m.severity === "warning");
  if (warning) return warning;
  return messages[0] ?? null;
}

/**
 * Returns whether a business asset needs user attention.
 * Used to show "action required" indicators in navigation.
 */
export function assetNeedsAttention(
  asset: BusinessAsset,
  decision: FiscalDecision,
): boolean {
  if (!asset.userValidated) return true;
  if (asset.category === "autre") return true;
  if (!isDurationReasonable(asset.category, asset.amortizationYears)) return true;
  return false;
}
