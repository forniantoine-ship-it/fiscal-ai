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

/** Minimal shape used to detect a stale write from an exercise already superseded. */
export type IdentityWorkspaceSnapshot = {
  fiscalYear: {
    id: string;
    previousFiscalYearId?: string | null;
  };
};

/**
 * P0 FINAL GATE (workspace debounce vs clôture N → N+1) — une écriture
 * entrante ne doit jamais remplacer un workspace dont le `previousFiscalYearId`
 * désigne exactement l'exercice qu'elle porte : cela signifie qu'une
 * transition N → N+1 a déjà eu lieu (même onglet ou un autre — la lecture de
 * `existing` se fait toujours depuis IndexedDB, partagé entre onglets) et que
 * cette écriture est un résidu débouncé de l'ancien exercice N.
 *
 * Volontairement fondée sur `previousFiscalYearId`, jamais sur `dossierId`
 * ni `year` : `previousFiscalYearId` est le seul champ garanti renseigné dès
 * la toute première transition d'un dossier (écrit inconditionnellement par
 * `createNextFiscalYear()`), alors que `dossierId` reste `undefined` sur le
 * workspace vivant tant qu'aucune transition n'a encore eu lieu — une garde
 * fondée sur `dossierId` manquerait donc systématiquement ce cas le plus
 * fréquent (P0 FINAL GATE §1-2).
 *
 * Ne détecte qu'un seul niveau de filiation (N face à N+1) — une écriture
 * stale vieille d'au moins deux transitions (N-2 alors que N est déjà actif)
 * n'est pas couverte ; risque résiduel documenté et assumé en P2 (P0 FINAL
 * GATE §2).
 */
export function isStaleFiscalYearIdentityWrite(
  incoming: IdentityWorkspaceSnapshot,
  existing: IdentityWorkspaceSnapshot | null | undefined,
): boolean {
  if (!existing) return false;
  return existing.fiscalYear.previousFiscalYearId === incoming.fiscalYear.id;
}
