/**
 * INT-4 — raccordement pré-switch : UI des qualifications, stocks d'ouverture, ACTIVITY globale, bilan F013 (source unique),
 * readiness exact complet. Le F006 productif reste le PROXY historique ; le moteur exact reste DORMANT.
 * Run: npx tsx --test src/lib/lmnp/services/article-39c/article-39c-pre-switch.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import type { PersistedWorkspace } from "@/lib/lmnp/store/persistence";
import type { LigneCharge } from "@/runtime/capabilities/f012/types";
import type { BilanInputs } from "@/runtime/capabilities/bilan/types";
import { assemblePatrimoine } from "@/runtime/capabilities/bilan/assemble-patrimoine";
import { map2033AFromRfs } from "@/runtime/capabilities/rfs/projection/map-2033a";
import type { FiscalRepresentation } from "@/runtime/capabilities/rfs/types";
import type { FiscalResult } from "@/runtime/capabilities/f006/types";
import { resolveEffectiveBilanWithRentInventory } from "@/lib/lmnp/services/f013/v2/f013-v2-bilan-wiring";
import { createRentReconciliationState, type RentReconciliationV2State } from "@/lib/lmnp/services/f013/v2/f013-v2-state";
import { applyFactsChange } from "@/lib/lmnp/services/f013/v2/f013-v2-state";
import {
  ACTIVITY,
  DOSSIER,
  YEAR,
  bien,
  collected,
  eur,
  expense,
  monoWorkspace,
  multiWorkspace,
  pret,
  rentState,
  roundtrip,
} from "./article-39c-test-fixtures";
import { buildConsolidatedArticle39cFromWorkspace, evaluateArticle39cReadiness } from "./consolidation";
import { resolveArticle39cOpeningStocks } from "./opening-stocks";
import { evaluateArticle39cPreSwitchReadiness } from "./pre-switch-readiness";
import { buildArticle39cAnswerAction, pendingArticle39cQuestions, type Article39cQuestion } from "./questions";
import {
  buildActivityChargeDeclaration,
  buildArticle39cCardsModel,
  buildCfeNoticeDeclaration,
  parseEurosToCents,
} from "./qualification-ui-model";
import type { Article39cQualificationAction } from "./qualification-writers";
import type { Article39cContribution } from "./contribution";

async function loadReducer() {
  process.env.NEXT_PUBLIC_SUPABASE_URL ??= "https://test.invalid.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??= "test-anon-key";
  return (await import("@/lib/lmnp/store/reducer")).lmnpReducer;
}
type Reducer = Awaited<ReturnType<typeof loadReducer>>;
type State = Parameters<Reducer>[0];
const AT = "2026-12-01T00:00:00.000Z";

async function dispatch(workspace: PersistedWorkspace, action: Article39cQualificationAction | undefined): Promise<PersistedWorkspace> {
  assert.ok(action, "une action était attendue");
  const reducer = await loadReducer();
  const next = reducer({ ...workspace, fileRegistry: new Map() } as unknown as State, action as unknown as Parameters<Reducer>[1]) as unknown as PersistedWorkspace;
  const { fileRegistry: _ignored, ...persistable } = next as unknown as Record<string, unknown>;
  void _ignored;
  return roundtrip(persistable as unknown as PersistedWorkspace).reloaded;
}

/** Première année DÉCLARÉE par le client (autorité d'ouverture existante) : seule preuve admise de `NONE_FIRST_YEAR`. */
const firstYear = (ws: PersistedWorkspace): PersistedWorkspace =>
  ({ ...ws, fiscalYear: { ...ws.fiscalYear, priorHistoryDeclaration: { status: "FIRST_REAL_YEAR", declaredAt: "2026-01-02T00:00:00.000Z" } } }) as PersistedWorkspace;

const withStocks = (ws: PersistedWorkspace, stocks: { deficits: { millesime: number; montant: number }[]; amortissementsReportes: number }): PersistedWorkspace =>
  ({ ...ws, fiscalYear: { ...ws.fiscalYear, previousFiscalYearId: "fy-0", stocksOuverture: { sourceClosureId: "closure-2025", stocks } } }) as PersistedWorkspace;

const exactBien = (id: string, e: number, c: Parameters<typeof collected>[0] = {}, extra: Parameters<typeof bien>[1] = {}, cc = 0, ac = 0) =>
  bien(id, { rent: rentState(id, e, cc, ac), collected: collected(c), logement: {}, dotation: 0, ...extra });

const pre = (ws: PersistedWorkspace) => evaluateArticle39cPreSwitchReadiness({ workspace: roundtrip(ws).reloaded, expectedDossierId: DOSSIER });
const facts = (ws: PersistedWorkspace) => buildConsolidatedArticle39cFromWorkspace({ workspace: roundtrip(ws).reloaded, expectedDossierId: DOSSIER });
const qs = (ws: PersistedWorkspace) => pendingArticle39cQuestions({ workspace: ws, expectedDossierId: DOSSIER });
const ofKind = (list: readonly Article39cQuestion[], kind: Article39cQuestion["kind"]) => list.filter((q) => q.kind === kind);
const find = (items: readonly Article39cContribution[], fragment: string, part?: string) =>
  items.find((c) => c.contributionId.includes(fragment) && (part === undefined || c.contributionId.endsWith(`|${part}`)));

async function answer(ws: PersistedWorkspace, question: Article39cQuestion, value: string, choice: Partial<Parameters<typeof buildArticle39cAnswerAction>[0]> = {}): Promise<PersistedWorkspace> {
  const res = buildArticle39cAnswerAction({ draft: ws.declarationDraft, question, answer: value, answeredAt: AT, ...choice });
  assert.ok(res.ok, JSON.stringify(res));
  return res.action === undefined ? ws : dispatch(ws, res.action);
}

// ---------------------------------------------------------------------------
// UI : questions contextuelles → writers → reducer → reload
// ---------------------------------------------------------------------------

