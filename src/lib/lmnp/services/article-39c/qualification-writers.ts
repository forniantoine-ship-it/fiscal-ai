/**
 * INT-3 — WRITERS PURS des qualifications article 39 C : état courant du draft + réponse → action reducer existante.
 *
 * Aucune mutation directe : chaque writer retourne une action `DECLARATION_PATCH_DRAFT` (le pattern existant) portant le
 * NOUVEAU store, ou `undefined` si la réponse ne change rien (même contenu fiscal : pas d'action, donc pas d'invalidation
 * parasite). Le reducer applique le patch :
 *  - mono : patch plat du draft ;
 *  - multi : `propertyId` explicite obligatoire (le store est routé vers `biens[propertyId]`) ;
 *  - activité : racine du draft, jamais de `propertyId`.
 *
 * Respect du scope, de l'exercice, de `sourceId`, de l'empreinte de source, de la provenance, de la validation
 * (`VALIDATED` : réponse explicite du client) et de `answeredAt` (fourni par l'appelant, jamais lu depuis l'horloge).
 * Le client fournit un FAIT métier ; le logiciel qualifie (jamais B / ACTIVITY / OTHER_PRODUCT / EXCLUDED en réponse).
 */
import type { DeclarationDraft } from "@/lib/lmnp/types";
import type { Article39cScope } from "./contribution";
import {
  declareCfeNotice,
  parseQualificationStore,
  recordCfeAnswer,
  recordChargeNatureAnswer,
  emptyQualificationStore,
  type Article39cQualificationStore,
  type CfeDiversLinkage,
} from "./qualification-store";
import type { CfeBaseKind, ChargeNatureFact, FactProvenanceKind } from "./qualification-facts";

export type Article39cQualificationAction =
  | { type: "DECLARATION_PATCH_DRAFT"; patch: { article39cQualifications: Article39cQualificationStore }; propertyId: string }
  | { type: "DECLARATION_PATCH_DRAFT"; patch: { article39cActivityQualifications: Article39cQualificationStore } };

/** Store courant d'un scope, lu dans le draft (multi : `biens[propertyId]` ; mono : à plat ; activité : racine). */
export function currentQualificationStore(draft: DeclarationDraft | undefined, scope: Article39cScope): Article39cQualificationStore {
  if (scope.level === "ACTIVITY") return parseQualificationStore(draft?.article39cActivityQualifications) ?? emptyQualificationStore();
  const raw = draft?.biens !== undefined ? draft.biens[scope.propertyId]?.article39cQualifications : draft?.article39cQualifications;
  return parseQualificationStore(raw) ?? emptyQualificationStore();
}

function actionFor(scope: Article39cScope, previous: Article39cQualificationStore, next: Article39cQualificationStore): Article39cQualificationAction | undefined {
  if (next === previous) return undefined;
  return scope.level === "ACTIVITY"
    ? { type: "DECLARATION_PATCH_DRAFT", patch: { article39cActivityQualifications: next } }
    : { type: "DECLARATION_PATCH_DRAFT", patch: { article39cQualifications: next }, propertyId: scope.propertyId };
}

type NoticeInput = { sourceId: string; fiscalYear: number; amountCents: number; evidenceRefs?: readonly string[] };

/** Déclare la SOURCE d'une CFE (avis) — aucune réponse sur sa base : absence = UNKNOWN. */
export function writeCfeNotice(
  draft: DeclarationDraft | undefined,
  input: { scope: Article39cScope; notice: NoticeInput; answeredAt: string; diversLinkage?: CfeDiversLinkage },
): Article39cQualificationAction | undefined {
  const previous = currentQualificationStore(draft, input.scope);
  return actionFor(input.scope, previous, declareCfeNotice(previous, input));
}

/** Réponse client → `cfeBaseKind` (BASE MINIMUM → MINIMUM ; VALEUR LOCATIVE → RENTAL_VALUE ; JE NE SAIS PAS → UNKNOWN). */
export type CfeAnswer = "MINIMUM_BASE" | "RENTAL_VALUE_BASE" | "DONT_KNOW";

const CFE_ANSWER_TO_KIND: Readonly<Record<CfeAnswer, CfeBaseKind>> = {
  MINIMUM_BASE: "MINIMUM",
  RENTAL_VALUE_BASE: "RENTAL_VALUE",
  DONT_KNOW: "UNKNOWN",
};

export function writeCfeAnswer(
  draft: DeclarationDraft | undefined,
  input: { scope: Article39cScope; notice: NoticeInput; answer: CfeAnswer; provenance: FactProvenanceKind; answeredAt: string },
): Article39cQualificationAction | undefined {
  const previous = currentQualificationStore(draft, input.scope);
  return actionFor(input.scope, previous, recordCfeAnswer(previous, { ...input, cfeBaseKind: CFE_ANSWER_TO_KIND[input.answer] }));
}

/** Fait de nature (gestion / assurance / frais bancaires / comptabilité) déjà rattaché à l'empreinte COURANTE de sa source. */
export function writeChargeNatureAnswer(
  draft: DeclarationDraft | undefined,
  input: { scope: Article39cScope; fiscalYear: number; fact: ChargeNatureFact; answeredAt: string },
): Article39cQualificationAction | undefined {
  const previous = currentQualificationStore(draft, input.scope);
  return actionFor(input.scope, previous, recordChargeNatureAnswer(previous, input));
}
