import type { Anomaly } from "@/runtime";
import { produceFiscalResult } from "@/runtime/capabilities/f006/produce-fiscal-result";
import { produceLiasse } from "@/runtime/capabilities/f007/produce-liasse";
import { assemblePatrimoine } from "@/runtime/capabilities/bilan/assemble-patrimoine";
import type { BilanInputs } from "@/runtime/capabilities/bilan/types";
import { buildFiscalRepresentation } from "@/runtime/capabilities/rfs/build-fiscal-representation";
import {
  resolveCaReferenceN1Fact,
  resolveDispense2033AEligibilite,
  type Dispense2033ADecision,
} from "@/runtime/capabilities/rfs/dispense-2033a";
import type { FiscalRepresentation } from "@/runtime/capabilities/rfs/types";
import {
  assembleLiasseFromRfs,
  type LiasseFromRfs,
} from "@/runtime/capabilities/rfs/projection/assemble-liasse-from-rfs";
import { identiteFromDeclarationDraft } from "@/lib/lmnp/services/f007/draft-to-liasse-inputs";
import { financementChargesForGeneration } from "@/lib/lmnp/services/f011/credit-financing-to-financement-charges";
import { resolveEmpruntsForRfs } from "./resolve-emprunts-for-rfs";
import {
  TAXE_FONCIERE_INTEGRITY_CHECK_VERSION,
  detectTaxeFonciereLegacyRisk,
  isTaxeFonciereIntegrityCheckValid,
} from "@/runtime/assistants/f012-charges/taxe-fonciere-legacy-integrity";
import type {
  DeclarationDraft,
  FiscalEngineOutput,
  FiscalYear,
  LiasseEngineOutput,
} from "@/lib/lmnp/types/domain";
import type { ComposantNouveau } from "@/runtime/capabilities/f012/types";
import {
  enrichImmobilisationsRfs,
  reconcileImmobilisationsContinuity,
  detailComposantsNouveaux,
  totalDotationComposantsDetail,
} from "@/lib/lmnp/services/dossier/immobilisations-comptables";
import { continueTakeoverSnapshot } from "@/lib/lmnp/services/dossier/continue-takeover-snapshot";
import {
  assertHistoricalInventoryMatchesApplied,
  composeExternalHistoryImmobilisationsRfs,
  EXTERNAL_HISTORY_F012_ACQUISITION_INCOHERENT,
  EXTERNAL_HISTORY_INVENTORY_MISMATCH,
  EXTERNAL_HISTORY_INVENTORY_UNPROJECTABLE,
  selectCurrentYearAcquisitions,
} from "@/lib/lmnp/services/dossier/compose-external-history-immobilisations";
import type { FiscalYearOpening } from "@/lib/lmnp/services/fiscal-year-opening/types";
import { resolveCanonicalOpeningFiscalStocks } from "@/lib/lmnp/services/fiscal-year-opening/resolve-opening-fiscal-stocks";
import { isAvailable } from "@/lib/lmnp/services/fiscal-year-opening/opening-fact";
import {
  applyResolvedOpeningDepreciation,
  resolveOpeningDepreciation,
} from "@/lib/lmnp/services/fiscal-year-opening/resolve-opening-depreciation";
import type { AmortissementPlan } from "@/runtime/capabilities/f010/types";
import { round2 } from "@/runtime/capabilities/f010/types";

/** Code anomalie stable — Blocker #3 Lot C (gate génération). */
export const TAXE_FONCIERE_LEGACY_INTEGRITY_UNRESOLVED = "TAXE_FONCIERE_LEGACY_INTEGRITY_UNRESOLVED";

/** Lot 5 B2 — réconciliation ouverture/clôture immobilisations échouée. */
export const IMMOBILISATIONS_CONTINUITY_RECONCILIATION_FAILED =
  "IMMOBILISATIONS_CONTINUITY_RECONCILIATION_FAILED";

/** P0-2A — inventaire historique RFS ≠ Opening appliqué (anti-S3). */
export {
  EXTERNAL_HISTORY_F012_ACQUISITION_INCOHERENT,
  EXTERNAL_HISTORY_INVENTORY_MISMATCH,
  EXTERNAL_HISTORY_INVENTORY_UNPROJECTABLE,
};

