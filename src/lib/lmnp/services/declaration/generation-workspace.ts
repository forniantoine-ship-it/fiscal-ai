/**
 * R2C.3b — entrée de génération PAR WORKSPACE, DORMANTE : aucun appelant de production (tests uniquement). R2C.3c décidera
 * de son branchement.
 *
 *   Workspace ─┬─ legacy_mono → runDeclarationGeneration(draft, …)                   (chemin historique, à l'identique)
 *              ├─ scoped mono → runDeclarationGeneration(vue plate du bien, …)       (R2C.3c2a : historique, via `resolveConsolidationInput`)
 *              └─ scoped multi → collectPropertyFiscalContributions
 *                                → consolidateFiscalContributions
 *                                → buildPropertyImmobilisations (par bien) → consolidatePropertyImmobilisations
 *                                → adaptateur consolidé → FiscalEngineInputs
 *                                → produceFiscalResult  (EXACTEMENT UNE FOIS, sur l'activité)
 *                                → produceLiasseStage → assembleGenerationOutput  (SHARED CORE de run-declaration-generation)
 *
 * Un seul moteur fiscal : les contributions par bien sont des entrées de consolidation et de traçabilité, jamais un calcul
 * (ni FiscalResult, ni déficit, ni stock d'amortissements par bien). Aucune date de mise en service globale n'est choisie.
 * Le service est PUR : il ne dispatche rien, ne persiste rien (ni l'origine d'un bien) et ne lit aucun état d'interface
 * (`activePropertyId`…). Il retourne un résultat de même forme que le mono, persistable à la racine.
 *
 * Bornes de R2C.3b (tous fail-closed, jamais d'allocation) : charges communes, prêt partagé, ouverture d'exercice non
 * attribuable (R2C.5), stock d'amortissements reportés > 0 (multi_property_historical_ard_not_supported) et amortissement
 * non déduit de l'exercice > 0 (multi_property_39c_allocation_not_supported : TRF-0035 par bien non implémenté).
 */
import type { Anomaly } from "@/runtime";
import { inventoryOfBiens } from "./generation-bilan-inputs";
import { exactOnlyChargeRecordIds, LEGACY_PROXY_OMITS_EXACT_CHARGES_CODE } from "./legacy-proxy-guard";
import { produceFiscalResult as produceFiscalResultReal } from "@/runtime/capabilities/f006/produce-fiscal-result";
import { sumEuros } from "@/runtime/capabilities/f006/cents";
import type { BilanInputs } from "@/runtime/capabilities/bilan/types";
import type { Dispense2033ADecision } from "@/runtime/capabilities/rfs/dispense-2033a";
import type { ConservationDetail2033B } from "@/runtime/capabilities/rfs/projection/detail-charges-2033b";
import type { ImmobilisationsBienRfs } from "@/runtime/capabilities/rfs/types";
import { identiteFromDeclarationDraft } from "@/lib/lmnp/services/f007/draft-to-liasse-inputs";
import type { FiscalEngineOutput, FiscalYear } from "@/lib/lmnp/types/domain";
import type { FiscalYearOpening } from "@/lib/lmnp/services/fiscal-year-opening/types";
import type { PersistedWorkspace } from "@/lib/lmnp/store/persistence";
import { readBienDrafts, resolveConsolidationInput, scopedBienView } from "@/lib/lmnp/dossier/bien-draft";
import {
  buildFiscalEngineInputsFromConsolidation,
  collectPropertyFiscalContributions,
  consolidateFiscalContributions,
  type PropertyEntryMode,
} from "@/lib/lmnp/dossier/fiscal-consolidation";
import {
  buildPropertyImmobilisations,
  consolidatePropertyImmobilisations,
  resolveMultiPropertyCharges2033BDetail,
  rfsEmpruntsMulti,
  type MultiPropertyCharges2033BDetail,
  type PropertyOpening,
} from "@/lib/lmnp/dossier/property-immobilisations";
import {
  MULTI_PROPERTY_39C_ALLOCATION_NOT_SUPPORTED,
  MULTI_PROPERTY_HISTORICAL_ARD_NOT_SUPPORTED,
  evaluateMultiPropertyDomain,
  multiPropertyDomainFactsFromWorkspace,
  multiPropertyDomainFactsOfFiscalResult,
  type MultiPropertyDomainFacts,
} from "@/lib/lmnp/dossier/multi-property-domain";
import {
  IMMOBILISATIONS_CONTINUITY_RECONCILIATION_FAILED,
  assembleGenerationOutput,
  produceLiasseStage,
  runDeclarationGeneration,
  type DeclarationGenerationResult,
} from "./run-declaration-generation";

