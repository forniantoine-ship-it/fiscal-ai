import type { PersistedWorkspace } from "@/lib/lmnp/store/persistence";
import { LMNP_ROUTES } from "@/lib/lmnp/routes";
import { buildDossierSteps, buildMissingItems, type DossierStepId } from "@/lib/lmnp/services/validation-profile";
import { FIELD_REGISTRY } from "@/lib/lmnp/types/field-keys";
import { resolveV3MonoBienSource } from "./v3-property-scope";

export interface V3UserAction {
  id: string;
  domain: DossierStepId;
  label: string;
  href: string;
}

export interface V3UserActionReadModel {
  state: "known" | "unknown";
  actions: V3UserAction[];
}

// Presentation sequence, deliberately distinct from buildDossierSteps' internal order.
const DOMAIN_ORDER: DossierStepId[] = ["activite", "logement", "credit", "revenus", "charges", "amortissement"];
const GENERIC_LABELS: Record<DossierStepId, string> = {
  activite: "Reprendre l’activité",
  logement: "Reprendre le logement",
  credit: "Reprendre le financement",
  revenus: "Reprendre les loyers",
  charges: "Reprendre les dépenses",
  amortissement: "Vérifier les amortissements",
};

function validationDomain(fieldKey: string): DossierStepId | null {
  if (!(fieldKey in FIELD_REGISTRY)) return null;
  if (fieldKey === "fiscal.regime") return "activite";
  if (fieldKey.startsWith("property.")) return "logement";
  if (fieldKey.startsWith("loan.")) return "credit";
  if (fieldKey.startsWith("income.")) return "revenus";
  if (fieldKey.startsWith("expense.")) return "charges";
  if (fieldKey.startsWith("amort.")) return "amortissement";
  return null;
}

/** A read-only projection of current user interventions, never a calculation or task store. */
export function buildV3UserActionReadModel(workspace: PersistedWorkspace): V3UserActionReadModel {
  const year = workspace.fiscalYear;
  // An unsupported or inconsistent entity scope cannot justify a zero-action claim. R2A — the exercise's single
  // property (or none) is resolved centrally and its values are read through BienDraft; any other scope is unknown.
  const source = resolveV3MonoBienSource(workspace);
  if (!year.id || !Number.isInteger(year.year) || source.kind === "unsupported") {
    return { state: "unknown", actions: [] };
  }
  const propertyId = source.kind === "bien" ? source.propertyId : undefined;
  const draft = source.draft;

  const missing = buildMissingItems(buildDossierSteps(draft, year.year));
  const firstMissing = DOMAIN_ORDER.map(domain => missing.find(item => item.id === domain)).find(Boolean);
  const preciseByDomain = new Map<DossierStepId, V3UserAction>();

  for (const item of workspace.validationItems) {
    if (item.status !== "pending" || item.fiscalYearId !== year.id) continue;
    if (item.propertyId && item.propertyId !== propertyId) continue;
    const domain = validationDomain(item.fieldKey);
    if (!domain || !item.id) return { state: "unknown", actions: [] };
    // The existing validation inbox owns this confirmation, including items without a document.
    if (!preciseByDomain.has(domain)) {
      preciseByDomain.set(domain, {
        id: item.id, domain, label: `Confirmer : ${item.label || FIELD_REGISTRY[item.fieldKey].label}`,
        href: LMNP_ROUTES.validation,
      });
    }
  }

  const actions = DOMAIN_ORDER.flatMap((domain): V3UserAction[] => {
    const precise = preciseByDomain.get(domain);
    if (precise) return [precise];
    if (firstMissing?.id !== domain) return [];
    const contested = domain === "amortissement" &&
      draft?.amortissementAssistant?.status === "contested" &&
      draft.amortissementAssistant.exerciceFiscal === year.year;
    return [{
      id: domain, domain,
      label: contested ? "Revoir le plan d’amortissement" : GENERIC_LABELS[domain],
      href: firstMissing.href,
    }];
  });

  return { state: "known", actions };
}
