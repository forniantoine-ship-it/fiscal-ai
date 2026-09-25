/**
 * P3-SOCLE-CYCLE-FISCAL — P0-1 — logique pure du cycle fiscal N → N+1.
 *
 * Aucune fonction de ce fichier n'accède à IndexedDB/Supabase : elles opèrent
 * uniquement sur des données déjà en mémoire, ce qui les rend testables sans
 * environnement navigateur (cohérent avec le reste du projet — voir
 * `persistence.test.ts`). L'orchestration IndexedDB (lecture/écriture réelle)
 * vit séparément dans `../store/dossier-db.ts`.
 *
 * Portée strictement P0-1 : aucune règle fiscale nouvelle (F-006 inchangé),
 * aucun vrai multi-bien (D2 différé — un FiscalYear continue de ne référencer
 * qu'un seul bien en pratique), `stockAmortInitial` non traité (hors scope).
 */

import type {
  DeclarationDraft,
  FiscalEngineOutput,
  FiscalYear,
  Property,
} from "../../types/domain";
import type {
  FiscalYearClosure,
  FinancementBase,
  ImmobilisationsComptablesSnapshot,
  PatrimoineOuvertureResult,
  PropertyAmortissementBase,
  PropertyAmortissementComposant,
  StocksOuvertureResult,
} from "../../types/dossier";
import type { PersistedWorkspace } from "../../store/persistence";
import type { F011LoanDraft } from "@/runtime/assistants/f011-financement/types";
import type { PatrimonialState, RanSituation } from "@/runtime/capabilities/bilan/types";
import {
  reporterRanNPlusUn,
  resolveOuvertureCompteExploitantNPlusUn,
} from "@/runtime/capabilities/bilan/resolve-ouverture-n-plus-1";
import type { ComposantNouveau } from "@/runtime/capabilities/f012/types";
import { round2 } from "@/runtime/capabilities/f012/types";
import { resolveDeclarationGenerationGate } from "../declaration/declaration-generation-gate";
import { isUsableExternalTakeoverOpening } from "../fiscal-year-opening/is-usable-external-takeover-opening";
import {
  resolveExternalOpeningProofFromFiscalYear,
  resolvePersistedExternalTakeoverOpening,
  resolvePriorHistoryEligibility,
} from "../declaration/prior-history-eligibility";
import {
  seedFinancementAssistantForNextYear,
  seedLogementAssistantForNextYear,
} from "./n-plus-1-durable-prefill";

/**
 * Champs durables Dossier-level — jamais remis à zéro au passage N → N+1.
 * Lot 4 : `dateMiseEnService` (RAI-003) est un fait durable du logement /
 * activité, distinct de toute confirmation annuelle F009.
 */
const IDENTITY_FIELDS = [
  "siren",
  "siret",
  "exploitantFirstName",
  "exploitantLastName",
  "exploitantEmail",
  "exploitantTelephone",
  "personalAddress",
  "personalCity",
  "personalPostalCode",
  "establishmentAddress",
  "establishmentCity",
  "establishmentPostalCode",
  "activityStartDate",
  "dateMiseEnService",
] as const satisfies readonly (keyof DeclarationDraft)[];

/**
 * P0-B — reconstruit un `ComposantNouveau` (forme F-012, consommée par
 * `composePlanAmortissement()`) depuis sa forme persistée
 * (`PropertyAmortissementComposant`). `dotationAnnuelle` n'est pas persistée
 * séparément (dérivée, `montant / dureeAnnees`, comme pour les lignes F-010,
 * cf. commentaire historique ci-dessous) — jamais une seconde vérité stockée
 * qui pourrait diverger de la base d'origine.
 */
function composantVersComposantNouveau(c: PropertyAmortissementComposant): ComposantNouveau | undefined {
  if (!c.id || !c.origin || !c.dateDebut) return undefined;
  return {
    id: c.id,
    label: c.label,
    montant: c.montant,
    dureeAnnees: c.dureeAnnees,
    dotationAnnuelle: round2(c.montant / c.dureeAnnees),
    nature: c.nature ?? "amélioration",
    dateDebut: c.dateDebut,
    origin: c.origin,
  };
}

/**
 * P0-B — liste, depuis une base persistée, les seuls composants d'origine
 * F-012 (jamais les lignes F-010, qui n'ont pas d'`id`/`origin`).
 */
export function composantsF012DepuisBase(
  base: PropertyAmortissementBase | undefined,
): ComposantNouveau[] {
  return (base?.composants ?? [])
    .map(composantVersComposantNouveau)
    .filter((c): c is ComposantNouveau => c !== undefined);
}