// Codes historiques du moteur : définis UNE fois dans la garde de domaine (ADR-011), ré-exportés ici pour compatibilité.
export { MULTI_PROPERTY_HISTORICAL_ARD_NOT_SUPPORTED, MULTI_PROPERTY_39C_ALLOCATION_NOT_SUPPORTED };

/** Preuve d'un bien, fournie explicitement par l'appelant (jamais déduite de l'ordre ni de l'ancienneté des biens). */
export type PropertyGenerationProof = {
  /** Origine établie du bien. Indispensable dès que l'exercice porte un indice de reprise. */
  entryMode?: PropertyEntryMode;
  /** Ouverture comptable PROPRE au bien (clôture N-1 du bien) — jamais dérivée d'une ouverture d'exercice scalaire. */
  opening?: PropertyOpening;
};

export type WorkspaceGenerationOptions = {
  // Paramètres historiques de `runDeclarationGeneration` — transmis tels quels au chemin mono.
  stocksOuverture?: FiscalEngineOutput["stocks"];
  bilanInputs?: BilanInputs;
  dispense2033AIntake?: { caReferenceN1Declaree?: number; decision?: Dispense2033ADecision };
  continuity?: Parameters<typeof runDeclarationGeneration>[5];
  fiscalYearOpening?: FiscalYearOpening;
  // Multi-bien.
  properties?: Readonly<Record<string, PropertyGenerationProof>>;
  /** Seam : charges communes explicites — toujours bloquantes (aucun modèle d'allocation). */
  commonCharges?: readonly unknown[];
  /** Injection du moteur fiscal (tests : comptage des appels). Défaut : F-006 réel. */
  engine?: { produceFiscalResult: typeof produceFiscalResultReal };
};

export type WorkspaceBlockingReason = { code: string; propertyId?: string; field?: string; message?: string };

export type WorkspaceGenerationResult =
  | DeclarationGenerationResult
  | { status: "blocked"; anomalies: Anomaly[]; blockingReasons: WorkspaceBlockingReason[] };

type GenerationWorkspace = Pick<PersistedWorkspace, "properties" | "fiscalYear" | "documents" | "declarationDraft">;

/**
 * R2C.3c2a — une `continuity` ne vaut ouverture/continuation que si elle porte un fait d'ouverture : `immobilisationsOuverture`,
 * `repriseHistoriqueEnContinuite` (seuls champs qui pilotent une ouverture dans `runDeclarationGeneration`), ou un fait de
 * continuation (`previousFiscalYearId`, `continuiteNativeVerifiee` : un exercice précédent existe — jamais vrai d'un premier
 * exercice). Choix fail-closed pour le multi : une continuation scalaire n'est attribuable à aucun bien (R2C.5).
 * Les autres champs (`composantsF012Merged`, `propertyId`) ne sont pas une ouverture : `ValidationDocumentStep` transmet TOUJOURS
 * cet objet, sa seule existence ne dit rien d'une ouverture non attribuable.
 */
function continuityCarriesOpening(continuity: WorkspaceGenerationOptions["continuity"]): boolean {
  return Boolean(
    continuity?.immobilisationsOuverture ||
      continuity?.repriseHistoriqueEnContinuite ||
      continuity?.previousFiscalYearId ||
      continuity?.continuiteNativeVerifiee,
  );
}

function blockedFromReasons(blockingReasons: WorkspaceBlockingReason[]): WorkspaceGenerationResult {
  return {
    status: "blocked",
    blockingReasons,
    anomalies: blockingReasons.map((reason) => ({
      severity: "error" as const,
      field: reason.field ?? reason.propertyId ?? "workspace",
      message: `${reason.code}${reason.propertyId ? `@${reason.propertyId}` : ""}${reason.message ? `: ${reason.message}` : ""}`,
    })),
  };
}

/**
 * O2 (ARB-8, cutover technique) — l'exercice porte-t-il un indice de reprise ? Sans indice, les biens sont natifs ; avec
 * indice, l'origine d'un bien ne peut venir que d'une preuve propre à ce bien (`options.properties[id].entryMode`).
 */
function exerciseCarriesTakeoverIndicium(fiscalYear: FiscalYear): boolean {
  return Boolean(
    fiscalYear.externalTakeoverOpening ||
      fiscalYear.repriseHistoriqueEnContinuite ||
      fiscalYear.immobilisationsOuverture ||
      fiscalYear.priorHistoryDeclaration?.status === "EXTERNAL_HISTORY",
  );
}

