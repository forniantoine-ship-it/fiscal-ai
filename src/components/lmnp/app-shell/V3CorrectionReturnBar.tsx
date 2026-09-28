"use client";

import { useState } from "react";
import { useV3CorrectionScope } from "@/lab/v2-dossier/correction-context";
import { useLmnp } from "@/lib/lmnp/store";
import { performV3CorrectionReturn } from "./v3-correction-return";

/** Visible only inside a V3 correction (non-null scope from V3CorrectionEntryGate). */
export function V3CorrectionReturnBar() {
  const scope = useV3CorrectionScope();
  const { workspace, confirmWorkspaceSave } = useLmnp();
  const [status, setStatus] = useState<"idle" | "saving" | "error">("idle");

  if (!scope) return null;

  async function handleReturn() {
    setStatus("saving");
    const outcome = await performV3CorrectionReturn({ scope: scope!, workspace, confirmWorkspaceSave });
    if (outcome.status === "error") {
      setStatus("error");
      return;
    }
    window.location.assign(outcome.href);
  }

  return (
    <div role="region" aria-label="Retour au dossier">
      <button type="button" onClick={() => void handleReturn()} disabled={status === "saving"}>
        {status === "saving" ? "Enregistrement en cours…" : "Retour au dossier"}
      </button>
      {status === "error" ? (
        <p role="alert">La sauvegarde n’a pas pu être confirmée. Réessayez avant de revenir.</p>
      ) : null}
    </div>
  );
}
