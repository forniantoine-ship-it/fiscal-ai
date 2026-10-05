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
import { toCents } from "@/runtime/capabilities/f006/cents";
import { computeChargesExercice } from "@/runtime/capabilities/f012/compute-charges-exercice";
import { assuranceAnnuelleF011, fraisDossierF011 } from "@/runtime/capabilities/f012/detect-financement-overlap";
import type { Charge } from "@/runtime/capabilities/f012/charge";
import type { ChargeCategorie, ChargesExerciceResult, LigneCharge } from "@/runtime/capabilities/f012/types";
import { collectedToChargeRegistry } from "@/runtime/assistants/f012-charges/collected-to-registry";
import { chargeRegistryToComputeInput } from "@/runtime/assistants/f012-charges/registry-to-compute-input";
import { createBienDraft, readBienDrafts, type BienDraft } from "@/lib/lmnp/dossier/bien-draft";
import type { PersistedWorkspace } from "@/lib/lmnp/store/persistence";
import { adaptF011ToArticle39cContributions } from "./from-f011";
import { adaptF012ToArticle39cContributions, f012LineFingerprint, type F012LineSources } from "./from-f012";
import { adaptF013V2ToArticle39cRent } from "./from-f013-v2";
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
  type ChargeNatureFact,
  type InsuranceNatureFact,
  type ManagementNatureFact,
} from "./qualification-facts";
import { parseQualificationStore, selectQualifications } from "./qualification-store";
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
  const financement = bien.financementCharges;
  const { charges } = computeChargesExercice(
    chargeRegistryToComputeInput(registry, {
      dateMiseEnService: bien.dateMiseEnService,
      fieldSources: state.fieldSources,
      ...(financement
        ? {
            assuranceEmprunteurF011: { exerciceFiscal: financement.exerciceFiscal, montantAnnuel: assuranceAnnuelleF011(financement) },
            fraisDossierF011: { exerciceFiscal: financement.exerciceFiscal, montantAnnuel: fraisDossierF011(financement) },
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
// Reconstruction
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

  // Identité du dossier : fournie par le workspace chargé, comparée à l'attendu. Absente → fail-closed.
  if (workspaceDossierId === undefined || workspaceDossierId === "") {
    blockers.push(blocker("DOSSIER_IDENTITY_MISSING", "Le workspace chargé ne porte aucune identité de dossier.", undefined));
    return finish();
  }
  if (workspaceDossierId !== expectedDossierId) {
    blockers.push(blocker("DOSSIER_MISMATCH", "Workspace chargé depuis un autre dossier que celui attendu.", undefined));
    return finish();
  }

  const view = readBienDrafts(workspace);
  if (view.mode === "none" || view.mode === "unresolved") {
    blockers.push(
      blocker(
        "PROPERTY_SCOPE_UNRESOLVED",
        view.mode === "none" ? "Aucun bien dans l'exercice." : `Biens non résolus (${view.reason}) : jamais le premier bien, jamais le bien actif.`,
        undefined,
      ),
    );
    return finish();
  }

  const propertyIds = [...workspace.fiscalYear.propertyIds].sort();
  for (const propertyId of propertyIds) {
    const scope: Article39cScope = { level: "PROPERTY", propertyId };
    const bien = view.biens[propertyId] ?? createBienDraft(propertyId);

    // --- F013 v2 → L ---------------------------------------------------------
    const rent = adaptF013V2ToArticle39cRent({
      dossierId: expectedDossierId,
      stateDossierId: workspaceDossierId,
      propertyId,
      fiscalYear,
      state: bien.rentReconciliationV2,
    });
    if (rent.status === "DEFINITIVE") contributions.push(rent.contribution);
    else for (const b of rent.blockers) blockers.push({ ...b, scope });

    // --- Qualifications du bien ------------------------------------------------
    const selected = selectQualifications(parseQualificationStore(bien.article39cQualifications), scope, fiscalYear);
    for (const recordId of selected.wrongScopeRecordIds) {
      blockers.push(blocker("QUALIFICATION_WRONG_SCOPE", `Qualification « ${recordId} » d'un autre bien présente dans ce bien : jamais servie.`, scope, recordId));
    }

    // --- F012 → B / ACTIVITY ---------------------------------------------------
    const lines = resolveF012LinesForBien({ bien, fiscalYear, scope });
    const prets = bien.financementCharges?.prets ?? [];
    if (!lines.ok) {
      blockers.push(...lines.blockers);
    } else {
      const f012 = adaptF012ToArticle39cContributions({
        owner: scope,
        fiscalYear,
        lignes: lines.charges.lignes as readonly LigneCharge[],
        natureFacts: mergeNatureFacts(lines.derivedNatureFacts, selected.natureFacts),
        registryCharges: lines.registryCharges,
        lineSources: lines.lineSources,
        ...(bien.financementCharges !== undefined ? { knownLoanIds: prets.map((p) => p.pretId) } : {}),
      });
      contributions.push(...f012.contributions);
      for (const b of f012.blockers) blockers.push({ ...b, scope });
    }

    // --- F011 → B --------------------------------------------------------------
    if (bien.financementCharges === undefined) {
      if (bien.creditDeclaredNoneAt === undefined) {
        blockers.push(blocker("F011_SOURCE_MISSING", "Financement non établi (ni prêt confirmé, ni absence de prêt déclarée) : charges de financement INCONNUES.", scope));
      }
    } else if (bien.financementCharges.exerciceFiscal !== fiscalYear) {
      blockers.push(blocker("FISCAL_YEAR_MISMATCH", `Financement de l'exercice ${bien.financementCharges.exerciceFiscal} pour ${fiscalYear}.`, scope));
    } else {
      const f011 = adaptF011ToArticle39cContributions({
        propertyId,
        fiscalYear,
        prets,
        excludedLoanIds: bien.financementCharges.excludedLoanIds ?? [],
        sharedLoanIds: input.sharedLoanIdsByProperty?.[propertyId] ?? [],
      });
      contributions.push(...f011.contributions);
      for (const b of f011.blockers) blockers.push({ ...b, scope });
    }

    // --- CFE rattachée au bien -------------------------------------------------
    for (const record of selected.cfe) {
      const c = qualifyCfe(record.notice, record.fact);
      if (c !== null) contributions.push(c);
    }
  }

  // --- Niveau activité : CFE de l'exploitant (aucun propertyId) -------------------
  const activityScope: Article39cScope = { level: "ACTIVITY" };
  const activity = selectQualifications(parseQualificationStore(workspace.declarationDraft?.article39cActivityQualifications), activityScope, fiscalYear);
  for (const recordId of activity.wrongScopeRecordIds) {
    blockers.push(blocker("QUALIFICATION_WRONG_SCOPE", `Qualification « ${recordId} » rattachée à un bien dans le store d'activité : jamais servie.`, activityScope, recordId));
  }
  for (const record of activity.cfe) {
    const c = qualifyCfe(record.notice, record.fact);
    if (c !== null) contributions.push(c);
  }

  return finish();
}
