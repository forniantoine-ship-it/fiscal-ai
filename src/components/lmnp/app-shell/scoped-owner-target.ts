import { LMNP_ROUTES } from "@/lib/lmnp/routes";
import { v3ScopedNavigationHref, type V3CorrectionScope } from "@/lab/v2-dossier/correction-scope";

/**
 * What a `ScopedOwnerLink` renders. Pure, so the legacy behaviour can be proven without React:
 * - "exit": under the V3 shell, a link to the legacy dashboard is a return to Mon dossier and must go through the
 *   confirmed-save mechanism — it is never turned into a plain href;
 * - "link": exactly the href the link always had (`v3ScopedNavigationHref(href, scope)`);
 * - "disabled": the scoped href could not be built (same fail-closed behaviour as before).
 */
export type ScopedOwnerTarget = { kind: "exit" } | { kind: "link"; href: string } | { kind: "disabled" };

function pathnameOf(href: string): string {
  try {
    return new URL(href, "http://v3.local").pathname;
  } catch {
    return href;
  }
}

export function scopedOwnerTarget(href: string, scope: V3CorrectionScope | null): ScopedOwnerTarget {
  if (scope?.shell === "v3" && pathnameOf(href) === LMNP_ROUTES.dashboard) return { kind: "exit" };
  const scoped = v3ScopedNavigationHref(href, scope);
  return scoped ? { kind: "link", href: scoped } : { kind: "disabled" };
}