describe("INT-4 — questions montées (modèle de la carte) : PNO, gestion, frais bancaires, CFE", () => {
  const pnoAmbiguous = () => exactBien("A", 12000, { documentExpenses: [expense({ id: "ass-1", category: "assurance_pno", montant: 400, insuranceKind: "logement" })] });

  it("INT4-01 — PNO ambiguë : question → OUI → B après reload ; aucune question pour un dossier legacy (sans F013 v2)", async () => {
    const ws = monoWorkspace("A", pnoAmbiguous());
    const model = buildArticle39cCardsModel({ workspace: ws, expectedDossierId: DOSSIER });
    assert.equal(model.applicable, true);
    const question = ofKind(model.questions, "PNO_CONFIRMATION")[0]!;
    assert.equal(question.prompt, "Cette assurance correspond-elle à l'assurance propriétaire non occupant (PNO) du logement ?");
    assert.deepEqual(question.options.map((o) => o.label), ["Oui", "Non", "Je ne sais pas"]);
    const after = await answer(ws, question, "YES");
    assert.equal(find(facts(after).contributions, "assurance-pno", "in_year")!.class, "B");

    const legacy = monoWorkspace("A", bien("A", { collected: collected({ documentExpenses: [expense({ id: "ass-1", category: "assurance_pno", montant: 400, insuranceKind: "logement" })] }), logement: {}, dotation: 0 }));
    const legacyModel = buildArticle39cCardsModel({ workspace: legacy, expectedDossierId: DOSSIER });
    assert.deepEqual({ applicable: legacyModel.applicable, questions: legacyModel.questions.length }, { applicable: false, questions: 0 });
  });

  it("INT4-02 — PNO déjà explicite ou aucune assurance : aucune question", () => {
    const explicit = monoWorkspace("A", exactBien("A", 12000, { assurancePno: 400 }));
    assert.deepEqual(buildArticle39cCardsModel({ workspace: explicit, expectedDossierId: DOSSIER }).questions, []);
    const none = monoWorkspace("A", exactBien("A", 12000));
    assert.deepEqual(buildArticle39cCardsModel({ workspace: none, expectedDossierId: DOSSIER }).questions, []);
  });

  it("INT4-03 — frais d'agence manuels : question → gestion courante → B (libellés métier, pas de jargon)", async () => {
    const ws = monoWorkspace("A", exactBien("A", 12000, { honorairesGestion: 800 }));
    const question = ofKind(buildArticle39cCardsModel({ workspace: ws, expectedDossierId: DOSSIER }).questions, "AGENCY_FEE_NATURE")[0]!;
    assert.equal(question.prompt, "À quoi correspondent principalement ces frais d'agence ?");
    assert.ok(question.options.every((o) => !/\b(B|ACTIVITY|PROPERTY_MANAGEMENT|LETTING)\b/.test(o.label)));
    assert.equal(find(facts(await answer(ws, question, "PROPERTY_MANAGEMENT")).contributions, "honoraires-gestion", "in_year")!.class, "B");
    assert.equal(find(facts(await answer(ws, question, "LETTING")).contributions, "honoraires-gestion", "in_year")!.class, "NEEDS_QUALIFICATION");
  });

  it("frais bancaires : question seulement si montant ; plusieurs prêts → jamais choisi automatiquement ; choix explicite persisté", async () => {
    const none = monoWorkspace("A", exactBien("A", 12000));
    assert.deepEqual(ofKind(qs(none), "BANK_FEE_PURPOSE"), []);
    const two = monoWorkspace("A", exactBien("A", 12000, { fraisBancaires: 200 }, { financement: [pret({ pretId: "loan-1", interetsEmpruntExercice: 500 }), pret({ pretId: "loan-2", interetsEmpruntExercice: 500 })] }));
    const q = ofKind(qs(two), "BANK_FEE_PURPOSE")[0]!;
    assert.equal(find(facts(await answer(two, q, "FINANCING")).contributions, "frais-bancaires", "in_year")!.class, "NEEDS_QUALIFICATION");
    const chosen = find(facts(await answer(two, q, "FINANCING", { loanId: "loan-2" })).contributions, "frais-bancaires", "in_year")!;
    assert.deepEqual([chosen.class, chosen.loanId], ["B", "loan-2"]);
  });
});

