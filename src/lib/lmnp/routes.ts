import type { DocumentJourneyStepId } from "./constants/document-journey";

/** Flat app-router paths for the LMNP product (no legacy /app/exercices tree). */
export const LMNP_ROUTES = {
  dashboard: "/dashboard",
  documents: "/documents",
  activite: "/documents?step=inpi",
  revenus: "/revenus",
  depenses: "/depenses",
  amortissements: "/amortissements",
  declarations: "/declarations",
  connexion: "/connexion",
} as const;

const LEGACY_EXERCICE_PREFIX = /^\/app\/exercices\/[^/]+/;

const LEGACY_SUFFIX_TO_ROUTE: Record<string, string> = {
  "": LMNP_ROUTES.dashboard,
  documents: LMNP_ROUTES.documents,
  activite: LMNP_ROUTES.activite,
  alertes: LMNP_ROUTES.declarations,
  recettes: LMNP_ROUTES.revenus,
  depenses: LMNP_ROUTES.depenses,
  emprunts: LMNP_ROUTES.depenses,
  immobilisations: LMNP_ROUTES.amortissements,
  validation: LMNP_ROUTES.declarations,
  paiement: LMNP_ROUTES.declarations,
  teletransmission: LMNP_ROUTES.declarations,
  piece: LMNP_ROUTES.documents,
};

/** Map ledger / field tabs to flat routes. */
export function lmnpTabRoute(tab: string): string {
  return LEGACY_SUFFIX_TO_ROUTE[tab] ?? LMNP_ROUTES.dashboard;
}

/** Document journey screens live on /documents with an optional step query. */
export function documentJourneyRoute(stepId?: DocumentJourneyStepId | string): string {
  if (!stepId) return LMNP_ROUTES.documents;
  return `${LMNP_ROUTES.documents}?step=${encodeURIComponent(stepId)}`;
}

/** Map declaration-flow suffix paths (e.g. /recettes) to flat routes. */
export function declarationFlowPathToRoute(path: string): string {
  if (path === "/documents") return LMNP_ROUTES.documents;
  if (path === "/activite") return documentJourneyRoute("inpi");
  if (path === "/etape/logement") return documentJourneyRoute("logement");
  if (path.startsWith("/etape/")) return LMNP_ROUTES.dashboard;
  if (path === "/immobilisations") return LMNP_ROUTES.amortissements;
  if (path === "/recettes") return LMNP_ROUTES.revenus;
  if (path === "/depenses" || path === "/emprunts") return LMNP_ROUTES.depenses;
  if (path === "/validation" || path === "/paiement" || path === "/teletransmission") {
    return LMNP_ROUTES.declarations;
  }
  return LMNP_ROUTES.dashboard;
}

/** Normalize legacy exercice URLs to the current flat router. */
export function toFlatLmnpRoute(href: string): string {
  if (!LEGACY_EXERCICE_PREFIX.test(href)) return href;

  const withoutPrefix = href.replace(LEGACY_EXERCICE_PREFIX, "");
  if (!withoutPrefix || withoutPrefix === "/") return LMNP_ROUTES.dashboard;

  const segments = withoutPrefix.replace(/^\//, "").split("/");
  const head = segments[0] ?? "";

  if (head === "piece") {
    const step = segments[1] ?? "inpi";
    return documentJourneyRoute(step);
  }

  return LEGACY_SUFFIX_TO_ROUTE[head] ?? LMNP_ROUTES.dashboard;
}
