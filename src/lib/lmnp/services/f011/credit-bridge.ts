/**
 * Cycle 4 (F-011) — pont pur entre le pipeline documentaire Crédit (Tunnel A)
 * et l'Assistant Financement (F-011). Aucun React, aucune persistance, aucune
 * navigation : uniquement des transformations de données, testables seules.
 *
 * Réutilise intégralement la gouvernance existante :
 * - `AMORTIZATION_OWNED_FIELDS` (credit-field-ownership.ts) pour arbitrer entre
 *   un tableau d'amortissement et une offre de prêt — le tableau l'emporte sur
 *   les champs qu'il possède ; l'offre ne comble que ce que le tableau laisse
 *   vide (la règle de `LOAN_OFFER_METADATA_FIELDS`), encodée ici par l'ordre
 *   même des vérifications (amortissement d'abord, offre en repli) ;
 * - `GovernedFieldMetadata` / `FieldWriteDecision` (governed-field.ts) pour la
 *   provenance et la règle d'écrasement — jamais un `pendingConflicts` recréé.
 *
 * N'invente aucune valeur : un champ non extrait reste `undefined`, jamais
 * déduit ou approximé (règle absolue du Cycle 4, §3 et §7).
 */
import type { CreditAmortizationExtraction } from "@/lib/documents/gpt/schemas/credit-amortization.schema";
import type { CreditLoanOfferExtraction } from "@/lib/documents/gpt/schemas/credit-loan-offer.schema";
import { AMORTIZATION_OWNED_FIELDS } from "@/lib/lmnp/services/credit-field-ownership";
import type { GovernedFieldMetadata, FieldWriteDecision } from "@/lib/documents/types/governed-field";
import type { F011LoanDraft, TypePret } from "@/runtime";

/**
 * Champs F-011 que ce pont sait alimenter depuis un document. Volontairement
 * un sous-ensemble de `F011LoanDraft` : `typeGarantie`, `commissionCaution`,
 * `iraMontant`, `souscritCetExercice`, `remboursementAnticipeCetExercice` et
 * `assuranceType` n'y figurent jamais — voir §7 et la table de couverture.
 */
export type F011PrefillFieldKey =
  | "typePret"
  | "capitalInitial"
  | "tauxNominal"
  | "dureeMois"
  | "datePremiereMensualite"
  | "assuranceAnnuelle"
  | "fraisDossier";

/**
 * Cycle 6 — même liste que le type ci-dessus, mais en valeur d'exécution :
 * seule source de vérité pour "quels champs de `F011LoanDraft` peuvent
 * provenir d'un document", réutilisée par le runtime (review consolidée,
 * provenance) au lieu d'une seconde liste qui pourrait diverger.
 */
export const F011_PREFILL_FIELD_KEYS: readonly F011PrefillFieldKey[] = [
  "typePret",
  "capitalInitial",
  "tauxNominal",
  "dureeMois",
  "datePremiereMensualite",
  "assuranceAnnuelle",
  "fraisDossier",
] as const;

export type CreditExtractionSessionInput = {
  amortization?: CreditAmortizationExtraction;
  loanOffer?: CreditLoanOfferExtraction;
};

/** Un champ vu dans le document mais délibérément non appliqué à F-011 — jamais silencieux. */
export type F011UnmappedField = {
  field: string;
  value: unknown;
  sourceDocument: "amortization" | "loan_offer";
  reason: string;
};

export type F011CreditPrefill = {
  fields: Partial<Record<F011PrefillFieldKey, F011LoanDraft[keyof F011LoanDraft]>>;
  provenance: Partial<Record<F011PrefillFieldKey, GovernedFieldMetadata>>;
  unmapped: F011UnmappedField[];
};

export type F011PrefillConflict = {
  field: F011PrefillFieldKey;
  existingValue: unknown;
  incomingValue: unknown;
  decision: FieldWriteDecision;
};

export type F011CreditPrefillApplication = {
  /** Uniquement les champs sûrs à appliquer (`apply_empty`) — jamais un champ déjà renseigné. */
  patch: Partial<F011LoanDraft>;
  provenance: Partial<Record<F011PrefillFieldKey, GovernedFieldMetadata>>;
  /** Champs où le document contredit une valeur déjà présente — jamais appliqués silencieusement. */
  conflicts: F011PrefillConflict[];
};

/**
 * Correctif Cycle 9 — dictionnaire élargi, mais uniquement pour des libellés
 * synonymes non ambigus (vocabulaire bancaire établi), jamais pour une
 * déduction depuis la structure du tableau (l'audit a montré qu'un capital
 * ≈ 0 sur l'exercice peut aussi bien signifier un différé total sur un prêt
 * amortissable — voir `spatial-amortization-core.ts` — donc aucune inférence
 * structurelle ici, uniquement du texte).
 */
