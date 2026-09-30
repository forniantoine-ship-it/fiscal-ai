import type { V3DomainId } from "./read-model";
import { v3CorrectionHrefForResolvedScope, type V3CorrectionScope } from "./correction-scope";

export type V3CorrectionActionKind = "modifier" | "verifier";

/**
 * "input": the owner assistant can be reopened to change the facts shown —
 * either a genuine user input (address, SIRET…) or its own exercise output.
 * "derived": every fact in the domain is a computed result the owner cannot
 * take a direct edit for — only a "verify/contest" action is offered, and
 * only when the code demonstrates that path exists (F014's contestation flow).
 */
export type V3CorrectionFactKind = "input" | "derived";

interface V3CorrectionRegistryEntry {
  owner: string;
  route: string;
  precision: "domain";
  /** R15.3 — route used instead of `route` when the verified scope carries the V3 shell marker. */
  v3ShellRoute?: string;
  factKind: V3CorrectionFactKind;
  actionKind: V3CorrectionActionKind;
  actionLabel: string;
}

// DOMAIN ONLY: never a field or step deep link. One action per domain, never per fact —
// see mission R12.2 §2/§5: derived results (prixRevient, totalDotations, F006's whole
// aggregation, Property.amortissementBase…) never get their own "Modifier ce chiffre".
const V3_CORRECTION_REGISTRY: Readonly<Record<V3DomainId, V3CorrectionRegistryEntry>> = {
  // R14.4A — routed to F009's V3-native presentation, not the legacy panel.
  // Same owner engine, same scope contract; only the mounted shell differs
  // (see V3ActivityRoute.tsx). Legacy /assistants/activite is unaffected.
  activity: {
    owner: "F009", route: "/lab/v2-dossier/real/activity", precision: "domain",
    // R15.3 — under the V3 shell (R15.1) the same owner engine is opened on its own route, wrapped by the common shell.
    v3ShellRoute: "/assistants/activite",
    factKind: "input", actionKind: "modifier", actionLabel: "Revoir l’activité",
  },
  property: {
    owner: "F010", route: "/assistants/logement", precision: "domain",
    factKind: "input", actionKind: "modifier", actionLabel: "Revoir le logement",
  },
  financing: {
    owner: "F011", route: "/assistants/financement", precision: "domain",
    factKind: "input", actionKind: "modifier", actionLabel: "Revoir le financement",
  },
  revenues: {
    owner: "F013", route: "/assistants/revenus", precision: "domain",
    factKind: "input", actionKind: "modifier", actionLabel: "Revoir les loyers",
  },
  charges: {
    owner: "F012", route: "/assistants/charges", precision: "domain",
    factKind: "input", actionKind: "modifier", actionLabel: "Revoir les charges",
  },
  // F014's totalDotations/profil are fully computed (see read-model.ts buildV3AmortizationReadModel):
  // never "Modifier le total", only the existing verify/contest path.
  depreciation: {
    owner: "F014", route: "/assistants/amortissements", precision: "domain",
    factKind: "derived", actionKind: "verifier", actionLabel: "Vérifier le plan",
  },
};

export interface V3CorrectionAction {
  owner: string;
  kind: V3CorrectionActionKind;
  label: string;
  href: string;
}

/**
 * Pure presentation lookup: no business logic, no fiscal computation. `scope` must already
 * be the real, server-verified scope resolved by R12.1A (null when unresolved/ambiguous/
 * multi-property) — this function never falls back to properties[0] or any other guess.
 */
export function v3CorrectionActionFor(domainId: V3DomainId, scope: V3CorrectionScope | null): V3CorrectionAction | null {
  const entry = V3_CORRECTION_REGISTRY[domainId];
  const href = v3CorrectionHrefForResolvedScope(scope?.shell === "v3" && entry.v3ShellRoute ? entry.v3ShellRoute : entry.route, scope);
  if (!href) return null;
  return { owner: entry.owner, kind: entry.actionKind, label: entry.actionLabel, href };
}
