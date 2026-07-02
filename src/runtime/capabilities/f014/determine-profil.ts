import type { AmortissementProfil, PlanAmortissement } from "./types";

/**
 * Diagnostic de profil F-014 (PROF-001 / PROF-002 / PROF-003).
 */
export function determineAmortissementProfil(plan: PlanAmortissement): AmortissementProfil {
  if (plan.premiere_annee) return "PROF-001";
  if (plan.plan_valide_precedemment && plan.nouveaux_elements.length === 0) return "PROF-002";
  if (plan.plan_valide_precedemment && plan.nouveaux_elements.length > 0) return "PROF-003";
  return "PROF-001";
}
