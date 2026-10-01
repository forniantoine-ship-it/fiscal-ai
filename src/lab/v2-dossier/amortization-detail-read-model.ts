import { isAnnualOutputForActiveYear } from "@/lib/lmnp/services/dossier/annual-output-year-safety";
import type { PersistedWorkspace } from "@/lib/lmnp/store/persistence";
import type { AmortissementAssistantOutput } from "@/lib/lmnp/types/domain";
import { hasAmortissementDrifted } from "@/runtime/capabilities/f014/plan-consistency";
import type { ComposantAmortissement } from "@/runtime/capabilities/f014/types";
import { resolveF014Plan, type F014PlanUnavailableReason } from "./amortization-plan-seam";
import { resolveV3PropertyServiceDate, type V3PropertyServiceDate } from "./property-service-date";
import { AMORTISSEMENT_PROFIL_LABELS } from "./read-model";
import {
  projectV3PropertyEntry, resolveV3PropertyScope, resolveV3PropertySupport,
  type V3PropertyEntry, type V3PropertyScopeReason, type V3PropertySupport, v3BienDraft,
} from "./v3-property-scope";

/**
 * R15.8 — projection structurée du domaine Amortissements (F014) POUR UN BIEN, pour la V3.
 * La V3 RESTITUE le plan F014 : elle ne décide ni base, ni terrain, ni durée, ni prorata, ni dotation, ni plafonnement.
 *
 * - Le montant principal est `amortissementAssistant.totalDotations` tel que persisté (jamais une somme de lignes). C'est
 *   une dotation CALCULÉE (comptable) : le montant fiscalement déduit ou reporté est décidé plus tard par F006 et n'est
 *   jamais déduit d'ici.
 * - Le détail vient du moteur propriétaire (`resolveF014Plan` → `composePlanAmortissement`), avec les mêmes dépendances que
 *   le panel F014. Il n'est exposé que si son total est égal au total persisté (`hasAmortissementDrifted`, même arrondi) ;
 *   sinon le détail est masqué (état « à revoir »).
 * - Reprise comptable : à la génération, la branche Opening peut REMPLACER ce total. Le total du draft n'est donc jamais
 *   présenté comme retenu : aucun montant, aucun détail, et aucun moteur Opening n'est appelé ici.
 * - Les sorties F014 n'ont pas de `propertyId` : attribuées au bien seulement s'il est le seul de l'exercice.
 * - Aucun document propre à F014 : aucun document n'est exposé.
 */
export type V3AmortizationTotal =
  /** Plusieurs biens : la sortie globale n'est attribuable à aucun bien. */
  | { state: "not_attributable" }
  | { state: "unknown" }
  /** Reprise comptable : le montant retenu vient de l'historique repris, pas du total F014 du draft. */
  | { state: "takeover" }
  /** Sortie présente, non validée (contestée) ou sans `amortissementConfirmedAt` : à confirmer. */
  | { state: "unconfirmed"; amount: number; contested: boolean }
  /** Le plan courant ne reproduit plus la sortie (logement, travaux, date modifiés) ou ne peut plus être composé : à revoir. */
  | { state: "stale"; amount: number }
  /** Sortie validée et confirmée. `amount` peut valoir 0 : dotation nulle confirmée ≠ absence. */
  | { state: "known_amount"; amount: number };

/** `consistent` : le plan recomposé par F014 est égal à la sortie persistée. */
export type V3AmortizationPlanFreshness = "not_checked" | "consistent" | "drifted" | "unavailable";

export type V3AmortizationLineSource =
  /** Ligne du plan logement F010 (grille native). */
  | "housing"
  /** Composant de la sortie F012 de l'exercice. */
  | "charges"
  /** Composant reporté d'un exercice antérieur (`Property.amortissementBase`). */
  | "carried_over"
  /** Ligne ancrée (id durable) : origine non démontrable ici. */
  | "unspecified";

export interface V3AmortizationLine {
  id: string;
  label: string;
  base: number;
  durationYears: number;
  /** `dotation_exercice` du plan F014. */
  dotation: number;
  source: V3AmortizationLineSource;
  /** Composants F012 uniquement. */
  startDate?: string;
}

export type V3AmortizationDetail =
  | { state: "scope_unresolved"; reason: V3PropertyScopeReason; year: number }
  | {
      state: "known";
      propertyId: string;
      year: number;
      label: string;
      address: string | null;
      support: V3PropertySupport;
      total: V3AmortizationTotal;
      /** Libellé du profil persisté (jamais recalculé). */
      profile: string | null;
      validatedAt: string | null;
      serviceDate: V3PropertyServiceDate;
      planFreshness: V3AmortizationPlanFreshness;
      /** Pourquoi le plan F014 n'a pas pu être composé (sortie de la seam), le cas échéant. */
      planBlock?: F014PlanUnavailableReason;
      /** Lignes du plan F014 — uniquement quand le plan recomposé est égal à la sortie persistée. */
      lines: V3AmortizationLine[];
      /** `logementAmortissement.valeurTerrain` persisté, jamais amorti — uniquement avec le détail. */
      land?: { amount: number };
      entry: V3PropertyEntry;
    };

