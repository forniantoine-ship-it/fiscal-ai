/**
 * INT-1 — adapter PUR F012 (`LigneCharge[]`) → contributions article 39 C (`B`, `ACTIVITY`, `EXCLUDED`,
 * `NEEDS_QUALIFICATION`, `OUT_OF_DOMAIN`).
 *
 * Source : les `LigneCharge[]` détaillées produites par `computeChargesExercice` (le calcul F012 n'est pas rejoué :
 * les montants sont ceux de `montantDeductible`, `montantPreExploitation`, `montantAmortissable` déjà calculés).
 *
 * Aucune classification par mot-clé. La catégorie technique ne suffit pas toujours : `honoraires_gestion` regroupe
 * gestion, mise en location, publicité, « autre » ; `frais_bancaires`, CFE et copropriété exigent un fait de nature
 * (`qualification-facts.ts`). Sans fait frais → `NEEDS_QUALIFICATION`, jamais B ni ACTIVITY par défaut.
 *
 * Limites de persistance déclarées (à traiter en INT-2, non forcées ici) :
 *  - `Charge` ne conserve ni `gestionKind` ni `insuranceKind` (la nature est perdue après la revue documentaire) ;
 *  - `honoraires-gestion` fusionne gestion + état des lieux dans UNE `LigneCharge` (le fait de nature doit couvrir la ligne) ;
 *  - `copropriete-deductible` est un net (provisions + régularisation + gros travaux déductibles) ;
 *  - `ChargesAssistantOutput` (draft) ne conserve que des agrégats : l'adapter exige donc les `LigneCharge[]` détaillées.
 *
 * Montants négatifs : seul le net copropriété peut l'être. Il n'est jamais transmis comme contribution négative au
 * moteur : un net négatif devient `NEEDS_QUALIFICATION` (réduction de B ou produit : non démontré). Le netting se fait
 * uniquement à l'intérieur de la même classe (déjà opéré par F012) et reste tracé par l'identité de la ligne.
 *
 * NON BRANCHÉ à F006 (INT-1).
 */
import { toCents } from "@/runtime/capabilities/f006/cents";
import { qualifyArticle39cCharge } from "@/runtime/capabilities/f006/qualify-article-39c";
import type { Charge } from "@/runtime/capabilities/f012/charge";
import type { ChargeCategorie, LigneCharge } from "@/runtime/capabilities/f012/types";
import { loanKey } from "@/lib/lmnp/dossier/property-keys";
import {
  contributionId,
  fingerprintChargeLineSource,
  NEEDS_QUALIFICATION_DEFAULT_PLAUSIBLE,
  sortContributions,
  type Article39cAdapterBlocker,
  type Article39cAdapterResult,
  type Article39cContribution,
  type Article39cProofLevel,
  type Article39cQualificationStatus,
  type Article39cResolvedClass,
  type Article39cScope,
} from "./contribution";
import {
  natureFactFreshness,
  type AccountingNatureFact,
  type BankFeeNatureFact,
  type ChargeNatureFact,
  type ManagementNatureFact,
} from "./qualification-facts";

export type F012Article39cInput = {
  /** Propriétaire de la source : un bien (vrai `propertyId`) ou l'activité (aucun `propertyId`). */
  owner: Article39cScope;
  fiscalYear: number;
  lignes: readonly LigneCharge[];
  /** Faits de nature rattachés à une `LigneCharge` (`lineId`). */
  natureFacts?: readonly ChargeNatureFact[];
  /** Optionnel : détecte les charges de copropriété sans type, qui n'alimentent aucune ligne (jamais ignorées). */
  registryCharges?: readonly Charge[];
};

type Classified = {
  class: Article39cContribution["class"];
  plausibleClasses?: readonly Article39cResolvedClass[];
  proofLevel: Article39cProofLevel;
  ruleId: string;
  reason: string;
  status: Article39cQualificationStatus;
  dedupeKey?: string;
  loanId?: string;
};

const PRE_OPERATIONAL_UNPROVEN =
  "Charge pré-opérationnelle : traitement 39 C avant mise en service non prouvé par le Knowledge (aucune doctrine ajoutée).";

function unresolved(reason: string, ruleId: string, status: Article39cQualificationStatus = "UNRESOLVED", plausible = NEEDS_QUALIFICATION_DEFAULT_PLAUSIBLE): Classified {
  return { class: "NEEDS_QUALIFICATION", plausibleClasses: plausible, proofLevel: "UNRESOLVED", ruleId, reason, status };
}

