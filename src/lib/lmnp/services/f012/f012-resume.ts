import type { F012PersistedState } from "@/runtime";
import { shouldResumeF012 } from "@/runtime";
import {
  TAXE_FONCIERE_INTEGRITY_CHECK_VERSION,
  detectTaxeFonciereLegacyRisk,
  isTaxeFonciereIntegrityCheckValid,
} from "@/runtime/assistants/f012-charges/taxe-fonciere-legacy-integrity";

/**
 * Cycle 2 (F-012) — décision de reprise, miroir de `resolveF011ResumeDecision`
 * (contrainte : `shouldResumeF012` toujours vérifié avant le repli
 * "déjà complet"). Blocker #3 Lot C : enveloppe `integrity_verification_required`
 * quand un state persisté est certainly_exposed sans marker valide.
 */
export type F012ResumeUnderlyingKind = "legacy_complete" | "resume_complete" | "resume_step";

export type F012ResumeDecision =
  | { kind: "start" }
  | { kind: "legacy_complete" }
  | { kind: "resume_step" }
  | { kind: "resume_complete" }
  | { kind: "integrity_verification_required"; underlying: F012ResumeUnderlyingKind };

export type ResolveF012ResumeDecisionParams = {
  persisted: F012PersistedState | undefined;
  /** `Boolean(declarationDraft?.chargesAssistant)` — calculé par l'appelant, jamais recalculé ici. */
  isLegacyComplete: boolean;
};

function resolveUnderlyingF012ResumeDecision(
  params: ResolveF012ResumeDecisionParams,
): Exclude<F012ResumeDecision, { kind: "integrity_verification_required" }> {
  const { persisted, isLegacyComplete } = params;

  if (persisted && persisted.step === "complete") return { kind: "resume_complete" };
  if (shouldResumeF012(persisted)) return { kind: "resume_step" };
  if (isLegacyComplete) return { kind: "legacy_complete" };
  return { kind: "start" };
}

/**
 * Décide comment initialiser le panel F012 au montage. Pure, testable sans
 * React : encode à elle seule l'ordre imposé (`shouldResumeF012` toujours
 * vérifié avant le repli `chargesAssistant`), pour que cet ordre ne dépende
 * pas d'une relecture attentive du composant.
 *
 * Blocker #3 — après la décision underlying, si un `F012PersistedState` est
 * présent et `certainly_exposed` sans marker valide →
 * `integrity_verification_required` (le panel hydrate l'underlying puis
 * active le parcours intégrité). Sans state persisté (`legacy_complete`
 * totaux seuls) : pas de détection V1 inventée.
 */
export function resolveF012ResumeDecision(params: ResolveF012ResumeDecisionParams): F012ResumeDecision {
  const underlying = resolveUnderlyingF012ResumeDecision(params);
  const { persisted } = params;

  if (
    persisted &&
    (underlying.kind === "legacy_complete" ||
      underlying.kind === "resume_complete" ||
      underlying.kind === "resume_step")
  ) {
    const risk = detectTaxeFonciereLegacyRisk({ collected: persisted.collected });
    const valid = isTaxeFonciereIntegrityCheckValid({
      check: persisted.taxeFonciereIntegrityCheck,
      expense: persisted.collected.taxeFonciereExpense,
      currentCheckVersion: TAXE_FONCIERE_INTEGRITY_CHECK_VERSION,
    });
    if (risk.kind === "certainly_exposed" && !valid) {
      return { kind: "integrity_verification_required", underlying: underlying.kind };
    }
  }

  return underlying;
}
