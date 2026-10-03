import type { PropertySelectorItem } from "./property-selector-model";

/**
 * MB-MULTI-UX-1 — sélecteur de bien. Présentation PURE : le bien actif et les liens viennent de `buildPropertySelectorItems`
 * (URL = source de vérité). Changer de bien est une navigation, jamais une écriture. Masqué avec moins de 2 biens.
 */
export function PropertySelector({ items }: { items: readonly PropertySelectorItem[] }) {
  if (items.length < 2) return null;
  return (
    <nav aria-label="Biens du dossier" className="rounded-lg border p-3 text-sm">
      <p className="mb-2 text-ink-muted">Bien concerné</p>
      <ul role="list" className="flex flex-wrap gap-2">
        {items.map((item) => (
          <li key={item.propertyId}>
            {item.active ? (
              <span aria-current="true" className="rounded-md border px-3 py-1 font-medium">{item.label}</span>
            ) : item.href ? (
              <a href={item.href} className="rounded-md border px-3 py-1 text-ink-muted underline">{item.label}</a>
            ) : (
              <span className="rounded-md border px-3 py-1 text-ink-muted">{item.label}</span>
            )}
          </li>
        ))}
      </ul>
    </nav>
  );
}