describe("INT-4 — CFE : source dédiée, base, lien avec une ancienne ligne « divers »", () => {
  const notice = async (ws: PersistedWorkspace, amountText = "500,00") => {
    const res = buildCfeNoticeDeclaration({ draft: ws.declarationDraft, fiscalYear: YEAR, amountText, answeredAt: AT });
    assert.ok(res.ok);
    return dispatch(ws, res.action);
  };
  const diversCfe = { divers: [{ id: "divers-cfe", description: "CFE 2026", montant: 500 }] };

  it("INT4-04 — source dédiée + base minimum → ACTIVITY (STRONG_INFERENCE) ; avis non répondu → question avec le texte exact", async () => {
    const ws = await notice(monoWorkspace("A", exactBien("A", 12000)));
    const q = ofKind(qs(ws), "CFE_BASE")[0]!;
    assert.equal(q.prompt, "Votre avis de CFE est-il calculé sur une base minimum ou sur la valeur locative d'un établissement ?");
    assert.deepEqual(q.options.map((o) => o.label), ["Base minimum", "Valeur locative", "Je ne sais pas"]);
    const c = facts(await answer(ws, q, "MINIMUM_BASE")).contributions.find((x) => x.source === "CFE_NOTICE")!;
    assert.deepEqual([c.class, c.proofLevel, c.scope], ["ACTIVITY", "STRONG_INFERENCE", { level: "ACTIVITY" }]);
    assert.deepEqual(buildCfeNoticeDeclaration({ draft: ws.declarationDraft, fiscalYear: YEAR, amountText: "abc", answeredAt: AT }), { ok: false, reason: "INVALID_AMOUNT" });
    assert.equal(parseEurosToCents("1 234,56"), 123456);
    assert.equal(parseEurosToCents("0"), undefined);
  });

  it("INT4-05 — divers 500 + CFE dédiée 500 + « oui, c'est la même dépense » → UNE seule contribution active (jamais deux)", async () => {
    const ws = await notice(monoWorkspace("A", exactBien("A", 12000, diversCfe)));
    const link = ofKind(qs(ws), "CFE_DIVERS_LINK")[0]!;
    assert.equal(link.prompt, "Cette dépense correspond-elle à la CFE que vous venez de renseigner ?");
    assert.deepEqual(link.options.map((o) => o.label), ["Oui, c'est la même dépense", "Non, ce sont deux dépenses différentes", "Je ne sais pas"]);
    const linked = facts(await answer(ws, link, "SAME"));
    assert.equal(find(linked.contributions, "divers-cfe", "in_year")!.class, "EXCLUDED");
    const active = linked.contributions.filter((c) => (c.contributionId.includes("divers-cfe") || c.source === "CFE_NOTICE") && c.class !== "EXCLUDED");
    assert.equal(active.length, 1);
    assert.ok(!linked.blockers.some((b) => b.code === "CFE_DIVERS_CONFLICT"));
  });

  it("INT4-06 — « non, deux dépenses différentes » → les deux faits sont conservés selon leur qualification respective", async () => {
    const ws = await notice(monoWorkspace("A", exactBien("A", 12000, diversCfe)));
    const distinct = facts(await answer(ws, ofKind(qs(ws), "CFE_DIVERS_LINK")[0]!, "DISTINCT"));
    assert.equal(find(distinct.contributions, "divers-cfe", "in_year")!.class, "NEEDS_QUALIFICATION");
    assert.ok(distinct.contributions.some((c) => c.source === "CFE_NOTICE"));
    assert.ok(!distinct.blockers.some((b) => b.code === "CFE_DIVERS_CONFLICT"));
  });

  it("INT4-07 — « je ne sais pas » → conflit conservé (NEEDS_QUALIFICATION), question non répétée, jamais résolu par défaut", async () => {
    const ws = await notice(monoWorkspace("A", exactBien("A", 12000, diversCfe)));
    const unknown = await answer(ws, ofKind(qs(ws), "CFE_DIVERS_LINK")[0]!, "UNKNOWN");
    assert.ok(facts(unknown).blockers.some((b) => b.code === "CFE_DIVERS_CONFLICT"));
    assert.equal(evaluateArticle39cReadiness(facts(firstYear(unknown))).status, "NEEDS_QUALIFICATION");
    assert.deepEqual(ofKind(qs(unknown), "CFE_DIVERS_LINK"), []);
  });

  it("CFE d'activité + « divers » d'un bien de même montant : la liaison désigne explicitement le bien (multi), sans fusion par libellé", async () => {
    const ws = await notice(multiWorkspace({ A: exactBien("A", 12000, diversCfe), B: exactBien("B", 8000) }));
    const link = ofKind(qs(ws), "CFE_DIVERS_LINK")[0]!;
    assert.deepEqual(link.scope, ACTIVITY);
    assert.equal(link.candidateLines?.length, 1);
    const linked = facts(await answer(ws, link, "SAME"));
    assert.equal(find(linked.contributions, "divers-cfe", "in_year")!.class, "EXCLUDED");
    assert.ok(!linked.blockers.some((b) => b.code === "CFE_DIVERS_CONFLICT"));
    // Plusieurs candidates : jamais choisie automatiquement.
    const two = await notice(multiWorkspace({ A: exactBien("A", 12000, diversCfe), B: exactBien("B", 8000, { divers: [{ id: "divers-b", description: "Autre", montant: 500 }] }) }));
    const q2 = ofKind(qs(two), "CFE_DIVERS_LINK")[0]!;
    assert.equal(q2.candidateLines?.length, 2);
    assert.deepEqual(buildArticle39cAnswerAction({ draft: two.declarationDraft, question: q2, answer: "SAME", answeredAt: AT }), { ok: false, reason: "LINE_REQUIRED" });
  });
});

describe("INT-4 — invalidation par réponse (mono, multi, store d'activité)", () => {
  it("une réponse contributive périme la génération ; une charge d'activité aussi ; une réponse identique = no-op", async () => {
    const reducer = await loadReducer();
    const stale = (ws: PersistedWorkspace) => ({ ...ws, fiscalYear: { ...ws.fiscalYear, declarationGeneratedAt: "2026-06-01T10:00:00Z", paidAt: "2026-06-01T09:00:00Z" } }) as PersistedWorkspace;
    for (const ws of [
      monoWorkspace("A", exactBien("A", 12000)),
      multiWorkspace({ A: exactBien("A", 12000), B: exactBien("B", 8000) }),
    ]) {
      const generated = stale(ws);
      const res = buildActivityChargeDeclaration({ draft: generated.declarationDraft, fiscalYear: YEAR, nature: "ACCOUNTING_FEES", amountText: "480", description: "", answeredAt: AT });
      assert.ok(res.ok && res.action);
      const next = reducer({ ...generated, fileRegistry: new Map() } as unknown as State, res.action as unknown as Parameters<Reducer>[1]);
      assert.equal(next.fiscalYear.declarationGeneratedAt, undefined);
      assert.equal(next.fiscalYear.paidAt, "2026-06-01T09:00:00Z");
      const again = buildActivityChargeDeclaration({ draft: (next as unknown as PersistedWorkspace).declarationDraft, fiscalYear: YEAR, nature: "ACCOUNTING_FEES", amountText: "480", description: "", answeredAt: "2027-01-01T00:00:00.000Z" });
      assert.ok(again.ok);
      assert.equal(again.action, undefined);
    }
  });
});

// ---------------------------------------------------------------------------
// Stocks d'ouverture
// ---------------------------------------------------------------------------

