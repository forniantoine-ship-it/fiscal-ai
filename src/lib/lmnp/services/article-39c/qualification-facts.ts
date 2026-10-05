/**
 * INT-1 — faits de qualification article 39 C et qualifications PURES qui en découlent.
 *
 * Aucune classification par mot-clé ni par libellé : chaque qualification part d'un FAIT STRUCTURÉ (`cfeBaseKind`,
 * nature d'un frais bancaire, traitement d'un frais d'acquisition…) fourni par l'amont (document ou déclaration), daté et
 * rattaché à l'empreinte de la source. Si le montant, l'exercice, la source ou la nature changent, l'empreinte diverge et
 * la qualification devient `STALE` : jamais conservée comme `VALIDATED`. Absence de fait = `UNKNOWN`.
 *
 * Ces fonctions ne décident ni de B ni d'ACTIVITY lorsque la doctrine ne l'a pas fait (CFE sur valeur locative,
 * base inconnue) : elles renvoient `NEEDS_QUALIFICATION` et laissent la matérialité au moteur exact.
 */
import type { Article39cResolvedClass } from "@/runtime/capabilities/f006/article-39c-capacity";
import {
  article39cSourceFingerprint,
  contributionId,
  NEEDS_QUALIFICATION_DEFAULT_PLAUSIBLE,
  type Article39cContribution,
  type Article39cScope,
} from "./contribution";

export type FactProvenanceKind = "document" | "declaration";

// ---------------------------------------------------------------------------
// CFE (SAV-031, décision PO 2026-10-05)
// ---------------------------------------------------------------------------

export type CfeBaseKind = "MINIMUM" | "RENTAL_VALUE" | "UNKNOWN";

export type CfeNotice = {
  /** Identifiant de l'avis de CFE (document). */
  sourceId: string;
  fiscalYear: number;
  amountCents: number;
  /** Présent seulement si l'avis est rattaché à un bien ; sinon niveau activité (aucun `propertyId` fictif). */
  propertyId?: string;
};

export type CfeQualificationFact = {
  sourceId: string;
  fiscalYear: number;
  cfeBaseKind: CfeBaseKind;
  provenance: FactProvenanceKind;
  /** Empreinte de l'avis au moment de la réponse (`fingerprintCfeNotice`). */
  sourceFingerprint: string;
  /** Date de la réponse : donnée fournie, jamais lue depuis l'horloge système. */
  answeredAt?: string;
};

export function fingerprintCfeNotice(notice: CfeNotice): string {
  return article39cSourceFingerprint({
    kind: "cfe_notice",
    sourceId: notice.sourceId,
    fiscalYear: notice.fiscalYear,
    amountCents: notice.amountCents,
    propertyId: notice.propertyId,
  });
}

function scopeOf(propertyId: string | undefined): Article39cScope {
  return propertyId !== undefined ? { level: "PROPERTY", propertyId } : { level: "ACTIVITY" };
}

/**
 * CFE → contribution. Jamais de classe par texte libre. MINIMUM → ACTIVITY (STRONG_INFERENCE, jamais DIRECT) ;
 * RENTAL_VALUE / UNKNOWN / absence / fait périmé → `NEEDS_QUALIFICATION` (B ou ACTIVITY non tranché).
 */