/**
 * Blocker #3 — détection + validité marker uniquement (déterministe, offline).
 * Absent `chargesAssistantState` → pas de blocage V1 (pas de preuve Expense).
 */
export function resolveTaxeFonciereLegacyIntegrityGenerationBlock(
  draft: DeclarationDraft | undefined,
): Anomaly | undefined {
  const state = draft?.chargesAssistantState;
  if (!state) return undefined;
  const risk = detectTaxeFonciereLegacyRisk({ collected: state.collected });
  if (risk.kind !== "certainly_exposed") return undefined;
  const valid = isTaxeFonciereIntegrityCheckValid({
    check: state.taxeFonciereIntegrityCheck,
    expense: state.collected.taxeFonciereExpense,
    currentCheckVersion: TAXE_FONCIERE_INTEGRITY_CHECK_VERSION,
  });
  if (valid) return undefined;
  return {
    severity: "error",
    field: "chargesAssistant",
    message: TAXE_FONCIERE_LEGACY_INTEGRITY_UNRESOLVED,
  };
}

/**
 * Cycle 25 — un dossier "generated" n'est pas forcément une liasse complète :
 * `formulairesManquants` en fait foi. `status: "generated"` reste vrai
 * (F-006/F-007 ont réellement tourné, sans erreur), mais `completude` est ce
 * qui doit gouverner tout wording utilisateur du type "déclaration prête" —
 * jamais `status` seul.
 *
 * P0-2 (audit 2026-09-02) — fonction pure, découplée du type F-007
 * (`LiasseEngineOutput`) : reçoit directement la liste effective de
 * formulaires manquants, quelle que soit sa source (cf. resolveFormulairesManquants
 * ci-dessous, qui préfère `liasseRfs` à `liasseResult` quand disponible).
 */
export type DeclarationCompletude = "partielle" | "complete";

export function declarationCompletude(formulairesManquants: readonly string[]): DeclarationCompletude {
  return formulairesManquants.length === 0 ? "complete" : "partielle";
}

/**
 * P0-2 — source de vérité unique pour "formulaires manquants" côté utilisateur.
 * Préfère `liasseRfs` (2031-SD + 2031-bis + 2033-A/B/C, branché depuis P0-1)
 * quand il est disponible ; recule sur `liasseResult` (F-007, 2031-SD seul)
 * sinon — dossiers persistés avant P0-1, ou tout chemin qui ne pose jamais
 * `liasseRfs`. Jamais de fusion des deux tableaux, jamais de recalcul.
 */
export function resolveFormulairesManquants(
  liasseResult: LiasseEngineOutput | undefined,
  liasseRfs: LiasseFromRfs | undefined,
): readonly string[] {
  if (liasseRfs) return liasseRfs.formulairesManquants;
  return liasseResult?.formulairesManquants ?? [];
}

export type DeclarationGenerationResult =
  | {
      status: "generated";
      completude: DeclarationCompletude;
      fiscalResult: FiscalEngineOutput;
      liasseResult: LiasseEngineOutput;
      /**
       * Cycle 26 — Représentation Fiscale Structurée. Source commune destinée
       * au document client, au futur adaptateur EDI et à la future liasse
       * finale. `rfs.fiscalResult` porte le FiscalResult complet (F-006, non
       * appauvri) — `fiscalResult` ci-dessus reste le sous-ensemble historique
       * déjà consommé par la porte de génération et l'UI Validation ; les deux
       * proviennent du même et unique appel à produceFiscalResult() ci-dessous,
       * jamais d'un second calcul.
       */
      rfs: FiscalRepresentation;
      /**
       * Cycle 31 — assemblage additif 2031-SD + 2033-B-SD depuis la RFS,
       * chemin parallèle à `liasseResult` (qui reste produit par
       * `produceLiasse()`, inchangé). N'affecte aucun champ historique —
       * ajouté uniquement pour préparer la généralisation du moteur de
       * projection sans rien casser du contrat actuel.
       */
      liasseRfs: LiasseFromRfs;
    }
  | {
      status: "blocked";
      anomalies: Anomaly[];
    };

