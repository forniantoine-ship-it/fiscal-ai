/**
 * NB : ce module de support porte le suffixe `.test.ts` pour rester hors du balayage « appelants de production » de G33 (r2c3b) — il ne contient aucun test.
 */
/**
 * FISCAL-SILENT-ERROR-GATE-1 — constructeurs de dossiers (entrées uniquement : aucune valeur attendue ici).
 */
import assert from "node:assert/strict";
/* eslint-disable @typescript-eslint/no-explicit-any -- fixtures de brouillons hétérogènes (test) */
import type { PersistedWorkspace } from "@/lib/lmnp/store/persistence";
import { exactDossier, type ExactDossierSpec } from "@/lib/lmnp/services/article-39c/exact-generation-fixtures";
import { YEAR, bien as bienFixture, collected as collectedFixture, multiWorkspace } from "@/lib/lmnp/services/article-39c/article-39c-test-fixtures";
import { emptyQualificationStore, recordActivityCharge } from "@/lib/lmnp/services/article-39c/qualification-store";
import { confirmRentReconciliation, createRentReconciliationState, type RentReconciliationV2State } from "@/lib/lmnp/services/f013/v2/f013-v2-state";
import { answerBalance, answerCollections, answerCoverage, answerExceptions, type BalanceKey } from "@/lib/lmnp/services/f013/v2/f013-v2-manual-flow";

const NOW = "2026-12-31T00:00:00.000Z";
export const cents = (euros: number) => Math.round(euros * 100);

/** État F013 v2 confirmé avec les CINQ termes (euros). Chemin de saisie réel (manual-flow). */
export function rentFull(propertyId: string, t: { E: number; CO?: number; CC?: number; AO?: number; AC?: number }, year = YEAR): RentReconciliationV2State {
  const scope = { propertyId, fiscalYear: year };
  const ok = <T extends { ok: boolean }>(r: T) => { assert.equal(r.ok, true, JSON.stringify(r)); return r as Extract<T, { ok: true }>; };
  let s = createRentReconciliationState(scope);
  s = ok(answerCollections(s, cents(t.E))).state;
  s = answerCoverage(s, "all");
  const bal: Record<BalanceKey, number | undefined> = { openingReceivables: t.CO, closingReceivables: t.CC, openingAdvances: t.AO, closingAdvances: t.AC } as never;
  for (const k of Object.keys(bal) as BalanceKey[]) {
    const a = bal[k];
    s = ok(answerBalance(s, k, a ? { answer: "some", amountCents: cents(a) } : { answer: "none" })).state;
  }
  s = ok(answerExceptions(s, { answer: "none" })).state;
  const confirmed = confirmRentReconciliation(s, scope, NOW);
  assert.ok(confirmed.ok);
  return confirmed.state;
}

export type Case = {
  E: number; CO?: number; CC?: number; AO?: number; AC?: number;
  /** Taxe foncière (B) et honoraires de comptable (ACTIVITY), en euros. */
  TF?: number; COMPTA?: number;
  /** Charges comptabilisées NON déductibles (fonds de travaux de copropriété) en euros : 330, jamais B, jamais ACTIVITY. */
  ND?: number;
  dotation: number;
  ardOpen?: number;
  deficits?: { millesime: number; montant: number }[];
  extra?: Partial<ExactDossierSpec>;
};

/** Plan F-010 COHÉRENT avec la dotation F-014 (une ligne bâti) : ce que le parcours produit génère toujours. */
export function consistentPlan(dotation: number, cumulated = dotation) {
  return {
    lignes: [{ id: "gros-oeuvre", label: "Gros œuvre", montant: 160000, dureeAnnees: 50, dotationExercice: dotation, amortissementsCumules: cumulated }],
    totalAnnuelExercice: dotation,
    totalBrut: 160000,
  };
}

export function withConsistentPlan(ws: PersistedWorkspace, dotation: number, cumulated = dotation): PersistedWorkspace {
  const d = ws.declarationDraft as any;
  return { ...ws, declarationDraft: { ...d, logementAmortissement: { ...d.logementAmortissement, dotationAnnuelle: dotation, plan: consistentPlan(dotation, cumulated) } } } as PersistedWorkspace;
}

