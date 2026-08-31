export type { RuntimeContext } from "./contracts/RuntimeContext";
export type { FieldSource } from "./contracts/FieldSource";
export type { Anomaly, AnomalySeverity } from "./contracts/Anomaly";

// F-009 — transforms
export type { ValidateSiretInput, ValidateSiretOutput } from "./capabilities/f009/validate-siret";
export { validateSiret } from "./capabilities/f009/validate-siret";
export type {
  ValidateActiviteDatesInput,
  ValidateActiviteDatesOutput,
} from "./capabilities/f009/validate-activite-dates";
export { validateActiviteDates } from "./capabilities/f009/validate-activite-dates";
export type {
  ExplainMiseEnServiceInput,
  ExplainMiseEnServiceOutput,
} from "./capabilities/f009/explain-mise-en-service";
export { explainMiseEnService } from "./capabilities/f009/explain-mise-en-service";

export {
  F009ActiviteAssistant,
  createInitialF009State,
  type F009Action,
  type F009AssistantTurn,
  type F009FieldSource,
  type F009Message,
  type F009Orientation,
  type F009State,
  type F009Step,
  type F009Suggestion,
} from "./assistants/f009-activite/assistant";

// F-010 — domain types
export type {
  AmortissementPlan,
  ComposantAmorti,
  ComposantGrille,
  PlanLigne,
  TypeBien,
} from "./capabilities/f010/types";

// F-010 — transforms (fonctions pures)
export type {
  ComputePrixRevientInput,
  ComputePrixRevientOutput,
} from "./capabilities/f010/compute-prix-revient";
export { computePrixRevient } from "./capabilities/f010/compute-prix-revient";
export type {
  VentilationTerrainBatiInput,
  VentilationTerrainBatiOutput,
} from "./capabilities/f010/ventilation-terrain-bati";
export { ventilationTerrainBati } from "./capabilities/f010/ventilation-terrain-bati";
export type { DecomposeBatiInput, DecomposeBatiOutput } from "./capabilities/f010/decompose-bati";
export { decomposeBati } from "./capabilities/f010/decompose-bati";
export type {
  AmortizeMobilierInput,
  AmortizeMobilierOutput,
} from "./capabilities/f010/amortize-mobilier";
export { amortizeMobilier } from "./capabilities/f010/amortize-mobilier";
export type {
  ProrataPremiereAnneeInput,
  ProrataPremiereAnneeOutput,
} from "./capabilities/f010/prorata-premiere-annee";
export { prorataPremiereAnnee } from "./capabilities/f010/prorata-premiere-annee";
export type { AssemblePlanInput, AssemblePlanOutput } from "./capabilities/f010/assemble-plan";
export { assemblePlan } from "./capabilities/f010/assemble-plan";
export type { ValidatePlanInput, ValidatePlanOutput } from "./capabilities/f010/validate-plan";
export { validatePlan } from "./capabilities/f010/validate-plan";
export type { SuggestFraisInput, SuggestFraisOutput } from "./capabilities/f010/suggest-frais";
export { suggestFrais } from "./capabilities/f010/suggest-frais";
export type {
  SuggestRatioTerrainInput,
  SuggestRatioTerrainOutput,
  ValidateRatioTerrainInput,
  ValidateRatioTerrainOutput,
} from "./capabilities/f010/ratio-terrain";
export { suggestRatioTerrain, validateRatioTerrain } from "./capabilities/f010/ratio-terrain";
export type {
  EstimateMobilierInput,
  EstimateMobilierOutput,
} from "./capabilities/f010/estimate-mobilier";
export { estimateMobilier } from "./capabilities/f010/estimate-mobilier";
export type {
  ComputeAmortizationPlanInput,
  ComputeAmortizationPlanOutput,
} from "./capabilities/f010/compute-amortization-plan";
export { computeAmortizationPlan } from "./capabilities/f010/compute-amortization-plan";
export type { Localisation } from "./capabilities/f010/bareme-terrain";

// F-010 — présentation
export type { ExplainPlanInput, ExplainPlanOutput } from "./presentation/explain-plan";
export { explainPlan } from "./presentation/explain-plan";