/** Détail 2033-B conservé PAR BIEN (R2C.2) → contrat du mapper 2033-B. Un bien non conservé : 242/244 non publiées. */
function toConservationDetail(multi: MultiPropertyCharges2033BDetail): ConservationDetail2033B {
  const attendu = sumEuros(multi.parBien.map((item) => item.detail.attendu));
  const attribue = sumEuros(multi.parBien.map((item) => item.detail.attribue));
  return {
    status: multi.status,
    attendu,
    attribue,
    ecart: sumEuros([attendu, -attribue]),
    ...(multi.status === "CONSERVE" && multi.ligne244 !== undefined ? { ligne244: multi.ligne244 } : {}),
    ...(multi.status === "CONSERVE" && multi.ligne242 !== undefined ? { ligne242: multi.ligne242 } : {}),
    raisons: multi.raisons.map((item) => `bien ${item.propertyId} : ${item.raison}`),
  };
}

/**
 * Entrée de génération de PRODUCTION : mono inchangé ; multi = GARDE DE DOMAINE (ADR-011) puis moteur. Un dossier multi hors
 * domaine est BLOQUÉ avec des motifs stables (`multi_property_*`), F-006 n'étant alors pas appelé quand le motif est connu
 * avant calcul. Jamais de best effort.
 */
export function runDeclarationGenerationFromWorkspace(
  workspace: GenerationWorkspace,
  options: WorkspaceGenerationOptions = {},
): WorkspaceGenerationResult {
  return generateFromWorkspace(workspace, options, true);
}

/**
 * MOTEUR TECHNIQUE multi, SANS garde de domaine : il prouve l'arithmétique consolidée (déficits antérieurs, ouvertures par bien,
 * ARD…) au-delà du domaine produit. Réservé aux tests du moteur : aucun fichier de production ne doit l'importer (test source
 * d'architecture). Le chemin utilisateur est `runDeclarationGenerationFromWorkspace`.
 */
export function runDeclarationGenerationFromWorkspaceTechnical(
  workspace: GenerationWorkspace,
  options: WorkspaceGenerationOptions = {},
): WorkspaceGenerationResult {
  return generateFromWorkspace(workspace, options, false);
}

