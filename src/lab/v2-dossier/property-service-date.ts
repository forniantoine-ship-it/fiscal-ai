import type { PersistedWorkspace } from "@/lib/lmnp/store/persistence";
import { validActivityDate } from "@/runtime/assistants/f009-activite/assistant";
import { propertyScopeFor } from "./correction-scope";
import { resolveBienDraftForRead } from "@/lib/lmnp/dossier/bien-draft";

/**
 * R15.5 — accessor PUR de la date de mise en service, présentée comme donnée du BIEN sans migrer son stockage.
 *
 * Sources autorisées (aucune autre) :
 *  - `draft.dateMiseEnService`            — stockage historique GLOBAL (écrit par F009 à sa complétion) ;
 *  - `Property.amortissementBase.dateMiseEnService` — propre au bien (posée au passage N → N+1) ;
 *  - `draft.activiteAssistantState.dateMiseEnService` — réponse F009 pas encore devenue donnée métier.
 *
 * Attribution : la base appartient au `Property` demandé. La valeur globale du draft n'est attribuable qu'à un bien qui
 * est le SEUL de l'exercice (même règle que `propertyScopeFor`, réutilisée) ; en multi-biens elle n'est jamais attribuée.
 *
 * Jamais de repli : ni `acquisitionDate`, ni `activityStartDate`, ni date construite depuis l'exercice. Deux sources
 * valides qui divergent = `conflict`, aucune valeur retenue, aucun arbitrage.
 */
export type V3ServiceDateSource = "draft" | "property_base" | "assistant_in_progress";

export type V3ServiceDateCandidate = { source: V3ServiceDateSource; value: string };

export type V3ServiceDateIgnored = { source: V3ServiceDateSource; value: string; reason: "invalid_format" | "not_attributable" };

export type V3PropertyServiceDate =
  | {
      status: "known";
      value: string;
      /** Sources fiables qui portent cette valeur. */
      origins: Array<"draft" | "property_base">;
      /** Valeur F009 non encore confirmée qui diffère de la valeur retenue (modification en cours), jamais retenue. */
      unconfirmedChange?: string;
      ignored: V3ServiceDateIgnored[];
    }
  | { status: "pending"; value: string; origin: "assistant_in_progress"; ignored: V3ServiceDateIgnored[] }
  | { status: "conflict"; candidates: V3ServiceDateCandidate[]; ignored: V3ServiceDateIgnored[] }
  | { status: "absent"; ignored: V3ServiceDateIgnored[] };

function clean(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

export function resolveV3PropertyServiceDate(workspace: PersistedWorkspace, propertyId: string): V3PropertyServiceDate {
  const ignored: V3ServiceDateIgnored[] = [];
  const property = workspace.properties.find(item => item.id === propertyId);
  const scope = propertyScopeFor(workspace.fiscalYear.propertyIds, workspace.properties);
  // R2A — the bien's values are read through BienDraft (legacy mono projection or draft.biens). They are attributable
  // only when the exercise's single property resolves; otherwise (multi, inconsistent, flat+scoped conflict) the
  // exercise draft is consulted solely to report its values as not attributable — never as this property's date.
  const read = resolveBienDraftForRead(workspace, propertyId);
  const draft = read.status === "resolved" ? read.view : workspace.declarationDraft;
  const globalAttributable =
    property !== undefined && read.status === "resolved" && scope?.kind === "required" && scope.propertyId === propertyId;

  const reliable: V3ServiceDateCandidate[] = [];
  const consider = (source: V3ServiceDateSource, raw: string | undefined, attributable: boolean, into: V3ServiceDateCandidate[]) => {
    const value = clean(raw);
    if (value === undefined) return;
    if (!attributable) { ignored.push({ source, value, reason: "not_attributable" }); return; }
    if (!validActivityDate(value)) { ignored.push({ source, value, reason: "invalid_format" }); return; }
    into.push({ source, value });
  };

  consider("property_base", property?.amortissementBase?.dateMiseEnService, property !== undefined, reliable);
  consider("draft", draft?.dateMiseEnService, globalAttributable, reliable);

  const distinct = [...new Set(reliable.map(candidate => candidate.value))];
  const inProgress: V3ServiceDateCandidate[] = [];
  consider("assistant_in_progress", draft?.activiteAssistantState?.dateMiseEnService, globalAttributable, inProgress);
  const unconfirmed = inProgress[0]?.value;

  if (distinct.length > 1) return { status: "conflict", candidates: reliable, ignored };
  if (distinct.length === 1) {
    const value = distinct[0]!;
    return {
      status: "known",
      value,
      origins: reliable.map(candidate => candidate.source as "draft" | "property_base"),
      ...(unconfirmed !== undefined && unconfirmed !== value ? { unconfirmedChange: unconfirmed } : {}),
      ignored,
    };
  }
  if (unconfirmed !== undefined) return { status: "pending", value: unconfirmed, origin: "assistant_in_progress", ignored };
  return { status: "absent", ignored };
}
