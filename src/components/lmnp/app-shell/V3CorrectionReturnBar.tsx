"use client";

import { useV3CorrectionReturn } from "./useV3CorrectionReturn";

/** Visible only inside a V3 correction (non-null scope from V3CorrectionEntryGate). */
export function V3CorrectionReturnBar() {
  const { available, status, run } = useV3CorrectionReturn();

  if (!available) return null;

  return (
    <div role="region" aria-label="Retour au dossier">
      <button type="button" onClick={() => void run()} disabled={status === "saving"}>
        {status === "saving" ? "Enregistrement en cours…" : "Retour au dossier"}
      </button>
      {status === "error" ? (
        <p role="alert">La sauvegarde n’a pas pu être confirmée. Réessayez avant de revenir.</p>
      ) : null}
    </div>
  );
}