export function caseDossier(c: Case, propertyId = "prop-1"): PersistedWorkspace {
  // GATE-1.1 : une créance / avance d'OUVERTURE n'est admise qu'avec une antériorité DÉMONTRÉE (continuité native) ; en première année
  // réelle déclarée elle est refusée (arbitrage doctrinal requis). Stocks nuls = continuité native avec stocks démontrés à zéro.
  const hasStocks = (c.ardOpen ?? 0) > 0 || (c.deficits?.length ?? 0) > 0 || (c.CO ?? 0) > 0 || (c.AO ?? 0) > 0;
  const collected: Record<string, number> = {};
  if (c.TF !== undefined && c.TF > 0) collected.taxeFonciere = c.TF;
  if (c.COMPTA !== undefined && c.COMPTA > 0) collected.honorairesComptable = c.COMPTA;
  if (c.ND !== undefined && c.ND > 0) (collected as any).coproLignes = [{ id: "fonds-travaux", type: "fonds_travaux", montant: c.ND }];
  return withConsistentPlan(exactDossier({
    cash: c.E,
    dotation: c.dotation,
    propertyId,
    collected: collected as never,
    ...(hasStocks ? { openingStocks: { deficits: c.deficits ?? [], amortissementsReportes: c.ardOpen ?? 0 } } : {}),
    bien: { rent: rentFull(propertyId, c) },
    ...c.extra,
  }), c.dotation);
}

// ---------------------------------------------------------------------------
// Multi-biens EXACT : UN dossier, N biens, charges d'activité globales optionnelles
// ---------------------------------------------------------------------------

export type MultiCase = {
  biens: Array<Case & { id: string }>;
  /** Charge d'activité GLOBALE (comptabilité de l'exploitant), en euros. */
  globalActivity?: number;
  /** Stocks d'ouverture globaux (première année exacte avec antériorité démontrée). */
  openingStocks?: { deficits: { millesime: number; montant: number }[]; amortissementsReportes: number };
};

export function multiDossier(m: MultiCase): PersistedWorkspace {
  const attest = { ssi: { answer: "confirmed", at: "t", wordingVersion: "v" }, directHolding: { answer: "confirmed", at: "t", wordingVersion: "v" }, noCommonCharges: { answer: "confirmed", at: "t", wordingVersion: "2026-10-05.exact-1" } };
  const biens: Record<string, any> = {};
  for (const c of m.biens) {
    const collected: Record<string, number> = {};
    if ((c.TF ?? 0) > 0) collected.taxeFonciere = c.TF!;
    if ((c.COMPTA ?? 0) > 0) collected.honorairesComptable = c.COMPTA!;
    Object.assign(collected, (c.extra?.collected ?? {}) as Record<string, number>);
    const b: any = bienFixture(c.id, { rent: rentFull(c.id, c), collected: collectedFixture(collected as never), logement: {}, dotation: c.dotation });
    b.logementAmortissement = { computedAt: "t", exerciceFiscal: YEAR, prixRevient: 100000, valeurTerrain: 20000, valeurBati: 80000, baseAmortissableBati: 80000, montantMobilier: 0, dotationAnnuelle: c.dotation, dureeMoyenneAnnees: 30, plan: consistentPlan(c.dotation) };
    b.amortissementAssistant = { exerciceFiscal: YEAR, totalDotations: c.dotation, status: "validated" };
    biens[c.id] = b;
  }
  const store = (m.globalActivity ?? 0) > 0
    ? recordActivityCharge(emptyQualificationStore(), { charge: { sourceId: "activity-accounting_fees-2026", fiscalYear: YEAR, nature: "ACCOUNTING_FEES", amountCents: cents(m.globalActivity!), description: "Comptable", provenance: "declaration" }, answeredAt: "t" })
    : undefined;
  const ws: any = multiWorkspace(biens, {
    multiPropertyAttestations: attest, siret: "12345678901234", siren: "123456789", exploitantFirstName: "M", exploitantLastName: "D", exploitantEmail: "a@b.fr",
    exploitantTelephone: "0601020304", personalAddress: "1 rue", personalCity: "Lyon", personalPostalCode: "69001", activityType: "LMNP",
    ...(store !== undefined ? { article39cActivityQualifications: store } : {}),
  });
  ws.fiscalYear = {
    ...ws.fiscalYear, regime: "reel",
    ...(m.openingStocks === undefined
      ? { priorHistoryDeclaration: { status: "FIRST_REAL_YEAR", declaredAt: "t" } }
      : { previousFiscalYearId: "fy-0", stocksOuverture: { sourceClosureId: "closure-prev", stocks: m.openingStocks } }),
  };
  return ws;
}