/**
 * P0-B — Contrat N → N+1 : un composant F-012 créé en N doit devenir une
 * immobilisation EXISTANTE en N+1 (même id, même base, même date, même
 * durée), jamais recréée comme une nouvelle dépense F-012. Fusionne les
 * composants F-012 déjà persistés (`fromBase`, reportés depuis un exercice
 * antérieur) avec ceux produits par CET exercice (`fromExercice`, encore
 * frais dans `chargesAssistant.composantsNouveaux`) : dédoublonnage par
 * `id`, la valeur la plus fraîche gagne (même composant, jamais compté deux
 * fois). Fonction pure, réutilisée à l'identique par `extractAmortissementBase`
 * (persistance) et par l'Assistant F-014 (calcul en direct dans l'exercice
 * courant, avant toute transition N → N+1) — une seule règle de fusion.
 */
export function mergeComposantsF012(
  fromExercice: ComposantNouveau[] | undefined,
  fromBase: PropertyAmortissementBase | undefined,
): ComposantNouveau[] {
  const merged = new Map<string, ComposantNouveau>();
  for (const c of composantsF012DepuisBase(fromBase)) merged.set(c.id, c);
  for (const c of fromExercice ?? []) merged.set(c.id, c);
  return [...merged.values()];
}

/**
 * Lot 5 B2 — même sémantique de continuité immobilisations pour payment gate
 * et génération finale (ValidationDocumentStep). Jamais inventée : lit
 * `FiscalYear.immobilisationsOuverture` + fusion F-012 déjà établie.
 */
export function resolveImmobilisationsContinuityForGeneration(input: {
  draft: DeclarationDraft | undefined;
  properties: Property[];
  propertyIds: string[];
  immobilisationsOuverture?: FiscalYear["immobilisationsOuverture"];
  repriseHistoriqueEnContinuite?: FiscalYear["repriseHistoriqueEnContinuite"];
}): {
  composantsF012Merged?: ComposantNouveau[];
  immobilisationsOuverture?: FiscalYear["immobilisationsOuverture"];
  repriseHistoriqueEnContinuite?: FiscalYear["repriseHistoriqueEnContinuite"];
  propertyId?: string;
} {
  const propertyId = input.propertyIds[0];
  const property = propertyId
    ? input.properties.find((p) => p.id === propertyId)
    : undefined;
  return {
    composantsF012Merged: mergeComposantsF012(
      input.draft?.chargesAssistant?.composantsNouveaux,
      property?.amortissementBase,
    ),
    immobilisationsOuverture: input.immobilisationsOuverture,
    repriseHistoriqueEnContinuite: input.repriseHistoriqueEnContinuite,
    propertyId,
  };
}

/**
 * Extrait la base F-010/F-012 stable (composants, valeurTerrain,
 * montantMobilier, dateMiseEnService) depuis la sortie d'assistant courante
 * — jamais l'inverse. `dotationAnnuelle` n'existe pas sur `PlanLigne`
 * (TRF-0012) : reconstituée par `montant / dureeAnnees`, exactement la
 * formule déjà utilisée par `compose-plan-amortissement.ts`
 * (`dotationAnnuellePleine`) — aucune nouvelle règle, une lecture identique
 * d'un calcul déjà approuvé.
 *
 * P0-B — `composantsNouveaux` (F-012, CET exercice) et `existingBase`
 * (reportée d'un exercice antérieur) sont fusionnés via `mergeComposantsF012`
 * plutôt que l'un remplaçant l'autre : c'est ce qui permet à un composant
 * créé en N de survivre au-delà de N sans être recréé, ET à un composant
 * créé en N+1 de s'ajouter sans perdre ceux de N. Si `logementAmortissement`
 * est absent (F-010 non rejoué cet exercice — cas normal en N+1), les lignes
 * F-010 de `existingBase` sont conservées telles quelles plutôt que perdues.
 */
export function extractAmortissementBase(
  logementAmortissement: DeclarationDraft["logementAmortissement"],
  dateMiseEnService: string | undefined,
  composantsNouveaux?: ComposantNouveau[],
  existingBase?: PropertyAmortissementBase,
): PropertyAmortissementBase | undefined {
  const composantsF010 = logementAmortissement
    ? logementAmortissement.plan.lignes.map((ligne) => ({
        label: ligne.label,
        montant: ligne.montant,
        dureeAnnees: ligne.dureeAnnees,
      }))
    : (existingBase?.composants ?? []).filter((c) => c.origin === undefined);

  const composantsF012 = mergeComposantsF012(composantsNouveaux, existingBase).map((c) => ({
    id: c.id,
    label: c.label,
    montant: c.montant,
    dureeAnnees: c.dureeAnnees,
    origin: c.origin,
    nature: c.nature,
    dateDebut: c.dateDebut,
  }));

  const composants = [...composantsF010, ...composantsF012];
  if (composants.length === 0) return undefined;

  return {
    composants,
    valeurTerrain: logementAmortissement?.valeurTerrain ?? existingBase?.valeurTerrain,
    montantMobilier: logementAmortissement?.montantMobilier ?? existingBase?.montantMobilier,
    dateMiseEnService: dateMiseEnService ?? existingBase?.dateMiseEnService,
  };
}