export function qualifyCfe(notice: CfeNotice, fact: CfeQualificationFact | undefined): Article39cContribution | null {
  if (notice.amountCents === 0) return null;
  const currentFingerprint = fingerprintCfeNotice(notice);
  const base = {
    contributionId: contributionId("CFE_NOTICE", notice.sourceId, "cfe"),
    source: "CFE_NOTICE" as const,
    sourceId: notice.sourceId,
    fiscalYear: notice.fiscalYear,
    amountCents: notice.amountCents,
    scope: scopeOf(notice.propertyId),
    sourceFingerprint: currentFingerprint,
  };
  const unresolved = (
    proofLevel: "AMBIGUOUS" | "UNRESOLVED",
    status: "UNRESOLVED" | "STALE",
    provenance: string,
    reason: string,
  ): Article39cContribution => ({
    ...base,
    class: "NEEDS_QUALIFICATION",
    plausibleClasses: NEEDS_QUALIFICATION_DEFAULT_PLAUSIBLE,
    proofLevel,
    provenance,
    ruleId: "SAV-031:cfe",
    reason,
    qualificationStatus: status,
  });

  if (fact === undefined) {
    return unresolved("UNRESOLVED", "UNRESOLVED", "cfe:no_answer", "CFE : base inconnue (absence de réponse = UNKNOWN) — B ou ACTIVITY non tranché.");
  }
  if (fact.sourceId !== notice.sourceId || fact.fiscalYear !== notice.fiscalYear || fact.sourceFingerprint !== currentFingerprint) {
    return unresolved(
      "UNRESOLVED",
      "STALE",
      `cfe:${fact.provenance}:stale`,
      "CFE : la réponse ne correspond plus à l'avis (montant, document, exercice ou nature modifié) — requalification requise.",
    );
  }
  switch (fact.cfeBaseKind) {
    case "MINIMUM":
      return {
        ...base,
        class: "ACTIVITY",
        proofLevel: "STRONG_INFERENCE",
        provenance: `cfe:${fact.provenance}`,
        ruleId: "SAV-031:cfe:minimum",
        reason: "CFE établie sur la base minimum : charge d'activité (STRONG_INFERENCE, jamais DIRECT).",
        qualificationStatus: "VALIDATED",
      };
    case "RENTAL_VALUE":
      return unresolved(
        "AMBIGUOUS",
        "UNRESOLVED",
        `cfe:${fact.provenance}`,
        "CFE assise sur la valeur locative : B_OR_ACTIVITY, matérialité évaluée par le moteur 39 C.",
      );
    default:
      return unresolved("UNRESOLVED", "UNRESOLVED", `cfe:${fact.provenance}`, "CFE : base UNKNOWN — B_OR_ACTIVITY, matérialité évaluée par le moteur 39 C.");
  }
}

// ---------------------------------------------------------------------------
// Faits de nature rattachés à une ligne de charge F012
// ---------------------------------------------------------------------------

/** Frais bancaires (SAV-031) : le libellé « frais bancaires » est insuffisant. */
export type BankFeeNatureFact = {
  kind: "BANK_FEE";
  lineId: string;
  nature: "PROPERTY_FINANCING" | "ACTIVITY_ACCOUNT" | "UNKNOWN";
  /** Prêt rattaché lorsque le financement est démontré. */
  loanId?: string;
  /** Nature du frais de financement, pour le rapprochement avec F011. */
  financingFeeKind?: "APPLICATION" | "GUARANTEE" | "OTHER";
  /** Frais déjà portés par F011 : jamais recomptés ici. */
  alreadyCountedByF011?: boolean;
  provenance: FactProvenanceKind;
  sourceFingerprint: string;
};

/** Gestion (SAV-031) : la catégorie technique « honoraires_gestion » regroupe aussi mise en location, publicité, autre. */
export type ManagementNatureFact = {
  kind: "MANAGEMENT_NATURE";
  lineId: string;
  nature: "PROPERTY_MANAGEMENT" | "MIXED_OR_OTHER_SERVICE" | "UNKNOWN";
  provenance: FactProvenanceKind;
  sourceFingerprint: string;
};

/** Honoraires comptables / logiciel : la comptabilité seule est un exemple doctrinal direct (§ 70). */
export type AccountingNatureFact = {
  kind: "ACCOUNTING_NATURE";
  lineId: string;
  nature: "ACCOUNTING_FEES" | "ACCOUNTING_OR_TAX_SOFTWARE";
  provenance: FactProvenanceKind;
  sourceFingerprint: string;
};

