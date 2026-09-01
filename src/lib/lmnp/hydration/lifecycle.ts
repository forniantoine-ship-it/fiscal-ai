/**
 * Hydration vs execution lifecycle guards for LMNP document tunnels.
 *
 * HYDRATION — read-only restore of persisted workspace/tunnel state.
 * EXECUTION — OCR, GPT, extractors, prefill, cross-tunnel ingest (upload / reanalyze only).
 */

export type ExecutionTrigger = "document_upload" | "reanalyze";

export type HydrationGuardContext = {
  isHydratingWorkspace: boolean;
  isPassiveHydration: boolean;
  executionTrigger: ExecutionTrigger | null;
};

export function shouldRunExtraction(ctx: HydrationGuardContext): boolean {
  if (ctx.isHydratingWorkspace || ctx.isPassiveHydration) {
    console.log("[prefill-skipped-hydration]", {
      reason: "passive_hydration",
      action: "extraction",
    });
    return false;
  }

  if (!ctx.executionTrigger) {
    return false;
  }

  console.log("[execution-event]", {
    trigger: ctx.executionTrigger,
    action: "extraction",
  });
  return true;
}

export function shouldApplyPrefill(ctx: HydrationGuardContext): boolean {
  if (ctx.isHydratingWorkspace || ctx.isPassiveHydration) {
    console.log("[prefill-skipped-hydration]", {
      reason: "passive_hydration",
      action: "prefill",
    });
    return false;
  }

  if (!ctx.executionTrigger) {
    return false;
  }

  console.log("[execution-event]", {
    trigger: ctx.executionTrigger,
    action: "prefill",
  });
  return true;
}

export function logPassiveHydrationStart(tunnel: string): void {
  console.log("[hydration-passive]", { tunnel, mode: "restore_only" });
}

export function logPassiveRestore(tunnel: string, fields?: string[]): void {
  console.log("[hydration-restore-only]", {
    tunnel,
    fields: fields ?? [],
  });
}

export function logWorkspaceHydrationStart(): void {
  console.log("[hydration-passive]", { scope: "workspace", mode: "restore_only" });
}

export function logWorkspaceHydrationComplete(): void {
  console.log("[hydration-restore-only]", { scope: "workspace" });
}
