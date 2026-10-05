/**
 * INT-2 — reconstruction PURE des contributions article 39 C depuis un WORKSPACE rechargé.
 *
 *   workspace persisté (reload)
 *     → identité dossier / bien (contrat mono / multi existant, jamais le bien actif de l'UI)
 *     → F013 v2 (état + confirmation) · F012 (collected → registre → `LigneCharge[]` recalculées) · F011 (prêts)
 *     → store de qualifications (faits + empreintes) → adapters INT-1 → `Article39cContribution[]`
 *
 * Aucune valeur fiscale n'est lue d'un résultat persisté : les contributions sont RECALCULÉES depuis les faits. La sortie
 * F012 confirmée (`chargesAssistant`) ne sert qu'à RÉCONCILIER (0 centime) : si les lignes recalculées ne retombent pas
 * exactement sur ses totaux, aucune contribution F012 n'est produite (état bloqué explicite).
 *
 * Fail-closed : identité de dossier absente ou divergente, bien non résolu, source absente (≠ zéro), sortie non confirmée,
 * `dateMiseEnService` absente, F011 non établi, réconciliation en échec, qualification d'un autre bien. Aucun fallback
 * silencieux ; `properties[0]` n'est jamais utilisé (le bien unique d'un mono passe par `readBienDrafts`).
 *
 * NON BRANCHÉ à F006 / `buildFiscalEngineInputs` / consolidation / RFS (INT-2). Le moteur exact reste NOT CONNECTED.
 */
import { fromCents, toCents } from "@/runtime/capabilities/f006/cents";
import { computeChargesExercice } from "@/runtime/capabilities/f012/compute-charges-exercice";
import { assuranceAnnuelleF011, fraisDossierF011, type FinancementChargesSummary } from "@/runtime/capabilities/f012/detect-financement-overlap";
import { effectiveFinancementCharges, resolveCreditState } from "@/lib/lmnp/services/declaration/credit-state";
import type { DeclarationDraft } from "@/lib/lmnp/types";
import type { Charge } from "@/runtime/capabilities/f012/charge";
import type { ChargeCategorie, ChargesExerciceResult, LigneCharge } from "@/runtime/capabilities/f012/types";
import { collectedToChargeRegistry } from "@/runtime/assistants/f012-charges/collected-to-registry";
import { chargeRegistryToComputeInput } from "@/runtime/assistants/f012-charges/registry-to-compute-input";
import { createBienDraft, readBienDrafts, type BienDraft } from "@/lib/lmnp/dossier/bien-draft";
import type { PersistedWorkspace } from "@/lib/lmnp/store/persistence";
import { adaptF011ToArticle39cContributions } from "./from-f011";
import { adaptF012ToArticle39cContributions, f012LineFingerprint, type F012LineSources } from "./from-f012";
import { adaptF013V2ToArticle39cRent } from "./from-f013-v2";
import { adaptF010ToArticle39cContributions } from "./from-f010";
import {
  sortContributions,
  summarizeArticle39cContributions,
  validateArticle39cContributions,
  type Article39cAdapterBlocker,
  type Article39cBlockerCode,
  type Article39cContribution,
  type Article39cScope,
  type Article39cViolation,
} from "./contribution";
import {
  qualifyCfe,
  type AccountingNatureFact,
  type ChargeNatureFact,
  type InsuranceNatureFact,
  type ManagementNatureFact,
} from "./qualification-facts";
import { parseQualificationStore, selectQualifications, type CfeQualificationRecord } from "./qualification-store";
import type { Article39cInsuranceNature, Article39cManagementNature } from "@/runtime/capabilities/f006/qualify-article-39c";

export type Article39cWorkspaceBlocker = Article39cAdapterBlocker & { readonly scope?: Article39cScope };

export type Article39cWorkspaceStatus =
  /** Au moins un blocage : source absente / non confirmée / non réconciliée / identité invalide. */
  | "BLOCKED"
  /** Aucun blocage, mais des montants non résolus ou hors domaine : jamais un résultat définitif. */
  | "NEEDS_QUALIFICATION"
  /** Aucun blocage, aucun non-résolu, aucune violation. */
  | "READY";

