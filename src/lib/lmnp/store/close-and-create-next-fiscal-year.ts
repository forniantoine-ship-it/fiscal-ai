/**
 * Lot 3 — wrapper sûr : converge vers `runServerFiscalYearTransition`.
 * Conservé pour l'API provider / UI existante.
 */
import {
  runServerFiscalYearTransition,
  __testResetServerFiscalYearTransitionGuard,
  type RunServerFiscalYearTransitionParams,
} from "./server-fiscal-year-transition";
import type { PersistedWorkspace } from "./persistence";

export type RunCloseAndCreateNextFiscalYearParams = {
  dossierId: string | null;
  userId: string | null;
  workspace: PersistedWorkspace;
  now?: string;
  dispatchCloseAndCreateNext: (nextWorkspace: PersistedWorkspace) => void;
  onError: (message: string | null) => void;
  /** @deprecated Lot 3 — inject via runServerFiscalYearTransition params instead. */
  persistClosureAndTransition?: RunServerFiscalYearTransitionParams["mirrorLocalAfterCommit"];
  /** @deprecated Lot 3 — unused; strict flush is mandatory on the server path. */
  flushPendingWorkspace?: (userId: string | null) => Promise<void>;
  flushForTransition?: RunServerFiscalYearTransitionParams["flushForTransition"];
  commitOnServer?: RunServerFiscalYearTransitionParams["commitOnServer"];
  getAuthToken?: RunServerFiscalYearTransitionParams["getAuthToken"];
  mirrorLocalAfterCommit?: RunServerFiscalYearTransitionParams["mirrorLocalAfterCommit"];
};

export async function runCloseAndCreateNextFiscalYear(
  params: RunCloseAndCreateNextFiscalYearParams,
): Promise<void> {
  await runServerFiscalYearTransition({
    dossierId: params.dossierId,
    userId: params.userId,
    workspace: params.workspace,
    now: params.now,
    dispatchNextWorkspace: params.dispatchCloseAndCreateNext,
    onError: params.onError,
    flushForTransition: params.flushForTransition,
    commitOnServer: params.commitOnServer,
    getAuthToken: params.getAuthToken,
    mirrorLocalAfterCommit: params.mirrorLocalAfterCommit ?? params.persistClosureAndTransition,
  });
}

/** @internal tests only */
export function __testResetCloseAndCreateNextFiscalYearGuard(): void {
  __testResetServerFiscalYearTransitionGuard();
}
