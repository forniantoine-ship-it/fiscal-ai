/**
 * Lot 1 — contrat commun `FiscalYearOpening`.
 *
 * INTERNAL CLOSURE → adaptateur pur → FiscalYearOpening
 * EXTERNAL TAKEOVER → (futur) → FiscalYearOpening
 *
 * Aucun branchement production dans ce lot. G10 inchangé :
 * `amortissementsReportes` = STOCK fiscal historique uniquement
 * (jamais case 318 / mouvement annuel).
 */

import type { RanSituation } from "@/runtime/capabilities/bilan/types";
import type { TypePret } from "@/runtime/capabilities/f011/types";
import type { DossierIdentity, FinancementBase, ImmobilisationComptableActif } from "@/lib/lmnp/types/dossier";
import type { OpeningFact } from "./opening-fact";

/** Déficit catégoriel reportable — millésime conservé (F-006 / FiscalEngineOutput). */
export type OpeningDeficitRow = {
  millesime: number;
  montant: number;
};

/**
 * Stocks fiscaux de report — exclusivement le stock historique.
 * Ne transporte jamais : case 318, mouvement annuel, cumul comptable, VNC.
 */
export type FiscalCarryforwardStocks = {
  deficits: OpeningFact<OpeningDeficitRow[]>;
  amortissementsReportes: OpeningFact<number>;
};

export type OpeningEvidence = {
  /** Chemin stable (jamais un index de tableau pour actifs/prêts). */
  fieldPath: string;
  sourceKind: "closure" | "archived_workspace" | "derived" | "external";
  /** Identifiant de la source (closureId, pretId, assetId, …). */
  sourceRef?: string;
  note?: string;
};

export type OpeningFieldProvenance = Record<string, OpeningEvidence>;

export type OpeningSourceInternal = {
  kind: "internal_closure";
  previousFiscalYearId: string;
  sourceClosureId: string;
};

export type OpeningSourceExternal = {
  kind: "external_takeover";
  takeoverId: string;
  sourceFiscalYear: number;
};

export type OpeningSource = OpeningSourceInternal | OpeningSourceExternal;

export type OpeningProrataConvention = "jours_reels" | "mensuel" | "annuel_plein";

export type OpeningAssetPlan =
  | {
      kind: "amortizable";
      startDate: string;
      durationYears: number;
      prorataConvention: OpeningProrataConvention;
    }
  | {
      kind: "non_amortizable";
    };

export type OpeningAssetOrigin = ImmobilisationComptableActif["provenance"] | ImmobilisationComptableActif["origin"];

export type OpeningAsset = {
  id: string;
  propertyId?: string;
  label: string;
  categorie: ImmobilisationComptableActif["categorie"];
  origin?: OpeningAssetOrigin;
  coutBrut: OpeningFact<number>;
  cumulOuverture: OpeningFact<number>;
  plan: OpeningFact<OpeningAssetPlan>;
  dateAcquisition?: string;
  /** Contrôle optionnel — ne remplace pas brut − cumul. */
  vncAttestee?: number;
};

export type OpeningLoanTerms = Pick<
  FinancementBase,
  | "typePret"
  | "capitalInitial"
  | "tauxNominal"
  | "dureeMois"
  | "datePremiereMensualite"
  | "assuranceAnnuelle"
  | "assuranceType"
  | "typeGarantie"
  | "fraisDossier"
  | "garantieDeductible"
  | "iraDeductible"
  | "anneeSouscription"
> & {
  typePret: TypePret;
};

export type OpeningLoanScheduleRow = {
  date: string;
  principal: number;
  interest: number;
  insurance: number;
};

export type OpeningLoan = {
  pretId: string;
  propertyId?: string;
  terms: OpeningFact<OpeningLoanTerms>;
  /** Soit paramètres (terms), soit échéancier — Lot 1 transporte, ne calcule pas. */
  schedule: OpeningFact<OpeningLoanScheduleRow[]>;
  assuranceAnnuelle: OpeningFact<number | undefined>;
  /** CRD d'ouverture — contrôle uniquement lorsqu'il est disponible. */
  crdOuverture: OpeningFact<number>;
};

export type OpeningPropertyPrefill = {
  propertyId: string;
  label?: string;
  address?: string;
  city?: string;
  postalCode?: string;
  propertyType?: string;
  acquisitionDate?: string;
  dateMiseEnService?: string;
};

export type OpeningPatrimoine = {
  ouvertureCompteExploitant: OpeningFact<number>;
  ran: OpeningFact<{ situation: RanSituation; valeur?: number }>;
  /** Trésorerie d'ouverture seulement si prouvée — sinon UNAVAILABLE. */
  tresorerieOuverture: OpeningFact<number>;
};

export type OpeningValidationPending = {
  status: "pending";
};

export type OpeningValidationValidated = {
  status: "validated";
  openingRevision: number;
  contentHash: string;
  validatedAt: string;
  validator: string;
};

export type OpeningValidation = OpeningValidationPending | OpeningValidationValidated;

export type OpeningDurableIdentity = Pick<
  DossierIdentity,
  | "siren"
  | "siret"
  | "exploitantFirstName"
  | "exploitantLastName"
  | "establishmentAddress"
  | "establishmentCity"
  | "establishmentPostalCode"
  | "activityStartDate"
> & {
  dateMiseEnService?: string;
};

export type FiscalYearOpening = {
  openingId: string;
  revision: number;
  /** Exercice cible (N+1 pour une reprise interne depuis N). */
  targetFiscalYear: number;
  dossierId: string;
  source: OpeningSource;
  stocks: FiscalCarryforwardStocks;
  assets: OpeningFact<OpeningAsset[]>;
  loans: OpeningFact<OpeningLoan[]>;
  patrimoine: OpeningPatrimoine;
  properties: OpeningFact<OpeningPropertyPrefill[]>;
  identity: OpeningFact<OpeningDurableIdentity>;
  provenance: OpeningFieldProvenance;
  validation: OpeningValidation;
};

export type OpeningIssueSeverity = "error" | "warning";

export type OpeningIssue = {
  code: string;
  message: string;
  severity: OpeningIssueSeverity;
  /** Chemin stable — IDs pour actifs/prêts, jamais un index. */
  fieldPath?: string;
};

export type AdaptInternalOpeningResult = {
  opening: FiscalYearOpening | undefined;
  issues: OpeningIssue[];
};