export type Article39cWorkspaceResult = {
  readonly status: Article39cWorkspaceStatus;
  readonly dossierId?: string;
  readonly fiscalYear: number;
  readonly contributions: readonly Article39cContribution[];
  readonly blockers: readonly Article39cWorkspaceBlocker[];
  readonly violations: readonly Article39cViolation[];
};

export type Article39cWorkspaceInput = {
  workspace: PersistedWorkspace;
  /** Dossier attendu par l'appelant (autorité serveur / session). */
  expectedDossierId: string;
  /** Prêts partagés entre biens par `propertyId` (garde de domaine multi existante). */
  sharedLoanIdsByProperty?: Readonly<Record<string, readonly string[]>>;
};

/**
 * Prêt partagé (fait EXISTANT, `unsupported_shared_loan` de la consolidation productive) : le même document de prêt
 * (`creditDocumentId`) déclaré sur plusieurs biens. Jamais d'heuristique, jamais d'allocation : tous les prêts de ces
 * biens sont signalés partagés (fail-closed → `OUT_OF_DOMAIN`).
 */
export function deriveSharedLoanIdsByProperty(biens: Readonly<Record<string, BienDraft>>): Record<string, string[]> {
  const byDocument = new Map<string, string[]>();
  for (const [propertyId, bien] of Object.entries(biens)) {
    if (bien.creditDocumentId === undefined) continue;
    byDocument.set(bien.creditDocumentId, [...(byDocument.get(bien.creditDocumentId) ?? []), propertyId]);
  }
  const out: Record<string, string[]> = {};
  for (const owners of byDocument.values()) {
    if (owners.length < 2) continue;
    for (const propertyId of owners) {
      out[propertyId] = [...new Set([...(out[propertyId] ?? []), ...(biens[propertyId]?.financementCharges?.prets ?? []).map((p) => p.pretId)])];
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Nature des sources F012 (dérivée du registre : jamais d'un libellé)
// ---------------------------------------------------------------------------

function gestionNatureOf(charge: Charge): Article39cManagementNature {
  switch (charge.gestionKind) {
    case "gestion":
      return "PROPERTY_MANAGEMENT";
    case "mise_en_location":
      return "LETTING";
    case "etat_des_lieux":
      return "INVENTORY";
    case "autre":
      return "OTHER";
    default:
      return "UNKNOWN";
  }
}

function insuranceNatureOf(charge: Charge): Article39cInsuranceNature {
  if (charge.insuranceKind === "gli") return "GLI";
  if (charge.insuranceKind === "emprunteur") return "BORROWER";
  // « logement » (document) = assurance logement GÉNÉRIQUE : jamais automatiquement PNO.
  if (charge.insuranceKind === "logement") return "UNKNOWN";
  // Aucune nature documentaire : seule la saisie manuelle dans le champ PNO explicite le déclare.
  return charge.category === "assurance_pno" && charge.source === "manual" ? "PNO" : "UNKNOWN";
}

function uniform<T extends string>(natures: readonly T[], unknown: T, mixed: T): T {
  if (natures.length === 0) return unknown;
  const distinct = [...new Set(natures)];
  if (distinct.length === 1) return distinct[0]!;
  return distinct.includes(unknown) ? unknown : mixed;
}

export type F012LinesResolution =
  | {
      readonly ok: true;
      readonly charges: ChargesExerciceResult;
      readonly registryCharges: readonly Charge[];
      readonly lineSources: Readonly<Record<string, F012LineSources>>;
      /** Faits de nature DÉRIVÉS de la source (frais par construction) — jamais d'une réponse. */
      readonly derivedNatureFacts: readonly ChargeNatureFact[];
    }
  | { readonly ok: false; readonly blockers: readonly Article39cWorkspaceBlocker[] };

function blocker(code: Article39cBlockerCode, message: string, scope: Article39cScope | undefined, sourceId?: string): Article39cWorkspaceBlocker {
  return { code, message, ...(sourceId !== undefined ? { sourceId } : {}), ...(scope !== undefined ? { scope } : {}) };
}

const RECONCILED_CATEGORIES = ["taxe_fonciere", "assurance_pno", "assurance_gli", "copropriete", "honoraires_gestion", "travaux", "honoraires_comptable", "frais_bancaires", "divers"] as const satisfies readonly ChargeCategorie[];

function reconcile(computed: ChargesExerciceResult, confirmed: NonNullable<BienDraft["chargesAssistant"]>): string[] {
  const diffs: string[] = [];
  const same = (label: string, a: number | undefined, b: number | undefined) => {
    if (toCents(a ?? 0) !== toCents(b ?? 0)) diffs.push(`${label}: ${a ?? 0} ≠ ${b ?? 0}`);
  };
  same("totalDeductible", computed.totalDeductible, confirmed.totalDeductible);
  same("totalNonDeductible", computed.totalNonDeductible, confirmed.totalNonDeductible);
  same("totalAmortissable", computed.totalAmortissable, confirmed.totalAmortissable);
  same("totalPreExploitation", computed.totalPreExploitation, confirmed.totalPreExploitation);
  for (const category of RECONCILED_CATEGORIES) {
    same(`parCategorie.${category}`, computed.parCategorie[category], confirmed.parCategorie[category]);
  }
  return diffs;
}

/**
 * Recalcule les `LigneCharge[]` d'un bien depuis son état F012 persisté (`collected` = chemin d'écriture canonique) et les
 * RÉCONCILIE avec la sortie confirmée. Exposée pour que les futures collectes (INT-3) calculent l'empreinte COURANTE d'une
 * ligne avant d'enregistrer une réponse.
 */
export function resolveF012LinesForBien(input: {
  bien: BienDraft;
  fiscalYear: number;
  scope: Article39cScope;
}): F012LinesResolution {
  const { bien, fiscalYear, scope } = input;
  const state = bien.chargesAssistantState;
  const confirmed = bien.chargesAssistant;
  if (state === undefined) {
    return { ok: false, blockers: [blocker("F012_SOURCE_MISSING", "Aucun état F012 persisté : charges INCONNUES (jamais zéro, jamais EXCLUDED).", scope)] };
  }
  if (confirmed === undefined || bien.chargesConfirmedAt === undefined) {
    return { ok: false, blockers: [blocker("F012_NOT_CONFIRMED", "Charges F012 non confirmées : aucune contribution exacte.", scope)] };
  }
  if (confirmed.exerciceFiscal !== fiscalYear) {
    return { ok: false, blockers: [blocker("FISCAL_YEAR_MISMATCH", `Sortie F012 de l'exercice ${confirmed.exerciceFiscal} pour ${fiscalYear}.`, scope)] };
  }
  if (bien.dateMiseEnService === undefined || bien.dateMiseEnService === "") {
    return { ok: false, blockers: [blocker("F012_DATE_MISE_EN_SERVICE_MISSING", "Date de mise en service absente : recalcul F012 impossible (jamais de date inventée).", scope)] };
  }

  const registry = collectedToChargeRegistry({
    collected: state.collected,
    profil: state.profil,
    categoryInventory: state.categoryInventory,
    fieldSources: state.fieldSources,
    exercise: fiscalYear,
  });
  // Même construction que l'assistant F012 en production : charges de financement EFFECTIVES (état crédit existant) et
  // total des frais de dossier = somme des prêts (le champ n'existe pas sur `FinancementChargesOutput`).
  const financement = effectiveFinancementCharges(bien as unknown as DeclarationDraft);
  const totalFraisDossier = (financement?.prets ?? []).reduce((acc, p) => acc + (p.fraisDossierDeductibles ?? 0), 0);
  const summary: FinancementChargesSummary | undefined =
    financement !== undefined && (financement.totalAssurance !== undefined || financement.totalCapitalRembourse !== undefined || totalFraisDossier > 0)
      ? {
          totalAssurance: financement.totalAssurance ?? 0,
          totalAssurancePreExploitation: financement.totalAssurancePreExploitation,
          totalFraisDossier,
          totalCapitalRembourse: financement.totalCapitalRembourse ?? 0,
          exerciceFiscal: financement.exerciceFiscal,
        }
      : undefined;
  const { charges } = computeChargesExercice(
    chargeRegistryToComputeInput(registry, {
      dateMiseEnService: bien.dateMiseEnService,
      fieldSources: state.fieldSources,
      ...(summary
        ? {
            assuranceEmprunteurF011: { exerciceFiscal: summary.exerciceFiscal, montantAnnuel: assuranceAnnuelleF011(summary) },
            fraisDossierF011: { exerciceFiscal: summary.exerciceFiscal, montantAnnuel: fraisDossierF011(summary) },
          }
        : {}),
    }),
  );

  const diffs = reconcile(charges, confirmed);
  if (diffs.length > 0) {
    return {
      ok: false,
      blockers: [blocker("F012_RECONCILIATION_MISMATCH", `Lignes recalculées ≠ totaux confirmés (${diffs.join(" ; ")}) : aucune contribution exacte.`, scope)],
    };
  }

  const lineSources: Record<string, F012LineSources> = {};
  const derived: ChargeNatureFact[] = [];
  for (const ligne of charges.lignes) {
    const components = registry.charges.filter((charge) => charge.category === ligne.categorie);
    const tags = new Set<string>();
    const docs = new Set<string>();
    for (const charge of components) {
      if (charge.gestionKind !== undefined) tags.add(`gestionKind:${charge.gestionKind}`);
      if (charge.insuranceKind !== undefined) tags.add(`insuranceKind:${charge.insuranceKind}`);
      if (ligne.categorie === "assurance_pno") tags.add(`source:${charge.source}`);
      for (const id of charge.documentIds ?? []) docs.add(id);
    }
    const sources: F012LineSources = { natureTags: [...tags].sort(), documentIds: [...docs].sort() };
    lineSources[ligne.id] = sources;

    const fingerprint = f012LineFingerprint(ligne, { owner: scope, fiscalYear, sources });
    const provenance = components.length > 0 && components.every((c) => c.source === "document") ? "document" : "declaration";
    if (ligne.categorie === "honoraires_gestion") {
      const nature = uniform(components.map(gestionNatureOf), "UNKNOWN", "OTHER");
      derived.push({ kind: "MANAGEMENT_NATURE", lineId: ligne.id, nature, provenance, sourceFingerprint: fingerprint } satisfies ManagementNatureFact);
    } else if (ligne.categorie === "assurance_pno") {
      const nature = uniform(components.map(insuranceNatureOf), "UNKNOWN", "OTHER");
      derived.push({ kind: "INSURANCE_NATURE", lineId: ligne.id, nature, provenance, sourceFingerprint: fingerprint } satisfies InsuranceNatureFact);
    }
  }
  return { ok: true, charges, registryCharges: registry.charges, lineSources, derivedNatureFacts: derived };
}

/**
 * Combine faits dérivés de la source et réponses du client. La SOURCE fait autorité lorsqu'elle établit une nature ; une
 * réponse ne sert que pour une nature `UNKNOWN` (jamais pour retourner une nature documentaire en B).
 */
function mergeNatureFacts(
  derived: readonly ChargeNatureFact[],
  answers: readonly ChargeNatureFact[],
): ChargeNatureFact[] {
  const out: ChargeNatureFact[] = [];
  const answered = new Map<string, ChargeNatureFact>();
  for (const answer of answers) answered.set(`${answer.kind}|${answer.lineId}`, answer);
  const used = new Set<string>();
  for (const fact of derived) {
    const key = `${fact.kind}|${fact.lineId}`;
    const answer = answered.get(key);
    const unknown = fact.nature === "UNKNOWN";
    if (unknown && answer !== undefined) {
      out.push(answer);
      used.add(key);
    } else {
      out.push(fact);
    }
  }
  for (const [key, answer] of answered) {
    if (!used.has(key) && !derived.some((f) => `${f.kind}|${f.lineId}` === key)) out.push(answer);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Contribution d'UN bien (contrat 39 C exact, dormant)
// ---------------------------------------------------------------------------

export type PropertyArticle39cContribution = {
  readonly propertyId: string;
  readonly fiscalYear: number;
  /** Contributions de ce bien UNIQUEMENT (toutes de portée `PROPERTY` avec CE `propertyId`). */
  readonly contributions: readonly Article39cContribution[];
  readonly blockers: readonly Article39cWorkspaceBlocker[];
  /** Dotation de l'exercice (F014 validé), en centimes : un FAIT d'entrée du moteur, jamais une contribution. */
  readonly dotationCents?: number;
};

/**
 * Rassemble les contributions d'un bien : F013 v2 → L, F012 → B / ACTIVITY / non résolu / EXCLUDED, F011 → B, CFE rattachée
 * au bien, et — si `exactSources` — F010 (frais d'acquisition) et F014 (dotation validée). Ne calcule PAS C : le moteur
 * exact consomme ces contributions ailleurs, une seule fois pour l'activité.
 */
export function buildPropertyArticle39cContribution(input: {
  bien: BienDraft;
  propertyId: string;
  fiscalYear: number;
  expectedDossierId: string;
  stateDossierId: string;
  sharedLoanIds?: readonly string[];
  exactSources?: boolean;
  /** CFE de niveau ACTIVITÉ : aucune liaison à une ligne de bien n'est possible, mais un jumeau « divers » est un conflit. */
  activityCfeRecords?: readonly CfeQualificationRecord[];
}): PropertyArticle39cContribution {
  const { bien, propertyId, fiscalYear } = input;
  const scope: Article39cScope = { level: "PROPERTY", propertyId };
  const blockers: Article39cWorkspaceBlocker[] = [];
  const contributions: Article39cContribution[] = [];
  const effectiveFinancement = effectiveFinancementCharges(bien as unknown as DeclarationDraft);
  const prets = effectiveFinancement?.prets ?? [];

  // --- F013 v2 → L -----------------------------------------------------------
  const rent = adaptF013V2ToArticle39cRent({
    dossierId: input.expectedDossierId,
    stateDossierId: input.stateDossierId,
    propertyId,
    fiscalYear,
    state: bien.rentReconciliationV2,
  });
  if (rent.status === "DEFINITIVE") contributions.push(rent.contribution);
  else for (const b of rent.blockers) blockers.push({ ...b, scope });

  // --- Qualifications du bien --------------------------------------------------
  const selected = selectQualifications(parseQualificationStore(bien.article39cQualifications), scope, fiscalYear);
  for (const recordId of selected.wrongScopeRecordIds) {
    blockers.push(blocker("QUALIFICATION_WRONG_SCOPE", `Qualification « ${recordId} » d'un autre bien présente dans ce bien : jamais servie.`, scope, recordId));
  }
  if (bien.chargesNatureReview !== undefined) {
    blockers.push(blocker("CHARGES_NATURE_NEEDS_REVIEW", "Charges d'un dossier mono historique de nature inconnue (peut-être communes) : à revoir, jamais ventilées.", scope));
  }

  // --- F012 → B / ACTIVITY (liaison CFE explicite, dedupe F011) -----------------
  const lines = resolveF012LinesForBien({ bien, fiscalYear, scope });
  if (!lines.ok) {
    blockers.push(...lines.blockers);
  } else {
    const lignes = lines.charges.lignes as readonly LigneCharge[];
    const excludedLines: Record<string, { ruleId: string; reason: string }> = {};
    for (const record of selected.cfe as readonly CfeQualificationRecord[]) {
      const amount = record.notice.amountCents;
      if (record.diversLinkage?.kind === "LINKED") {
        const linked = lignes.find((l) => l.id === (record.diversLinkage as { lineId: string }).lineId);
        const linkedCents = linked === undefined ? undefined : toCents(linked.montantDeductible) + toCents(linked.montantPreExploitation);
        if (linked === undefined || linkedCents !== amount) {
          blockers.push(blocker("CFE_DIVERS_CONFLICT", "CFE dédiée liée à une ligne de charges diverses absente ou de montant différent : conflit explicite, aucune suppression arbitraire.", scope, record.recordId));
        } else {
          excludedLines[linked.id] = { ruleId: "INT3:cfe_dedicated_source", reason: "Ligne « divers » désignée par le client comme étant la CFE déclarée : portée par la source CFE dédiée, jamais comptée deux fois." };
        }
      } else if (record.diversLinkage === undefined || record.diversLinkage.kind === "UNKNOWN") {
        const twin = lignes.some(
          (l) => l.categorie === "divers" && l.exclusionReason !== "f011_overlap" && l.deductibilite === "deductible" && toCents(l.montantDeductible) + toCents(l.montantPreExploitation) === amount,
        );
        if (twin) {
          blockers.push(blocker("CFE_DIVERS_CONFLICT", "Une ligne de charges diverses a le même montant que la CFE déclarée : s'agit-il de la même dépense ? Conflit explicite (lier ou déclarer distinct).", scope, record.recordId));
        }
      }
    }
    for (const record of input.activityCfeRecords ?? []) {
      const linkage = record.diversLinkage;
      const linesCents = (l: LigneCharge): number => toCents(l.montantDeductible) + toCents(l.montantPreExploitation);
      if (linkage?.kind === "LINKED" && linkage.propertyId === propertyId) {
        const linked = lignes.find((l) => l.id === linkage.lineId);
        if (linked === undefined || linesCents(linked) !== record.notice.amountCents) {
          blockers.push(blocker("CFE_DIVERS_CONFLICT", "CFE de l'activité liée à une ligne de charges diverses absente ou de montant différent : conflit explicite.", scope, record.recordId));
        } else {
          excludedLines[linked.id] = { ruleId: "INT4:cfe_dedicated_source", reason: "Ligne « divers » désignée par le client comme étant la CFE de l'activité : portée par la source CFE dédiée, jamais comptée deux fois." };
        }
        continue;
      }
      const twin = lignes.some((l) => l.categorie === "divers" && l.exclusionReason !== "f011_overlap" && l.deductibilite === "deductible" && linesCents(l) === record.notice.amountCents);
      if (twin && linkage?.kind !== "DECLARED_DISTINCT" && linkage?.kind !== "LINKED") {
        blockers.push(blocker("CFE_DIVERS_CONFLICT", "Une ligne de charges diverses de ce bien a le même montant que la CFE de l'activité : même dépense ? Conflit explicite.", scope, record.recordId));
      }
    }
    const f011FeeCentsByLoan: Record<string, { application: number; guarantee: number }> = {};
    for (const pret of prets) {
      f011FeeCentsByLoan[pret.pretId] = { application: toCents(pret.fraisDossierDeductibles), guarantee: toCents(pret.garantieDeductible) };
    }
    const f012 = adaptF012ToArticle39cContributions({
      owner: scope,
      fiscalYear,
      lignes,
      natureFacts: mergeNatureFacts(lines.derivedNatureFacts, selected.natureFacts),
      registryCharges: lines.registryCharges,
      lineSources: lines.lineSources,
      excludedLines,
      f011FeeCentsByLoan,
      ...(effectiveFinancement !== undefined ? { knownLoanIds: prets.map((p) => p.pretId) } : {}),
    });
    contributions.push(...f012.contributions);
    for (const b of f012.blockers) blockers.push({ ...b, scope });
  }

  // --- F011 → B (état crédit existant : jamais « aucun crédit » déduit d'une absence) ----------------
  const creditState = resolveCreditState(bien as unknown as DeclarationDraft);
  const financement = effectiveFinancementCharges(bien as unknown as DeclarationDraft);
  if (creditState.etat === "AUCUN_CREDIT_ETABLI") {
    // Aucun crédit déclaré explicitement : aucune charge de financement, ce n'est pas un inconnu.
  } else if (financement === undefined || creditState.etat === "INCONNU" || creditState.etat === "AMBIGU") {
    blockers.push(
      blocker(
        "F011_SOURCE_MISSING",
        creditState.etat === "AMBIGU"
          ? `État du crédit ambigu (${creditState.raisons.join(" ; ")}) : charges de financement non établies.`
          : "Financement non établi (ni prêt confirmé, ni absence de prêt déclarée) : charges de financement INCONNUES.",
        scope,
      ),
    );
  } else if (financement.exerciceFiscal !== fiscalYear) {
    blockers.push(blocker("FISCAL_YEAR_MISMATCH", `Financement de l'exercice ${financement.exerciceFiscal} pour ${fiscalYear}.`, scope));
  } else {
    const f011 = adaptF011ToArticle39cContributions({
      propertyId,
      fiscalYear,
      prets: financement.prets,
      excludedLoanIds: financement.excludedLoanIds ?? [],
      sharedLoanIds: input.sharedLoanIds ?? [],
    });
    contributions.push(...f011.contributions);
    for (const b of f011.blockers) blockers.push({ ...b, scope });
  }

  // --- CFE rattachée au bien -----------------------------------------------------
  for (const record of selected.cfe) {
    const c = qualifyCfe(record.notice, record.fact);
    if (c !== null) contributions.push(c);
  }

  let dotationCents: number | undefined;
  if (input.exactSources === true) {
    // --- F010 : frais d'acquisition ------------------------------------------------
    const f010 = adaptF010ToArticle39cContributions({
      propertyId,
      fiscalYear,
      logementAmortissement: bien.logementAmortissement,
      state: bien.logementAssistantState,
    });
    contributions.push(...f010.contributions);
    for (const b of f010.blockers) blockers.push({ ...b, scope });

    // --- F014 : dotation validée de l'exercice -------------------------------------
    const amort = bien.amortissementAssistant;
    if (amort === undefined || amort.status !== "validated" || amort.exerciceFiscal !== fiscalYear || !Number.isFinite(amort.totalDotations) || amort.totalDotations < 0) {
      blockers.push(blocker("F014_NOT_VALIDATED", "Dotation d'amortissement non validée pour l'exercice : dotation INCONNUE (jamais zéro).", scope));
    } else {
      dotationCents = toCents(amort.totalDotations);
    }
  }

  return { propertyId, fiscalYear, contributions: sortContributions(contributions), blockers, ...(dotationCents !== undefined ? { dotationCents } : {}) };
}

// ---------------------------------------------------------------------------
// Contribution de l'ACTIVITÉ (jamais de propertyId)
// ---------------------------------------------------------------------------

export type ActivityArticle39cContribution = {
  readonly fiscalYear: number;
  /** Contributions de niveau ACTIVITÉ uniquement : aucune n'a de `propertyId`. */
  readonly contributions: readonly Article39cContribution[];
  readonly blockers: readonly Article39cWorkspaceBlocker[];
};

/**
 * Faits réellement globaux : CFE de l'exploitant (store d'activité) et charges d'activité globales fournies explicitement
 * (`activityLines`, structure dormante ADR-011 §11 — aucun F012 niveau activité n'est persisté aujourd'hui). Une charge
 * globale classée B reste bloquée (`common_charges_not_supported`) ; une charge ACTIVITY globale n'est jamais répartie.
 */
export function buildActivityArticle39cContribution(input: {
  fiscalYear: number;
  store: unknown;
  activityLines?: readonly LigneCharge[];
}): ActivityArticle39cContribution {
  const scope: Article39cScope = { level: "ACTIVITY" };
  const blockers: Article39cWorkspaceBlocker[] = [];
  const contributions: Article39cContribution[] = [];
  const selected = selectQualifications(parseQualificationStore(input.store), scope, input.fiscalYear);
  for (const recordId of selected.wrongScopeRecordIds) {
    blockers.push(blocker("QUALIFICATION_WRONG_SCOPE", `Qualification « ${recordId} » rattachée à un bien dans le store d'activité : jamais servie.`, scope, recordId));
  }
  for (const record of selected.cfe) {
    const c = qualifyCfe(record.notice, record.fact);
    if (c !== null) contributions.push(c);
  }
  // INT-4 — charges globales PERSISTÉES (store d'activité) : une ligne F012 par charge, jamais rattachée à un bien.
  const persistedLines: LigneCharge[] = [];
  const persistedSources: Record<string, F012LineSources> = {};
  const persistedFacts: AccountingNatureFact[] = [];
  for (const record of selected.activityCharges) {
    const c = record.charge;
    const euros = fromCents(c.amountCents);
    const accounting = c.nature !== "OTHER";
    persistedLines.push({
      id: c.sourceId,
      description: c.description,
      montant: euros,
      categorie: accounting ? "honoraires_comptable" : "divers",
      deductibilite: "deductible",
      montantDeductible: euros,
      montantPreExploitation: 0,
      montantAmortissable: 0,
      source: "manual",
    });
    persistedSources[c.sourceId] = { natureTags: [`activity-charge:${c.nature}`], documentIds: [...(c.documentIds ?? [])].sort() };
  }
  if (persistedLines.length > 0) {
    for (const ligne of persistedLines) {
      const record = selected.activityCharges.find((r) => r.charge.sourceId === ligne.id)!;
      if (record.charge.nature === "OTHER") continue;
      persistedFacts.push({
        kind: "ACCOUNTING_NATURE",
        lineId: ligne.id,
        nature: record.charge.nature,
        provenance: record.charge.provenance,
        sourceFingerprint: f012LineFingerprint(ligne, { owner: scope, fiscalYear: input.fiscalYear, sources: persistedSources[ligne.id] }),
      });
    }
    const f012 = adaptF012ToArticle39cContributions({
      owner: scope,
      fiscalYear: input.fiscalYear,
      lignes: persistedLines,
      natureFacts: [...selected.natureFacts, ...persistedFacts],
      lineSources: persistedSources,
    });
    contributions.push(...f012.contributions);
    for (const b of f012.blockers) blockers.push({ ...b, scope });
  }
  if ((input.activityLines?.length ?? 0) > 0) {
    const f012 = adaptF012ToArticle39cContributions({
      owner: scope,
      fiscalYear: input.fiscalYear,
      lignes: input.activityLines!,
      natureFacts: selected.natureFacts,
    });
    contributions.push(...f012.contributions);
    for (const b of f012.blockers) blockers.push({ ...b, scope });
  }
  return { fiscalYear: input.fiscalYear, contributions: sortContributions(contributions), blockers };
}

// ---------------------------------------------------------------------------
// Reconstruction depuis un workspace (INT-2 : sans F010 / F014)
// ---------------------------------------------------------------------------

export function buildArticle39cContributionsFromWorkspace(input: Article39cWorkspaceInput): Article39cWorkspaceResult {
  const { workspace, expectedDossierId } = input;
  const fiscalYear = workspace.fiscalYear.year;
  const workspaceDossierId = workspace.fiscalYear.dossierId;
  const blockers: Article39cWorkspaceBlocker[] = [];
  const contributions: Article39cContribution[] = [];

  const finish = (): Article39cWorkspaceResult => {
    const sorted = sortContributions(contributions);
    const violations = validateArticle39cContributions(sorted);
    const summary = summarizeArticle39cContributions(sorted);
    const status: Article39cWorkspaceStatus =
      blockers.length > 0 || violations.length > 0
        ? "BLOCKED"
        : summary.hasUnresolved || summary.hasOutOfDomain
          ? "NEEDS_QUALIFICATION"
          : "READY";
    return { status, ...(workspaceDossierId !== undefined ? { dossierId: workspaceDossierId } : {}), fiscalYear, contributions: sorted, blockers, violations };
  };

  const identity = resolveWorkspaceIdentity(workspace, expectedDossierId);
  if (!identity.ok) {
    blockers.push(...identity.blockers);
    return finish();
  }

  for (const propertyId of identity.propertyIds) {
    const part = buildPropertyArticle39cContribution({
      bien: identity.biens[propertyId] ?? createBienDraft(propertyId),
      propertyId,
      fiscalYear,
      expectedDossierId,
      stateDossierId: identity.dossierId,
      sharedLoanIds: input.sharedLoanIdsByProperty?.[propertyId] ?? [],
    });
    contributions.push(...part.contributions);
    blockers.push(...part.blockers);
  }

  const activity = buildActivityArticle39cContribution({ fiscalYear, store: workspace.declarationDraft?.article39cActivityQualifications });
  contributions.push(...activity.contributions);
  blockers.push(...activity.blockers);
  return finish();
}

/** Identité dossier + biens du workspace chargé (contrat mono / multi existant) — fail-closed. */
export function resolveWorkspaceIdentity(
  workspace: PersistedWorkspace,
  expectedDossierId: string,
):
  | { ok: true; dossierId: string; propertyIds: string[]; biens: Readonly<Record<string, BienDraft>> }
  | { ok: false; blockers: Article39cWorkspaceBlocker[] } {
  const dossierId = workspace.fiscalYear.dossierId;
  if (dossierId === undefined || dossierId === "") {
    return { ok: false, blockers: [blocker("DOSSIER_IDENTITY_MISSING", "Le workspace chargé ne porte aucune identité de dossier.", undefined)] };
  }
  if (dossierId !== expectedDossierId) {
    return { ok: false, blockers: [blocker("DOSSIER_MISMATCH", "Workspace chargé depuis un autre dossier que celui attendu.", undefined)] };
  }
  const view = readBienDrafts(workspace);
  if (view.mode === "none" || view.mode === "unresolved") {
    return {
      ok: false,
      blockers: [
        blocker(
          "PROPERTY_SCOPE_UNRESOLVED",
          view.mode === "none" ? "Aucun bien dans l'exercice." : `Biens non résolus (${view.reason}) : jamais le premier bien, jamais le bien actif.`,
          undefined,
        ),
      ],
    };
  }
  return { ok: true, dossierId, propertyIds: [...workspace.fiscalYear.propertyIds].sort(), biens: view.biens };
}