export {
  F010LogementAssistant,
  createInitialF010State,
  type F010Action,
  type F010AcquisitionSource,
  type F010AssistantTurn,
  type F010Deps,
  type F010Message,
  type F010Nature,
  type F010Result,
  type F010State,
  type F010Step,
  type F010Suggestion,
} from "./assistants/f010-logement/assistant";

// F-011 — domain types
export type {
  ChargesFinancementExercice,
  EcheanceMensuelle,
  PeriodePreExploitation,
  PretFinancementExercice,
  TypePret,
} from "./capabilities/f011/types";

// F-011 — transforms (fonctions pures)
export type {
  ComputeFinancementExerciceInput,
  ComputeFinancementExerciceOutput,
  PretInput,
} from "./capabilities/f011/compute-financement-exercice";
export { computeFinancementExercice } from "./capabilities/f011/compute-financement-exercice";
export type {
  GenerateLoanScheduleInput,
  GenerateLoanScheduleOutput,
} from "./capabilities/f011/generate-loan-schedule";
export { generateLoanSchedule } from "./capabilities/f011/generate-loan-schedule";
export type {
  ExtractInterestsExerciceInput,
  ExtractInterestsExerciceOutput,
} from "./capabilities/f011/extract-interests-exercice";
export { extractInterestsExercice } from "./capabilities/f011/extract-interests-exercice";
export type {
  ComputePreExploitationPeriodInput,
  ComputePreExploitationPeriodOutput,
} from "./capabilities/f011/compute-pre-exploitation-period";
export { computePreExploitationPeriod } from "./capabilities/f011/compute-pre-exploitation-period";
export type {
  IsolatePreExploitationInterestsInput,
  IsolatePreExploitationInterestsOutput,
} from "./capabilities/f011/isolate-pre-exploitation-interests";
export { isolatePreExploitationInterests } from "./capabilities/f011/isolate-pre-exploitation-interests";
export type {
  ComputeInFineInterestsInput,
  ComputeInFineInterestsOutput,
} from "./capabilities/f011/compute-in-fine-interests";
export { computeInFineInterests } from "./capabilities/f011/compute-in-fine-interests";
export type {
  ValidateFinancementInput,
  ValidateFinancementOutput,
} from "./capabilities/f011/validate-financement";
export { validateFinancement } from "./capabilities/f011/validate-financement";

// F-011 — présentation
export type {
  ExplainFinancementInput,
  ExplainFinancementOutput,
} from "./presentation/explain-financement";
export { explainFinancement } from "./presentation/explain-financement";

export {
  F011FinancementAssistant,
  createInitialF011State,
  type F011Action,
  type F011AssistantTurn,
  type F011Deps,
  type F011LoanDraft,
  type F011Message,
  type F011Result,
  type F011State,
  type F011Step,
  type F011Suggestion,
} from "./assistants/f011-financement/assistant";

// F-012 — domain types
export type {
  ChargeCategorie,
  ChargeDeductibilite,
  ChargesExerciceResult,
  ComposantNouveau,
  CoproLigneType,
  F012CategoryId,
  LigneCharge,
  NatureIntervention,
  ProfilCharges,
} from "./capabilities/f012/types";

// F-012 — transforms (fonctions pures)
export type {
  ComputeChargesExerciceInput,
  ComputeChargesExerciceOutput,
  TravauxInput,
} from "./capabilities/f012/compute-charges-exercice";
export { computeChargesExercice, buildCategoryInventory } from "./capabilities/f012/compute-charges-exercice";
export type {
  ComputeCoproDeductibleInput,
  ComputeCoproDeductibleOutput,
  CoproLigneInput,
} from "./capabilities/f012/compute-copro-deductible";
export { computeCoproDeductible } from "./capabilities/f012/compute-copro-deductible";
export type {
  ComputeTaxeFonciereDeductibleInput,
  ComputeTaxeFonciereDeductibleOutput,
} from "./capabilities/f012/compute-taxe-fonciere-deductible";
export { computeTaxeFonciereDeductible } from "./capabilities/f012/compute-taxe-fonciere-deductible";
export type {
  IsolatePreExploitationChargeInput,
  IsolatePreExploitationChargeOutput,
} from "./capabilities/f012/isolate-pre-exploitation-charge";
export { isolatePreExploitationCharge } from "./capabilities/f012/isolate-pre-exploitation-charge";
export type {
  QualifyTravailInput,
  QualifyTravailOutput,
  TravauxQualificationChoix,
} from "./capabilities/f012/qualify-travail";
export { qualifyTravail, splitMixteTravaux, mapChoixToNature } from "./capabilities/f012/qualify-travail";
export type {
  CreateComposantTravauxInput,
  CreateComposantTravauxOutput,
} from "./capabilities/f012/create-composant-travaux";
export { createComposantTravaux } from "./capabilities/f012/create-composant-travaux";
export type {
  ValidateChargesInput,
  ValidateChargesOutput,
} from "./capabilities/f012/validate-charges";
export { validateCharges } from "./capabilities/f012/validate-charges";

