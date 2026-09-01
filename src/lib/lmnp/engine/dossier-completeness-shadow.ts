/**
 * dossier-completeness-shadow.ts — Phase 4.2 (requalifiée) de la migration STATE-001.
 *
 * Ne remplace PAS businessStepsComplete(). Mesure uniquement, en parallèle et sans effet
 * sur le comportement du produit, si cette notion converge avec DOSSIER_COMPLET (STATE-001).
 *
 * Ces deux notions sont volontairement traitées comme deux responsabilités distinctes,
 * ni fusionnées ni hiérarchisées, tant que l'observation n'a pas démontré qu'une fusion
 * est légitime :
 *
 *   - businessStepsComplete() (workflow-progression.ts) : l'utilisateur a-t-il confirmé
 *     chaque étape guidée (Activité, Logement, Crédit, Revenus, Charges, Amortissement) ?
 *
 *   - DOSSIER_COMPLET (deriveStatutDossier, via fiscalYear.status === "ready_to_close")
 *     : dossierDone (journey.ts) est vrai — documents requis fournis et analysés, aucune
 *     alerte bloquante, aucune validation en attente, régime confirmé.
 *
 * Un dossier peut satisfaire l'une sans l'autre — notamment via les chemins de saisie
 * manuelle proposés par certains Assistants (ex. F010LogementAssistant, option "Non, je
 * saisirai les montants"), qui peuvent valider une étape sans que le document requis
 * correspondant ait été fourni et analysé.
 *
 * La comparaison est stricte (derived === "DOSSIER_COMPLET"), telle que demandée. Une
 * fois DOSSIER_COMPLET dépassé (calcul, déclaration, clôture), la stricte égalité devient
 * fausse alors que businessStepsComplete reste vrai — ce n'est pas un désaccord réel, seulement
 * la conséquence d'une progression normale au-delà du palier comparé. Le champ
 * `derivedStatus` du résultat permet de distinguer ce cas d'une divergence au même stade.
 */

import { deriveStatutDossier } from "./dossier-status";
import { businessStepsComplete } from "@/components/lmnp/dashboard/workflow-progression";
import type { DashboardWorkspace } from "@/components/lmnp/dashboard/dashboard-workflow-model";

export interface CompletenessComparisonResult {
  businessStepsComplete: boolean;
  derivedStatus: ReturnType<typeof deriveStatutDossier>;
  derivedIsDossierComplet: boolean;
  /** Vrai si derived a dépassé DOSSIER_COMPLET (calcul/déclaration/clôture) — non-égalité attendue, pas une divergence. */
  derivedPastDossierComplet: boolean;
  /** Divergence réelle : les deux notions ne s'accordent pas au même stade du Dossier. */
  divergent: boolean;
}

const STATES_PAST_DOSSIER_COMPLET = ["CALCUL_EN_COURS", "CALCUL_TERMINE", "DECLARATION_GENEREE", "DOSSIER_TERMINE"];

export function compareDossierCompletenessShadow(
  workspace: DashboardWorkspace,
): CompletenessComparisonResult {
  const bsc = businessStepsComplete(workspace);
  const derivedStatus = deriveStatutDossier(workspace);
  const derivedIsDossierComplet = derivedStatus === "DOSSIER_COMPLET";
  const derivedPastDossierComplet = STATES_PAST_DOSSIER_COMPLET.includes(derivedStatus);

  // Divergence réelle uniquement si les deux ne s'accordent pas alors qu'ils décrivent
  // le même stade (avant ou au niveau de DOSSIER_COMPLET) — pas après.
  const divergent = !derivedPastDossierComplet && bsc !== derivedIsDossierComplet;

  return {
    businessStepsComplete: bsc,
    derivedStatus,
    derivedIsDossierComplet,
    derivedPastDossierComplet,
    divergent,
  };
}

export function logDossierCompletenessShadowIfDivergent(workspace: DashboardWorkspace): void {
  if (process.env.NODE_ENV === "production") return;
  const result = compareDossierCompletenessShadow(workspace);
  if (result.divergent) {
    console.debug(
      "[shadow:dossier-completeness] businessStepsComplete ↔ DOSSIER_COMPLET divergent",
      result,
    );
  }
}
