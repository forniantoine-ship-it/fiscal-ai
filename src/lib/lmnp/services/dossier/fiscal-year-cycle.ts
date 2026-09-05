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
  PropertyAmortissementBase,
  StocksOuvertureResult,
} from "../../types/dossier";
import type { PersistedWorkspace } from "../../store/persistence";
import type { F011LoanDraft } from "@/runtime/assistants/f011-financement/types";
import { resolveDeclarationGenerationGate } from "../declaration/declaration-generation-gate";

/** Champs d'identité — Dossier-level (audit P3-SOCLE-CYCLE-FISCAL, Blocker A) — jamais remis à zéro au passage N → N+1. */
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
] as const satisfies readonly (keyof DeclarationDraft)[];

/**
 * Extrait la base F-010 stable (composants, valeurTerrain, montantMobilier,
 * dateMiseEnService) depuis la sortie d'assistant courante — jamais l'inverse.
 * `dotationAnnuelle` n'existe pas sur `PlanLigne` (TRF-0012) : reconstituée
 * par `montant / dureeAnnees`, exactement la formule déjà utilisée par
 * `compose-plan-amortissement.ts` (`dotationAnnuellePleine`) — aucune
 * nouvelle règle, une lecture identique d'un calcul déjà approuvé.
 */
export function extractAmortissementBase(
  logementAmortissement: DeclarationDraft["logementAmortissement"],
  dateMiseEnService: string | undefined,
): PropertyAmortissementBase | undefined {
  if (!logementAmortissement) return undefined;
  return {
    composants: logementAmortissement.plan.lignes.map((ligne) => ({
      label: ligne.label,
      montant: ligne.montant,
      dureeAnnees: ligne.dureeAnnees,
    })),
    valeurTerrain: logementAmortissement.valeurTerrain,
    montantMobilier: logementAmortissement.montantMobilier,
    dateMiseEnService,
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
  return loans.map((loan) => ({
    pretId: loan.pretId,
    capitalInitial: loan.capitalInitial,
    tauxNominal: loan.tauxNominal,
    dureeMois: loan.dureeMois,
    datePremiereMensualite: loan.datePremiereMensualite,
    assuranceAnnuelle: loan.assuranceAnnuelle,
    fraisDossier: loan.fraisDossier,
    garantieDeductible: loan.commissionCaution,
    iraDeductible: loan.iraMontant,
  }));
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
 */
export function buildFiscalYearClosure(input: {
  fiscalYearId: string;
  dossierId?: string;
  stocks: FiscalEngineOutput["stocks"];
  computedAt: string;
  sourceDeclarationVersionId?: string;
  now: string;
}): FiscalYearClosure {
  return {
    id: crypto.randomUUID(),
    fiscalYearId: input.fiscalYearId,
    dossierId: input.dossierId,
    sourceDeclarationVersionId: input.sourceDeclarationVersionId,
    stocks: input.stocks,
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
export function latestClosure(fiscalYear: FiscalYear): FiscalYearClosure | undefined {
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
 * P0-1 (audit "Idempotence + Generation Gate", constats B1/B2) —
 * `declarationGeneratedAt` renseigné est nécessaire mais jamais suffisant :
 * ce flag ne redevient jamais `undefined` pour une correction d'identité
 * (nom, adresse, email, téléphone, SIREN, `activityStartDate`) — seuls
 * `financementCharges`/`revenusAssistant`/`amortissementAssistant`/
 * `logementAmortissement`/`siret`/`dateMiseEnService`/`activityType`
 * l'invalident (reducer.ts, `DECLARATION_PATCH_DRAFT`). La SEULE vérité déjà
 * fiable pour "la génération correspond-elle encore aux données actuelles ?"
 * est `resolveDeclarationGenerationGate()` (declaration-generation-gate.ts) —
 * elle recalcule un aperçu frais et compare aussi bien la dérive fiscale
 * (totalRecettes/totalCharges/amortDeduct/amortReporte) que l'identité
 * complète (`identiteChanged()`, elle-même fondée sur
 * `identiteFromDeclarationDraft()`, la même fonction que la génération
 * réelle). Réutilisée ici telle quelle — aucune seconde liste de champs,
 * aucun fingerprint parallèle : `gate.canGenerate === true` après une
 * génération signifie exactement "une régénération est nécessaire", donc la
 * clôture doit être refusée dans ce cas précis.
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

  const gate = resolveDeclarationGenerationGate({
    draft: declarationDraft,
    properties,
    fiscalYear: fiscalYear.year,
    paid: Boolean(fiscalYear.paidAt),
    generated: true,
  });

  if (gate.canGenerate) {
    return {
      ok: false,
      reason:
        "Le dossier a changé depuis la dernière génération de votre déclaration — régénérez-la avant de clôturer l'exercice.",
    };
  }

  return { ok: true };
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
  options?: { sourceDeclarationVersionId?: string },
): FiscalYear {
  if (!fiscalResult) return fiscalYear;
  const closure = buildFiscalYearClosure({
    fiscalYearId: fiscalYear.id,
    dossierId: fiscalYear.dossierId,
    stocks: fiscalResult.stocks,
    computedAt: fiscalResult.computedAt,
    sourceDeclarationVersionId: options?.sourceDeclarationVersionId,
    now,
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
 * Construit le FiscalYear N+1 — ne copie AUCUNE donnée métier de N (documents,
 * validations, declarationDraft) : seules les références stables (dossierId,
 * propertyIds) sont reportées. `previousFiscalYearId` pointe explicitement
 * vers N ; les stocks d'ouverture ne sont jamais calculés ici — ils sont lus
 * à la demande via `resolveStocksOuverture()`.
 */
export function createNextFiscalYear(current: FiscalYear, dossierId: string | undefined, now: string): FiscalYear {
  return {
    id: crypto.randomUUID(),
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
 * Construit le draft de départ de N+1 : identité Dossier-level reportée,
 * tout le reste (assistants, résultats, déclaration) explicitement vide —
 * "declarationDraft = nouvel état d'exercice" (P3-SOCLE-CYCLE-FISCAL §12).
 */
export function createNextDeclarationDraft(previousDraft: DeclarationDraft | undefined): DeclarationDraft {
  return {
    completedSteps: [],
    ...extractIdentity(previousDraft),
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
  const amortissementBase = extractAmortissementBase(
    draft?.logementAmortissement,
    draft?.dateMiseEnService,
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