describe("INT-4 — stocks d'ouverture : autorité de lecture explicite", () => {
  const base = () => monoWorkspace("A", exactBien("A", 12000, { taxeFonciere: 4000 }, { dotation: 1000 }));

  it("INT4-08 — continuité native : ARD N−1 et déficit restant N−1 → ouvertures N séparées", () => {
    const ws = withStocks(base(), { deficits: [{ millesime: 2025, montant: 3000 }], amortissementsReportes: 2000 });
    const r = resolveArticle39cOpeningStocks({ fiscalYear: ws.fiscalYear });
    assert.equal(r.status, "RESOLVED");
    assert.deepEqual(r.status === "RESOLVED" ? r.stocks : null, {
      kind: "PROVIDED",
      historicalArdStock: 2000,
      priorDeficits: [{ millesime: 2025, montant: 3000 }],
      basis: "NATIVE_CONTINUITY",
      sourceRef: "closure-2025",
    });
  });

  it("N → N+1 : la clôture existante transporte ARD et déficits SÉPARÉMENT (aucun mélange), lus par l'autorité d'ouverture", async () => {
    const { resolveStocksOuverture, applyStocksOuvertureResult } = await import("@/lib/lmnp/services/dossier/fiscal-year-cycle");
    const closedN = {
      id: "fy-0", dossierId: DOSSIER, year: YEAR - 1, status: "closed", regime: "reel_simplifie", propertyIds: ["A"], createdAt: "t", updatedAt: "t",
      closures: [{ id: "closure-2025", stocks: { deficits: [{ millesime: 2025, montant: 3000 }], amortissementsReportes: 2000 } }],
    } as never;
    const ws = base();
    const next = applyStocksOuvertureResult({ ...ws.fiscalYear, previousFiscalYearId: "fy-0" } as never, resolveStocksOuverture({ ...ws.fiscalYear, previousFiscalYearId: "fy-0" } as never, closedN));
    const r = resolveArticle39cOpeningStocks({ fiscalYear: next });
    assert.deepEqual(r.status === "RESOLVED" && r.stocks.kind === "PROVIDED" ? [r.stocks.historicalArdStock, r.stocks.priorDeficits] : null, [2000, [{ millesime: 2025, montant: 3000 }]]);
    // Clôture absente : jamais zéro (le garde existant refuse, l'autorité d'ouverture reste INCONNUE).
    const open = applyStocksOuvertureResult({ ...ws.fiscalYear, previousFiscalYearId: "fy-0" } as never, resolveStocksOuverture({ ...ws.fiscalYear, previousFiscalYearId: "fy-0" } as never, { ...(closedN as object), status: "ready_to_close" } as never));
    assert.equal(resolveArticle39cOpeningStocks({ fiscalYear: open }).status, "UNKNOWN");
  });

  it("INT4-09 — première année prouvée (réponse explicite du client) → NONE_FIRST_YEAR accepté", () => {
    const r = resolveArticle39cOpeningStocks({ fiscalYear: firstYear(base()).fiscalYear });
    assert.deepEqual(r.status === "RESOLVED" ? r.stocks.kind : null, "NONE_FIRST_YEAR");
    const consolidated = facts(firstYear(base()));
    assert.equal(consolidated.openingStocks?.kind, "NONE_FIRST_YEAR");
    assert.ok(!consolidated.blockers.some((b) => b.code === "OPENING_STOCKS_UNKNOWN"));
  });

  it("INT4-10 — première année NON prouvée → INVALID, jamais 0 implicite (ni date de début d'activité, ni mise en service ne prouvent)", () => {
    const ws = base();
    const withDates = { ...ws, declarationDraft: { ...ws.declarationDraft, activityStartDate: "2026-01-01", dateMiseEnService: "2026-01-01" } } as PersistedWorkspace;
    for (const candidate of [ws, withDates]) {
      const r = resolveArticle39cOpeningStocks({ fiscalYear: candidate.fiscalYear });
      assert.deepEqual(r, { status: "UNKNOWN", reasons: ["OPENING_STOCKS_UNKNOWN", "PRIOR_HISTORY_ANSWER_REQUIRED"] });
      const readiness = pre(candidate);
      assert.equal(readiness.status, "INVALID");
      assert.ok(readiness.reasons.includes("OPENING_STOCKS_UNKNOWN"));
      assert.equal(readiness.exact.engine, undefined, "aucun calcul exact sans stocks démontrés");
      assert.equal(readiness.checks.find((c) => c.id === "OPENING_STOCKS_KNOWN")!.ok, false);
    }
    // Antériorité externe déclarée sans reprise validée : pas de stock.
    const external = { ...ws, fiscalYear: { ...ws.fiscalYear, priorHistoryDeclaration: { status: "EXTERNAL_HISTORY", declaredAt: "t" } } } as PersistedWorkspace;
    assert.equal(resolveArticle39cOpeningStocks({ fiscalYear: external.fiscalYear }).status, "UNKNOWN");
    // Prédécesseur déclaré sans stocks persistés : jamais zéro.
    const orphan = { ...ws, fiscalYear: { ...ws.fiscalYear, previousFiscalYearId: "fy-0" } } as PersistedWorkspace;
    assert.equal(resolveArticle39cOpeningStocks({ fiscalYear: orphan.fiscalYear }).status, "UNKNOWN");
  });

  it("INT4-11 — ARD 2k + déficit 3k restent DEUX stocks : H = 2k puis déficit imputé 3k (jamais confondus)", () => {
    const ws = withStocks(monoWorkspace("A", exactBien("A", 10000, { taxeFonciere: 4000 }, { dotation: 1000 })), { deficits: [{ millesime: 2025, montant: 3000 }], amortissementsReportes: 2000 });
    const f = pre(ws).exact.engine!.figures!;
    assert.equal(f.ardConsomme, 2000, "ARD historique consommé = 2 000");
    assert.equal(f.resultatApresAmortissements, 3000);
    assert.equal(f.deficitsImputes, 3000, "déficit antérieur imputé = 3 000, après l'ARD");
    assert.equal(f.stockArdFinal, 0);
    assert.deepEqual(f.stockDeficits, []);
    // Inversion des deux montants : résultat différent (preuve que les stocks ne sont pas interchangeables).
    const swapped = withStocks(monoWorkspace("A", exactBien("A", 10000, { taxeFonciere: 4000 }, { dotation: 1000 })), { deficits: [{ millesime: 2025, montant: 2000 }], amortissementsReportes: 3000 });
    const g = pre(swapped).exact.engine!.figures!;
    assert.deepEqual([g.ardConsomme, g.deficitsImputes], [3000, 2000]);
  });
});

// ---------------------------------------------------------------------------
// ACTIVITY globale
// ---------------------------------------------------------------------------