const isNativeHousingId = (id: string) => /^f010-\d+$/.test(id);

function addressOf(address: string | undefined, postalCode: string | undefined, city: string | undefined): string | null {
  return [address?.trim(), [postalCode, city].filter(Boolean).join(" ")].filter(Boolean).join(", ") || null;
}

/** Reprise comptable au sens de la génération : Opening externe, continuité de reprise ou reprise déclarée. */
function isTakeoverContext(workspace: PersistedWorkspace, entry: V3PropertyEntry): boolean {
  const fiscalYear = workspace.fiscalYear;
  return entry.kind === "takeover"
    || entry.reason === "takeover_declared_not_validated"
    || fiscalYear.externalTakeoverOpening !== undefined
    || fiscalYear.repriseHistoriqueEnContinuite === true
    || fiscalYear.immobilisationsOuverture?.actifsReprise !== undefined;
}

export function buildV3AmortizationDetail(
  workspace: PersistedWorkspace,
  propertyId: string | null | undefined,
): V3AmortizationDetail {
  const year = workspace.fiscalYear.year;
  const scope = resolveV3PropertyScope(workspace, propertyId);
  if (!scope.ok) return { state: "scope_unresolved", reason: scope.reason, year };
  const { property } = scope;
  const support = resolveV3PropertySupport(workspace, property.id);
  const serviceDate = resolveV3PropertyServiceDate(workspace, property.id);
  const entry = projectV3PropertyEntry(workspace, property.id, support);
  const base = {
    state: "known" as const, propertyId: property.id, year, label: property.label,
    address: addressOf(property.address, property.postalCode, property.city), support, serviceDate, entry,
    profile: null, validatedAt: null, planFreshness: "not_checked" as V3AmortizationPlanFreshness, lines: [] as V3AmortizationLine[],
  };

  if (support === "facts_only") {
    // The global F014 output is not demonstrably this property's: nothing of it is exposed.
    return { ...base, total: { state: "not_attributable" } };
  }
  if (isTakeoverContext(workspace, entry)) {
    // The draft total may be replaced at generation by the Opening's: it is never shown as retained.
    return { ...base, total: { state: "takeover" } };
  }

  const draft = v3BienDraft(workspace, property.id);
  const output: AmortissementAssistantOutput | undefined =
    draft?.amortissementAssistant && isAnnualOutputForActiveYear(draft.amortissementAssistant, year)
    && Number.isFinite(draft.amortissementAssistant.totalDotations)
      ? draft.amortissementAssistant : undefined;

  const resolution = resolveF014Plan(workspace, property.id);
  const planBlock = resolution.ok ? undefined : resolution.reason;
  const withBlock = planBlock ? { planBlock } : {};

  if (!output) return { ...base, ...withBlock, total: { state: "unknown" } };

  const meta = {
    profile: AMORTISSEMENT_PROFIL_LABELS[output.profil] ?? output.profil,
    validatedAt: output.validatedAt || null,
  };
  const confirmed = output.status === "validated" && Boolean(draft?.amortissementConfirmedAt);

  if (!resolution.ok) {
    return { ...base, ...meta, ...withBlock, planFreshness: "unavailable", total: { state: "stale", amount: output.totalDotations } };
  }
  if (hasAmortissementDrifted(output.totalDotations, resolution.plan.total_dotations_exercice)) {
    return { ...base, ...meta, planFreshness: "drifted", total: { state: "stale", amount: output.totalDotations } };
  }

  const carriedFrom = new Set(resolution.currentComposantIds);
  const housingLines = resolution.plan.composants.map((component): V3AmortizationLine =>
    lineOf(component, isNativeHousingId(component.id) ? "housing" : "unspecified"));
  const componentLines = resolution.plan.nouveaux_elements.map((component): V3AmortizationLine => {
    const start = resolution.composantsNouveaux.find(item => item.id === component.id)?.dateDebut;
    return { ...lineOf(component, carriedFrom.has(component.id) ? "charges" : "carried_over"), ...(start ? { startDate: start } : {}) };
  });

  const housing = draft?.logementAmortissement;
  const landAmount = housing?.valeurTerrain;
  const total: V3AmortizationTotal = !confirmed
    ? { state: "unconfirmed", amount: output.totalDotations, contested: output.status === "contested" }
    : { state: "known_amount", amount: output.totalDotations };

  return {
    ...base, ...meta,
    planFreshness: "consistent",
    total,
    lines: [...housingLines, ...componentLines],
    ...(typeof landAmount === "number" && Number.isFinite(landAmount) && landAmount > 0 ? { land: { amount: landAmount } } : {}),
  };
}

function lineOf(component: ComposantAmortissement, source: V3AmortizationLineSource): V3AmortizationLine {
  return {
    id: component.id, label: component.nom_courant, base: component.base_amortissable, durationYears: component.duree_ans,
    dotation: component.dotation_exercice, source,
  };
}
