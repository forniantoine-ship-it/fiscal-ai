import type { F012PersistedState } from "@/runtime";
import { shouldResumeF012 } from "@/runtime";

/**
 * Cycle 2 (F-012) — décision de reprise, miroir de `resolveF011ResumeDecision`
 * (contrainte : `shouldResumeF012` toujours vérifié avant le repli
 * "déjà complet"). Pas de variante documentaire : F-012 (Tunnel B) n'a pas de
 * convergence document/OCR câblée à ce jour (hors périmètre Cycle 2).
 */
export type F012ResumeDecision = { kind: "start" } | { kind: "legacy_complete" } | { kind: "resume_step" };

export type ResolveF012ResumeDecisionParams = {
  persisted: F012PersistedState | undefined;
  /** `Boolean(declarationDraft?.chargesAssistant)` — calculé par l'appelant, jamais recalculé ici. */
  isLegacyComplete: boolean;
};

/**
 * Décide comment initialiser le panel F012 au montage. Pure, testable sans
 * React : encode à elle seule l'ordre imposé (`shouldResumeF012` toujours
 * vérifié avant le repli `chargesAssistant`), pour que cet ordre ne dépende
 * pas d'une relecture attentive du composant.
 */
export function resolveF012ResumeDecision(params: ResolveF012ResumeDecisionParams): F012ResumeDecision {
  const { persisted, isLegacyComplete } = params;

  if (shouldResumeF012(persisted)) return { kind: "resume_step" };
  if (isLegacyComplete) return { kind: "legacy_complete" };
  return { kind: "start" };
}