/**
 * Extrait les bases F-011 stables depuis `F011LoanDraft[]` (seule structure
 * du modèle actuel à porter les termes bruts d'un prêt — `financementCharges`,
 * l'output, ne les porte jamais). `commissionCaution`/`iraMontant` sont
 * reportés tels quels vers `garantieDeductible`/`iraDeductible` : même
 * grandeur, déjà nommée ainsi côté capability F-011 (`PretFinancementExercice`),
 * pas une nouvelle règle de calcul.
 */
export function extractFinancementBases(
  loans: F011LoanDraft[] | undefined,
): FinancementBase[] {
  if (!loans) return [];
  return loans.map((loan) => {
    // Millésime de souscription : uniquement s'il est EXPLICITEMENT connu
    // (flag annuel N). Jamais déduit de datePremiereMensualite (peut différer).
    // Sans millésime, les one-offs restent stockés mais ne seront jamais
    // déduits automatiquement (computeFinancementExercice : anneeSouscription
    // === exercice uniquement).
    const anneeSouscription =
      loan.souscritCetExercice === true && loan.datePremiereMensualite
        ? Number(loan.datePremiereMensualite.slice(0, 4))
        : undefined;

    return {
      pretId: loan.pretId,
      typePret: loan.typePret,
      capitalInitial: loan.capitalInitial,
      tauxNominal: loan.tauxNominal,
      dureeMois: loan.dureeMois,
      datePremiereMensualite: loan.datePremiereMensualite,
      assuranceAnnuelle: loan.assuranceAnnuelle,
      assuranceType: loan.assuranceType,
      typeGarantie: loan.typeGarantie,
      // One-offs conservés pour l'historique Dossier, jamais re-seedés en
      // F011LoanDraft N+1 (voir seedFinancementAssistantForNextYear).
      fraisDossier: loan.fraisDossier,
      garantieDeductible: loan.commissionCaution,
      iraDeductible: loan.iraMontant,
      anneeSouscription: Number.isFinite(anneeSouscription) ? anneeSouscription : undefined,
    };
  });
}

/**
 * Extrait les champs d'identité Dossier-level du draft courant — jamais
 * l'inverse (le Dossier ne se déduit pas d'un exercice, seul le draft actuel
 * en porte la valeur courante mutable).
 */
export function extractIdentity(draft: DeclarationDraft | undefined): Partial<DeclarationDraft> {
  const identity: Partial<DeclarationDraft> = {};
  if (!draft) return identity;
  for (const key of IDENTITY_FIELDS) {
    const value = draft[key];
    if (value !== undefined) (identity as Record<string, unknown>)[key] = value;
  }
  return identity;
}

/**
 * Construit une closure — jamais appelée pour remplacer une closure
 * existante, uniquement pour en AJOUTER une nouvelle via `appendClosure()`.
 *
 * G1-P1 — `patrimoine`, si fourni, doit porter le `PatrimonialState` complet
 * de CET exercice ET la `ranSituation` brute (`BilanInputs.ran.situation` —
 * absente de `RanResolution`, donc transmise séparément par l'appelant). Le
 * sous-objet `FiscalYearClosure.patrimoine` n'est construit QUE si le compte
 * de l'exploitant est réellement résolu (`clotureN !== undefined`) — sinon
 * `undefined` intégralement : jamais une closure patrimoniale partielle,
 * jamais un 0 inventé pour combler l'absence.
 */
export function buildFiscalYearClosure(input: {
  fiscalYearId: string;
  dossierId?: string;
  stocks: FiscalEngineOutput["stocks"];
  computedAt: string;
  sourceDeclarationVersionId?: string;
  now: string;
  patrimoine?: { state: PatrimonialState; ranSituation: RanSituation };
  /** Lot 5 — snapshot comptable immobilisations (UNKNOWN ≠ ZERO si absent). */
  immobilisationsComptables?: ImmobilisationsComptablesSnapshot;
}): FiscalYearClosure {
  const clotureCompteExploitant = input.patrimoine?.state.compteExploitant.clotureN;
  const patrimoine =
    input.patrimoine !== undefined && clotureCompteExploitant !== undefined
      ? {
          compteExploitantAvantAffectationResultat: clotureCompteExploitant,
          resultatComptableExercice: input.patrimoine.state.resultatComptable,
          ranSituation: input.patrimoine.ranSituation,
          ranValeur: input.patrimoine.state.ran.valeur,
        }
      : undefined;
  return {
    id: crypto.randomUUID(),
    fiscalYearId: input.fiscalYearId,
    dossierId: input.dossierId,
    sourceDeclarationVersionId: input.sourceDeclarationVersionId,
    stocks: input.stocks,
    patrimoine,
    immobilisationsComptables: input.immobilisationsComptables,
    computedAt: input.computedAt,
    closedAt: input.now,
  };
}

