/**
 * F013 v2 — contrat du rapprochement annuel des loyers ordinaires, par bien (`propertyId`) et exercice.
 *
 * Module SANS dépendance (types + gardes purs). Il est construit À CÔTÉ de F013 v1 : il n'est lu ni écrit par
 * `DeclarationDraft`, le snapshot, l'assistant ou le panel. Aucune persistance n'est définie ici (workspace schema v3
 * différé) : le contrat est une valeur de calcul, pas encore une seconde source de vérité dans le draft.
 *
 * Règles portées (prémisses validées FISCAL-PROOF-F013-39C / F013-DESIGN-1) :
 * - montants en centimes entiers ;
 * - `UNKNOWN` n'est jamais un zéro : `VALIDATED(0)` et `UNKNOWN` sont structurellement distincts ;
 * - un montant validé n'implique pas une couverture complète.
 */

/** Versionnement : l'ancien contrat « encaissements = recettes » et le nouveau ne sont jamais interchangeables. */
export const F013_LEGACY_CONTRACT_VERSION = "legacy_cash_v1" as const;
export const F013_V2_CONTRACT_VERSION = "f013_v2" as const;
export type F013ContractVersion = typeof F013_LEGACY_CONTRACT_VERSION | typeof F013_V2_CONTRACT_VERSION;

/** Version de la formule/contrôles : change quand le calcul change, indépendamment du contrat. */
export const F013_V2_CALCULATION_VERSION = "f013_v2.rent_reconciliation.1" as const;

/** Provenance structurée (extensible : déclaration, extraction, calcul, continuité N−1→N). */
export type FactProvenance =
  | { kind: "user_declaration"; ref?: string }
  | { kind: "extraction"; ref?: string }
  | { kind: "computation"; ref?: string }
  | { kind: "prior_year_continuity"; fromFiscalYear: number; ref?: string };

/** Fait chiffré, en centimes entiers. `UNKNOWN` ne porte AUCUN montant. */
export type MoneyFact =
  | { status: "UNKNOWN" }
  | { status: "PROPOSED"; amountCents: number; provenance?: FactProvenance }
  | { status: "VALIDATED"; amountCents: number; provenance?: FactProvenance };

/** Couverture des encaissements fournis, pour le bien et l'exercice. */
export type CollectionsCoverage =
  | { completeness: "UNKNOWN" }
  | {
      completeness: "COMPLETE" | "PARTIAL";
      validation: "PROPOSED" | "VALIDATED";
      provenance?: FactProvenance;
    };

export type RentTermKey =
  | "collectionsCents"
  | "openingReceivablesCents"
  | "closingReceivablesCents"
  | "openingAdvancesCents"
  | "closingAdvancesCents";

/**
 * Domaines hors périmètre automatique initial, déclarés explicitement par l'amont. Leur présence rend le moteur
 * `OUT_OF_DOMAIN` : une règle fiscale distincte serait nécessaire.
 */
export type OutOfDomainTreatment =
  | "doubtful_receivable_provision"
  | "definitive_loss"
  | "gli"
  | "dispute"
  | "complex_cancellation"
  // V2.2 — sommes qui ne sont pas des loyers ordinaires et ne doivent jamais être déclarées silencieusement comme tels.
  | "security_deposit"
  | "insurance_indemnity"
  | "refund";

/** Rattachement futur (observations, périodes, preuves) — identifiants opaques, non exploités par le moteur v2.1. */
export interface RentReconciliationLinks {
  observationIds?: readonly string[];
  periodIds?: readonly string[];
  evidenceIds?: readonly string[];
}

export interface RentReconciliationV2 {
  contractVersion: typeof F013_V2_CONTRACT_VERSION;
  propertyId: string;
  fiscalYear: number;
  /** Révision monotone de ce rapprochement (fraîcheur) ; entier ≥ 0. */
  revision: number;

  /** Montant locatif reçu pendant N (règlements d'anciennes créances et avances inclus ; dépôt de garantie exclu). */
  collections: MoneyFact;
  collectionsCoverage: CollectionsCoverage;

  openingReceivables: MoneyFact;
  closingReceivables: MoneyFact;
  openingAdvances: MoneyFact;
  closingAdvances: MoneyFact;

  /**
   * V2.2 — l'utilisateur a explicitement passé en revue les sommes nécessitant une qualification distincte.
   * `false` (défaut d'un rapprochement vierge) = non passé en revue : jamais assimilé à « aucune exception ».
   */
  exceptionsReviewed: boolean;
  outOfDomain?: readonly OutOfDomainTreatment[];
  links?: RentReconciliationLinks;
}

/** Garde de version : tout objet sans `contractVersion: "f013_v2"` explicite n'est PAS un rapprochement v2. */
export function classifyF013Contract(value: unknown): F013ContractVersion | "unknown" {
  if (typeof value !== "object" || value === null) return "unknown";
  const record = value as Record<string, unknown>;
  if (record.contractVersion === F013_V2_CONTRACT_VERSION) return F013_V2_CONTRACT_VERSION;
  // `RevenusAssistantOutput` (v1) ne porte aucune version : sa forme « encaissements » est legacy_cash_v1.
  if (
    record.contractVersion === F013_LEGACY_CONTRACT_VERSION ||
    "totalRecettes" in record ||
    "loyersEncaisses" in record
  ) {
    return F013_LEGACY_CONTRACT_VERSION;
  }
  return "unknown";
}