describe("INT-4 — charges ACTIVITY globales : source persistée niveau activité", () => {
  const addAccounting = async (ws: PersistedWorkspace, amount = "1000", nature: "ACCOUNTING_FEES" | "ACCOUNTING_OR_TAX_SOFTWARE" | "OTHER" = "ACCOUNTING_FEES", description = "") => {
    const res = buildActivityChargeDeclaration({ draft: ws.declarationDraft, fiscalYear: YEAR, nature, amountText: amount, description, answeredAt: AT });
    assert.ok(res.ok, JSON.stringify(res));
    return dispatch(ws, res.action);
  };

  it("INT4-12 — comptabilité globale 1 000 € → ACTIVITY 1 000 € sans propertyId, avec fingerprint et provenance", async () => {
    const ws = await addAccounting(monoWorkspace("A", exactBien("A", 12000)));
    const c = facts(ws).contributions.find((x) => x.scope.level === "ACTIVITY")!;
    assert.deepEqual([c.class, c.amountCents, c.proofLevel], ["ACTIVITY", eur(1000), "DIRECT"]);
    assert.ok(!("propertyId" in c.scope));
    assert.ok(c.sourceFingerprint.length > 0 && c.provenance.length > 0);
    // Logiciel : ACTIVITY par INFERENCE (seule la comptabilité est un exemple doctrinal direct).
    const soft = facts(await addAccounting(monoWorkspace("A", exactBien("A", 12000)), "300", "ACCOUNTING_OR_TAX_SOFTWARE")).contributions.find((x) => x.scope.level === "ACTIVITY")!;
    assert.deepEqual([soft.class, soft.proofLevel], ["ACTIVITY", "INFERENCE"]);
    // Autre frais : jamais définitivement ACTIVITY.
    const other = facts(await addAccounting(monoWorkspace("A", exactBien("A", 12000)), "200", "OTHER", "Frais divers")).contributions.find((x) => x.scope.level === "ACTIVITY")!;
    assert.equal(other.class, "NEEDS_QUALIFICATION");
  });

  it("INT4-13 — multi A L10/B2, B L8/B1, ACTIVITY globale 1 → C 15 000, aucune allocation, un seul appel moteur", async () => {
    const ws = firstYear(
      await addAccounting(
        multiWorkspace({
          A: exactBien("A", 10000, { taxeFonciere: 2000 }, { dotation: 2500 }),
          B: exactBien("B", 8000, { taxeFonciere: 1000 }, { dotation: 1500 }),
        }),
      ),
    );
    const readiness = pre(ws);
    assert.equal(readiness.status, "READY");
    const f = readiness.exact.engine!.figures!;
    assert.deepEqual([f.capacite, f.resultatAvantAmort, f.amortDeduit], [15000, 14000, 4000]);
    const consolidated = readiness.exact.consolidated;
    assert.equal(consolidated.activityCents.ACTIVITY, eur(1000));
    assert.equal(consolidated.byPropertyCents.A!.ACTIVITY + consolidated.byPropertyCents.B!.ACTIVITY, 0);
    assert.deepEqual(consolidated.architecture, { capacityScope: "ACTIVITY", engineCalls: 1 });
  });

  it("INT4-14 — charge commune B (ou non résolue) : toujours fail-closed ; doublon avec un logement : conflit explicite", async () => {
    const ws = firstYear(multiWorkspace({ A: exactBien("A", 10000, {}, { dotation: 0 }), B: exactBien("B", 8000, {}, { dotation: 0 }) }));
    const commonB = { id: "tf", description: "Taxe", montant: 500, categorie: "taxe_fonciere", deductibilite: "deductible", montantDeductible: 500, montantPreExploitation: 0, montantAmortissable: 0, source: "manual" } as LigneCharge;
    const blocked = evaluateArticle39cPreSwitchReadiness({ workspace: roundtrip(ws).reloaded, expectedDossierId: DOSSIER, activityLines: [commonB] });
    assert.equal(blocked.status, "OUT_OF_DOMAIN");
    assert.ok(blocked.reasons.includes("COMMON_CHARGE_NOT_SUPPORTED"));
    assert.equal(blocked.checks.find((c) => c.id === "ACTIVITY_GLOBAL_SUPPORTED")!.ok, false);
    // Même montant déjà saisi comme comptabilité dans un logement : jamais compté deux fois en silence.
    const dup = await addAccounting(firstYear(multiWorkspace({ A: exactBien("A", 10000, { honorairesComptable: 1000 }, { dotation: 0 }), B: exactBien("B", 8000, {}, { dotation: 0 }) })));
    const dupReadiness = pre(dup);
    assert.equal(dupReadiness.status, "NEEDS_QUALIFICATION");
    assert.ok(dupReadiness.reasons.includes("ACTIVITY_CHARGE_DUPLICATE_SUSPECTED"));
    const q = ofKind(qs(dup), "ACTIVITY_CHARGE_DUPLICATE")[0]!;
    const same = await answer(dup, q, "SAME");
    assert.equal(facts(same).contributions.filter((c) => c.class === "ACTIVITY").length, 1, "la dépense reste comptée une seule fois");
    const distinct = await answer(dup, q, "DISTINCT");
    assert.equal(pre(distinct).status, "READY");
    assert.equal(facts(distinct).byClassCents.ACTIVITY, eur(2000));
  });
});

// ---------------------------------------------------------------------------
// Bilan F013 : source unique
// ---------------------------------------------------------------------------

const Y = YEAR;
const FISCAL_RESULT: FiscalResult = {
  exercice: Y, recettes: { total: 12000 },
  charges: { totalDeductible: 4000, chargesExploitation: 4000, chargesFinancement: 0, chargesPreExploitation: 0, totalNonDeductible: 100 },
  resultatAvantAmort: 7000, amortCalcule: 1500, amortDeduct: 1500, amortReporte: 0, amortNonDeduitExercice: 0, amortReportesUtilises: 0,
  resultatFiscal: 5500, deficitNouveau: 0, deficitsImputes: 0, perteExceptionnelle: 0,
  stocks: { deficits: [], amortissementsReportes: 0, deficitsExpires: [] },
  trace: { ksArtifacts: ["TRF-0032"], computedAt: "2026-08-31T00:00:00.000Z", journal: [] },
  status: "computed", anomalies: [],
};
const RFS = {
  exercice: Y,
  identite: { siren: "104545108", siret: "10454510800011", denomination: "Pré-switch" },
  fiscalResult: FISCAL_RESULT,
  immobilisations: { lignes: [{ label: "Composant", montant: 45000, dureeAnnees: 30, dotationExercice: 1500, amortissementsCumules: 1500, vnc: 43500 }], totalAnnuelExercice: 1500, totalBrut: 45000, valeurTerrain: 15000 },
  emprunts: [],
  trace: { ksArtifacts: ["TRF-0032"], assembledAt: "2026-08-31T00:00:00.000Z", sourceFiscalResultAt: FISCAL_RESULT.trace.computedAt, sources: { identite: "x", fiscalResult: "y" } },
} as unknown as FiscalRepresentation;

