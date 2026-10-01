import { mergeComposantsF012 } from "@/lib/lmnp/services/dossier/fiscal-year-cycle";
import { isAnnualOutputForActiveYear } from "@/lib/lmnp/services/dossier/annual-output-year-safety";
import type { PersistedWorkspace } from "@/lib/lmnp/store/persistence";
import type { F014Deps } from "@/runtime/assistants/f014-amortissements/types";
import { composePlanAmortissement } from "@/runtime/capabilities/f014/compose-plan-amortissement";
import { determineAmortissementProfil } from "@/runtime/capabilities/f014/determine-profil";
import type { AmortissementProfil, PlanAmortissement } from "@/runtime/capabilities/f014/types";
import type { ComposantNouveau } from "@/runtime/capabilities/f012/types";
import { resolveV3PropertyServiceDate } from "./property-service-date";
import { resolveV3PropertyScope, resolveV3PropertySupport, type V3PropertyScopeReason, v3BienDraft } from "./v3-property-scope";

/**
 * R15.8 — SEAM PUR vers le moteur propriétaire F014, pour UN bien.
 *
 * Ce n'est pas un calcul V3 : le plan est produit par `composePlanAmortissement` (le moteur que l'Assistant Amortissements
 * appelle lui-même) avec EXACTEMENT les dépendances du panel F014 (`F014AmortissementsAssistantPanel`) :
 *   dateMiseEnService  = draft.dateMiseEnService
 *   planLogement       = draft.logementAmortissement.plan            (sortie F010)
 *   prorataRatio       = draft.logementAmortissement.prorataRatio    (sortie F010)
 *   composantsNouveaux = mergeComposantsF012(draft.chargesAssistant.composantsNouveaux, Property.amortissementBase)
 *   planValidePrecedemment / anneeValidationInitiale = draft.amortissementAssistant
 *
 * Différence assumée : la base reportée est lue sur CE bien (`propertyId` explicite vérifié), jamais sur le premier bien de la liste.
 * Aucune mutation, aucun repli : date absente / conflictuelle, plan logement absent ou d'un autre exercice → raison
 * fail-closed, jamais de plan fabriqué. Multi-biens : rien n'est attribué au bien demandé.
 */
export type F014PlanUnavailableReason =
  | { kind: "scope"; reason: V3PropertyScopeReason }
  | { kind: "not_attributable" }
  | { kind: "service_date"; status: "absent" | "conflict" | "pending" | "not_in_draft" }
  | { kind: "housing_plan_missing" }
  | { kind: "housing_plan_other_year" }
  | { kind: "prorata_invalid" };

export type F014PlanResolution =
  | {
      ok: true;
      propertyId: string;
      deps: F014Deps;
      plan: PlanAmortissement;
      profil: AmortissementProfil;
      /** Composants F012 passés au moteur (courants + reportés). */
      composantsNouveaux: ComposantNouveau[];
      /** Ids des composants portés par la sortie F012 de CET exercice (les autres viennent de la base reportée). */
      currentComposantIds: string[];
    }
  | { ok: false; reason: F014PlanUnavailableReason };

export function resolveF014Plan(workspace: PersistedWorkspace, propertyId: string | null | undefined): F014PlanResolution {
  const scope = resolveV3PropertyScope(workspace, propertyId);
  if (!scope.ok) return { ok: false, reason: { kind: "scope", reason: scope.reason } };
  const { property } = scope;
  if (resolveV3PropertySupport(workspace, property.id) !== "full") return { ok: false, reason: { kind: "not_attributable" } };

  const draft = v3BienDraft(workspace, property.id);
  const serviceDate = resolveV3PropertyServiceDate(workspace, property.id);
  if (serviceDate.status !== "known") return { ok: false, reason: { kind: "service_date", status: serviceDate.status } };
  // The panel reads the GLOBAL draft date: the plan is only reproducible when that is the retained date.
  if (draft?.dateMiseEnService?.trim() !== serviceDate.value) return { ok: false, reason: { kind: "service_date", status: "not_in_draft" } };

  const housing = draft?.logementAmortissement;
  if (!housing?.plan) return { ok: false, reason: { kind: "housing_plan_missing" } };
  if (!isAnnualOutputForActiveYear(housing, workspace.fiscalYear.year)) return { ok: false, reason: { kind: "housing_plan_other_year" } };
  if (typeof housing.prorataRatio !== "number" || !Number.isFinite(housing.prorataRatio)) return { ok: false, reason: { kind: "prorata_invalid" } };

  const currentComposants = draft?.chargesAssistant?.composantsNouveaux;
  const composantsNouveaux = mergeComposantsF012(currentComposants, property.amortissementBase);
  const deps: F014Deps = {
    dateMiseEnService: draft?.dateMiseEnService,
    planLogement: housing.plan,
    prorataRatio: housing.prorataRatio,
    composantsNouveaux,
    planValidePrecedemment: Boolean(draft?.amortissementAssistant?.validatedAt),
    anneeValidationInitiale: draft?.amortissementAssistant?.anneeValidationInitiale ?? null,
  };

  const { plan } = composePlanAmortissement({
    exerciceFiscal: workspace.fiscalYear.year,
    dateMiseEnService: deps.dateMiseEnService!,
    planLogement: deps.planLogement!,
    prorataRatio: deps.prorataRatio!,
    composantsNouveaux: deps.composantsNouveaux,
    planValidePrecedemment: deps.planValidePrecedemment,
    anneeValidationInitiale: deps.anneeValidationInitiale,
  });

  return {
    ok: true,
    propertyId: property.id,
    deps,
    plan,
    profil: determineAmortissementProfil(plan),
    composantsNouveaux,
    currentComposantIds: (currentComposants ?? []).map(component => component.id),
  };
}