export type ChargeNatureFact = BankFeeNatureFact | ManagementNatureFact | AccountingNatureFact;

export type NatureFactFreshness = "MISSING" | "FRESH" | "STALE";

/** Compare l'empreinte de la réponse à l'empreinte COURANTE de la source. */
export function natureFactFreshness(fact: ChargeNatureFact | undefined, currentFingerprint: string): NatureFactFreshness {
  if (fact === undefined) return "MISSING";
  return fact.sourceFingerprint === currentFingerprint ? "FRESH" : "STALE";
}

// ---------------------------------------------------------------------------
// Frais d'acquisition (SAV-031 ; JUG-001 n'est PAS une preuve fiscale de classe)
// ---------------------------------------------------------------------------

export type AcquisitionCostTreatment = "CAPITALIZED" | "IMMEDIATELY_DEDUCTED" | "UNKNOWN";

export type AcquisitionCostFact = {
  sourceId: string;
  propertyId: string;
  fiscalYear: number;
  amountCents: number;
  treatment: AcquisitionCostTreatment;
};

/**
 * Transport du choix déjà posé par F010 (`optionFraisAcquisition.choix`) vers un traitement : intégration au prix de
 * revient = capitalisé ; déduction = immédiatement déduit. Un transport de fait, pas une classification fiscale.
 */
export function acquisitionCostTreatmentFromOption(choix: "integration" | "deduction" | undefined): AcquisitionCostTreatment {
  if (choix === "integration") return "CAPITALIZED";
  if (choix === "deduction") return "IMMEDIATELY_DEDUCTED";
  return "UNKNOWN";
}

/**
 * Capitalisé → EXCLUDED de B (passe par l'amortissement). Immédiatement déduit : Knowledge non fermé (B ou ACTIVITY) →
 * `NEEDS_QUALIFICATION`. Traitement inconnu → `NEEDS_QUALIFICATION`.
 */
export function qualifyAcquisitionCost(fact: AcquisitionCostFact): Article39cContribution | null {
  if (fact.amountCents === 0) return null;
  const base = {
    contributionId: contributionId("ACQUISITION_COST", fact.sourceId, "acquisition"),
    source: "ACQUISITION_COST" as const,
    sourceId: fact.sourceId,
    fiscalYear: fact.fiscalYear,
    amountCents: fact.amountCents,
    scope: { level: "PROPERTY", propertyId: fact.propertyId } as Article39cScope,
    provenance: "acquisition_cost:fact",
    sourceFingerprint: article39cSourceFingerprint({ kind: "acquisition_cost", ...fact }),
  };
  if (fact.treatment === "CAPITALIZED") {
    return {
      ...base,
      class: "EXCLUDED",
      proofLevel: "DIRECT",
      ruleId: "SAV-031:capitalized_expense",
      reason: "Frais d'acquisition capitalisés : hors B, via immobilisation / amortissement (pas de double déduction).",
      qualificationStatus: "VALIDATED",
    };
  }
  return {
    ...base,
    class: "NEEDS_QUALIFICATION",
    plausibleClasses: NEEDS_QUALIFICATION_DEFAULT_PLAUSIBLE,
    proofLevel: "UNRESOLVED",
    ruleId: "SAV-031:acquisition_cost_deducted",
    reason:
      fact.treatment === "IMMEDIATELY_DEDUCTED"
        ? "Frais d'acquisition immédiatement déduits : position 39 C (B ou ACTIVITY) non fermée par le Knowledge."
        : "Frais d'acquisition : traitement inconnu.",
    qualificationStatus: "UNRESOLVED",
  };
}

// ---------------------------------------------------------------------------
// Produits hors F013 v2 : jamais reclassés par défaut
// ---------------------------------------------------------------------------