function factOf<T extends ChargeNatureFact>(facts: readonly ChargeNatureFact[], kind: T["kind"], lineId: string): T | undefined {
  return facts.find((f): f is T => f.kind === kind && f.lineId === lineId);
}

function levelOfEngine(level: "DIRECT" | "INFERENCE" | "UNRESOLVED"): Article39cProofLevel {
  return level;
}

function classifyBankFee(
  ligne: LigneCharge,
  facts: readonly ChargeNatureFact[],
  currentFingerprint: string,
  owner: Article39cScope,
  fiscalYear: number,
): Classified {
  const fact = factOf<BankFeeNatureFact>(facts, "BANK_FEE", ligne.id);
  const freshness = natureFactFreshness(fact, currentFingerprint);
  if (freshness === "MISSING") {
    return unresolved("Frais bancaires : libellé insuffisant, nature (financement du bien / compte d'activité) non démontrée.", "SAV-031:bank_fee");
  }
  if (freshness === "STALE") {
    return unresolved("Frais bancaires : la qualification ne correspond plus à la source (montant, nature ou exercice modifié).", "SAV-031:bank_fee", "STALE");
  }
  const bank = fact!;
  if (bank.nature === "PROPERTY_FINANCING") {
    if (bank.alreadyCountedByF011 === true) {
      return {
        class: "EXCLUDED",
        proofLevel: "DIRECT",
        ruleId: "AX-009:f011_overlap",
        reason: "Frais de financement déjà portés par F011 : jamais recomptés.",
        status: "VALIDATED",
        ...(bank.loanId !== undefined ? { loanId: bank.loanId } : {}),
      };
    }
    if (bank.loanId === undefined || owner.level !== "PROPERTY") {
      // Financement du bien démontré mais sans prêt ni bien d'attache : la référence de rattachement manque.
      return unresolved(
        "Frais bancaires de financement : prêt ou bien d'attache non référencé — rattachement non démontré.",
        "SAV-031:bank_fee",
      );
    }
    const dedupeKey =
      bank.financingFeeKind === "APPLICATION" || bank.financingFeeKind === "GUARANTEE"
        ? `financing-fee:${loanKey(owner.propertyId, bank.loanId)}:${bank.financingFeeKind}:${fiscalYear}`
        : undefined;
    return {
      class: "B",
      proofLevel: "INFERENCE",
      ruleId: "SAV-031:bank_fee:property_financing",
      reason: "Frais démontrés liés au financement du bien (prêt référencé) : B.",
      status: "VALIDATED",
      loanId: bank.loanId,
      ...(dedupeKey !== undefined ? { dedupeKey } : {}),
    };
  }
  if (bank.nature === "ACTIVITY_ACCOUNT") {
    return {
      class: "ACTIVITY",
      proofLevel: "INFERENCE",
      ruleId: "SAV-031:bank_fee:activity_account",
      reason: "Frais généraux de compte d'activité démontrés : ACTIVITY (réduit le résultat, pas C).",
      status: "VALIDATED",
    };
  }
  return unresolved("Frais bancaires : nature déclarée inconnue.", "SAV-031:bank_fee");
}

