/**
 * dossier-status.ts — Dérivation de STATE-001 (Cycle de vie du Dossier)
 *
 * Phase 1 de la migration runtime → STATE-001 (Knowledge System, 02 - Domaine/États/STATE-001).
 *
 * RELATION DE RAFFINEMENT — logique unique de dérivation des états fonctionnels :
 *
 *   resolveFiscalYearStatus() (workspace-progress.ts) reste l'unique propriétaire de la
 *   lecture des documents, des validationItems et de canClose. Elle produit FiscalYearStatus
 *   (6 valeurs), déjà maintenu à jour par le reducer via touchFiscalYear().
 *
 *   deriveStatutDossier() ne relit JAMAIS les documents ni les validationItems. Elle
 *   consomme uniquement `fiscalYear.status` (déjà résolu ailleurs) et l'affine vers les
 *   13 états de STATE-001, à l'aide des seuls signaux que FiscalYearStatus ne distingue pas :
 *     - les timestamps de confirmation par Feature (regimeConfirmedAt, inpiConfirmedAt,
 *       logementConfirmedAt), pour subdiviser "draft" ;
 *     - les timestamps de clôture (declarationGeneratedAt, transmittedAt), pour subdiviser
 *       "closed".
 *
 *   Toute correction du comportement de fond (quand un document est "analysé", quand une
 *   validation est "en attente", quand le dossier "peut être clos"...) se fait dans
 *   resolveFiscalYearStatus, jamais ici. Il n'existe qu'une seule logique de dérivation
 *   des états fonctionnels du Dossier — celle-ci ne fait que la raffiner.
 *
 * Correspondance documentée aussi côté Knowledge System dans RT-002 (Runtime Adapter),
 * section "FiscalYearStatus → STATE-001".
 *
 * Deux états de STATE-001 ne sont jamais produits par cette dérivation aujourd'hui —
 * approximations runtime assumées, pas des règles métier définitives :
 *
 *   - BIEN_COMPLETE : transitoire. FiscalYearStatus reste "draft" tant qu'aucun document
 *     n'est arrivé ; dès que logementConfirmedAt est renseigné, l'état dérivé passe
 *     directement à DOCUMENTS_EN_ATTENTE, sans repos observable sur BIEN_COMPLETE.
 *
 *   - CALCUL_EN_COURS : non observable. Le calcul fiscal est une fonction pure synchrone,
 *     sans état intermédiaire persisté. Si le calcul devient asynchrone un jour, ce cas
 *     redeviendra observable sans changer la structure de cette fonction — ajouter un
 *     signal (ex. `fiscalYear.calculatingAt`) et un branchement dans le cas "ready_to_close".
 */

import type { PersistedWorkspace } from "../store/persistence";

export type DossierStatus =
  | "DOSSIER_CREE"
  | "INFORMATIONS_GENERALES"
  | "BIEN_EN_COURS"
  | "BIEN_COMPLETE"
  | "DOCUMENTS_EN_ATTENTE"
  | "DOCUMENTS_IMPORTES"
  | "ANALYSE_DOCUMENTAIRE"
  | "INFORMATIONS_MANQUANTES"
  | "DOSSIER_COMPLET"
  | "CALCUL_EN_COURS"
  | "CALCUL_TERMINE"
  | "DECLARATION_GENEREE"
  | "DOSSIER_TERMINE";

export function deriveStatutDossier(workspace: PersistedWorkspace): DossierStatus {
  const { fiscalYear, declarationDraft } = workspace;

  switch (fiscalYear.status) {
    case "draft":
      if (!fiscalYear.regimeConfirmedAt) return "DOSSIER_CREE";
      if (!declarationDraft?.inpiConfirmedAt) return "INFORMATIONS_GENERALES";
      if (!declarationDraft?.logementConfirmedAt) return "BIEN_EN_COURS";
      // logementConfirmedAt renseigné mais FiscalYearStatus toujours "draft" ⇒
      // aucun document n'est encore arrivé (cf. resolveFiscalYearStatus).
      return "DOCUMENTS_EN_ATTENTE";

    case "collecting_documents":
      // FiscalYearStatus ne renvoie cette valeur que si des documents existent et
      // qu'aucun n'est "processing" ni "analyzed" — c'est exactement DOCUMENTS_IMPORTES.
      return "DOCUMENTS_IMPORTES";

    case "analyzing":
      return "ANALYSE_DOCUMENTAIRE";

    case "pending_validation":
      return "INFORMATIONS_MANQUANTES";

    case "ready_to_close":
      return "DOSSIER_COMPLET";

    case "closed":
      if (fiscalYear.transmittedAt) return "DOSSIER_TERMINE";
      if (fiscalYear.declarationGeneratedAt) return "DECLARATION_GENEREE";
      return "CALCUL_TERMINE";
  }
}
