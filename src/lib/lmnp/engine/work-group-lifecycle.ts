/**
 * LMNP Business Engine — WorkGroup Lifecycle Engine
 *
 * WorkGroups are NOT temporary AI suggestions — they are editable
 * economic project objects with a full lifecycle and audit trail.
 *
 * Every mutation creates an immutable audit event:
 *   confirmed → split → merged → edited
 *
 * Rejection fingerprints prevent the AI from re-proposing the same
 * rejected merge on subsequent document uploads.
 */

import type {
  AccountingCategory,
  ExtractedAccountingFact,
  WorkGroup,
  WorkGroupAuditEvent,
  WorkGroupStatus,
} from "./business-engine.types";

// ---------------------------------------------------------------------------
// Fingerprint utilities — prevent re-proposal of rejected merges
// ---------------------------------------------------------------------------

/**
 * Computes a stable fingerprint for a set of invoice documentIds.
 * Sorting guarantees the fingerprint is order-independent.
 * Format: sorted documentIds joined with "|"
 */
export function computeGroupFingerprint(documentIds: string[]): string {
  return [...documentIds].sort().join("|");
}

/**
 * Returns true when a proposed grouping of invoices matches a previously
 * rejected fingerprint. Used to prevent the AI from suggesting the same
 * merge again after the user explicitly rejected it.
 */
export function isRejectedGrouping(
  proposedDocumentIds: string[],
  rejectedFingerprints: string[],
): boolean {
  const fp = computeGroupFingerprint(proposedDocumentIds);
  return rejectedFingerprints.includes(fp);
}

/**
 * Adds a rejection fingerprint to the registry.
 * Called when the user rejects a WorkGroup proposal.
 */
export function addRejectionFingerprint(
  existing: string[],
  documentIds: string[],
): string[] {
  const fp = computeGroupFingerprint(documentIds);
  if (existing.includes(fp)) return existing;
  return [...existing, fp];
}

// ---------------------------------------------------------------------------
// Audit trail utilities
// ---------------------------------------------------------------------------

function auditEvent(
  workGroupId: string,
  eventType: WorkGroupAuditEvent["eventType"],
  explanation: string,
  metadata?: WorkGroupAuditEvent["metadata"],
): WorkGroupAuditEvent {
  return {
    id: `audit-${crypto.randomUUID()}`,
    workGroupId,
    eventType,
    timestamp: new Date().toISOString(),
    explanation,
    metadata,
  };
}

function appendAudit(group: WorkGroup, event: WorkGroupAuditEvent): WorkGroup {
  return {
    ...group,
    auditTrail: [...(group.auditTrail ?? []), event],
    editedAt: event.timestamp,
  };
}

// ---------------------------------------------------------------------------
// Lifecycle operations
// ---------------------------------------------------------------------------

/**
 * Creates the initial "created_by_ai" audit event on a proposed WorkGroup.
 * Call this immediately after `proposeWorkGroups()` returns.
 */
export function initializeAuditTrail(group: WorkGroup): WorkGroup {
  const event = auditEvent(
    group.id,
    group.manuallyCreated ? "created_manually" : "created_by_ai",
    group.manuallyCreated
      ? `Groupe créé manuellement par l'utilisateur.`
      : `Groupe proposé automatiquement par l'IA. Confiance : ${Math.round(group.confidence * 100)}%.`,
    { nextValues: { confidence: group.confidence } },
  );
  return {
    ...group,
    aiExplanationSnapshot: group.explanation,
    auditTrail: [event],
  };
}

/**
 * Confirms a WorkGroup with full audit trail.
 * Optionally allows overriding the label and/or duration.
 * Rejection fingerprints are NOT cleared on confirm.
 */
