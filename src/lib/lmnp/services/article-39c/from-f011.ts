/**
 * INT-1 — adapter PUR F011 (`PretFinancementExercice[]`) → contributions article 39 C.
 *
 * Classifications établies (SAV-031) lorsque les données du prêt le démontrent :
 *  - intérêts d'emprunt du bien → B ;
 *  - assurance emprunteur → B ;
 *  - frais de dossier / garantie de financement (déjà isolés « année de souscription » par F011) → B, preuve INFERENCE
 *    (« directement rattachables au bien » : niveau non fixé par le Knowledge, pris au plus prudent) ;
 *  - IRA : le Knowledge ne le classe pas → `NEEDS_QUALIFICATION` (aucune classification inventée) ;
 *  - parts pré-opérationnelles (intérêts / assurance) → `NEEDS_QUALIFICATION` (pas de nouvelle doctrine) ;
 *  - capital remboursé : jamais une charge, aucune contribution.
 *
 * Identité d'un prêt : `loanKey(propertyId, pretId)`. Un prêt partagé entre biens reste `OUT_OF_DOMAIN` (garde ADR-011) ;
 * un prêt exclu du calcul F011 (date de première mensualité manquante, échéancier inexploitable) produit un blocage
 * explicite : montant INCONNU, jamais zéro.
 *
 * Anti-double-comptage : les frais de dossier / garantie portent un `dedupeKey` ; le même frais présent côté F012
 * (frais bancaires de financement) partage la clé et est détecté par `validateArticle39cContributions`.
 *
 * NON BRANCHÉ à F006 (INT-1).
 */
import { toCents } from "@/runtime/capabilities/f006/cents";
import type { PretFinancementExercice } from "@/runtime/capabilities/f011/types";
import { loanKey } from "@/lib/lmnp/dossier/property-keys";
import {
  contributionId,
  article39cSourceFingerprint,
  NEEDS_QUALIFICATION_DEFAULT_PLAUSIBLE,
  sortContributions,
  type Article39cAdapterBlocker,
  type Article39cAdapterResult,
  type Article39cContribution,
} from "./contribution";

export type F011Article39cInput = {
  propertyId: string;
  fiscalYear: number;
  prets: readonly PretFinancementExercice[];
  /** Prêts confirmés mais exclus du calcul F011 (`financementCharges.excludedLoanIds`). */
  excludedLoanIds?: readonly string[];
  /** Prêts partagés entre biens (garde de domaine multi existante) : jamais classés. */
  sharedLoanIds?: readonly string[];
};

