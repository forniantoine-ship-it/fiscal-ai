"use client";

import { useCallback, useState } from "react";
import { useV3CorrectionScope } from "@/lab/v2-dossier/correction-context";
import { useLmnp } from "@/lib/lmnp/store";
import { performV3CorrectionReturn } from "./v3-correction-return";

export type V3ReturnStatus = "idle" | "saving" | "error";

/**
 * The one way back to Mon dossier from a V3 correction: the existing confirmed-save mechanism
 * (`performV3CorrectionReturn` → `confirmWorkspaceSave` → `v3ReturnHref`), then a full navigation.
 * Shared by the return bar and every in-panel exit under the V3 shell; never replaced by a plain href.
 */
export function useV3CorrectionReturn(): { available: boolean; status: V3ReturnStatus; run: () => Promise<void> } {
  const scope = useV3CorrectionScope();
  const { workspace, confirmWorkspaceSave } = useLmnp();
  const [status, setStatus] = useState<V3ReturnStatus>("idle");

  const run = useCallback(async () => {
    if (!scope) return;
    setStatus("saving");
    const outcome = await performV3CorrectionReturn({ scope, workspace, confirmWorkspaceSave });
    if (outcome.status === "error") {
      setStatus("error");
      return;
    }
    window.location.assign(outcome.href);
  }, [scope, workspace, confirmWorkspaceSave]);

  return { available: scope !== null, status, run };
}
