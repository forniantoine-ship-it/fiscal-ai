import type { Anomaly } from "@/runtime";
import { produceFiscalResult } from "@/runtime/capabilities/f006/produce-fiscal-result";
import { produceLiasse } from "@/runtime/capabilities/f007/produce-liasse";
import { buildFiscalRepresentation } from "@/runtime/capabilities/rfs/build-fiscal-representation";
import type { FiscalRepresentation } from "@/runtime/capabilities/rfs/types";
import {
  assembleLiasseFromRfs,
  type LiasseFromRfs,
} from "@/runtime/capabilities/rfs/projection/assemble-liasse-from-rfs";
import { identiteFromDeclarationDraft } from "@/lib/lmnp/services/f007/draft-to-liasse-inputs";
import type {
  DeclarationDraft,
  FiscalEngineOutput,
  LiasseEngineOutput,
} from "@/lib/lmnp/types/domain";

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
): DeclarationGenerationResult {
  // P0-1 (2026-09-03) — `draft.fiscalResult` est le miroir de la DERNIÈRE
  // génération, pas un stock d'ouverture indépendant. Régénérer le MÊME
  // exercice (canRetryAfterPayment) ne doit jamais relire sa propre clôture
  // comme ouverture (dérive : un déficit/amortissement reporté de l'exercice
  // courant se réinjecterait dans son propre calcul). Seul un exercice
  // antérieur constitue une ouverture légitime — inexistant dans l'archi
  // mono-exercice actuelle (cf. audit P0-1), donc stocksOuverture est vide
  // tant qu'aucun mécanisme de report inter-exercices n'existe.
  const stocksOuverture =
    draft?.fiscalResult && draft.fiscalResult.exercice < fiscalYear
      ? draft.fiscalResult.stocks
      : undefined;

  const fiscalComputation = produceFiscalResult({
    exerciceFiscal: fiscalYear,
    activite: {
      siret: draft?.siret,
      dateMiseEnService: draft?.dateMiseEnService,
      activityType: draft?.activityType,
    },
    logementAmortissement: draft?.logementAmortissement,
    financementCharges: draft?.financementCharges,
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
  // Immobilisations/emprunts : lecture seule des sorties déjà persistées de
  // F-010/F-011, jamais recalculées ici. `valeurTerrain` (Cycle 35) et
  // `montantMobilier` (Cycle 58) sont des champs frères de `.plan` dans la
  // sortie durable de F-010 — fusionnés ici (transport pur, aucun calcul)
  // pour ne pas se perdre en route vers la RFS, comme c'était déjà le cas
  // pour `valeurTerrain` avant le Cycle 35.
  const rfs = buildFiscalRepresentation({
    fiscalResult,
    identite,
    immobilisations: draft?.logementAmortissement
      ? {
          ...draft.logementAmortissement.plan,
          valeurTerrain: draft.logementAmortissement.valeurTerrain,
          montantMobilier: draft.logementAmortissement.montantMobilier,
        }
      : undefined,
    emprunts: draft?.financementCharges?.prets,
  });

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
      amortDeduct: fiscalResult.amortDeduct,
      amortReporte: fiscalResult.amortReporte,
      deficitNouveau: fiscalResult.deficitNouveau,
      stocks: fiscalResult.stocks,
      trace: fiscalResult.trace,
      computedAt: fiscalResult.trace.computedAt,
    },
    liasseResult,
  };
}