/** Bilan sans bucket tiers : aucune contradiction possible avec l'inventaire. */
const NEUTRAL: BilanInputs = { tresorerie: { bankMode: "DEDIE", closingCash: 3000 }, compteExploitant: { ouverture: 37100, apports: 0, prelevements: 1000 }, ran: { situation: "NATIF" } };
const effective = (base: BilanInputs, states: RentReconciliationV2State[], propertyIds = states.map((s) => s.facts.propertyId)) =>
  resolveEffectiveBilanWithRentInventory({ bilan: base, fiscalYear: Y, propertyIds, states });
const cases = (bilan: BilanInputs) => {
  const patrimoine = assemblePatrimoine(RFS, bilan);
  const form = map2033AFromRfs({ ...RFS, patrimoine });
  return { v: patrimoine.ventilationTiers, c068: form.cases.find((c) => c.caseId === "068")?.value, c174: form.cases.find((c) => c.caseId === "174")?.value };
};

describe("INT-4 — bilan F013 : propriétaire unique des soldes de clôture", () => {
  it("INT4-15 — créance de clôture 1 000 → LOYER_DU_PAR_LOCATAIRE → case 068 = 1 000", () => {
    const r = effective(NEUTRAL, [rentState("A", 11000, 1000)]);
    assert.equal(cases(r.bilan).c068, 1000);
  });
  it("INT4-16 — avance de clôture 500 → LOYER_ENCAISSE_D_AVANCE → case 174 = 500", () => {
    const r = effective(NEUTRAL, [rentState("A", 12500, 0, 500)]);
    assert.equal(cases(r.bilan).c174, 500);
  });
  it("INT4-17 — VALIDATED(0) → zéro confirmé (jamais INCONNU) ; INT4-18 — UNKNOWN / PROPOSED → INCONNU, bilan non prêt", () => {
    const zero = effective(NEUTRAL, [rentState("A", 12000)]);
    assert.equal(zero.status, "READY");
    const z = cases(zero.bilan).v.cases;
    assert.deepEqual([z.clients.status, z.produitsConstatesAvance.status], ["NUL_CONFIRME", "NUL_CONFIRME"]);

    const unknownState = createRentReconciliationState({ propertyId: "A", fiscalYear: Y });
    const unknown = effective(NEUTRAL, [unknownState]);
    assert.equal(unknown.status, "INVENTORY_INCOMPLETE");
    assert.equal(cases(unknown.bilan).v.cases.clients.status, "INCONNU");
    assert.equal(pre(firstYear(monoWorkspace("A", exactBien("A", 12000), { bilanPatrimonial: NEUTRAL, rentReconciliationV2: unknownState }))).readyForExact39c, false);

    const proposed = applyFactsChange(createRentReconciliationState({ propertyId: "A", fiscalYear: Y }), { closingReceivables: { status: "PROPOSED", amountCents: eur(1000), provenance: { kind: "document_proposal" } } as never });
    const p = effective(NEUTRAL, [proposed]);
    assert.equal(p.status, "INVENTORY_INCOMPLETE");
    assert.equal(cases(p.bilan).v.cases.clients.status, "INCONNU", "PROPOSED ne devient jamais un poste de bilan");
    assert.equal(p.projection!.proposed.length, 1);
  });

  it("INT4-19 — créance legacy 1 000 + F013 1 000 → 1 000, jamais 2 000 (saisie legacy remplacée, listée)", () => {
    const legacy: BilanInputs = { ...NEUTRAL, ventilationTiers: { postes: [{ id: "legacy-cc", montant: 1000, nature: "LOYER_DU_PAR_LOCATAIRE" }] } };
    const r = effective(legacy, [rentState("A", 11000, 1000)]);
    const c = cases(r.bilan);
    assert.equal(c.c068, 1000);
    assert.equal(r.superseded.length, 1);
    assert.deepEqual(c.v.conflits, []);
    // Montant legacy différent : remplacé aussi (une seule valeur courante, celle de l'inventaire).
    const other: BilanInputs = { ...NEUTRAL, ventilationTiers: { postes: [{ id: "legacy-cc", montant: 700, nature: "LOYER_DU_PAR_LOCATAIRE" }] } };
    assert.equal(cases(effective(other, [rentState("A", 11000, 1000)]).bilan).c068, 1000);
  });

  it("INT4-20 — avance legacy 500 (poste ou ligne simple 174) + F013 500 → 500, jamais 1 000", () => {
    const poste: BilanInputs = { ...NEUTRAL, ventilationTiers: { postes: [{ id: "legacy-ac", montant: 500, nature: "LOYER_ENCAISSE_D_AVANCE" }] } };
    assert.equal(cases(effective(poste, [rentState("A", 12500, 0, 500)]).bilan).c174, 500);
    const simple: BilanInputs = { ...NEUTRAL, lignesSimples: { produitsConstatesAvance: { status: "DECLARE", montant: 800 } } };
    const r = effective(simple, [rentState("A", 12500, 0, 500)]);
    const c = cases(r.bilan);
    assert.equal(c.c174, 500, "la ligne simple concurrente (même case) est neutralisée, pas sommée ni bloquante");
    assert.ok(r.superseded.some((s) => s.kind === "ligne_simple"));
    assert.deepEqual(c.v.conflits, []);
  });

  it("INT4-21 — `tiers.dettes = NUL_CONFIRME` face à une avance F013 → contradiction EXPLICITE, jamais « aucune dette » + « avance 500 »", () => {
    const legacy: BilanInputs = { ...NEUTRAL, tiers: { dettes: { status: "NUL_CONFIRME" } } };
    const r = effective(legacy, [rentState("A", 12500, 0, 500)]);
    assert.equal(r.status, "CONFLICT");
    assert.deepEqual(r.conflicts.map((c) => c.code), ["TIERS_DETTES_NUL_CONFIRME_VS_F013_ADVANCE"]);
    const patrimoine = assemblePatrimoine(RFS, r.bilan);
    assert.equal(patrimoine.ventilationTiers.projectionFiable, false, "le conflit reste actif en aval : aucune contradiction finale publiée");
    const ws = firstYear(monoWorkspace("A", exactBien("A", 12500, {}, {}, 0, 500), { bilanPatrimonial: legacy }));
    const readiness = pre(ws);
    assert.equal(readiness.status, "NEEDS_QUALIFICATION");
    assert.ok(readiness.reasons.includes("BILAN_RENTAL_CONFLICT"));
    // Même type de contradiction pour une créance.
    const cc = effective({ ...NEUTRAL, tiers: { creances: { status: "NUL_CONFIRME" } } }, [rentState("A", 11000, 1000)]);
    assert.deepEqual(cc.conflicts.map((c) => c.code), ["TIERS_CREANCES_NUL_CONFIRME_VS_F013_RECEIVABLE"]);
  });

  it("INT4-22 — multi : A créance 1 000 + B avance 500 → 068 = 1 000 / 174 = 500 ; un bien non validé empêche la publication", () => {
    const r = effective(NEUTRAL, [rentState("A", 11000, 1000), rentState("B", 8500, 0, 500)]);
    const c = cases(r.bilan);
    assert.deepEqual([c.c068, c.c174], [1000, 500]);
    assert.equal(r.status, "READY");
    const partial = effective(NEUTRAL, [rentState("A", 11000, 1000)], ["A", "B"]);
    assert.equal(partial.status, "INVENTORY_INCOMPLETE");
    assert.equal(cases(partial.bilan).v.cases.clients.status, "INCONNU");
  });

  it("legacy F013 v1 : bilan STRICTEMENT inchangé (même objet), aucune migration silencieuse", () => {
    const legacy: BilanInputs = { ...NEUTRAL, tiers: { creances: { status: "NUL_CONFIRME" }, dettes: { status: "DECLARE", montant: 300 } }, ventilationTiers: { postes: [{ id: "x", montant: 700, nature: "LOYER_ENCAISSE_D_AVANCE" }] } };
    const r = effective(legacy, []);
    assert.equal(r.bilan, legacy);
    assert.equal(r.status, "NOT_APPLICABLE");
    const otherYear = resolveEffectiveBilanWithRentInventory({ bilan: legacy, fiscalYear: Y + 1, propertyIds: ["A"], states: [rentState("A", 11000, 1000)] });
    assert.equal(otherYear.bilan, legacy, "un état d'un autre exercice n'est jamais consommé");
  });
});

