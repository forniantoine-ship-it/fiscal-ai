/**
 * Lot 3 — wrapper sûr : même commande serveur que la clôture (idempotente si N fermé).
 */
import {
  runServerFiscalYearTransition,
  __testResetServerFiscalYearTransitionGuard,
  type RunServerFiscalYearTransitionParams,
} from "./server-fiscal-year-transition";
import type { PersistedWorkspace } from "./persistence";
import type { FiscalYear, Property } from "../types/domain";

export type RunCreateNextFiscalYearParams = {
  dossierId: string | null;
  /** Lot 3 — requis pour la transition serveur (flush + mirror). */
  userId?: string | null;
  workspace: PersistedWorkspace;
  now?: string;
  dispatchCreateNextFiscalYear: (nextFiscalYear: FiscalYear, properties: Property[]) => void;
  onError: (message: string | null) => void;
  /** @deprecated Lot 3 — local-only persist is no longer the SoT. */
  persistTransition?: unknown;
  flushForTransition?: RunServerFiscalYearTransitionParams["flushForTransition"];
  commitOnServer?: RunServerFiscalYearTransitionParams["commitOnServer"];
  getAuthToken?: RunServerFiscalYearTransitionParams["getAuthToken"];
  mirrorLocalAfterCommit?: RunServerFiscalYearTransitionParams["mirrorLocalAfterCommit"];
};

export async function runCreateNextFiscalYear(
  params: RunCreateNextFiscalYearParams,
): Promise<void> {
  await runServerFiscalYearTransition({
    dossierId: params.dossierId,
    userId: params.userId ?? null,
    workspace: params.workspace,
    now: params.now,
    dispatchNextWorkspace: (nextWorkspace) => {
      params.dispatchCreateNextFiscalYear(nextWorkspace.fiscalYear, nextWorkspace.properties);
    },
    onError: params.onError,
    flushForTransition: params.flushForTransition,
    commitOnServer: params.commitOnServer,
    getAuthToken: params.getAuthToken,
    mirrorLocalAfterCommit: params.mirrorLocalAfterCommit,
  });
}

/** @internal tests only */
export function __testResetCreateNextFiscalYearGuard(): void {
  __testResetServerFiscalYearTransitionGuard();
}
