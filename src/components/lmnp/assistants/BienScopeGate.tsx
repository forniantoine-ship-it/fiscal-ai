"use client";

import { useMemo, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { useV3CorrectionScope } from "@/lab/v2-dossier/correction-context";
import { isMultiPropertyWorkspace } from "@/lib/lmnp/dossier/multi-property-activation";
import { useBienScope, useLmnp } from "@/lib/lmnp/store";
import { PropertySelector } from "@/components/lmnp/biens/PropertySelector";
import { buildPropertySelectorItems } from "@/components/lmnp/biens/property-selector-model";

/**
 * R2B.2b — garde des panels F010–F014. Legacy mono : le panel est rendu tel quel. Dossier multi-bien scopé sans bien
 * actif identifié : le panel n'est PAS monté (aucune lecture de repli, aucune écriture possible).
 *
 * MB-MULTI-UX-1 — en multi-bien, le sélecteur de bien (liens du scope V3 vérifié) s'affiche au-dessus du panel et, sans bien
 * actif, à la place du panel : le bien actif reste celui de l'URL, jamais un état parallèle ni « le premier bien ».
 */
export function BienScopeGate({ children }: { children: ReactNode }) {
  const { scope, propertyId } = useBienScope();
  const { workspace } = useLmnp();
  const correctionScope = useV3CorrectionScope();
  const pathname = usePathname();
  const multi = isMultiPropertyWorkspace(workspace);
  const items = useMemo(
    () => (multi
      ? buildPropertySelectorItems({
          properties: workspace.properties,
          propertyIds: workspace.fiscalYear.propertyIds,
          activePropertyId: propertyId,
          scope: correctionScope,
          pathname,
        })
      : []),
    [multi, workspace.properties, workspace.fiscalYear.propertyIds, propertyId, correctionScope, pathname],
  );
  if (scope.status === "blocked") {
    return (
      <div className="flex flex-col gap-3">
        <PropertySelector items={items} />
        <div role="status" className="rounded-lg border p-4 text-sm text-ink-muted">
          {multi
            ? "Choisissez le bien à renseigner, ou ouvrez-le depuis votre dossier."
            : "Ce logement n’est pas identifié. Ouvrez-le depuis votre dossier pour continuer."}
        </div>
      </div>
    );
  }
  return (
    <>
      {multi ? <div className="mb-4"><PropertySelector items={items} /></div> : null}
      {children}
    </>
  );
}