// F-012 — présentation
export type { ExplainChargesInput, ExplainChargesOutput } from "./presentation/explain-charges";
export { explainCharges } from "./presentation/explain-charges";

export {
  F012ChargesAssistant,
  createInitialF012State,
  type F012Action,
  type F012AssistantTurn,
  type F012Deps,
  type F012Message,
  type F012Result,
  type F012State,
  type F012Step,
  type F012Suggestion,
} from "./assistants/f012-charges/assistant";

// F-013 — domain types
export type {
  ContinuiteBail,
  EcartNature,
  EcartNiveau,
  LigneRecette,
  ModeCharges,
  PeriodeLocation,
  RecetteSource,
  RecettesExerciceResult,
  RevenuTheorique,
  TypeLocation,
  VacancePeriode,
} from "./capabilities/f013/types";

// F-013 — transforms (fonctions pures)
export type {
  ApplyDecalageJanDecInput,
  ApplyDecalageJanDecOutput,
} from "./capabilities/f013/apply-decalage-jan-dec";
export { applyDecalageJanDec } from "./capabilities/f013/apply-decalage-jan-dec";
export type {
  ComputeMoisLocationInput,
  ComputeMoisLocationOutput,
} from "./capabilities/f013/compute-mois-location";
export { computeMoisLocation } from "./capabilities/f013/compute-mois-location";
export type {
  ComputeRevenuTheoriqueInput,
  ComputeRevenuTheoriqueOutput,
} from "./capabilities/f013/compute-revenu-theorique";
export { computeRevenuTheorique } from "./capabilities/f013/compute-revenu-theorique";
export type {
  ReconcileRevenusInput,
  ReconcileRevenusOutput,
} from "./capabilities/f013/reconcile-revenus";
export { reconcileRevenus } from "./capabilities/f013/reconcile-revenus";
export type {
  ValidateRevenusInput,
  ValidateRevenusOutput,
} from "./capabilities/f013/validate-revenus";
export { validateRevenus } from "./capabilities/f013/validate-revenus";
export type {
  ComputeRecettesExerciceInput,
  ComputeRecettesExerciceOutput,
} from "./capabilities/f013/compute-recettes-exercice";
export { computeRecettesExercice } from "./capabilities/f013/compute-recettes-exercice";

// F-013 — présentation
export type { ExplainRevenusInput, ExplainRevenusOutput } from "./presentation/explain-revenus";
export {
  explainRevenus,
  EXP_F013_DEPOT_GARANTIE,
  EXP_F013_IMPAYE,
  EXP_F013_PLATEFORME_NET,
  EXP_F013_VACANCE_LONGUE,
} from "./presentation/explain-revenus";

export {
  F013RevenusAssistant,
  createInitialF013State,
  type F013Action,
  type F013AssistantTurn,
  type F013Deps,
  type F013Message,
  type F013Result,
  type F013State,
  type F013Step,
  type F013Suggestion,
} from "./assistants/f013-revenus/assistant";

// F-014 — domain types
export type {
  AmortissementProfil,
  ComposantAmortissement,
  LignePlan,
  PlanAmortissement,
  ValidationAmortissements,
} from "./capabilities/f014/types";