export function confirmWorkGroupWithAudit(
  group: WorkGroup,
  overrides?: {
    label?: string;
    durationYears?: number;
    confirmedByUserId?: string;
  },
): WorkGroup {
  const now = new Date().toISOString();
  const changedFields: string[] = [];
  const previousValues: Record<string, unknown> = {};
  const nextValues: Record<string, unknown> = {};

  if (overrides?.label && overrides.label !== group.detectedProjectLabel) {
    changedFields.push("detectedProjectLabel");
    previousValues.detectedProjectLabel = group.detectedProjectLabel;
    nextValues.detectedProjectLabel = overrides.label;
  }
  if (overrides?.durationYears && overrides.durationYears !== group.proposedDurationYears) {
    changedFields.push("proposedDurationYears");
    previousValues.proposedDurationYears = group.proposedDurationYears;
    nextValues.proposedDurationYears = overrides.durationYears;
  }

  const explanationParts = ["Groupe confirmé par l'utilisateur."];
  if (changedFields.includes("detectedProjectLabel")) {
    explanationParts.push(`Nom modifié : "${overrides!.label}".`);
  }
  if (changedFields.includes("proposedDurationYears")) {
    explanationParts.push(`Durée modifiée : ${overrides!.durationYears} ans.`);
  }

  const event = auditEvent(group.id, "confirmed", explanationParts.join(" "), {
    changedFields,
    previousValues,
    nextValues,
  });

  return appendAudit(
    {
      ...group,
      status: "confirmed" as WorkGroupStatus,
      confirmedAt: now,
      detectedProjectLabel: overrides?.label ?? group.detectedProjectLabel,
      proposedDurationYears: overrides?.durationYears ?? group.proposedDurationYears,
    },
    event,
  );
}

/**
 * Rejects a WorkGroup.
 * Adds a rejection fingerprint so the AI never re-proposes this exact
 * combination of invoices on future runs.
 * Returns [rejectedGroup, rejectionFingerprintToStore].
 */
export function rejectWorkGroupWithAudit(
  group: WorkGroup,
  fingerprintsRegistry: string[],
): [WorkGroup, string[]] {
  const now = new Date().toISOString();
  const documentIds = group.invoices.map((inv) => inv.documentId);
  const fingerprint = computeGroupFingerprint(documentIds);

  const event = auditEvent(
    group.id,
    "rejected",
    `L'utilisateur a choisi de ne pas regrouper ces factures. Elles seront traitées individuellement.`,
    { affectedInvoiceIds: documentIds },
  );

  const updatedGroup = appendAudit(
    {
      ...group,
      status: "rejected" as WorkGroupStatus,
      rejectedAt: now,
    },
    event,
  );

  const updatedFingerprints = fingerprintsRegistry.includes(fingerprint)
    ? fingerprintsRegistry
    : [...fingerprintsRegistry, fingerprint];

  return [updatedGroup, updatedFingerprints];
}

/**
 * Edits a WorkGroup's metadata (label, supplier, category, duration).
 * Preserves the original AI explanation as `aiExplanationSnapshot`.
 * Only metadata is editable — invoice list is changed via add/remove operations.
 */
export function editWorkGroupMetadata(
  group: WorkGroup,
  edits: {
    label?: string;
    supplier?: string;
    category?: AccountingCategory;
    durationYears?: number;
  },
): WorkGroup {
  const changedFields: string[] = [];
  const previousValues: Record<string, unknown> = {};
  const nextValues: Record<string, unknown> = {};

  const changes: Partial<WorkGroup> = {};

  if (edits.label !== undefined && edits.label !== group.detectedProjectLabel) {
    changedFields.push("detectedProjectLabel");
    previousValues.detectedProjectLabel = group.detectedProjectLabel;
    nextValues.detectedProjectLabel = edits.label;
    changes.detectedProjectLabel = edits.label;
  }
  if (edits.supplier !== undefined && edits.supplier !== group.supplier) {
    changedFields.push("supplier");
    previousValues.supplier = group.supplier;
    nextValues.supplier = edits.supplier;
    changes.supplier = edits.supplier;
  }
  if (edits.category !== undefined && edits.category !== group.dominantCategory) {
    changedFields.push("dominantCategory");
    previousValues.dominantCategory = group.dominantCategory;
    nextValues.dominantCategory = edits.category;
    changes.dominantCategory = edits.category;
  }
  if (edits.durationYears !== undefined && edits.durationYears !== group.proposedDurationYears) {
    changedFields.push("proposedDurationYears");
    previousValues.proposedDurationYears = group.proposedDurationYears;
    nextValues.proposedDurationYears = edits.durationYears;
    changes.proposedDurationYears = edits.durationYears;
  }

  if (changedFields.length === 0) return group;

  const fieldLabels: Record<string, string> = {
    detectedProjectLabel: "nom du projet",
    supplier: "fournisseur",
    dominantCategory: "catégorie",
    proposedDurationYears: "durée d'amortissement",
  };
  const fieldsFr = changedFields.map((f) => fieldLabels[f] ?? f).join(", ");
  const event = auditEvent(group.id, "edited", `Métadonnées modifiées : ${fieldsFr}.`, {
    changedFields,
    previousValues,
    nextValues,
  });

  return appendAudit(
    {
      ...group,
      ...changes,
      aiExplanationSnapshot: group.aiExplanationSnapshot ?? group.explanation,
    },
    event,
  );
}