function inferTypePretFromFreeText(loanType: string | undefined): TypePret | undefined {
  if (!loanType) return undefined;
  const normalized = loanType.toLowerCase();
  if (/in\s*[\s-]?fine/.test(normalized)) return "in_fine";
  // Prêt/crédit relais : structurellement toujours remboursé in fine en
  // France (intérêts seuls pendant le relais, capital en une fois à la
  // revente) — fait établi du vocabulaire bancaire, pas une supposition.
  if (/(pr[êe]t|cr[ée]dit)\s+relais/.test(normalized)) return "in_fine";
  if (/amortissable/.test(normalized)) return "amortissable";
  // Libellés alternatifs désignant la même famille qu'"amortissable",
  // jamais une inférence depuis le tableau.
  if (/amortissement\s+progressif/.test(normalized)) return "amortissable";
  if (/capital\s+constant/.test(normalized)) return "amortissable";
  // Texte présent mais non concluant (ex. "prêt travaux") — ne jamais deviner.
  return undefined;
}

function provenanceFor(
  value: unknown,
  sourceDocument: "amortization" | "loan_offer",
  documentId: string,
  updatedAt: string,
): GovernedFieldMetadata {
  return {
    value,
    sourceTunnel: "credit",
    sourceDocument: documentId,
    extractedBy: "gpt",
    ownershipTunnel: "credit",
    manuallyValidated: false,
    updatedAt,
    crossTunnelInferred: false,
  };
}

/**
 * Étape 1 — transforme UNE extraction documentaire (au plus un tableau
 * d'amortissement + une offre de prêt, pour UN seul prêt : le pipeline
 * GPT actuel n'extrait jamais plusieurs prêts d'un même document, voir
 * `credit-amortization.schema.ts` / `credit-loan-offer.schema.ts` — aucun
 * champ `loans[]` côté schéma) en un pré-remplissage F-011.
 *
 * L'arbitrage amortissable/offre réutilise `AMORTIZATION_OWNED_FIELDS` /
 * `LOAN_OFFER_METADATA_FIELDS` — jamais une règle de priorité réinventée.
 */
export function mapCreditExtractionToF011Prefill(
  session: CreditExtractionSessionInput,
  documentId: string,
  updatedAt: string,
): F011CreditPrefill {
  const amortization = session.amortization;
  const loanOffer = session.loanOffer;
  const fields: F011CreditPrefill["fields"] = {};
  const provenance: F011CreditPrefill["provenance"] = {};
  const unmapped: F011UnmappedField[] = [];

  function setField(key: F011PrefillFieldKey, value: F011LoanDraft[keyof F011LoanDraft] | undefined, source: "amortization" | "loan_offer") {
    if (value === undefined) return;
    fields[key] = value;
    provenance[key] = provenanceFor(value, source, documentId, updatedAt);
  }

  // capitalInitial — les deux schémas peuvent le porter. Le tableau d'amortissement
  // reflète l'échéancier réel ; s'il est présent, il prévaut (cohérent avec la
  // philosophie KS "le tableau est la vérité fiscale"), sinon l'offre.
  if (amortization?.loanAmount !== undefined) {
    setField("capitalInitial", amortization.loanAmount, "amortization");
  } else if (loanOffer?.loanAmount !== undefined) {
    setField("capitalInitial", loanOffer.loanAmount, "loan_offer");
  }

  // tauxNominal — jamais présent dans le schéma d'amortissement (aucune formule
  // inverse n'est tentée pour le reconstruire : ce serait une valeur inventée).
  // Seule l'offre de prêt le porte, en pourcentage (ex. 3.15 → 0.0315).
  if (loanOffer?.interestRate !== undefined) {
    setField("tauxNominal", loanOffer.interestRate / 100, "loan_offer");
  }

  // dureeMois — appartient au tableau d'amortissement (AMORTIZATION_OWNED_FIELDS
  // porte "durationMonths"), jamais écrasé par l'offre si les deux sont présents.
  if (amortization?.loanDurationMonths !== undefined && AMORTIZATION_OWNED_FIELDS.has("durationMonths")) {
    setField("dureeMois", amortization.loanDurationMonths, "amortization");
  } else if (loanOffer?.loanDurationMonths !== undefined) {
    setField("dureeMois", loanOffer.loanDurationMonths, "loan_offer");
  }

  // datePremiereMensualite — même arbitrage : "firstPaymentDate" est amortization-owned.
  if (amortization?.firstPaymentDate !== undefined && AMORTIZATION_OWNED_FIELDS.has("firstPaymentDate")) {
    setField("datePremiereMensualite", amortization.firstPaymentDate, "amortization");
  } else if (loanOffer?.firstPaymentDate !== undefined) {
    setField("datePremiereMensualite", loanOffer.firstPaymentDate, "loan_offer");
  }

  // typePret — aucun schéma ne porte d'énumération structurée. Best-effort sur
  // le texte libre `loanType` (l'offre) — jamais deviné si le texte est absent
  // ou non concluant (ex. "prêt travaux").
  if (loanOffer?.loanType !== undefined) {
    const inferred = inferTypePretFromFreeText(loanOffer.loanType);
    if (inferred) {
      setField("typePret", inferred, "loan_offer");
    } else {
      unmapped.push({
        field: "loanType",
        value: loanOffer.loanType,
        sourceDocument: "loan_offer",
        reason: "texte libre non concluant pour distinguer amortissable/in fine — jamais deviné",
      });
    }
  }

  // assuranceAnnuelle — "annualInsurance"/"insurance" sont amortization-owned
  // (montant réellement observé sur l'échéancier) ; sinon l'offre, mensuelle,
  // convertie en annuel. `assuranceType` (bancaire/externe) n'est JAMAIS déduit :
  // aucun schéma ne porte cette distinction — F-011 devra toujours la demander.
  if (
    amortization?.yearlyInsuranceTotal !== undefined &&
    (AMORTIZATION_OWNED_FIELDS.has("annualInsurance") || AMORTIZATION_OWNED_FIELDS.has("insurance"))
  ) {
    setField("assuranceAnnuelle", amortization.yearlyInsuranceTotal, "amortization");
  } else if (loanOffer?.insuranceMonthlyAmount !== undefined) {
    setField("assuranceAnnuelle", Math.round(loanOffer.insuranceMonthlyAmount * 12 * 100) / 100, "loan_offer");
  }

  // fraisDossier — uniquement l'offre de prêt (frais de dossier bancaire, à la
  // souscription). L'amortissement n'a pas ce concept.
  if (loanOffer?.applicationFees !== undefined) {
    setField("fraisDossier", loanOffer.applicationFees, "loan_offer");
  }

  // garantie (guaranteeFees) — STOP volontaire (Cycle 4 §7 / Cycle 1 §3) : le
  // schéma ne porte qu'un montant, jamais la nature (caution vs hypothèque/IPPD).
  // Le moteur F-011 ne sait représenter que la caution comme charge déductible ;
  // appliquer aveuglément ce montant risquerait un double comptage avec le prix
  // de revient F-010 si le document décrit en réalité une hypothèque/IPPD.
  // Le montant est conservé en `unmapped` pour une future revue humaine — jamais
  // copié dans `commissionCaution`.
  if (loanOffer?.guaranteeFees !== undefined) {
    unmapped.push({
      field: "guaranteeFees",
      value: loanOffer.guaranteeFees,
      sourceDocument: "loan_offer",
      reason:
        "nature de la garantie (caution vs hypothèque/IPPD) non extraite par le pipeline actuel — " +
        "appliquer ce montant sans certitude risquerait un double comptage avec F-010 (STOP délibéré)",
    });
  }

  // IRA — aucun schéma actuel ne porte d'indemnité de remboursement anticipé.
  // Rien à faire : l'absence reste une absence, sans entrée `unmapped` (rien vu).

  return { fields, provenance, unmapped };
}