function classifyInYear(
  ligne: LigneCharge,
  amountCents: number,
  facts: readonly ChargeNatureFact[],
  fiscalYear: number,
  owner: Article39cScope,
): Classified {
  const category: ChargeCategorie = ligne.categorie;
  const lineFingerprint = fingerprintChargeLineSource({ lineId: ligne.id, fiscalYear, amountCents, category });

  switch (category) {
    case "taxe_fonciere":
    case "assurance_pno":
    case "assurance_gli": {
      // Table établie UNIQUE du qualificateur existant (jamais une seconde table).
      const q = qualifyArticle39cCharge({ id: ligne.id, category, amount: ligne.montantDeductible, provenance: "f012", deductibilite: "deductible" });
      return {
        class: q.class,
        proofLevel: levelOfEngine(q.qualificationLevel),
        ruleId: `SAV-031:${category}`,
        reason: q.reason,
        status: "VALIDATED",
      };
    }
    case "honoraires_gestion": {
      const fact = factOf<ManagementNatureFact>(facts, "MANAGEMENT_NATURE", ligne.id);
      const freshness = natureFactFreshness(fact, lineFingerprint);
      if (freshness === "MISSING") {
        return unresolved(
          "Honoraires de gestion : la catégorie regroupe gestion, mise en location, publicité et autres services — nature non démontrée.",
          "SAV-031:management_fee",
        );
      }
      if (freshness === "STALE") {
        return unresolved("Honoraires de gestion : qualification périmée (source modifiée).", "SAV-031:management_fee", "STALE");
      }
      if (fact!.nature === "PROPERTY_MANAGEMENT") {
        return {
          class: "B",
          proofLevel: "DIRECT",
          ruleId: "SAV-031:management_fee",
          reason: "Gestion locative démontrée : B.",
          status: "VALIDATED",
        };
      }
      return unresolved("Honoraires : prestation autre que la gestion locative (ou mixte) — classement 39 C non fermé.", "SAV-031:management_fee");
    }
    case "honoraires_comptable": {
      const fact = factOf<AccountingNatureFact>(facts, "ACCOUNTING_NATURE", ligne.id);
      const freshness = natureFactFreshness(fact, lineFingerprint);
      if (freshness === "STALE") {
        return unresolved("Honoraires comptables : qualification périmée (source modifiée).", "SAV-031:accounting", "STALE");
      }
      const direct = freshness === "FRESH" && fact!.nature === "ACCOUNTING_FEES";
      return {
        class: "ACTIVITY",
        proofLevel: direct ? "DIRECT" : "INFERENCE",
        ruleId: "SAV-031:accounting",
        reason: direct
          ? "Frais de comptabilité : charge de pure activité (BOI-BIC-AMT-20-40-10-20 § 70)."
          : "Comptable ou logiciel : ACTIVITY (seule la comptabilité est un exemple doctrinal direct — INFERENCE).",
        status: "VALIDATED",
      };
    }
    case "frais_bancaires":
      return classifyBankFee(ligne, facts, lineFingerprint, owner, fiscalYear);
    case "copropriete":
      if (amountCents > 0) {
        return {
          class: "B",
          proofLevel: "DIRECT",
          ruleId: "SAV-031:copro_current_charge",
          reason: "Provisions / régularisation / appels déductibles typés par F012 : charge courante afférente au bien (net déjà opéré).",
          status: "VALIDATED",
        };
      }
      return unresolved(
        "Net de copropriété négatif (régularisation > charges) : réduction de B ou produit non démontré — jamais une contribution négative.",
        "SAV-031:copro_negative_net",
        "UNRESOLVED",
        ["OTHER_PRODUCT", "EXCLUDED"],
      );
    case "travaux":
      return {
        class: "B",
        proofLevel: "DIRECT",
        ruleId: "SAV-031:repairs",
        reason: "Réparation / entretien qualifié déductible par F012 : B.",
        status: "VALIDATED",
      };
    default:
      return unresolved("Catégorie « divers » : jamais B ni ACTIVITY sans qualification explicite.", "SAV-031:miscellaneous");
  }
}