/**
 * Append-only strict : une closure déjà présente (même `id`) n'est jamais
 * dupliquée ni remplacée ; toute autre closure existante reste intacte.
 * C'est la SEULE fonction autorisée à écrire dans `FiscalYear.closures`.
 */
export function appendClosure(fiscalYear: FiscalYear, closure: FiscalYearClosure): FiscalYear {
  const existing = fiscalYear.closures ?? [];
  if (existing.some((c) => c.id === closure.id)) return fiscalYear;
  return { ...fiscalYear, closures: [...existing, closure] };
}

/** Dernière closure produite pour cet exercice — jamais une closure choisie au hasard. */
export function latestClosure(fiscalYear: Pick<FiscalYear, "closures">): FiscalYearClosure | undefined {
  const closures = fiscalYear.closures ?? [];
  return closures.length > 0 ? closures[closures.length - 1] : undefined;
}

export type CreateNextFiscalYearPrecondition = { ok: true } | { ok: false; reason: string };

/**
 * Préconditions 3/4 de CREATE_NEXT_FISCAL_YEAR (P0-1 v2) : l'exercice courant
 * doit être clôturé ET porter au moins une closure exploitable. Jamais un
 * N+1 créé "avec des stocks supposés" — si l'une des deux conditions manque,
 * la création doit être refusée avant tout effet (aucun dispatch, aucune
 * écriture).
 */
export function canCreateNextFiscalYear(fiscalYear: FiscalYear): CreateNextFiscalYearPrecondition {
  if (fiscalYear.status !== "closed") {
    return { ok: false, reason: "L'exercice courant n'est pas clôturé — impossible de créer l'exercice suivant." };
  }
  if (!latestClosure(fiscalYear)) {
    return { ok: false, reason: "Aucune clôture n'existe pour l'exercice courant — impossible de créer l'exercice suivant." };
  }
  return { ok: true };
}

/**
 * Précondition du geste de clôture explicite "Clôturer et continuer" (Design
 * Gate — Décision 1). Distincte de `canCreateNextFiscalYear()` (qui vérifie
 * que N est déjà clos) : celle-ci vérifie que N est prêt à ÊTRE clos. Ne
 * vérifie jamais `transmittedAt` — la clôture reste indépendante de la
 * télétransmission EDI (JOURNEY_MARK_TRANSMITTED, chemin séparé).
 *
 * Lot 1 — clôture positive : `declarationGeneratedAt` et `gate.canGenerate
 * === false` ne suffisent JAMAIS. `canGenerate === false` amalgamait
 * « dossier incomplet / recalcul bloqué / génération à jour » — seul
 * `referenceGenerationStatus === "current"` est une preuve positive qu'une
 * génération de référence valide et fraîche correspond encore à l'état
 * métier courant (même porte, mêmes comparaisons fisc/identité/patrimoine).
 */