/**
 * Étape 2 — décide, champ par champ, si une valeur documentaire peut remplir
 * un `F011LoanDraft` déjà en cours de saisie. Réutilise `FieldWriteDecision`
 * (governed-field.ts) au lieu d'un mécanisme de conflit ad hoc :
 * - `apply_empty` : le champ F-011 est vide → la valeur documentaire s'applique ;
 * - `blocked_user_validated` : le champ F-011 porte déjà une valeur → jamais
 *   écrasée silencieusement, remontée comme conflit.
 */
export function resolveF011FieldWriteDecision(existingValue: unknown): FieldWriteDecision {
  if (existingValue === undefined) return "apply_empty";
  return "blocked_user_validated";
}

/**
 * Étape 3 — applique un `F011CreditPrefill` à un prêt F-011 déjà en cours
 * (`pendingLoan`, éventuel). Ne modifie jamais un champ déjà renseigné —
 * le remonte en conflit à la place. Pure : ne touche ni `F011State`, ni le
 * store, ni React — l'intégration (Cycle 5) décide quoi faire du résultat.
 */
export function applyCreditPrefillToLoan(
  existing: Partial<F011LoanDraft> | undefined,
  prefill: F011CreditPrefill,
): F011CreditPrefillApplication {
  const patch: Partial<F011LoanDraft> = {};
  const provenance: F011CreditPrefillApplication["provenance"] = {};
  const conflicts: F011PrefillConflict[] = [];

  for (const key of Object.keys(prefill.fields) as F011PrefillFieldKey[]) {
    const incomingValue = prefill.fields[key];
    const existingValue = existing?.[key as keyof F011LoanDraft];
    const decision = resolveF011FieldWriteDecision(existingValue);

    if (decision === "apply_empty") {
      (patch as Record<string, unknown>)[key] = incomingValue;
      provenance[key] = prefill.provenance[key];
      continue;
    }

    if (existingValue !== incomingValue) {
      conflicts.push({ field: key, existingValue, incomingValue, decision });
    }
    // decision === "blocked_user_validated" et valeurs identiques : rien à
    // faire, rien à signaler — le document confirme simplement ce qui était
    // déjà su.
  }

  return { patch, provenance, conflicts };
}