function generateFromWorkspace(
  workspace: GenerationWorkspace,
  options: WorkspaceGenerationOptions,
  enforceDomain: boolean,
): WorkspaceGenerationResult {
  // INT-4.1 — le proxy historique ne lit ni charge d'activité globale ni avis de CFE : refus explicite plutôt qu'omission.
  const omitted = exactOnlyChargeRecordIds(workspace.declarationDraft, workspace.fiscalYear.year);
  if (omitted.length > 0) {
    return blockedFromReasons([{ code: LEGACY_PROXY_OMITS_EXACT_CHARGES_CODE, message: `charges collectées non lisibles par le calcul historique : ${omitted.join(", ")}` }]);
  }
  const view = readBienDrafts(workspace);

  // MONO — délégation stricte au chemin historique : ni collecte, ni consolidation, ni adaptateur multi.
  if (view.mode === "legacy_mono") {
    return runDeclarationGeneration(
      workspace.declarationDraft,
      workspace.fiscalYear.year,
      options.stocksOuverture,
      options.bilanInputs,
      options.dispense2033AIntake,
      options.continuity,
      options.fiscalYearOpening,
    );
  }
  if (view.mode === "unresolved") return blockedFromReasons([{ code: view.reason }]);
  if (view.mode === "none") return blockedFromReasons([{ code: "no_property" }]);

  // SCOPED MONO (R2C.3c2a) — « scoped != multi » : un dossier scopé à UN seul bien est un dossier mono. Même contrat que
  // `resolveConsolidationInput` (invariants R1/R2, aucune seconde définition) : sa vue plate canonique alimente le chemin
  // historique, verbatim. La RFS n'a jamais la forme multi (`immobilisationsParBien`) : le marqueur Cerfa de 3c1 reste fiable.
  const consolidationInput = resolveConsolidationInput(workspace);
  if (consolidationInput.kind === "single_declaration") {
    return runDeclarationGeneration(
      consolidationInput.draft,
      workspace.fiscalYear.year,
      options.stocksOuverture,
      options.bilanInputs,
      options.dispense2033AIntake,
      options.continuity,
      options.fiscalYearOpening,
    );
  }
  // Scoped mono refusé par ses propres invariants (charges à revoir, documents non attribués…) : refus structuré, jamais
  // un pipeline multi pour un dossier mono. Seul `multi_property_consolidation_not_supported` désigne un vrai multi.
  if (!consolidationInput.reasons.includes("multi_property_consolidation_not_supported")) {
    return blockedFromReasons(consolidationInput.reasons.map((code) => ({ code })));
  }

  // MULTI (dossier scopé) — préparation consolidée.
  const fiscalYear = workspace.fiscalYear;
  const exercice = fiscalYear.year;
  const openingInputs = { stocksOuverture: options.stocksOuverture, continuity: options.continuity, fiscalYearOpening: options.fiscalYearOpening };
  /**
   * Refus d'un dossier multi : motifs historiques du moteur CONSERVÉS tels quels, auxquels s'ajoutent les motifs de domaine
   * stables (garde unique ADR-011) lorsque la garde est appliquée.
   */
  const block = (seamReasons: WorkspaceBlockingReason[], extraFacts: Partial<MultiPropertyDomainFacts> = {}): WorkspaceGenerationResult => {
    if (!enforceDomain) return blockedFromReasons(seamReasons);
    const base = multiPropertyDomainFactsFromWorkspace(workspace, openingInputs);
    const verdict = evaluateMultiPropertyDomain({
      ...base,
      ...extraFacts,
      seamBlocks: [
        ...(base.seamBlocks ?? []),
        ...seamReasons.map((reason) => ({ code: reason.code, ...(reason.propertyId !== undefined ? { propertyId: reason.propertyId } : {}) })),
      ],
    });
    const domainReasons: WorkspaceBlockingReason[] =
      verdict.status === "UNSUPPORTED"
        ? verdict.reasons
            .filter((reason) => !seamReasons.some((seam) => seam.code === reason.code && seam.propertyId === reason.propertyId))
            .map((reason) => ({ code: reason.code, ...(reason.propertyId !== undefined ? { propertyId: reason.propertyId } : {}), ...(reason.detail !== undefined ? { message: reason.detail } : {}) }))
        : [];
    return blockedFromReasons([...seamReasons, ...domainReasons]);
  };
  // Une ouverture d'exercice RÉELLE fournie par l'appelant est globale (scalaire) : elle n'est attribuable à aucun bien (R2C.5).
  // La simple présence d'un objet `continuity` (toujours transmis par l'écran de validation) n'en est pas une.
  if (continuityCarriesOpening(options.continuity) || options.fiscalYearOpening !== undefined) {
    return block([{ code: "exercise_opening_not_attributable" }]);
  }

  const indicium = exerciseCarriesTakeoverIndicium(fiscalYear);
  const entryModes: Record<string, PropertyEntryMode> = {};
  for (const propertyId of fiscalYear.propertyIds) {
    const mode = options.properties?.[propertyId]?.entryMode ?? (indicium ? undefined : "native");
    if (mode !== undefined) entryModes[propertyId] = mode;
  }

  const collection = collectPropertyFiscalContributions(workspace, { entryModes });
  if (collection.status === "blocked") return block(collection.reasons);
  const { contributions } = collection;

  const stocks = options.stocksOuverture
    ? { deficits: options.stocksOuverture.deficits, amortissementsReportes: options.stocksOuverture.amortissementsReportes }
    : collection.activity.stocksOuverture;
  const activity = {
    ...collection.activity,
    ...(stocks ? { stocksOuverture: stocks } : {}),
    ...(options.commonCharges ? { commonCharges: options.commonCharges } : {}),
  };

  const consolidation = consolidateFiscalContributions(activity, contributions);
  const reasons: WorkspaceBlockingReason[] = [...consolidation.blockingReasons];
  // ARB-7 bis : le stock d'amortissements reportés est un stock d'ACTIVITÉ ; sa consommation par bien n'est pas établie.
  if ((stocks?.amortissementsReportes ?? 0) > 0) reasons.push({ code: MULTI_PROPERTY_HISTORICAL_ARD_NOT_SUPPORTED, field: "stocksOuverture.amortissementsReportes" });
  if (consolidation.status === "blocked" || reasons.length > 0) return block(reasons);

  // ADR-011 — domaine vérifié AVANT tout calcul fiscal : un stock d'ouverture ou un indice d'antériorité/reprise bloque, F-006 n'est pas appelé.
  if (enforceDomain) {
    const preCalculation = evaluateMultiPropertyDomain(multiPropertyDomainFactsFromWorkspace(workspace, openingInputs));
    if (preCalculation.status === "UNSUPPORTED") {
      return blockedFromReasons(preCalculation.reasons.map((reason) => ({
        code: reason.code,
        ...(reason.propertyId !== undefined ? { propertyId: reason.propertyId } : {}),
        ...(reason.detail !== undefined ? { message: reason.detail } : {}),
      })));
    }
  }

  // F-006 : UN SEUL appel, sur l'activité consolidée.
  const engine = options.engine?.produceFiscalResult ?? produceFiscalResultReal;
  const fiscalComputation = engine(buildFiscalEngineInputsFromConsolidation(consolidation.inputs));
  if (!fiscalComputation.result) return { status: "blocked", anomalies: fiscalComputation.anomalies, blockingReasons: [] };
  const fiscalResult = fiscalComputation.result;

  // ARB-7 : résultat global calculable, mais le cycle d'amortissement non déduit par bien (TRF-0035) n'est pas supporté.
  if (fiscalResult.amortNonDeduitExercice > 0) {
    return block(
      [{ code: MULTI_PROPERTY_39C_ALLOCATION_NOT_SUPPORTED, field: "amortNonDeduitExercice" }],
      multiPropertyDomainFactsOfFiscalResult(fiscalResult),
    );
  }

  const root = workspace.declarationDraft ?? { completedSteps: [] };
  const identite = identiteFromDeclarationDraft(workspace.declarationDraft, exercice);
  const liasseStage = produceLiasseStage(fiscalResult, identite);
  if (liasseStage.status === "blocked") return { ...liasseStage, blockingReasons: [] };

  // Immobilisations : un bloc PAR BIEN (règles comptables d'aujourd'hui), réconcilié par bien, jamais fusionné avant.
  const blocks = contributions.map((contribution) =>
    buildPropertyImmobilisations({
      propertyId: contribution.propertyId,
      origin: contribution.entryMode,
      exerciceFiscal: exercice,
      source: { kind: "draft", view: scopedBienView(root, contribution.propertyId)! },
      ...(options.properties?.[contribution.propertyId]?.opening ? { opening: options.properties[contribution.propertyId]!.opening } : {}),
    }),
  );
  const consolidatedImmobilisations = consolidatePropertyImmobilisations(blocks, { amortCalculeGlobal: fiscalResult.amortCalcule });
  const immobilisationReasons: WorkspaceBlockingReason[] = consolidatedImmobilisations.blockingReasons.map((reason) => ({ ...reason }));
  for (const block of blocks) {
    if (block.reconciliation?.status === "fail") {
      immobilisationReasons.push({ code: IMMOBILISATIONS_CONTINUITY_RECONCILIATION_FAILED, propertyId: block.propertyId, field: "immobilisations", message: block.reconciliation.reason });
    }
  }
  if (immobilisationReasons.length > 0) return blockedFromReasons(immobilisationReasons);

  // Jamais « zéro » implicite : un bien sans bloc d'immobilisations est déjà bloqué (property_immobilisations_not_established) ;
  // ce garde-fou refuse toute génération qui publierait des blocs partiels si ce contrat était contourné.
  const incomplete = blocks.filter((block) => block.immobilisations === undefined || block.dotationsExercice === undefined);
  if (incomplete.length > 0) {
    return blockedFromReasons(incomplete.map((block) => ({ code: "property_immobilisations_not_established", propertyId: block.propertyId, field: "immobilisations" })));
  }
  const immobilisationsParBien: ImmobilisationsBienRfs[] = blocks.map((block) => ({
    propertyId: block.propertyId,
    immobilisations: block.immobilisations!,
    dotationsExercice: block.dotationsExercice!,
  }));

  return assembleGenerationOutput({
    fiscalResult,
    identite,
    liasseResult: liasseStage.liasseResult,
    fiscalYear: exercice,
    // SAV-033 — stock de déficits d'ouverture tel qu'injecté dans l'appel F-006 unique (transport pur, aucune allocation par bien).
    deficitsOuverture: {
      source: stocks ? "fiscal_year_stocks_ouverture" : "none",
      deficits: (stocks?.deficits ?? []).map((deficit) => ({ ...deficit })),
    },
    immobilisationsParBien,
    detailCharges2033B: toConservationDetail(resolveMultiPropertyCharges2033BDetail(contributions)),
    emprunts: rfsEmpruntsMulti(consolidation.inputs),
    bilanInputs: options.bilanInputs,
    rentInventory: inventoryOfBiens(fiscalYear.propertyIds, view.biens),
    dispense2033AIntake: options.dispense2033AIntake,
  });
}