// F-014 — transforms (fonctions pures)
export type {
  ComposePlanAmortissementInput,
  ComposePlanAmortissementOutput,
} from "./capabilities/f014/compose-plan-amortissement";
export { composePlanAmortissement } from "./capabilities/f014/compose-plan-amortissement";
export { determineAmortissementProfil } from "./capabilities/f014/determine-profil";
export type {
  ValidateAmortissementsInput,
  ValidateAmortissementsOutput,
} from "./capabilities/f014/validate-amortissements";
export { validateAmortissements } from "./capabilities/f014/validate-amortissements";
export { toNomCourant } from "./capabilities/f014/nom-courant";
export type { FiscalResultJournalEntry } from "./capabilities/f014/plan-consistency";
export {
  hasAmortissementDrifted,
  fiscalResultMatchesAmortissementTotal,
} from "./capabilities/f014/plan-consistency";

// F-014 — présentation
export type {
  ExplainAmortissementsInput,
  ExplainAmortissementsOutput,
} from "./presentation/explain-amortissements";
export {
  explainAmortissements,
  explainComposantDetail,
  EXP_F014_PLAN_PLURIANNUEL,
  EXP_F014_TERRAIN_BATI,
  expF014DureeComposant,
  expF014ImpactFiscal,
  expF014Prorata,
  expF014UsageFiscal,
} from "./presentation/explain-amortissements";

export {
  F014AmortissementsAssistant,
  createInitialF014State,
  type F014Action,
  type F014AssistantTurn,
  type F014Deps,
  type F014Message,
  type F014Result,
  type F014State,
  type F014Step,
  type F014Suggestion,
} from "./assistants/f014-amortissements/assistant";

// F-006 — domain types
export type {
  FiscalEngineInputs,
  FiscalResult,
  FiscalJournalEntry,
  StockDeficit,
  ComputeFiscalResultOutput,
  ValidateFiscalInputsOutput,
} from "./capabilities/f006/types";
export { validateFiscalInputs } from "./capabilities/f006/validate-fiscal-inputs";
export { aggregateFiscalInputs } from "./capabilities/f006/aggregate-inputs";
export { computeResultatAvantAmort } from "./capabilities/f006/compute-resultat-avant-amort";
export { applyAmortissementStocks } from "./capabilities/f006/apply-amortissement-stocks";

// F-006 — présentation
export type {
  ExplainFiscalResultInput,
  ExplainFiscalResultOutput,
} from "./presentation/explain-fiscal-result";
export { explainFiscalResult } from "./presentation/explain-fiscal-result";

export {
  F006FiscalEngineAssistant,
  createInitialF006State,
  type F006Action,
  type F006AssistantTurn,
  type F006Deps,
  type F006Message,
  type F006Result,
  type F006State,
  type F006Step,
  type F006Suggestion,
} from "./assistants/f006-fiscal-engine/assistant";

// F-007 — domain types
export type {
  CerfaCase,
  CaseTrace,
  Form2031SD,
  IdentiteDeclarante,
  LiasseEngineInputs,
  LiasseRepresentation,
  ProduceLiasseOutput,
  ValidateLiasseInputsOutput,
  LIASSE_LMNP_REEL_SIMPLIFIE_ATTENDUE,
} from "./capabilities/f007/types";

// F-007 — transforms (fonctions pures)
export { validateLiasseInputs } from "./capabilities/f007/validate-liasse-inputs";
export { map2031IdentiteCases } from "./capabilities/f007/map-2031-identite";
export { map2031RecapitulationCases } from "./capabilities/f007/map-2031-recapitulation";
export { map2031RegimeCases } from "./capabilities/f007/map-2031-regime";
export { assembleForm2031SD } from "./capabilities/f007/assemble-form-2031";
export { produceLiasse } from "./capabilities/f007/produce-liasse";

// F-007 — présentation
export type { ExplainLiasseInput, ExplainLiasseOutput } from "./presentation/explain-liasse";
export { explainLiasse } from "./presentation/explain-liasse";

export {
  F007LiasseEngineAssistant,
  createInitialF007State,
  type F007Action,
  type F007AssistantTurn,
  type F007Deps,
  type F007Message,
  type F007Result,
  type F007State,
  type F007Step,
  type F007Suggestion,
} from "./assistants/f007-liasse-engine/assistant";