export function canCloseFiscalYear(input: {
  fiscalYear: FiscalYear;
  declarationDraft: DeclarationDraft | undefined;
  properties: Property[];
}): CreateNextFiscalYearPrecondition {
  const { fiscalYear, declarationDraft, properties } = input;

  if (fiscalYear.status !== "ready_to_close") {
    return { ok: false, reason: "L'exercice n'est pas prêt à être clôturé." };
  }
  if (!fiscalYear.declarationGeneratedAt) {
    return { ok: false, reason: "La déclaration n'a pas encore été générée pour cet exercice." };
  }

  // P0 launch safety — clôturer figerait des stocks issus d'un exercice dont
  // l'antériorité n'est pas établie et les présenterait ensuite comme une
  // continuité native valide pour N+1. Même résolveur + même preuve Opening
  // que la porte de génération (Lot 5.3) : jamais une seconde règle.
  if (!resolvePriorHistoryEligibility(fiscalYear, resolveExternalOpeningProofFromFiscalYear(fiscalYear)).eligible) {
    return {
      ok: false,
      reason:
        "L'antériorité de votre activité LMNP n'est pas établie pour cet exercice — impossible de le clôturer pour l'instant.",
    };
  }

  const stored = declarationDraft?.fiscalResult;
  if (!stored) {
    return {
      ok: false,
      reason:
        "Aucune génération de déclaration exploitable n'est disponible pour cet exercice — générez-la avant de clôturer.",
    };
  }
  if (stored.exercice !== fiscalYear.year) {
    return {
      ok: false,
      reason:
        "La génération disponible ne correspond pas à l'exercice en cours — régénérez la déclaration avant de clôturer.",
    };
  }

  const gate = resolveDeclarationGenerationGate({
    draft: declarationDraft,
    properties,
    fiscalYear: fiscalYear.year,
    paid: Boolean(fiscalYear.paidAt),
    generated: true,
    // P0-1A — même stocksOuverture que la génération réelle (déjà résolue et
    // persistée sur CET exercice, jamais recalculée ici) : sans ce champ, le
    // preview de la porte tournait sans continuité alors que la génération
    // réelle en tenait compte pour un exercice N+1, détectant une dérive
    // artificielle et bloquant une clôture pourtant valide.
    stocksOuverture: fiscalYear.stocksOuverture?.stocks,
    // Lot 5 B2 — même continuité immobilisations que ValidationDocumentStep.
    continuity: resolveImmobilisationsContinuityForGeneration({
      draft: declarationDraft,
      properties,
      propertyIds: fiscalYear.propertyIds,
      immobilisationsOuverture: fiscalYear.immobilisationsOuverture,
      repriseHistoriqueEnContinuite: fiscalYear.repriseHistoriqueEnContinuite,
    }),
    // Lot 5.3 — même Opening que la génération réelle.
    fiscalYearOpening: resolvePersistedExternalTakeoverOpening(fiscalYear),
  });

  switch (gate.referenceGenerationStatus) {
    case "absent":
      return {
        ok: false,
        reason:
          "Aucune génération de déclaration exploitable n'est disponible pour cet exercice — générez-la avant de clôturer.",
      };
    case "incomplete":
      return {
        ok: false,
        reason:
          "Le dossier n'est pas complet — impossible de clôturer l'exercice pour l'instant.",
      };
    case "blocked":
      return {
        ok: false,
        reason:
          "Le dossier ne permet plus de recalculer une déclaration valide — impossible de clôturer l'exercice pour l'instant.",
      };
    case "stale":
      return {
        ok: false,
        reason:
          "Le dossier a changé depuis la dernière génération de votre déclaration — régénérez-la avant de clôturer l'exercice.",
      };
    case "current":
      return { ok: true };
    default:
      // Jamais `!canGenerate` comme preuve positive : un statut manquant
      // n'autorise pas la clôture.
      return {
        ok: false,
        reason:
          "Impossible de vérifier que la déclaration générée est encore à jour — régénérez-la avant de clôturer l'exercice.",
      };
  }
}

/**
 * Clôture un exercice : construit et ajoute une closure à partir de son
 * `FiscalResult` courant — jamais appelée si `fiscalResult` est absent (rien
 * à figer). `dossierId` reste optionnel (§ buildFiscalYearClosure) : une
 * closure produite avant migration garde `dossierId: undefined`, jamais une
 * valeur inventée.
 */
export function closeFiscalYear(
  fiscalYear: FiscalYear,
  fiscalResult: FiscalEngineOutput | undefined,
  now: string,
  options?: {
    sourceDeclarationVersionId?: string;
    /** G1-P1 — voir `buildFiscalYearClosure()`. Absent ⇒ closure sans continuité patrimoniale, comportement rigoureusement inchangé. */
    patrimoine?: { state: PatrimonialState; ranSituation: RanSituation };
    /** Lot 5 — snapshot comptable immobilisations. */
    immobilisationsComptables?: ImmobilisationsComptablesSnapshot;
  },
): FiscalYear {
  if (!fiscalResult) return fiscalYear;
  const closure = buildFiscalYearClosure({
    fiscalYearId: fiscalYear.id,
    dossierId: fiscalYear.dossierId,
    stocks: fiscalResult.stocks,
    computedAt: fiscalResult.computedAt,
    sourceDeclarationVersionId: options?.sourceDeclarationVersionId,
    now,
    patrimoine: options?.patrimoine,
    immobilisationsComptables: options?.immobilisationsComptables,
  });
  return appendClosure(fiscalYear, closure);
}

/**
 * Garde stricte des stocks d'ouverture de N+1 — les 6 conditions doivent
 * TOUTES être vraies, revérifiées à chaque appel (jamais mémorisées). Aucune
 * condition manquante ne produit de valeur inventée : uniquement
 * `{status: "unavailable", reason}`, jamais 0, jamais une estimation, jamais
 * un repli sur un autre exercice.
 */
