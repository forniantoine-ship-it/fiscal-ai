"use client";

import type { ReactNode } from "react";
import { useBienScope } from "@/lib/lmnp/store";

/**
 * R2B.2b — garde des panels F010–F014. Legacy mono : le panel est rendu tel quel. Dossier multi-bien scopé sans bien
 * actif identifié : le panel n'est PAS monté (aucune lecture de repli, aucune écriture possible). Pas de sélecteur ici.
 */
export function BienScopeGate({ children }: { children: ReactNode }) {
  const { scope } = useBienScope();
  if (scope.status === "blocked") {
    return (
      <div role="status" className="rounded-lg border p-4 text-sm text-ink-muted">
        Ce logement n’est pas identifié. Ouvrez-le depuis votre dossier pour continuer.
      </div>
    );
  }
  return <>{children}</>;
}
