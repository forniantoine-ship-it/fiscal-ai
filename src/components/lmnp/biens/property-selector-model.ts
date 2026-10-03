/**
 * MB-MULTI-UX-1 — modèle PUR du sélecteur de bien. Le bien actif est celui de l'URL (scope V3 vérifié) : changer de bien = changer
 * de lien, jamais d'écriture. Les noms viennent du bien (jamais « bien 1 / bien 2 » comme identité) ; deux noms identiques sont
 * distingués par leur adresse, puis par un rang d'affichage.
 */
import { v3CorrectionHrefForResolvedScope, type V3CorrectionScope } from "@/lab/v2-dossier/correction-scope";

export type SelectorProperty = { id: string; label?: string; address?: string; city?: string };

export type PropertySelectorItem = { propertyId: string; label: string; active: boolean; href: string | null };

function baseLabel(property: SelectorProperty): string {
  return property.label?.trim() || property.address?.trim() || "Bien sans nom";
}

export function buildPropertySelectorItems(input: {
  properties: readonly SelectorProperty[];
  /** Biens de l'exercice (ordre conservé) : seuls ceux-ci sont sélectionnables. */
  propertyIds: readonly string[];
  activePropertyId: string | undefined;
  scope: V3CorrectionScope | null;
  pathname: string;
}): PropertySelectorItem[] {
  const inYear = input.propertyIds
    .map((id) => input.properties.find((property) => property.id === id))
    .filter((property): property is SelectorProperty => property !== undefined);
  const counts = new Map<string, number>();
  for (const property of inYear) counts.set(baseLabel(property), (counts.get(baseLabel(property)) ?? 0) + 1);
  const seen = new Map<string, number>();
  return inYear.map((property) => {
    let label = baseLabel(property);
    if ((counts.get(label) ?? 0) > 1) {
      const where = [property.address?.trim(), property.city?.trim()].filter(Boolean).join(", ");
      const rank = (seen.get(label) ?? 0) + 1;
      seen.set(label, rank);
      label = where ? `${label} — ${where}` : `${label} (${rank})`;
    }
    const href = input.scope
      ? v3CorrectionHrefForResolvedScope(input.pathname, { ...input.scope, property: { kind: "required", propertyId: property.id } })
      : null;
    return { propertyId: property.id, label, active: property.id === input.activePropertyId, href };
  });
}

/**
 * Lien du dossier V3 (lecture) pour un bien : le bien actif est le paramètre d'URL `propertyId` (source de vérité unique), jamais
 * une autorité — il est revérifié contre le dossier chargé (`scopeFromRealWorkspace`).
 */
export function v3ShellPropertyHref(dossierId: string, propertyId: string): string {
  const params = new URLSearchParams({ dossierId, propertyId });
  return `/lab/v3-dossier/real?${params}`;
}

export function buildV3ShellPropertyItems(input: {
  properties: readonly SelectorProperty[];
  propertyIds: readonly string[];
  activePropertyId: string | undefined;
  dossierId: string | undefined;
}): PropertySelectorItem[] {
  return buildPropertySelectorItems({ ...input, scope: null, pathname: "" }).map((item) => ({
    ...item,
    href: input.dossierId ? v3ShellPropertyHref(input.dossierId, item.propertyId) : null,
  }));
}