export type OtherProductNature =
  /** Autre produit taxable DÉMONTRÉ : augmente le résultat, n'entre pas dans L. */
  | "QUALIFIED_TAXABLE_PRODUCT"
  | "GLI_INDEMNITY"
  | "INSURANCE_INDEMNITY"
  | "VISALE_INDEMNITY"
  | "DISPUTE_OR_REMISSION"
  | "SUBSIDY"
  | "DEPOSIT_RETAINED"
  | "CAF_THIRD_PARTY"
  | "PLATFORM_NET_PAYOUT"
  | "GENERIC_REFUND"
  | "UNQUALIFIED_REVENUE_REGULARISATION";

export type OtherProductFact = {
  sourceId: string;
  propertyId?: string;
  fiscalYear: number;
  amountCents: number;
  nature: OtherProductNature;
  /** Seulement pour `QUALIFIED_TAXABLE_PRODUCT` : les deux faits doivent être démontrés. */
  demonstratedTaxable?: boolean;
  demonstratedOutsideRent?: boolean;
  provenance: FactProvenanceKind;
};

const OUT_OF_DOMAIN_NATURES: ReadonlySet<OtherProductNature> = new Set([
  "GLI_INDEMNITY",
  "INSURANCE_INDEMNITY",
  "VISALE_INDEMNITY",
  "DISPUTE_OR_REMISSION",
]);

const PRODUCT_PLAUSIBLE: readonly Article39cResolvedClass[] = ["L", "OTHER_PRODUCT", "EXCLUDED"];

/**
 * `OTHER_PRODUCT` UNIQUEMENT pour un produit démontré taxable ET hors loyers. Indemnités GLI / assurance / VISALE, litige
 * et remise → `OUT_OF_DOMAIN` (SAV-034, SAV-031 : jamais ajoutées à L). Les autres cas non qualifiés (CAF, plateforme
 * nette, dépôt conservé, remboursement, subvention, régularisation) → `NEEDS_QUALIFICATION`.
 */
export function qualifyOtherProduct(fact: OtherProductFact): Article39cContribution | null {
  if (fact.amountCents === 0) return null;
  const base = {
    contributionId: contributionId("OTHER_PRODUCT_FACT", fact.sourceId, "product"),
    source: "OTHER_PRODUCT_FACT" as const,
    sourceId: fact.sourceId,
    fiscalYear: fact.fiscalYear,
    amountCents: fact.amountCents,
    scope: scopeOf(fact.propertyId),
    provenance: `other_product:${fact.provenance}`,
    sourceFingerprint: article39cSourceFingerprint({ kind: "other_product", ...fact }),
  };
  if (fact.nature === "QUALIFIED_TAXABLE_PRODUCT" && fact.demonstratedTaxable === true && fact.demonstratedOutsideRent === true) {
    return {
      ...base,
      class: "OTHER_PRODUCT",
      proofLevel: "DIRECT",
      ruleId: "SAV-030:other_product",
      reason: "Produit taxable démontré, hors loyers acquis : augmente le résultat, n'augmente pas C.",
      qualificationStatus: "VALIDATED",
    };
  }
  if (OUT_OF_DOMAIN_NATURES.has(fact.nature)) {
    return {
      ...base,
      class: "OUT_OF_DOMAIN",
      proofLevel: "UNRESOLVED",
      ruleId: "SAV-034:out_of_domain_product",
      reason: `« ${fact.nature} » : jamais ajouté automatiquement à L ni reclassé (règle distincte requise).`,
      qualificationStatus: "UNRESOLVED",
    };
  }
  return {
    ...base,
    class: "NEEDS_QUALIFICATION",
    plausibleClasses: PRODUCT_PLAUSIBLE,
    proofLevel: "UNRESOLVED",
    ruleId: "SAV-031:unresolved_product",
    reason: `« ${fact.nature} » : nature fiscale non démontrée (jamais L, jamais 0).`,
    qualificationStatus: "UNRESOLVED",
  };
}
