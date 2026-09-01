/**
 * dossier-status-shadow.ts — Phase 2 de la migration runtime → STATE-001.
 *
 * Compare, sans jamais influencer le comportement du produit, la Mission dérivée par
 * deriveStatutDossier() (dossier-status.ts) à une lecture déjà existante et indépendante :
 * resolveDeclarationProgress() (declaration-progress.ts), consommée réellement par
 * l'écran /declarations.
 *
 * Pourquoi cette comparaison précisément : STATE-001 modélise une seule phase documentaire
 * linéaire (DOCUMENTS_EN_ATTENTE → DOCUMENTS_IMPORTES → ANALYSE_DOCUMENTAIRE), alors que le
 * Dashboard (dashboard-workflow-model.ts) raisonne par Feature en parallèle (7 étapes
 * indépendantes). Une comparaison état-par-état contre le Dashboard produirait des
 * "divergences" qui ne sont que la conséquence de ce désaccord structurel, déjà documenté
 * dans le backlog d'implémentation — pas des erreurs de calcul. resolveDeclarationProgress
 * partage en revanche le même type d'entrée (PersistedWorkspace, sans reconstruction), ce
 * qui permet une comparaison sans hypothèse supplémentaire.
 *
 * La comparaison se fait à un niveau de phase (avant clôture / clôture en cours / clôturé),
 * pas état par état : DECLARATION_FLOW (16 étapes, incluant SIREN, TVA, régime social...)
 * n'a pas de correspondance fine avec les 13 états de STATE-001 — comparer plus finement
 * produirait de faux écarts, pour la même raison que ci-dessus.
 *
 * Cette comparaison est un outil de vérification, jamais un chemin d'exécution : son
 * résultat n'est jamais lu par un autre module du runtime.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QU'UNE DIVERGENCE SIGNIFIE — ET CE QU'ELLE NE SIGNIFIE PAS
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Le scénario "fiscalYear.status = closed mais currentStepId de la déclaration bloqué
 * avant paiement" (voir dossier-status-shadow.test.ts) n'est pas un défaut à corriger.
 * Il révèle deux concepts distincts, dont l'écart est normal et attendu :
 *
 *   - la COMPLÉTUDE MÉTIER DU DOSSIER (FiscalYearStatus, puis STATE-001 après
 *     raffinement) : documents traités, anomalies levées, validations résolues — l'état
 *     du travail qu'IA et Validation Engine ont accompli sur le contenu du Dossier ;
 *
 *   - la PROGRESSION DE L'UTILISATEUR DANS LE PARCOURS DE DÉCLARATION
 *     (resolveDeclarationProgress) : exhaustivité du formulaire administratif
 *     (SIREN, exploitant, régime social, TVA, paiement, signature, télétransmission)
 *     que l'utilisateur doit lui-même compléter pour produire la liasse.
 *
 * Un Dossier peut légitimement être "complet" au premier sens (rien ne reste à traiter
 * côté documents/validations) sans que l'utilisateur ait terminé le second (il n'a pas
 * encore rempli son SIREN ou son régime social). Ce n'est pas une incohérence entre
 * deux moteurs qui devraient être d'accord — c'est deux moteurs qui répondent, à raison,
 * à deux questions différentes. Ne jamais chercher à les faire converger artificiellement :
 * ni en enrichissant FiscalYearStatus des signaux de resolveDeclarationProgress, ni
 * l'inverse. Ils restent deux sources de vérité, chacune légitime sur son périmètre.
 *
 * Documenté de façon identique dans RT-002 (Runtime Adapter), section 3.4 bis.
 */

import { deriveStatutDossier, type DossierStatus } from "./dossier-status";
import { resolveDeclarationProgress } from "./declaration-progress";
import type { DeclarationStepId } from "../constants/declaration-flow";
import type { PersistedWorkspace } from "../store/persistence";

export type DossierPhase = "avant-cloture" | "cloture-en-cours" | "cloture";

export interface ShadowComparisonResult {
  derived: DossierStatus;
  declarationCurrentStepId: DeclarationStepId;
  expectedPhase: DossierPhase;
  actualPhase: DossierPhase;
  divergent: boolean;
}

const LATE_DECLARATION_STEPS: readonly DeclarationStepId[] = ["paiement", "signature", "teletransmission"];

function phaseFromDeclarationStep(id: DeclarationStepId): DossierPhase {
  if (id === "teletransmission") return "cloture";
  if (LATE_DECLARATION_STEPS.includes(id)) return "cloture-en-cours";
  return "avant-cloture";
}

function expectedPhaseFromDerived(status: DossierStatus): DossierPhase {
  switch (status) {
    case "DOSSIER_TERMINE":
      return "cloture";
    case "DECLARATION_GENEREE":
    case "CALCUL_TERMINE":
      return "cloture-en-cours";
    default:
      return "avant-cloture";
  }
}

export function compareDossierStatusShadow(persisted: PersistedWorkspace): ShadowComparisonResult {
  const derived = deriveStatutDossier(persisted);
  const declaration = resolveDeclarationProgress(persisted);
  const expectedPhase = expectedPhaseFromDerived(derived);
  const actualPhase = phaseFromDeclarationStep(declaration.currentStepId);

  return {
    derived,
    declarationCurrentStepId: declaration.currentStepId,
    expectedPhase,
    actualPhase,
    divergent: expectedPhase !== actualPhase,
  };
}

/**
 * Point d'appel unique, dev-only, sans effet sur le comportement du produit.
 * À invoquer depuis deriveWorkspace() (engine/index.ts) — jamais depuis un composant.
 */
export function logDossierStatusShadowIfDivergent(persisted: PersistedWorkspace): void {
  if (process.env.NODE_ENV === "production") return;
  const result = compareDossierStatusShadow(persisted);
  if (result.divergent) {
    console.debug("[shadow:dossier-status] divergence STATE-001 ↔ declaration-progress", result);
  }
}
