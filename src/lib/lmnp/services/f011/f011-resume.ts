import type { F011PersistedState } from "@/runtime";
import { shouldResumeF011 } from "@/runtime";

/**
 * Cycle 2 (F-011) — décision de reprise, miroir de `resolveF010ResumeDecision`
 * (contrainte : `shouldResumeF011` toujours vérifié avant le repli
 * "déjà complet"). Pas de variantes `resume_analysis`/`resume_pending_extraction` :
 * F-011 n'a pas encore de convergence documentaire (hors périmètre Cycle 2).
 */
export type F011ResumeDecision =
  | { kind: "start" }
  | { kind: "legacy_complete" }
  | { kind: "legacy_skipped" }
  | { kind: "resume_step" };

export type ResolveF011ResumeDecisionParams = {
  persisted: F011PersistedState | undefined;
  /** `Boolean(declarationDraft?.financementCharges)` — calculé par l'appelant, jamais recalculé ici. */
  isLegacyComplete: boolean;
  /**
   * Achat comptant confirmé (`creditDeclaredNoneAt`) sans `financementCharges`.
   * `shouldResumeF011` ignore volontairement `skipped` — ce drapeau est le
   * raccourci prévu (cf. commentaire de `shouldResumeF011`).
   */
  isLegacySkipped?: boolean;
};

/**
 * Décide comment initialiser le panel F011 au montage. Pure, testable sans
 * React : encode à elle seule l'ordre imposé (`shouldResumeF011` toujours
 * vérifié avant le repli `financementCharges`), pour que cet ordre ne dépende
 * pas d'une relecture attentive du composant.
 */
export function resolveF011ResumeDecision(params: ResolveF011ResumeDecisionParams): F011ResumeDecision {
  const { persisted, isLegacyComplete, isLegacySkipped } = params;

  if (shouldResumeF011(persisted)) return { kind: "resume_step" };
  if (isLegacyComplete) return { kind: "legacy_complete" };
  if (isLegacySkipped) return { kind: "legacy_skipped" };
  return { kind: "start" };
}