export function resolveStocksOuverture(
  current: FiscalYear,
  previous: FiscalYear | undefined,
): StocksOuvertureResult {
  if (!current.previousFiscalYearId) {
    return { status: "unavailable", reason: "Aucun previousFiscalYearId défini pour cet exercice." };
  }
  if (!previous) {
    return { status: "unavailable", reason: "L'exercice précédent référencé est introuvable." };
  }
  if (previous.id !== current.previousFiscalYearId) {
    return {
      status: "unavailable",
      reason: "L'exercice fourni ne correspond pas au previousFiscalYearId déclaré.",
    };
  }
  if (!current.dossierId || !previous.dossierId || previous.dossierId !== current.dossierId) {
    return { status: "unavailable", reason: "L'exercice précédent n'appartient pas au même dossier." };
  }
  if (previous.year !== current.year - 1) {
    return {
      status: "unavailable",
      reason: `Adjacence non respectée : previous.year=${previous.year}, current.year=${current.year} (attendu ${current.year - 1}).`,
    };
  }
  if (previous.status !== "closed") {
    return { status: "unavailable", reason: "L'exercice précédent n'est pas clôturé." };
  }
  const closure = latestClosure(previous);
  if (!closure) {
    return { status: "unavailable", reason: "Aucune closure exploitable sur l'exercice précédent." };
  }
  return { status: "available", sourceClosureId: closure.id, stocks: closure.stocks };
}

/**
 * P0 launch safety — applique le résultat de `resolveStocksOuverture()` au
 * FiscalYear N+1. `available` ⇒ `stocksOuverture` (comportement inchangé).
 * `unavailable` ⇒ la raison est CONSERVÉE (`stocksOuvertureUnavailableReason`)
 * au lieu d'être jetée : aucune valeur de stock n'est jamais fabriquée.
 */
export function applyStocksOuvertureResult(fiscalYear: FiscalYear, result: StocksOuvertureResult): FiscalYear {
  return result.status === "available"
    ? { ...fiscalYear, stocksOuverture: { sourceClosureId: result.sourceClosureId, stocks: result.stocks } }
    : { ...fiscalYear, stocksOuvertureUnavailableReason: result.reason };
}

/**
 * G1-P1 — miroir exact de `resolveStocksOuverture()` ci-dessus pour la
 * continuité patrimoniale (compte exploitant / RAN). Mêmes 6 gardes,
 * délibérément dupliquées plutôt que factorisées (même choix que le fichier
 * applique déjà entre les deux mécanismes de continuité — une régression
 * future de l'une ne doit jamais silencieusement affaiblir l'autre via un
 * helper partagé).
 *
 * Garde supplémentaire, spécifique au patrimoine : `closure.patrimoine`
 * doit exister (l'intake G1-P0 doit avoir été réellement renseigné pour
 * l'exercice précédent) — sinon `unavailable`, jamais un 0 par défaut.
 *
 * Ne recalcule rien elle-même : délègue strictement à
 * `resolveOuvertureCompteExploitantNPlusUn()` et `reporterRanNPlusUn()`
 * (déjà écrites, déjà testées en isolation) — cette fonction ne fait que les
 * appeler avec les bonnes valeurs, lues sur la closure réelle.
 */
export function resolvePatrimoineOuvertureNPlusUn(
  current: FiscalYear,
  previous: FiscalYear | undefined,
): PatrimoineOuvertureResult {
  if (!current.previousFiscalYearId) {
    return { status: "unavailable", reason: "Aucun previousFiscalYearId défini pour cet exercice." };
  }
  if (!previous) {
    return { status: "unavailable", reason: "L'exercice précédent référencé est introuvable." };
  }
  if (previous.id !== current.previousFiscalYearId) {
    return {
      status: "unavailable",
      reason: "L'exercice fourni ne correspond pas au previousFiscalYearId déclaré.",
    };
  }
  if (!current.dossierId || !previous.dossierId || previous.dossierId !== current.dossierId) {
    return { status: "unavailable", reason: "L'exercice précédent n'appartient pas au même dossier." };
  }
  if (previous.year !== current.year - 1) {
    return {
      status: "unavailable",
      reason: `Adjacence non respectée : previous.year=${previous.year}, current.year=${current.year} (attendu ${current.year - 1}).`,
    };
  }
  if (previous.status !== "closed") {
    return { status: "unavailable", reason: "L'exercice précédent n'est pas clôturé." };
  }
  const closure = latestClosure(previous);
  if (!closure) {
    return { status: "unavailable", reason: "Aucune closure exploitable sur l'exercice précédent." };
  }
  if (!closure.patrimoine) {
    return {
      status: "unavailable",
      reason: "La clôture de l'exercice précédent ne porte aucune donnée patrimoniale (intake G1-P0 non renseigné pour cet exercice) — absence ≠ zéro.",
    };
  }

  const ouvertureCompteExploitant = resolveOuvertureCompteExploitantNPlusUn({
    cloture120N: closure.patrimoine.compteExploitantAvantAffectationResultat,
    resultatComptableN: closure.patrimoine.resultatComptableExercice,
  });
  const ranReporte = reporterRanNPlusUn({
    situationN: closure.patrimoine.ranSituation,
    valeurN: closure.patrimoine.ranValeur,
  });

  return {
    status: "available",
    sourceClosureId: closure.id,
    ouvertureCompteExploitant,
    ran: { situation: ranReporte.situationNPlusUn, valeur: ranReporte.valeurNPlusUn },
  };
}

