"use client";

import { useMemo } from "react";
import { usePathname } from "next/navigation";
import { useV3CorrectionScope } from "@/lab/v2-dossier/correction-context";
import { v3CorrectionHrefForResolvedScope } from "@/lab/v2-dossier/correction-scope";
import { isMultiPropertyCapabilityOpen, isMultiPropertyWorkspace, type MultiPropertyCapabilities } from "@/lib/lmnp/dossier/multi-property-activation";
import { deriveProductionScope, productionWorkspaceHref, PRODUCTION_VALIDATION_HREF } from "@/lib/lmnp/dossier/production-dossier-scope";
import { useLmnp } from "@/lib/lmnp/store";
import { PropertySelector } from "./PropertySelector";
import { buildPropertySelectorItems } from "./property-selector-model";
import { shouldShowV3PropertiesSection } from "./V3PropertiesSection";

/**
 * MB-MULTI-JOURNEY-COMPLETION-2 — entrée de PRODUCTION du parcours multi-bien : « Mes biens », sélecteur de bien sur les documents et
 * accès à la validation. Réutilise les routes et le contrat de scope existants (dérivé du dossier chargé, revérifié côté serveur) ;
 * aucune route /lab, aucun drapeau de test.
 *
 * DORMANTE tant que la capacité d'ÉDITION est fermée : rendue seulement pour un dossier DÉJÀ multi-bien ou si l'édition est ouverte
 * (jamais en production aujourd'hui) — un dossier mono n'en voit aucune trace.
 */
export function ProductionPropertiesEntry({ capabilities }: { capabilities?: MultiPropertyCapabilities }) {
  const { workspace } = useLmnp();
  const urlScope = useV3CorrectionScope();
  const pathname = usePathname();
  const scope = useMemo(() => urlScope ?? deriveProductionScope(workspace), [urlScope, workspace]);
  const items = useMemo(
    () => buildPropertySelectorItems({
      properties: workspace.properties,
      propertyIds: workspace.fiscalYear.propertyIds,
      activePropertyId: scope?.property.kind === "required" ? scope.property.propertyId : undefined,
      scope,
      pathname: "/documents",
    }),
    [workspace.properties, workspace.fiscalYear.propertyIds, scope],
  );
  if (!shouldShowV3PropertiesSection(workspace, capabilities) || pathname === "/assistants/biens") return null;
  const manageHref = scope ? v3CorrectionHrefForResolvedScope("/assistants/biens", scope) : null;
  const multi = isMultiPropertyWorkspace(workspace);
  return (
    <section aria-label="Mes biens" className="mb-4 flex flex-col gap-3">
      {pathname === "/documents" ? <PropertySelector items={items} /> : null}
      <div className="flex flex-wrap gap-4 text-sm">
        {manageHref ? <a href={manageHref} className="underline">Mes biens{isMultiPropertyCapabilityOpen("edition", capabilities) ? " · Ajouter un bien" : ""}</a> : null}
        {multi ? <a href={productionWorkspaceHref(PRODUCTION_VALIDATION_HREF, workspace)} className="underline">Valider mon dossier</a> : null}
      </div>
    </section>
  );
}