describe("INT-4 — câblage productif du bilan (assembleGenerationOutput), gardé par l'état F013 v2", () => {
  const generate = async (bilanInputs: BilanInputs, states: RentReconciliationV2State[]) => {
    const { assembleGenerationOutput, produceLiasseStage } = await import("@/lib/lmnp/services/declaration/run-declaration-generation");
    const identite = RFS.identite;
    const stage = produceLiasseStage(FISCAL_RESULT, identite);
    assert.equal(stage.status, "ok");
    if (stage.status !== "ok") throw new Error("liasse");
    const out = assembleGenerationOutput({
      fiscalResult: FISCAL_RESULT,
      identite,
      liasseResult: stage.liasseResult,
      fiscalYear: Y,
      immobilisations: RFS.immobilisations,
      emprunts: [],
      bilanInputs,
      rentInventory: { propertyIds: states.map((s) => s.facts.propertyId), states },
    });
    assert.equal(out.status, "generated");
    if (out.status !== "generated") throw new Error("generation");
    return out;
  };

  it("dossier F013 v2 : 068 / 174 viennent de l'inventaire (legacy remplacé) ; dossier legacy : sortie IDENTIQUE à la génération sans inventaire", async () => {
    const legacyBilan: BilanInputs = { ...NEUTRAL, ventilationTiers: { postes: [{ id: "legacy", montant: 900, nature: "LOYER_DU_PAR_LOCATAIRE" }] } };
    const v2 = await generate(legacyBilan, [rentState("A", 11000, 1000)]);
    assert.equal(v2.rfs.patrimoine?.ventilationTiers.cases.clients.status, "DECLARE");
    assert.equal((v2.rfs.patrimoine?.ventilationTiers.cases.clients as { montant: number }).montant, 1000);

    const withoutInventory = await generate(legacyBilan, []);
    const legacyOnly = (await import("@/lib/lmnp/services/declaration/run-declaration-generation")).assembleGenerationOutput;
    const stage = (await import("@/lib/lmnp/services/declaration/run-declaration-generation")).produceLiasseStage(FISCAL_RESULT, RFS.identite);
    if (stage.status !== "ok") throw new Error("liasse");
    const noInventoryArg = legacyOnly({ fiscalResult: FISCAL_RESULT, identite: RFS.identite, liasseResult: stage.liasseResult, fiscalYear: Y, immobilisations: RFS.immobilisations, emprunts: [], bilanInputs: legacyBilan });
    assert.deepEqual(withoutInventory.rfs.patrimoine, (noInventoryArg as typeof withoutInventory).rfs.patrimoine, "sans état v2, la présence de l'argument ne change rien");
    assert.equal((withoutInventory.rfs.patrimoine?.ventilationTiers.cases.clients as { montant: number }).montant, 900, "legacy conservé");
  });
});

// ---------------------------------------------------------------------------
// Readiness pré-switch + oracles
// ---------------------------------------------------------------------------