/**
 * Point de connexion réel entre le parcours de validation et le Runtime F-006/F-007.
 * N'invente aucune règle : appelle produceFiscalResult() puis produceLiasse() avec le
 * résultat frais (pas de round-trip via le draft persisté, contrairement à
 * fiscalResultFromDraft() qui reconstruit une version appauvrie pour l'affichage seul).
 */
export function runDeclarationGeneration(
  draft: DeclarationDraft | undefined,
  fiscalYear: number,
  // P1-1 — stocks d'ouverture de CET exercice, résolus et persistés une
  // seule fois à la création de l'exercice (FiscalYear.stocksOuverture,
  // voir persistFiscalYearClosureAndTransition() / resolveStocksOuverture())
  // — jamais dérivés de `draft.fiscalResult`, qui reste exclusivement le
  // miroir de la DERNIÈRE génération du MÊME exercice (P0-1, régénération
  // sans double-comptage). Optionnel : absent pour un premier exercice, un
  // exercice sans continuité disponible, ou tout appelant qui n'en a pas
  // (ex. l'aperçu de dérive de declaration-generation-gate.ts, inchangé).
  stocksOuverture?: FiscalEngineOutput["stocks"],
  /**
   * P1-PDF-02-E — saisie patrimoniale déjà collectée. Absente aujourd'hui
   * du draft (aucun formulaire UI). Fournie uniquement par un appelant qui
   * dispose réellement des `BilanInputs` : alors `assemblePatrimoine()`
   * produit le `PatrimonialState` transporté dans la RFS. Jamais inventée
   * ici, jamais remplacée par des zéros.
   */
  bilanInputs?: BilanInputs,
  /**
   * Dispense de bilan 2033-A — saisie brute uniquement (`draft.dispense2033A`,
   * même doctrine que `bilanInputs`/`draft.bilanPatrimonial` ci-dessus).
   * L'éligibilité elle-même est TOUJOURS recalculée ici via
   * `resolveDispense2033AEligibilite()` — jamais persistée telle quelle,
   * jamais dérivée d'un exercice différent.
   */
  dispense2033AIntake?: { caReferenceN1Declaree?: number; decision?: Dispense2033ADecision },
  /**
   * Lot 5 — continuité immobilisations :
   * - `composantsF012Merged` : F-012 historiques + courants (via mergeComposantsF012 côté appelant) ;
   * - `immobilisationsOuverture` : brut/cumul clôture N pour 2033-C 490/570 ;
   * - `propertyId` : porté tel quel quand connu (jamais inventé).
   */
  continuity?: {
    composantsF012Merged?: ComposantNouveau[];
    immobilisationsOuverture?: FiscalYear["immobilisationsOuverture"];
    repriseHistoriqueEnContinuite?: FiscalYear["repriseHistoriqueEnContinuite"];
    previousFiscalYearId?: FiscalYear["previousFiscalYearId"];
    continuiteNativeVerifiee?: FiscalYear["continuiteNativeVerifiee"];
    propertyId?: string;
  },
  /**
   * Lot 3B / 4F.2 — bridge optionnel `FiscalYearOpening` → stocks F006 +
   * amortissement ancré (si actifs disponibles). Absent en production tant
   * qu'aucune Opening n'est fournie. EXTERNAL_HISTORY n'autorise la génération
   * que si une Opening external_takeover validée est passée ici (gate 4F.2).
   * Convergence fail-closed avant `produceFiscalResult` :
   * unavailable ≠ 0/[] ; double source divergente → blocked.
   */
  fiscalYearOpening?: FiscalYearOpening,
): DeclarationGenerationResult {
  // Blocker #3 Lot C — avant tout calcul fiscal : TF legacy unresolved bloque.
  const integrityBlock = resolveTaxeFonciereLegacyIntegrityGenerationBlock(draft);
  if (integrityBlock) {
    return { status: "blocked", anomalies: [integrityBlock] };
  }

  // Lot 3B — convergence stocks d'ouverture avant F006 (provenance effacée).
  const stocksResolution = resolveCanonicalOpeningFiscalStocks({
    opening: fiscalYearOpening,
    stocksOuverture,
    expectedExerciceFiscal: fiscalYearOpening ? fiscalYear : undefined,
  });
  if (stocksResolution.status === "blocked") {
    return {
      status: "blocked",
      anomalies: stocksResolution.issues.map((issue) => ({
        severity: issue.severity === "warning" ? ("warning" as const) : ("error" as const),
        message: `${issue.code}: ${issue.message}`,
        field: issue.fieldPath ?? "fiscalYearOpening.stocks",
      })),
    };
  }
  const openingFiscalStocks = stocksResolution.stocks;

  // Lot 4F.2 / P0-2A — Opening actifs disponibles → DN ancrée + inventaire
  // historique conservé pour la RFS. Assets unavailable (stocks-only) → draft.
  let amortissementAssistant = draft?.amortissementAssistant
    ? {
        exerciceFiscal: draft.amortissementAssistant.exerciceFiscal,
        totalDotations: draft.amortissementAssistant.totalDotations,
        status: draft.amortissementAssistant.status,
      }
    : undefined;
  let appliedOpeningPlan: AmortissementPlan | undefined;
  let openingTerrainBrut = 0;
  let openingCurrentYearAcquisitions: ComposantNouveau[] | undefined;
  let continuedTakeover: Extract<ReturnType<typeof continueTakeoverSnapshot>, { status: "ready" }> | undefined;

  if (continuity?.previousFiscalYearId && continuity.immobilisationsOuverture &&
      !continuity.repriseHistoriqueEnContinuite &&
      continuity.immobilisationsOuverture.actifsReprise === undefined &&
      !continuity.continuiteNativeVerifiee) {
    return {
      status: "blocked",
      anomalies: [{ severity: "error", field: "immobilisationsOuverture", message: "Provenance de l'ouverture des immobilisations non vérifiée : archive de clôture précédente indisponible ou incohérente." }],
    };
  }

  if (
    continuity?.repriseHistoriqueEnContinuite === true ||
    continuity?.immobilisationsOuverture?.actifsReprise !== undefined
  ) {
    if (fiscalYearOpening && isAvailable(fiscalYearOpening.assets)) {
      return {
        status: "blocked",
        anomalies: [{ severity: "error", field: "immobilisations", message: "Deux inventaires historiques concurrents." }],
      };
    }
    const continued = continueTakeoverSnapshot({
      opening: continuity.immobilisationsOuverture,
      exerciceFiscal: fiscalYear,
      composantsF012Merged:
        continuity.composantsF012Merged ?? draft?.chargesAssistant?.composantsNouveaux,
      propertyId: continuity.propertyId,
      dateMiseEnService: draft?.dateMiseEnService,
    });
    if (continued.status === "blocked") {
      return {
        status: "blocked",
        anomalies: [{ severity: "error", field: "immobilisationsOuverture", message: `${continued.code}: ${continued.reason}` }],
      };
    }
    continuedTakeover = continued;
    amortissementAssistant = {
      exerciceFiscal: fiscalYear,
      totalDotations: continued.totalDotations,
      status: "validated",
    };
  }

  if (fiscalYearOpening && isAvailable(fiscalYearOpening.assets)) {
    const f012Source =
      continuity?.composantsF012Merged ?? draft?.chargesAssistant?.composantsNouveaux;
    const depreciation = resolveOpeningDepreciation({
      opening: fiscalYearOpening,
      expectedExerciceFiscal: fiscalYear,
      currentYearAcquisitionIds: f012Source?.map((c) => c.id),
    });
    if (depreciation.status === "blocked") {
      return {
        status: "blocked",
        anomalies: depreciation.issues.map((issue) => ({
          severity: issue.severity === "warning" ? ("warning" as const) : ("error" as const),
          message: `${issue.code}: ${issue.message}`,
          field: issue.fieldPath ?? "fiscalYearOpening.assets",
        })),
      };
    }
    const applied = applyResolvedOpeningDepreciation({ resolved: depreciation });
    if (!applied.ok) {
      return {
        status: "blocked",
        anomalies: applied.issues.map((issue) => ({
          severity: issue.severity === "warning" ? ("warning" as const) : ("error" as const),
          message: `${issue.code}: ${issue.message}`,
          field: issue.fieldPath ?? "fiscalYearOpening.assets",
        })),
      };
    }

    const historicalIds = new Set(
      applied.plan.lignes
        .map((l) => l.id)
        .filter((id): id is string => typeof id === "string" && id.length > 0),
    );
    const f012Partition = selectCurrentYearAcquisitions({
      composants: f012Source,
      exerciceFiscal: fiscalYear,
      historicalAssetIds: historicalIds,
    });
    // P0-2A.1 — F-012 hors Opening et hors année N : fail-closed, jamais drop silencieux.
    if (f012Partition.incoherent.length > 0) {
      const ids = f012Partition.incoherent.map((c) => c.id).join(", ");
      return {
        status: "blocked",
        anomalies: [
          {
            severity: "error",
            field: "chargesAssistant.composantsNouveaux",
            message:
              `${EXTERNAL_HISTORY_F012_ACQUISITION_INCOHERENT}: acquisition(s) F-012 ` +
              `incohérente(s) avec l'exercice ${fiscalYear} (hors Opening) : ${ids}.`,
          },
        ],
      };
    }
    openingCurrentYearAcquisitions = f012Partition.acquisitions;
    const f012Details = detailComposantsNouveaux(
      openingCurrentYearAcquisitions,
      fiscalYear,
      continuity?.propertyId,
    );
    appliedOpeningPlan = applied.plan;
    openingTerrainBrut = round2(
      depreciation.terrain.reduce((acc, t) => acc + t.coutBrut, 0),
    );
    amortissementAssistant = {
      exerciceFiscal: fiscalYear,
      totalDotations: round2(
        applied.plan.totalAnnuelExercice + totalDotationComposantsDetail(f012Details),
      ),
      status: "validated",
    };
  }

  // NEXT-2 (F011-CREDIT-SILENT-LOAN-EXCLUSION) — dérivé en direct depuis
  // `creditFinancing.loans` (donnée source, toujours persistée) plutôt que
  // depuis un champ calculé au moment de la confirmation Tunnel A : protège
  // aussi les dossiers confirmés avant le correctif UI, sans exiger une
  // nouvelle confirmation.
  // NEXT-3 (P2-A) — écrasement INCONDITIONNEL, y compris `[]` : la dérivation
  // fraîche reste la seule vérité, jamais une ancienne valeur persistée
  // (potentiellement stale) qui survivrait parce que le tableau frais est vide.
  // Latence « prêt saisi puis aucun crédit » — `effectiveFinancementCharges` écarte d'anciennes charges de
  // financement dès que « aucun crédit » est établi (voir credit-state.ts) ; sinon `draft.financementCharges`.
  // R1.x (P0-B) — composition unique partagée avec le panneau F-006 : bloque aussi un échéancier
  // documentaire courant que les charges persistées (périmées ou absentes) ne reflètent pas.
  const financementCharges = financementChargesForGeneration(draft, fiscalYear);

  // P0-2A.1 — reprise EXTERNAL_HISTORY : fraisEnCharges du draft F-010 ne doit
  // jamais contaminer F-006 (acquisition déjà traitée historiquement — JUG-001 /
  // TRF-0001 hors exercice N). Source = Opening external_takeover, pas le draft.
  const usesTakeoverHistory =
    fiscalYearOpening?.source.kind === "external_takeover" || continuedTakeover !== undefined;
  const logementAmortissementForF006 =
    draft?.logementAmortissement && usesTakeoverHistory
      ? { ...draft.logementAmortissement, fraisEnCharges: 0 }
      : draft?.logementAmortissement;

  const fiscalComputation = produceFiscalResult({
    exerciceFiscal: fiscalYear,
    activite: {
      siret: draft?.siret,
      dateMiseEnService: draft?.dateMiseEnService,
      activityType: draft?.activityType,
    },
    logementAmortissement: logementAmortissementForF006,
    financementCharges,
    chargesAssistant: draft?.chargesAssistant,
    revenusAssistant: draft?.revenusAssistant,
    amortissementAssistant,
    stockDeficitsAnterieurs: openingFiscalStocks?.deficits,
    stockAmortissementsReportes: openingFiscalStocks?.amortissementsReportes,
  });

  if (!fiscalComputation.result) {
    return { status: "blocked", anomalies: fiscalComputation.anomalies };
  }

  const fiscalResult = fiscalComputation.result;
  const identite = identiteFromDeclarationDraft(draft, fiscalYear);
  const liasseComputation = produceLiasse({ fiscalResult, identite });

  if (!liasseComputation.liasse) {
    return { status: "blocked", anomalies: liasseComputation.anomalies };
  }

  const liasse = liasseComputation.liasse;
  const form = liasse.formulairesGeneres[0];

  const liasseResult: LiasseEngineOutput = {
    exercice: liasse.exercice,
    form2031Generated: true,
    caseCount: form?.cases.length ?? 0,
    cases: form?.cases ?? [],
    formulairesManquants: [...liasse.formulairesManquants],
    trace: liasse.trace,
    generatedAt: liasse.trace.generatedAt,
  };

  // RFS — assemblage pur. P0-2A EXTERNAL_HISTORY : inventaire = Opening appliqué
  // + acquisitions N (F-012). Parcours natif : F-010 + F-012 inchangé.
  const immobilisations =
    appliedOpeningPlan !== undefined
      ? composeExternalHistoryImmobilisationsRfs({
          appliedPlan: appliedOpeningPlan,
          terrainBrut: openingTerrainBrut,
          exerciceFiscal: fiscalYear,
          currentYearAcquisitions: openingCurrentYearAcquisitions,
          propertyId: continuity?.propertyId,
          dateMiseEnService: draft?.dateMiseEnService,
        })
      : continuedTakeover !== undefined
        ? continuedTakeover.immobilisations
      : draft?.logementAmortissement
        ? enrichImmobilisationsRfs({
            immobilisations: {
              ...draft.logementAmortissement.plan,
              valeurTerrain: draft.logementAmortissement.valeurTerrain,
              montantMobilier: draft.logementAmortissement.montantMobilier,
              dateMiseEnService: draft.dateMiseEnService,
              composantsNouveaux: draft.chargesAssistant?.composantsNouveaux,
            },
            exerciceFiscal: fiscalYear,
            composantsMerged:
              continuity?.composantsF012Merged ?? draft.chargesAssistant?.composantsNouveaux,
            propertyId: continuity?.propertyId,
            ouverture: continuity?.immobilisationsOuverture
              ? {
                  valeurBruteOuverture: continuity.immobilisationsOuverture.brut,
                  amortissementsCumulesOuverture:
                    continuity.immobilisationsOuverture.amortissementsCumules,
                  sourceClosureId: continuity.immobilisationsOuverture.sourceClosureId,
                }
              : undefined,
          })
        : undefined;

  // P0-2A — Opening actifs présents mais projection impossible → pas de fallback F-010.
  if (appliedOpeningPlan !== undefined && !immobilisations) {
    return {
      status: "blocked",
      anomalies: [
        {
          severity: "error",
          field: "fiscalYearOpening.assets",
          message: `${EXTERNAL_HISTORY_INVENTORY_UNPROJECTABLE}: inventaire historique Opening non projectable en RFS.`,
        },
      ],
    };
  }

  // P0-2A anti-S3 — inventaire historique RFS doit matcher l'Opening appliqué.
  if (appliedOpeningPlan !== undefined && immobilisations) {
    const inventoryGuard = assertHistoricalInventoryMatchesApplied({
      immobilisations,
      appliedPlan: appliedOpeningPlan,
    });
    if (!inventoryGuard.ok) {
      return {
        status: "blocked",
        anomalies: [
          {
            severity: "error",
            field: "immobilisations",
            message: `${inventoryGuard.code}: ${inventoryGuard.reason}`,
          },
        ],
      };
    }
  }

  // Lot 5 B2 — fail-closed en amont de la liasse : une divergence
  // ouverture/clôture (fausse acquisition, 570+572≠576) bloque la génération.
  if (immobilisations) {
    const reconciliation = reconcileImmobilisationsContinuity({
      immobilisations,
      exercice: fiscalYear,
      amortCalcule: fiscalResult.amortCalcule,
    });
    if (reconciliation.status === "fail") {
      return {
        status: "blocked",
        anomalies: [
          {
            severity: "error",
            field: "immobilisations",
            message: `${IMMOBILISATIONS_CONTINUITY_RECONCILIATION_FAILED}: ${reconciliation.reason}`,
          },
        ],
      };
    }
  }

  // A5(1) — voir `resolveEmpruntsForRfs` : `[]` uniquement si le client a
  // explicitement déclaré ne pas avoir de crédit (`creditDeclaredNoneAt`) ; une
  // absence de réponse reste `undefined` (jamais transformée en « aucun crédit »).
  const emprunts = resolveEmpruntsForRfs(draft);
  const immobilisationsSource = appliedOpeningPlan !== undefined
    ? "FiscalYearOpening externe + acquisitions F-012 de l'exercice"
    : continuedTakeover !== undefined
      ? `Clôture comptable ${continuity?.immobilisationsOuverture?.sourceClosureId} + acquisitions F-012 de l'exercice`
      : undefined;

  // Dispense 2033-A (CGI, art. 302 septies A bis, VI) — correction audit
  // contradictoire : AUCUNE dérivation automatique depuis `dateMiseEnService`
  // (date de mise en service du BIEN, jamais une preuve de l'ancienneté de
  // l'ACTIVITÉ de l'exploitant — voir `resolveCaReferenceN1Fact()` pour le
  // détail du contre-exemple). Seule la saisie explicite du client
  // (`dispense2033AIntake.caReferenceN1Declaree`) fait foi ; son absence
  // reste TOUJOURS INCONNU, y compris pour un dossier de première année —
  // jamais une valeur dérivée du chiffre d'affaires de l'exercice en cours.
  const caReferenceN1Fact = resolveCaReferenceN1Fact({
    caReferenceN1Declaree: dispense2033AIntake?.caReferenceN1Declaree,
  });
  const dispense2033A = {
    eligibilite: resolveDispense2033AEligibilite({ exercice: fiscalYear, caReferenceN1: caReferenceN1Fact }),
    decision: dispense2033AIntake?.decision,
  };

  const rfsSansPatrimoine = buildFiscalRepresentation({
    fiscalResult,
    identite,
    immobilisations,
    immobilisationsSource,
    emprunts,
    dispense2033A,
  });
  // Transport uniquement : si aucun BilanInputs réel n'est fourni, le
  // patrimoine reste `undefined` — le mapper 2033-A laisse alors 084/120/
  // 134/137/142 bloqués. Aucune saisie n'est inventée depuis le draft.
  const rfs =
    bilanInputs !== undefined
      ? buildFiscalRepresentation({
          fiscalResult,
          identite,
          immobilisations,
          immobilisationsSource,
          emprunts,
          patrimoine: assemblePatrimoine(rfsSansPatrimoine, bilanInputs),
          dispense2033A,
        })
      : rfsSansPatrimoine;

  // Assemblage additif — appelle uniquement les mappers déjà testés
  // (map2031FromRfs/map2033BFromRfs/map2033AFromRfs/map2033CFromRfs), aucun
  // second calcul fiscal. Calculé avant `completude` (P0-2) pour que la
  // synthèse utilise la même source de vérité que celle persistée ci-dessous.
  const liasseRfs = assembleLiasseFromRfs(rfs);

  return {
    status: "generated",
    completude: declarationCompletude(resolveFormulairesManquants(liasseResult, liasseRfs)),
    rfs,
    liasseRfs,
    fiscalResult: {
      exercice: fiscalResult.exercice,
      resultatFiscal: fiscalResult.resultatFiscal,
      resultatAvantAmort: fiscalResult.resultatAvantAmort,
      totalRecettes: fiscalResult.recettes.total,
      totalCharges: fiscalResult.charges.totalDeductible,
      // P0-3b — transport pur, pour la formation du résultat de l'écran de
      // validation (buildValidationFiscalDisplay).
      chargesPreExploitation: fiscalResult.charges.chargesPreExploitation,
      amortDeduct: fiscalResult.amortDeduct,
      amortReporte: fiscalResult.amortReporte,
      amortNonDeduitExercice: fiscalResult.amortNonDeduitExercice,
      deficitNouveau: fiscalResult.deficitNouveau,
      stocks: fiscalResult.stocks,
      trace: fiscalResult.trace,
      computedAt: fiscalResult.trace.computedAt,
    },
    liasseResult,
  };
}