export const multiOracleInput = (m: MultiCase, year = YEAR) => {
  const sum = (f: (c: Case) => number) => m.biens.reduce((n, c) => n + f(c), 0);
  return {
    E: sum((c) => cents(c.E)), CO: sum((c) => cents(c.CO ?? 0)), CC: sum((c) => cents(c.CC ?? 0)), AO: sum((c) => cents(c.AO ?? 0)), AC: sum((c) => cents(c.AC ?? 0)),
    B: sum((c) => cents(c.TF ?? 0)), ACTIVITY: sum((c) => cents(c.COMPTA ?? 0)) + cents(m.globalActivity ?? 0),
    dotation: sum((c) => cents(c.dotation)), ardOpen: cents(m.openingStocks?.amortissementsReportes ?? 0),
    deficits: (m.openingStocks?.deficits ?? []).map((d) => ({ millesime: d.millesime, montant: cents(d.montant) })), year,
  };
};

// ---------------------------------------------------------------------------
// N → N+1 : vraie transition (clôture + prepareFiscalYearTransitionCandidate), puis dossier N+1 construit par les parcours réels
// ---------------------------------------------------------------------------
import { runDeclarationGenerationFromWorkspace } from "@/lib/lmnp/services/declaration/generation-workspace";
import { prepareFiscalYearTransitionCandidate } from "@/lib/lmnp/services/fiscal-year-transition/prepare-transition";

/** Remplace l'exercice 2026 par `year` dans toutes les copies de l'exercice portées par un dossier fixture (état F012 / F010 / F014). */
export function bumpYear<T>(value: T, year: number): T {
  const KEYS = new Set(["exerciceFiscal", "fiscalYear", "year", "exercise", "exerciseYear", "exercice"]);
  const walk = (v: any, key?: string): any => {
    if (Array.isArray(v)) return v.map((x) => walk(x));
    if (v !== null && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, walk(x, k)]));
    if (typeof v === "number" && v === YEAR && key !== undefined && KEYS.has(key)) return year;
    return v;
  };
  return walk(value);
}

export type TransitionResult = { ok: true; next: PersistedWorkspace; closure: { deficits: { millesime: number; montant: number }[]; amortissementsReportes: number } } | { ok: false; code: string; reason: string };

/** Génère N, la clôt via la transition réelle, et renvoie le workspace N+1 d'ouverture (sans données de N+1). */
export function closeAndOpenNext(n: PersistedWorkspace): TransitionResult {
  const g: any = genProd(n);
  assert.equal(g.status, "generated", JSON.stringify(g.blockingReasons ?? g.anomalies));
  const closable: any = {
    ...n,
    fiscalYear: { ...n.fiscalYear, status: "ready_to_close", declarationGeneratedAt: NOW },
    declarationDraft: { ...(n.declarationDraft as any), fiscalResult: g.fiscalResult, rfs: g.rfs, liasseRfs: g.liasseRfs },
  };
  const p: any = prepareFiscalYearTransitionCandidate({ workspace: closable, dossierId: n.fiscalYear.dossierId ?? "dossier-1", now: "2027-01-05T00:00:00.000Z", nextFiscalYearId: "fy-next" });
  if (!p.ok) return { ok: false, code: p.code, reason: p.reason };
  return { ok: true, next: p.nextWorkspace, closure: p.closedFiscalYear.closures[0].stocks };
}