describe("INT-4 — readiness pré-switch (dormant) et oracles", () => {
  const fullMono = () => firstYear(monoWorkspace("A", exactBien("A", 10000, { taxeFonciere: 7000, honorairesComptable: 1000 }, { dotation: 2500 }), { bilanPatrimonial: NEUTRAL }));

  it("INT4-23 — dossier entièrement exact → READY ; READY ≠ activation (proxy productif, moteur dormant)", () => {
    const r = pre(fullMono());
    assert.equal(r.status, "READY");
    assert.equal(r.readyForExact39c, true);
    assert.deepEqual(r.checks.filter((c) => !c.ok), []);
    assert.deepEqual([r.consumption, r.productiveF006], ["DORMANT", "OLD_PROXY"]);
    assert.equal(r.bilan.status, "READY");
  });

  it("INT4-24 — stocks d'ouverture absents → INVALID ; F013 v1 → jamais READY ; stocks mal formés → INVALID", () => {
    const ws = monoWorkspace("A", exactBien("A", 10000, { taxeFonciere: 7000 }, { dotation: 0 }), { bilanPatrimonial: NEUTRAL });
    const r = pre(ws);
    assert.equal(r.status, "INVALID");
    assert.ok(r.reasons.includes("OPENING_STOCKS_UNKNOWN"));
    assert.equal(r.readyForExact39c, false);
    const v1 = firstYear(monoWorkspace("A", bien("A", { collected: collected({ taxeFonciere: 7000 }), logement: {}, dotation: 0 }), { revenusAssistant: { exerciceFiscal: YEAR, totalRecettes: 12000 } }));
    assert.equal(pre(v1).readyForExact39c, false);
    const corrupt = { ...monoWorkspace("A", exactBien("A", 10000)), fiscalYear: { ...monoWorkspace("A", exactBien("A", 10000)).fiscalYear, previousFiscalYearId: "fy-0", stocksOuverture: { sourceClosureId: "c", stocks: { deficits: [{ millesime: 2025, montant: -5 }], amortissementsReportes: 0 } } } } as PersistedWorkspace;
    assert.equal(resolveArticle39cOpeningStocks({ fiscalYear: corrupt.fiscalYear }).status, "UNKNOWN");
  });

  it("matérialité (moteur exact) : incertitude immatérielle → READY_WITH_IMMATERIAL_UNCERTAINTY ; matérielle → NEEDS_QUALIFICATION", async () => {
    const make = (dotation: number) => firstYear(monoWorkspace("A", exactBien("A", 12000, { taxeFonciere: 7000 }, { dotation }), { bilanPatrimonial: NEUTRAL }));
    const withCfe = async (ws: PersistedWorkspace) => {
      const declared = buildCfeNoticeDeclaration({ draft: ws.declarationDraft, fiscalYear: YEAR, amountText: "500", answeredAt: AT });
      assert.ok(declared.ok);
      const declaredWs = await dispatch(ws, declared.action);
      return answer(declaredWs, ofKind(qs(declaredWs), "CFE_BASE")[0]!, "DONT_KNOW");
    };
    const immaterial = pre(await withCfe(make(0)));
    assert.equal(immaterial.status, "READY_WITH_IMMATERIAL_UNCERTAINTY");
    assert.equal(immaterial.readyForExact39c, true);
    assert.deepEqual(immaterial.warnings, ["UNRESOLVED_BUT_IMMATERIAL"]);
    const material = pre(await withCfe(make(6000)));
    assert.equal(material.status, "NEEDS_QUALIFICATION");
    assert.equal(material.readyForExact39c, false);
  });

  it("ORACLE 39C-01 (pipeline complet pré-switch) : L 10k, B 7k, ACT 1k, dotation 2,5k, stocks connus → C 3k, D 2,5k, ARD 0, après −500, déficit 500", () => {
    const f = pre(fullMono()).exact.engine!.figures!;
    assert.deepEqual(
      [f.capacite, f.amortDeduit, f.ardNouvelle, f.resultatApresAmortissements, f.deficitNouveau, f.resultatAvantAmort],
      [3000, 2500, 0, -500, 500, 2000],
    );
  });

  it("ORACLE C (dormant, 2033-B inchangée) : ACT 1k, dotation 1,5k, ARD historique 1,5k → avant 2k, C 3k, D 1,5k, H 1,5k, après −1k, ARD final 0, déficit 1k", () => {
    const ws = withStocks(monoWorkspace("A", exactBien("A", 10000, { taxeFonciere: 7000, honorairesComptable: 1000 }, { dotation: 1500 }), { bilanPatrimonial: NEUTRAL }), { deficits: [], amortissementsReportes: 1500 });
    const r = pre(ws);
    assert.equal(r.status, "READY");
    const f = r.exact.engine!.figures!;
    assert.deepEqual(
      [f.resultatAvantAmort, f.capacite, f.amortDeduit, f.ardConsomme, f.resultatApresAmortissements, f.stockArdFinal, f.deficitNouveau],
      [2000, 3000, 1500, 1500, -1000, 0, 1000],
    );
  });

  it("multi : le garde productif ADR-011 (stocks / charges communes) est LISTÉ comme bloquant d'activation, jamais levé ici", async () => {
    const res = buildActivityChargeDeclaration({ draft: undefined, fiscalYear: YEAR, nature: "ACCOUNTING_FEES", amountText: "1000", description: "", answeredAt: AT });
    assert.ok(res.ok);
    const ws = firstYear(await dispatch(multiWorkspace({ A: exactBien("A", 10000, { taxeFonciere: 2000 }, { dotation: 0 }), B: exactBien("B", 8000, { taxeFonciere: 1000 }, { dotation: 0 }) }, { bilanPatrimonial: NEUTRAL }), res.action));
    const r = pre(ws);
    assert.equal(r.status, "READY");
    assert.ok(r.activationBlockers.includes("ADR011_MULTI_BLOCKS_COMMON_CHARGES_UNTIL_GUARD_EVOLVES"));
  });
});

describe("INT-4 — déterminisme, portée et non-régression", () => {
  it("stocks : même exercice → même résolution ; ARD et déficits ne se mélangent jamais ; aucune horloge", () => {
    const ws = withStocks(monoWorkspace("A", exactBien("A", 12000)), { deficits: [{ millesime: 2024, montant: 100 }, { millesime: 2025, montant: 200 }], amortissementsReportes: 700 });
    const a = resolveArticle39cOpeningStocks({ fiscalYear: ws.fiscalYear });
    const b = resolveArticle39cOpeningStocks({ fiscalYear: structuredClone(ws.fiscalYear) });
    assert.deepEqual(a, b);
    assert.equal(a.status === "RESOLVED" && a.stocks.kind === "PROVIDED" ? a.stocks.historicalArdStock : -1, 700);
  });

  it("sans bien : aucune question, bilan sans propriété, readiness INVALID (jamais READY)", () => {
    const empty = { ...monoWorkspace("A", exactBien("A", 12000)), properties: [], fiscalYear: { ...monoWorkspace("A", exactBien("A", 12000)).fiscalYear, propertyIds: [] } } as PersistedWorkspace;
    const r = pre(empty);
    assert.equal(r.readyForExact39c, false);
    assert.equal(buildArticle39cCardsModel({ workspace: empty, expectedDossierId: DOSSIER }).applicable, false);
  });
});