// ---------------------------------------------------------------------------
// Manual merge — user-initiated grouping
// ---------------------------------------------------------------------------

/**
 * Manually merges a set of ExtractedAccountingFacts into a new WorkGroup.
 * Used when the user selects invoices and explicitly creates a project group.
 * The resulting group is in "confirmed" status (user intent is clear).
 */
export function manualMergeInvoices(
  invoices: ExtractedAccountingFact[],
  options: {
    label: string;
    category: AccountingCategory;
    durationYears: number;
    propertyId?: string;
    supplier?: string;
  },
): WorkGroup {
  if (invoices.length === 0) throw new Error("Cannot create a WorkGroup from zero invoices.");

  const totalAmount = invoices.reduce((sum, inv) => sum + inv.amountTTC, 0);
  const now = new Date().toISOString();
  const id = `wg-${crypto.randomUUID()}`;

  const explanation = `Groupe créé manuellement. ${invoices.length} facture${invoices.length > 1 ? "s" : ""} regroupée${invoices.length > 1 ? "s" : ""} par l'utilisateur.`;

  const group: WorkGroup = {
    id,
    propertyId: options.propertyId,
    supplier: options.supplier,
    invoices,
    totalAmount,
    dominantCategory: options.category,
    detectedProjectLabel: options.label,
    proposedDurationYears: options.durationYears,
    confidence: 1.0,
    explanation,
    aiExplanationSnapshot: undefined,
    status: "confirmed",
    confirmedAt: now,
    manuallyCreated: true,
    auditTrail: [],
  };

  const event = auditEvent(
    id,
    "created_manually",
    explanation,
    {
      affectedInvoiceIds: invoices.map((inv) => inv.documentId),
      nextValues: {
        label: options.label,
        category: options.category,
        durationYears: options.durationYears,
      },
    },
  );

  return { ...group, auditTrail: [event] };
}

// ---------------------------------------------------------------------------
// Split — remove one invoice from a group
// ---------------------------------------------------------------------------

/**
 * Splits a single invoice out of a WorkGroup.
 * Returns [updatedGroup, extractedSoloGroup].
 *
 * The extracted invoice becomes its own standalone "proposed" WorkGroup.
 * The original group is updated with the invoice removed and totalAmount recomputed.
 *
 * If the group only has 1 invoice, this operation is a no-op (returns [group, null]).
 */
export function splitInvoiceFromGroup(
  group: WorkGroup,
  invoiceDocumentId: string,
): [WorkGroup, WorkGroup | null] {
  const invoiceIndex = group.invoices.findIndex(
    (inv) => inv.documentId === invoiceDocumentId,
  );

  if (invoiceIndex === -1) {
    throw new Error(`Invoice ${invoiceDocumentId} not found in group ${group.id}`);
  }
  if (group.invoices.length <= 1) {
    return [group, null];
  }

  const extractedInvoice = group.invoices[invoiceIndex];
  const remainingInvoices = group.invoices.filter(
    (inv) => inv.documentId !== invoiceDocumentId,
  );
  const newTotalAmount = remainingInvoices.reduce((sum, inv) => sum + inv.amountTTC, 0);

  const soloGroupId = `wg-${crypto.randomUUID()}`;
  const splitEvent = auditEvent(
    group.id,
    "split",
    `Facture extraite du groupe : ${extractedInvoice.supplier ?? invoiceDocumentId}. Elle sera traitée séparément.`,
    {
      affectedInvoiceIds: [invoiceDocumentId],
      splitIntoGroupIds: [soloGroupId],
    },
  );

  const updatedGroup = appendAudit(
    {
      ...group,
      invoices: remainingInvoices,
      totalAmount: newTotalAmount,
      status: "split" as WorkGroupStatus,
    },
    splitEvent,
  );

  const soloGroup: WorkGroup = {
    id: soloGroupId,
    propertyId: group.propertyId,
    supplier: extractedInvoice.supplier,
    invoices: [extractedInvoice],
    totalAmount: extractedInvoice.amountTTC,
    dominantCategory: extractedInvoice.detectedCategory,
    detectedProjectLabel: extractedInvoice.supplier
      ? `Facture ${extractedInvoice.supplier}`
      : "Facture individuelle",
    proposedDurationYears: group.proposedDurationYears,
    confidence: extractedInvoice.confidence,
    explanation: `Facture extraite du groupe "${group.detectedProjectLabel}". À traiter individuellement.`,
    status: "proposed",
    manuallyCreated: false,
    auditTrail: [
      auditEvent(
        soloGroupId,
        "split",
        `Facture extraite du groupe "${group.detectedProjectLabel}".`,
        { mergedFromGroupIds: [group.id], affectedInvoiceIds: [invoiceDocumentId] },
      ),
    ],
  };

  return [updatedGroup, soloGroup];
}

