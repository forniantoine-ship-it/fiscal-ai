/** Minimal shape used to protect paid / generated journey flags. */
export type JourneyWorkspaceSnapshot = {
  fiscalYear: {
    paidAt?: string;
    declarationGeneratedAt?: string;
  };
};

/**
 * Flush must persist the explicit in-memory snapshot when provided.
 * A stale debounce (`pending`) must not win over that snapshot — that
 * overwrite wiped paid/generated flags after logout (Cycle 24).
 */
export function resolveFlushSnapshot<T extends JourneyWorkspaceSnapshot>(
  pending: { userId: string; data: T } | null,
  userId: string | null,
  data?: T,
): { userId: string; data: T } | null {
  if (userId && data) {
    return { userId, data };
  }
  if (pending) {
    return pending;
  }
  return null;
}

function hasJourneyTimestamp(value: string | undefined): boolean {
  return Boolean(value && value.trim());
}

/**
 * A tab with an older in-memory workspace must not erase a richer disk
 * snapshot (paid / déclaration générée).
 */
export function isRegressiveWorkspaceWrite(
  incoming: JourneyWorkspaceSnapshot,
  existing: JourneyWorkspaceSnapshot | null | undefined,
): boolean {
  if (!existing) return false;

  if (
    hasJourneyTimestamp(existing.fiscalYear.declarationGeneratedAt) &&
    !hasJourneyTimestamp(incoming.fiscalYear.declarationGeneratedAt)
  ) {
    return true;
  }

  if (
    hasJourneyTimestamp(existing.fiscalYear.paidAt) &&
    !hasJourneyTimestamp(incoming.fiscalYear.paidAt)
  ) {
    return true;
  }

  return false;
}
