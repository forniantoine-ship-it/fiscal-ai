import type { V3CorrectionScope } from "@/lab/v2-dossier/correction-scope";
import { v3CorrectionHrefForResolvedScope } from "@/lab/v2-dossier/correction-scope";
import { isMultiPropertyCapabilityOpen, isMultiPropertyWorkspace, type MultiPropertyCapabilities } from "@/lib/lmnp/dossier/multi-property-activation";
import type { PersistedWorkspace } from "@/lib/lmnp/store/persistence";
import { PropertySelector } from "./PropertySelector";
import { buildV3ShellPropertyItems } from "./property-selector-model";

/**
 * MB-MULTI-UX-1 — entrée « Mes biens » du parcours Dossier V3. DORMANTE : rendue seulement si le dossier est déjà multi-bien ou si
 * la capacité d'ÉDITION multi est ouverte (jamais en production). Aucun redesign : un lien, et le sélecteur de bien.
 */
export function shouldShowV3PropertiesSection(workspace: Pick<PersistedWorkspace, "properties" | "fiscalYear" | "declarationDraft">, capabilities?: MultiPropertyCapabilities): boolean {
  return isMultiPropertyWorkspace(workspace) || isMultiPropertyCapabilityOpen("edition", capabilities);
}

export function V3PropertiesSection({ workspace, scope, requestedPropertyId, capabilities }: {
  workspace: PersistedWorkspace;
  scope: V3CorrectionScope | null;
  requestedPropertyId?: string;
  capabilities?: MultiPropertyCapabilities;
}) {
  if (!shouldShowV3PropertiesSection(workspace, capabilities)) return null;
  const manageHref = scope ? v3CorrectionHrefForResolvedScope("/assistants/biens", scope) : null;
  const items = buildV3ShellPropertyItems({
    properties: workspace.properties,
    propertyIds: workspace.fiscalYear.propertyIds,
    activePropertyId: scope?.property.kind === "required" ? scope.property.propertyId : requestedPropertyId,
    dossierId: scope?.dossierId,
  });
  return (
    <section aria-label="Mes biens" className="flex flex-col gap-3">
      <PropertySelector items={items} />
      {manageHref ? <a href={manageHref} className="text-sm underline">Mes biens{isMultiPropertyCapabilityOpen("edition", capabilities) ? " · Ajouter un bien" : ""}</a> : null}
    </section>
  );
}