// ---------------------------------------------------------------------------
// Merge two existing groups
// ---------------------------------------------------------------------------

/**
 * Merges two existing WorkGroups into one.
 * Both source groups are marked as "split" (absorbed).
 * Returns [mergedGroup, updatedSourceA, updatedSourceB].
 */
export function mergeWorkGroups(
  groupA: WorkGroup,
  groupB: WorkGroup,
  overrides?: {
    label?: string;
    category?: AccountingCategory;
    durationYears?: number;
  },
): [WorkGroup, WorkGroup, WorkGroup] {
  const mergedId = `wg-${crypto.randomUUID()}`;
  const now = new Date().toISOString();
  const allInvoices = [...groupA.invoices, ...groupB.invoices];
  const totalAmount = allInvoices.reduce((sum, inv) => sum + inv.amountTTC, 0);

  const dominantCategory = overrides?.category ?? groupA.dominantCategory;
  const label = overrides?.label ?? `${groupA.detectedProjectLabel} + ${groupB.detectedProjectLabel}`;
  const duration = overrides?.durationYears ?? groupA.proposedDurationYears;

  const explanation = `Deux groupes fusionnés par l'utilisateur : "${groupA.detectedProjectLabel}" et "${groupB.detectedProjectLabel}".`;

  const mergedGroup: WorkGroup = {
    id: mergedId,
    propertyId: groupA.propertyId ?? groupB.propertyId,
    supplier: groupA.supplier ?? groupB.supplier,
    invoices: allInvoices,
    totalAmount,
    dominantCategory,
    detectedProjectLabel: label,
    proposedDurationYears: duration,
    confidence: Math.min(groupA.confidence, groupB.confidence),
    explanation,
    aiExplanationSnapshot: undefined,
    status: "confirmed",
    confirmedAt: now,
    manuallyCreated: true,
    auditTrail: [
      auditEvent(mergedId, "merged", explanation, {
        mergedFromGroupIds: [groupA.id, groupB.id],
        affectedInvoiceIds: allInvoices.map((inv) => inv.documentId),
      }),
    ],
  };

  const absorbedEvent = (id: string, label: string): WorkGroupAuditEvent =>
    auditEvent(id, "merged", `Groupe absorbé dans "${mergedGroup.detectedProjectLabel}".`, {
      mergedFromGroupIds: [mergedId],
    });

  const updatedA = appendAudit({ ...groupA, status: "split" as WorkGroupStatus }, absorbedEvent(groupA.id, groupA.detectedProjectLabel));
  const updatedB = appendAudit({ ...groupB, status: "split" as WorkGroupStatus }, absorbedEvent(groupB.id, groupB.detectedProjectLabel));

  return [mergedGroup, updatedA, updatedB];
}

// ---------------------------------------------------------------------------
// Fingerprint-aware propose wrapper
// ---------------------------------------------------------------------------

import { proposeWorkGroups } from "./work-group-engine";

/**
 * Proposes work groups while filtering out combinations that the user has
 * already explicitly rejected (via rejectedGroupFingerprints).
 *
 * This is the safe entry point for the engine — always use this instead of
 * calling `proposeWorkGroups` directly when fingerprints are available.
 */
export function proposeWorkGroupsSafe(
  facts: import("./business-engine.types").ExtractedAccountingFact[],
  rejectedFingerprints: string[],
  propertyId?: string,
): WorkGroup[] {
  const all = proposeWorkGroups(facts, propertyId);

  return all.filter((group) => {
    const ids = group.invoices.map((inv) => inv.documentId);
    return !isRejectedGrouping(ids, rejectedFingerprints);
  });
}