/** N+1 = ouverture issue de la transition + données de l'exercice N+1 saisies par les parcours réels (F013 v2 manuel, F012, F010/F014). */
export function nextYearDossier(open: PersistedWorkspace, c: Case, year = YEAR + 1, propertyId = "prop-1"): PersistedWorkspace {
  const base: any = bumpYear(withConsistentPlan(exactDossier({ cash: c.E, dotation: c.dotation, propertyId, collected: { ...(c.TF ? { taxeFonciere: c.TF } : {}), ...(c.COMPTA ? { honorairesComptable: c.COMPTA } : {}) } as never, bien: { rent: rentFull(propertyId, c, YEAR) } }), c.dotation, ((open.fiscalYear as any).immobilisationsOuverture?.amortissementsCumules ?? 0) + c.dotation), year);
  const openState = (open.declarationDraft as any).rentReconciliationV2 as RentReconciliationV2State;
  let s = openState;
  const ok = <T extends { ok: boolean }>(r: T) => { assert.equal(r.ok, true, JSON.stringify(r)); return r as Extract<T, { ok: true }>; };
  s = ok(answerCollections(s, cents(c.E))).state;
  s = answerCoverage(s, "all");
  for (const [k, v] of [["closingReceivables", c.CC], ["closingAdvances", c.AC]] as const) s = ok(answerBalance(s, k, v ? { answer: "some", amountCents: cents(v) } : { answer: "none" })).state;
  s = ok(answerExceptions(s, { answer: "none" })).state;
  const conf = confirmRentReconciliation(s, { propertyId, fiscalYear: year }, NOW);
  assert.ok(conf.ok);
  return { ...base, fiscalYear: { ...open.fiscalYear, regime: "reel" }, declarationDraft: { ...base.declarationDraft, rentReconciliationV2: conf.state } } as PersistedWorkspace;
}

// ---------------------------------------------------------------------------
// Génération « comme la production » : mêmes options que l'écran de validation et que la livraison serveur (authoritative-delivery)
// ---------------------------------------------------------------------------
import { resolveImmobilisationsContinuityForGeneration } from "@/lib/lmnp/services/dossier/fiscal-year-cycle";
import { resolvePersistedExternalTakeoverOpening } from "@/lib/lmnp/services/declaration/prior-history-eligibility";

export function productionOptions(ws: PersistedWorkspace) {
  const year: any = ws.fiscalYear;
  const draft: any = ws.declarationDraft;
  return {
    stocksOuverture: year.stocksOuverture?.stocks,
    bilanInputs: draft?.bilanPatrimonial,
    dispense2033AIntake: draft?.dispense2033A,
    continuity: resolveImmobilisationsContinuityForGeneration({
      draft, properties: ws.properties, propertyIds: year.propertyIds ?? [], immobilisationsOuverture: year.immobilisationsOuverture,
      repriseHistoriqueEnContinuite: year.repriseHistoriqueEnContinuite, previousFiscalYearId: year.previousFiscalYearId, continuiteNativeVerifiee: year.continuiteNativeVerifiee,
    }),
    fiscalYearOpening: resolvePersistedExternalTakeoverOpening(year),
  };
}

export function genProd(ws: PersistedWorkspace, extra: Record<string, unknown> = {}) {
  return runDeclarationGenerationFromWorkspace(ws, { ...productionOptions(ws), ...extra } as never);
}

// ---------------------------------------------------------------------------
// Mise en service en cours d'année : F012 ventile chaque charge entre exploitation et pré-exploitation (prorata par date)
// ---------------------------------------------------------------------------
import { collectedToChargeRegistry } from "@/runtime/assistants/f012-charges/collected-to-registry";
import { chargeRegistryToComputeInput } from "@/runtime/assistants/f012-charges/registry-to-compute-input";
import { computeChargesExercice } from "@/runtime/capabilities/f012/compute-charges-exercice";
import { buildChargesAssistantOutput } from "@/lib/lmnp/services/f012/charges-assistant-output";

/** Reconstruit la sortie F012 confirmée du dossier pour une `dateMiseEnService` donnée (même construction que `bien()`). */
export function withServiceDate(ws: PersistedWorkspace, date: string): PersistedWorkspace {
  const d: any = ws.declarationDraft;
  const state = d.chargesAssistantState;
  const registry = collectedToChargeRegistry({ collected: state.collected, categoryInventory: [], fieldSources: {}, exercise: YEAR });
  const { charges } = computeChargesExercice(chargeRegistryToComputeInput(registry, { dateMiseEnService: date, fieldSources: {} }));
  return { ...ws, declarationDraft: { ...d, dateMiseEnService: date, chargesAssistantState: { ...state, registry }, chargesAssistant: buildChargesAssistantOutput(charges, {}, "t") } } as PersistedWorkspace;
}