export function adaptF011ToArticle39cContributions(input: F011Article39cInput): Article39cAdapterResult {
  const out: Article39cContribution[] = [];
  const blockers: Article39cAdapterBlocker[] = [];
  const shared = new Set(input.sharedLoanIds ?? []);

  for (const loanId of [...(input.excludedLoanIds ?? [])].sort()) {
    blockers.push({
      code: "LOAN_EXCLUDED_FROM_F011",
      sourceId: loanKey(input.propertyId, loanId),
      message: `Prêt « ${loanId} » exclu du calcul F011 : charges de financement INCONNUES (jamais zéro).`,
    });
  }

  const prets = [...input.prets].sort((a, b) => (a.pretId < b.pretId ? -1 : a.pretId > b.pretId ? 1 : 0));
  for (const pret of prets) {
    const key = loanKey(input.propertyId, pret.pretId);
    const sourceId = `${key}:${input.fiscalYear}`;
    const parts: ReadonlyArray<{ part: string; euros: number; kind: "interest" | "insurance" | "application_fee" | "guarantee_fee" | "ira" | "preop_interest" | "preop_insurance" }> = [
      { part: "interest", euros: pret.interetsEmpruntExercice, kind: "interest" },
      { part: "insurance", euros: pret.assuranceEmpruntExercice, kind: "insurance" },
      { part: "application_fee", euros: pret.fraisDossierDeductibles, kind: "application_fee" },
      { part: "guarantee_fee", euros: pret.garantieDeductible, kind: "guarantee_fee" },
      { part: "ira", euros: pret.iraDeductible, kind: "ira" },
      { part: "preop_interest", euros: pret.interetsPreExploitation, kind: "preop_interest" },
      { part: "preop_insurance", euros: pret.assurancePreExploitation, kind: "preop_insurance" },
    ];

    for (const { part, euros, kind } of parts) {
      if (!Number.isFinite(euros) || euros < 0) {
        blockers.push({ code: "INVALID_AMOUNT", sourceId: `${key}:${part}`, message: `Prêt « ${pret.pretId} » : ${part} invalide (jamais assimilé à zéro).` });
        continue;
      }
      const amountCents = toCents(euros);
      if (amountCents === 0) continue;

      const common = {
        contributionId: contributionId("F011_LOAN", sourceId, part),
        source: "F011_LOAN" as const,
        sourceId,
        fiscalYear: input.fiscalYear,
        amountCents,
        provenance: `f011:loan:${pret.pretId}`,
        scope: { level: "PROPERTY", propertyId: input.propertyId } as const,
        loanId: pret.pretId,
        sourceFingerprint: article39cSourceFingerprint({ kind: "f011_part", loanKey: key, part, fiscalYear: input.fiscalYear, amountCents }),
      };

      if (shared.has(pret.pretId)) {
        blockers.push({ code: "SHARED_LOAN_OUT_OF_DOMAIN", sourceId: key, message: `Prêt « ${pret.pretId} » partagé entre biens : hors domaine.` });
        out.push({
          ...common,
          class: "OUT_OF_DOMAIN",
          proofLevel: "UNRESOLVED",
          ruleId: "ADR-011:shared_loan",
          reason: "Prêt partagé entre biens : aucune allocation supportée, aucune classification.",
          qualificationStatus: "UNRESOLVED",
        });
        continue;
      }

      switch (kind) {
        case "interest":
          out.push({ ...common, class: "B", proofLevel: "DIRECT", ruleId: "SAV-031:loan_interest", reason: "Intérêts d'emprunt du bien : B.", qualificationStatus: "VALIDATED" });
          break;
        case "insurance":
          out.push({ ...common, class: "B", proofLevel: "DIRECT", ruleId: "SAV-031:loan_insurance", reason: "Assurance emprunteur du financement : B.", qualificationStatus: "VALIDATED" });
          break;
        case "application_fee":
        case "guarantee_fee":
          out.push({
            ...common,
            class: "B",
            proofLevel: "INFERENCE",
            ruleId: "SAV-031:financing_fee",
            reason: "Frais de financement directement rattachables au bien (souscription de l'exercice) : B.",
            qualificationStatus: "VALIDATED",
            dedupeKey: `financing-fee:${key}:${kind === "application_fee" ? "APPLICATION" : "GUARANTEE"}:${input.fiscalYear}`,
          });
          break;
        case "ira":
          out.push({
            ...common,
            class: "NEEDS_QUALIFICATION",
            plausibleClasses: NEEDS_QUALIFICATION_DEFAULT_PLAUSIBLE,
            proofLevel: "UNRESOLVED",
            ruleId: "SAV-031:ira_unresolved",
            reason: "IRA : le Knowledge ne classe pas l'indemnité de remboursement anticipé pour le 39 C.",
            qualificationStatus: "UNRESOLVED",
          });
          break;
        default:
          out.push({
            ...common,
            class: "NEEDS_QUALIFICATION",
            plausibleClasses: NEEDS_QUALIFICATION_DEFAULT_PLAUSIBLE,
            proofLevel: "UNRESOLVED",
            ruleId: "SAV-031:pre_operational",
            reason: "Charge de financement pré-opérationnelle : traitement 39 C avant mise en service non prouvé.",
            qualificationStatus: "UNRESOLVED",
          });
      }
    }
  }

  return { contributions: sortContributions(out), blockers };
}