/**
 * Construit le FiscalYear N+1 — ne copie AUCUNE donnée métier de N (documents,
 * validations, declarationDraft) : seules les références stables (dossierId,
 * propertyIds) sont reportées. `previousFiscalYearId` pointe explicitement
 * vers N ; les stocks d'ouverture ne sont jamais calculés ici — ils sont lus
 * à la demande via `resolveStocksOuverture()` (ou appliqués par
 * `buildNextExerciseFromClosedYear()`).
 *
 * `nextFiscalYearId` injectable : même entrée + mêmes IDs ⇒ même résultat
 * (Lot 1 — constructeur déterministe). Absent ⇒ `crypto.randomUUID()`.
 */
export function createNextFiscalYear(
  current: FiscalYear,
  dossierId: string | undefined,
  now: string,
  nextFiscalYearId?: string,
): FiscalYear {
  return {
    id: nextFiscalYearId ?? crypto.randomUUID(),
    year: current.year + 1,
    status: "draft",
    regime: current.regime,
    propertyIds: [...current.propertyIds],
    dossierId,
    previousFiscalYearId: current.id,
    closures: [],
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Lot 1 — constructeur métier pur N→N+1.
 *
 * Frontière unique : reçoit N déjà clôturé (avec sa closure), le draft de N
 * (uniquement pour l'identité durable), et les valeurs non déterministes
 * injectées (id / horodatage). Produit l'état initial de N+1 via une liste
 * EXPLICITE — jamais un spread global de `DeclarationDraft`, jamais un clone
 * de workspace, jamais de sessions/confirmations/résultats/documents N.
 *
 * Réutilise `resolveStocksOuverture` / `resolvePatrimoineOuvertureNPlusUn` :
 * une ouverture requise mais indisponible n'est jamais convertie en zéro.
 */
export function buildNextExerciseFromClosedYear(input: {
  closedFiscalYear: FiscalYear;
  previousDraft: DeclarationDraft | undefined;
  dossierId: string | undefined;
  nextFiscalYearId: string;
  now: string;
}): {
  fiscalYear: FiscalYear;
  declarationDraft: DeclarationDraft;
  /** Closure réellement consommée pour les ouvertures (si disponible). */
  sourceClosureId: string | undefined;
} {
  const nextFiscalYearBase = createNextFiscalYear(
    input.closedFiscalYear,
    input.dossierId,
    input.now,
    input.nextFiscalYearId,
  );

  const stocksOuvertureResult = resolveStocksOuverture(nextFiscalYearBase, input.closedFiscalYear);
  const nextFiscalYearWithStocks = applyStocksOuvertureResult(nextFiscalYearBase, stocksOuvertureResult);

  const patrimoineOuvertureResult = resolvePatrimoineOuvertureNPlusUn(
    nextFiscalYearBase,
    input.closedFiscalYear,
  );
  let fiscalYear: FiscalYear =
    patrimoineOuvertureResult.status === "available"
      ? {
          ...nextFiscalYearWithStocks,
          patrimoineOuverture: {
            sourceClosureId: patrimoineOuvertureResult.sourceClosureId,
            ouvertureCompteExploitant: patrimoineOuvertureResult.ouvertureCompteExploitant,
            ran: patrimoineOuvertureResult.ran,
          },
        }
      : nextFiscalYearWithStocks;

  // Lot 5 — ouvertures comptables immobilisations (distinctes du stock fiscal).
  const closureN = latestClosure(input.closedFiscalYear);
  const immoSnap = closureN?.immobilisationsComptables;
  const repriseHistoriqueEnContinuite =
    isUsableExternalTakeoverOpening(
      input.closedFiscalYear.externalTakeoverOpening?.opening,
      input.closedFiscalYear.year,
    ) || input.closedFiscalYear.repriseHistoriqueEnContinuite === true;
  if (repriseHistoriqueEnContinuite) {
    fiscalYear = { ...fiscalYear, repriseHistoriqueEnContinuite: true };
  }
  if (
    closureN &&
    immoSnap &&
    typeof immoSnap.brutCloture === "number" &&
    typeof immoSnap.amortissementsCumulesCloture === "number"
  ) {
    fiscalYear = {
      ...fiscalYear,
      immobilisationsOuverture: {
        sourceClosureId: closureN.id,
        brut: immoSnap.brutCloture,
        amortissementsCumules: immoSnap.amortissementsCumulesCloture,
        vnc: immoSnap.vncCloture,
        ...(repriseHistoriqueEnContinuite ? { actifsReprise: immoSnap.actifs.map((a) => ({ ...a })) } : {}),
      },
    };
  }

  const sourceClosureId =
    stocksOuvertureResult.status === "available"
      ? stocksOuvertureResult.sourceClosureId
      : patrimoineOuvertureResult.status === "available"
        ? patrimoineOuvertureResult.sourceClosureId
        : closureN?.id;

  return {
    fiscalYear,
    declarationDraft: createNextDeclarationDraft(input.previousDraft),
    sourceClosureId,
  };
}

/**
 * Construit le draft de départ de N+1 : identité + faits durables allowlistés
 * (Lot 4), tout le reste (confirmations, outputs annuels, documents,
 * génération) explicitement vide — "nouvel exercice avec mémoire durable",
 * jamais un clone de N (P3-SOCLE-CYCLE-FISCAL §12 + Lot 4 Phase 12).
 */
export function createNextDeclarationDraft(previousDraft: DeclarationDraft | undefined): DeclarationDraft {
  const logementAssistantState = seedLogementAssistantForNextYear(previousDraft);
  const financementAssistantState = seedFinancementAssistantForNextYear(previousDraft);

  return {
    completedSteps: [],
    ...extractIdentity(previousDraft),
    ...(logementAssistantState ? { logementAssistantState } : {}),
    ...(financementAssistantState ? { financementAssistantState } : {}),
  };
}

/**
 * Reconstitue, à partir d'un `PersistedWorkspace` mono-exercice existant, les
 * données Dossier-level (Property.amortissementBase, financements[]) sans
 * toucher au workspace lui-même — pure fonction, utilisée par la migration
 * (`dossier-db.ts`) ET testable indépendamment d'IndexedDB.
 */
export function extractDossierLevelDataFromWorkspace(workspace: PersistedWorkspace): {
  properties: Property[];
  financements: FinancementBase[];
} {
  const draft = workspace.declarationDraft;
  // P0-B — la base EXISTANTE (reportée d'un exercice antérieur, déjà portée
  // par `workspace.properties[0]` avant cet appel) est le point de fusion :
  // sans elle, tout composant F-012 déjà accumulé sur un exercice précédent
  // serait perdu dès la transition suivante (remplacé plutôt qu'étendu).
  const existingBase = workspace.properties[0]?.amortissementBase;
  // P0-2C — EXTERNAL_HISTORY validé : l'Opening est la vérité du passé
  // comptable (inventaire porté par la RFS générée puis par
  // `closure.immobilisationsComptables`). Le draft F-010 (lignes, terrain,
  // mobilier) et sa date de mise en service ne doivent jamais être persistés
  // comme base historique : ni relus, ni autorisés à contredire l'Opening en
  // N+1. Seuls les composants F-012 de l'exercice (acquisitions N) et la base
  // déjà reportée (`existingBase`) survivent. Parcours natif inchangé.
  const isExternalTakeover = isUsableExternalTakeoverOpening(
    workspace.fiscalYear.externalTakeoverOpening?.opening,
    workspace.fiscalYear.year,
  );
  const amortissementBase = extractAmortissementBase(
    isExternalTakeover ? undefined : draft?.logementAmortissement,
    isExternalTakeover ? undefined : draft?.dateMiseEnService,
    draft?.chargesAssistant?.composantsNouveaux,
    existingBase,
  );
  const properties = workspace.properties.map((property, index) =>
    // P0-1 — mono-bien en pratique (D2 différé) : la base extraite est
    // rattachée au premier bien référencé par l'exercice, jamais dupliquée
    // ni devinée pour un bien qu'elle ne concerne pas.
    index === 0 && amortissementBase ? { ...property, amortissementBase } : property,
  );
  const financements = extractFinancementBases(draft?.financementAssistantState?.loans);
  return { properties, financements };
}

export type ArchivedFiscalYearAccess = { ok: true } | { ok: false; reason: string };

/**
 * P1 — Historique des exercices clôturés. Précondition d'accès à la vue
 * read-only d'un exercice archivé (`loadArchivedFiscalYear()`,
 * `store/dossier-db.ts`) : jamais un exercice d'un autre dossier (isolation
 * multi-utilisateur/multi-dossier), jamais l'exercice ACTIF (celui-ci reste
 * consultable uniquement via le parcours existant, `/declarations`) — un
 * exercice non `"closed"` (dont la coquille technique de l'exercice courant,
 * cf. `persistFiscalYearClosureAndTransition()`) n'est jamais une archive
 * consultable au sens de ce parcours.
 */
export function resolveArchivedFiscalYearAccess(
  record: Pick<FiscalYear, "dossierId" | "status"> | undefined,
  dossierId: string,
): ArchivedFiscalYearAccess {
  if (!record) {
    return { ok: false, reason: "Exercice introuvable." };
  }
  if (!dossierId || record.dossierId !== dossierId) {
    return { ok: false, reason: "Cet exercice n'appartient pas à votre dossier." };
  }
  if (record.status !== "closed") {
    return { ok: false, reason: "Cet exercice n'est pas clôturé." };
  }
  return { ok: true };
}