export function adaptF012ToArticle39cContributions(input: F012Article39cInput): Article39cAdapterResult {
  const out: Article39cContribution[] = [];
  const blockers: Article39cAdapterBlocker[] = [];
  const facts = input.natureFacts ?? [];
  const ownerKey = input.owner.level === "PROPERTY" ? input.owner.propertyId : "activity";

  const push = (lineId: string, part: string, amountCents: number, c: Classified, provenance: string, fingerprint: string): void => {
    let klass = c;
    // Niveau activité : une charge commune B (ou matérielle non ACTIVITY) reste bloquée (ADR-011 §11, SAV-031).
    if (input.owner.level === "ACTIVITY" && c.class === "B") {
      klass = {
        class: "OUT_OF_DOMAIN",
        proofLevel: "UNRESOLVED",
        ruleId: "ADR-011:common_charges_not_supported",
        reason: "Charge commune classée B : aucune allocation par bien n'est supportée (common_charges_not_supported).",
        status: "UNRESOLVED",
      };
      blockers.push({ code: "COMMON_CHARGE_NOT_SUPPORTED", sourceId: lineId, message: klass.reason });
    }
    out.push({
      contributionId: contributionId("F012_CHARGE", `${ownerKey}:${lineId}:${input.fiscalYear}`, part),
      source: "F012_CHARGE",
      sourceId: `${ownerKey}:${lineId}:${input.fiscalYear}`,
      fiscalYear: input.fiscalYear,
      amountCents,
      class: klass.class,
      ...(klass.plausibleClasses !== undefined ? { plausibleClasses: klass.plausibleClasses } : {}),
      proofLevel: klass.proofLevel,
      provenance,
      ruleId: klass.ruleId,
      reason: klass.reason,
      scope: input.owner,
      qualificationStatus: klass.status,
      sourceFingerprint: fingerprint,
      ...(klass.dedupeKey !== undefined ? { dedupeKey: klass.dedupeKey } : {}),
      ...(klass.loanId !== undefined ? { loanId: klass.loanId } : {}),
    });
  };

  const sortedLines = [...input.lignes].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  for (const ligne of sortedLines) {
    const provenance = `f012:${ligne.source}`;
    const amounts = [ligne.montant, ligne.montantDeductible, ligne.montantPreExploitation, ligne.montantAmortissable];
    if (amounts.some((n) => !Number.isFinite(n))) {
      blockers.push({ code: "INVALID_AMOUNT", sourceId: ligne.id, message: `Ligne « ${ligne.id} » : montant non fini (jamais assimilé à zéro).` });
      continue;
    }
    const inYearCents = toCents(ligne.montantDeductible);
    const fingerprint = fingerprintChargeLineSource({ lineId: ligne.id, fiscalYear: input.fiscalYear, amountCents: inYearCents, category: ligne.categorie });

    if (ligne.exclusionReason === "f011_overlap") {
      push(ligne.id, "overlap", toCents(ligne.montant), {
        class: "EXCLUDED",
        proofLevel: "DIRECT",
        ruleId: "AX-009:f011_overlap",
        reason: "Dépense déjà comptée par F011 (assurance emprunteur / frais de dossier) : aucune contribution F012.",
        status: "VALIDATED",
      }, provenance, fingerprint);
      continue;
    }

    if (ligne.deductibilite === "amortissement") {
      const amortCents = toCents(ligne.montantAmortissable);
      if (amortCents !== 0) {
        push(ligne.id, "capitalized", amortCents, {
          class: "EXCLUDED",
          proofLevel: "DIRECT",
          ruleId: "SAV-031:capitalized_expense",
          reason: "Dépense capitalisée / immobilisée : hors B, via amortissement (pas de double déduction).",
          status: "VALIDATED",
        }, provenance, fingerprint);
      }
      continue;
    }

    if (ligne.deductibilite === "non_deductible") {
      const cents = toCents(ligne.montant);
      if (cents !== 0) {
        const worksFund = ligne.categorie === "copropriete";
        push(ligne.id, "non_deductible", cents, {
          class: "EXCLUDED",
          proofLevel: "DIRECT",
          ruleId: worksFund ? "SAV-031:copro_works_fund" : "SAV-031:non_deductible",
          reason: worksFund
            ? "Fonds de travaux / avance de copropriété : pas encore une charge, hors B."
            : "Charge non déductible : hors B et hors ACTIVITY.",
          status: "VALIDATED",
        }, provenance, fingerprint);
      }
      continue;
    }

    // deductible
    if (inYearCents !== 0) {
      if (inYearCents < 0 && ligne.categorie !== "copropriete") {
        blockers.push({ code: "INVALID_AMOUNT", sourceId: ligne.id, message: `Ligne « ${ligne.id} » : montant négatif hors régularisation de copropriété.` });
      } else {
        const classified = classifyInYear(ligne, inYearCents, facts, input.fiscalYear, input.owner);
        push(ligne.id, "in_year", Math.abs(inYearCents), classified, provenance, fingerprint);
      }
    }
    const preOpCents = toCents(ligne.montantPreExploitation);
    if (preOpCents > 0) {
      push(ligne.id, "pre_operational", preOpCents, unresolved(PRE_OPERATIONAL_UNPROVEN, "SAV-031:pre_operational"), provenance, fingerprint);
    }
  }

  // Charges de copropriété sans type : ignorées par `registry-to-compute-input` (aucune ligne) → jamais silencieuses ici.
  for (const charge of [...(input.registryCharges ?? [])].sort((a, b) => (a.id < b.id ? -1 : 1))) {
    if (charge.category !== "copropriete" || charge.coproType !== undefined) continue;
    if (!Number.isFinite(charge.amount)) {
      blockers.push({ code: "INVALID_AMOUNT", sourceId: charge.id, message: `Charge « ${charge.id} » : montant non fini.` });
      continue;
    }
    const cents = toCents(charge.amount);
    if (cents <= 0) continue;
    push(charge.id, "untyped_copro", cents, unresolved(
      "Appel de fonds de copropriété sans type : ≠ automatiquement B (charge courante / fonds travaux / dépense capitalisée).",
      "SAV-031:copro_untyped",
      "UNRESOLVED",
      ["B", "EXCLUDED"],
    ), `f012:${charge.provenance}`, fingerprintChargeLineSource({ lineId: charge.id, fiscalYear: input.fiscalYear, amountCents: cents, category: charge.category }));
  }

  return { contributions: sortContributions(out), blockers };
}
