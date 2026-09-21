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
import { excludedLoanIdsFromFinancing } from "@/lib/lmnp/services/f011/credit-financing-to-financement-charges";
import { resolveEmpruntsForRfs } from "./resolve-emprunts-for-rfs";
import { effectiveFinancementCharges } from "./credit-state";
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
import { enrichImmobilisationsRfs, reconcileImmobilisationsContinuity } from "@/lib/lmnp/services/dossier/immobilisations-comptables";

/** Code anomalie stable — Blocker #3 Lot C (gate génération). */
export const TAXE_FONCIERE_LEGACY_INTEGRITY_UNRESOLVED = "TAXE_FONCIERE_LEGACY_INTEGRITY_UNRESOLVED";

/** Lot 5 B2 — réconciliation ouverture/clôture immobilisations échouée. */
export const IMMOBILISATIONS_CONTINUITY_RECONCILIATION_FAILED =
  "IMMOBILISATIONS_CONTINUITY_RECONCILIATION_FAILED";

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
    propertyId?: string;
  },
): DeclarationGenerationResult {
  // Blocker #3 Lot C — avant tout calcul fiscal : TF legacy unresolved bloque.
  const integrityBlock = resolveTaxeFonciereLegacyIntegrityGenerationBlock(draft);
  if (integrityBlock) {
    return { status: "blocked", anomalies: [integrityBlock] };
  }

  // NEXT-2 (F011-CREDIT-SILENT-LOAN-EXCLUSION) — dérivé en direct depuis
  // `creditFinancing.loans` (donnée source, toujours persistée) plutôt que
  // depuis un champ calculé au moment de la confirmation Tunnel A : protège
  // aussi les dossiers confirmés avant le correctif UI, sans exiger une
  // nouvelle confirmation.
  // NEXT-3 (P2-A) — écrasement INCONDITIONNEL, y compris `[]` : la dérivation
  // fraîche reste la seule vérité, jamais une ancienne valeur persistée
  // (potentiellement stale) qui survivrait parce que le tableau frais est vide.
  const excludedLoanIds = excludedLoanIdsFromFinancing(draft?.creditFinancing);
  // Latence « prêt saisi puis aucun crédit » — `effectiveFinancementCharges` écarte d'anciennes charges de
  // financement dès que « aucun crédit » est établi (voir credit-state.ts) ; sinon `draft.financementCharges`.
  const financementBrut = effectiveFinancementCharges(draft);
  const financementCharges = financementBrut ? { ...financementBrut, excludedLoanIds } : financementBrut;

  const fiscalComputation = produceFiscalResult({
    exerciceFiscal: fiscalYear,
    activite: {
      siret: draft?.siret,
      dateMiseEnService: draft?.dateMiseEnService,
      activityType: draft?.activityType,
    },
    logementAmortissement: draft?.logementAmortissement,
    financementCharges,
    chargesAssistant: draft?.chargesAssistant,
    revenusAssistant: draft?.revenusAssistant,
    amortissementAssistant: draft?.amortissementAssistant,
    stockDeficitsAnterieurs: stocksOuverture?.deficits,
    stockAmortissementsReportes: stocksOuverture?.amortissementsReportes,
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

  // RFS — assemblage pur, aucun second appel à produceFiscalResult() : le même
  // `fiscalResult` (F-006, complet) calculé ci-dessus est injecté tel quel.
  // Immobilisations : F-010 plan + F-012 fusionnés (Lot 5) + ouvertures N.
  const immobilisations = draft?.logementAmortissement
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
