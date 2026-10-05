/**
 * INT-3 — qualifications collectables + consolidation EXACTE mono / multi (dormante).
 * Run: npx tsx --test src/lib/lmnp/services/article-39c/article-39c-exact.test.ts
 *
 *   facts source → question métier → writer (action reducer) → reducer → store → reload → adapters INT-1
 *   → contributions property / activity → consolidation → readiness (moteur exact appelé UNE fois, dormant).
 *
 * Les résultats fiscaux sont obtenus DEPUIS les contributions, jamais en construisant les entrées du moteur à la main.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import type { PersistedWorkspace } from "@/lib/lmnp/store/persistence";
import type { LigneCharge } from "@/runtime/capabilities/f012/types";
import type { PretFinancementExercice } from "@/runtime/capabilities/f011/types";
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
  prop,
  rentState,
  roundtrip,
} from "./article-39c-test-fixtures";
import {
  buildConsolidatedArticle39cFromWorkspace,
  evaluateArticle39cReadiness,
  type Article39cReadiness,
  type ConsolidatedArticle39cFacts,
} from "./consolidation";
import type { Article39cContribution } from "./contribution";
import { buildArticle39cAnswerAction, pendingArticle39cQuestions, type Article39cQuestion } from "./questions";
import { writeCfeNotice, type Article39cQualificationAction } from "./qualification-writers";
import { cfeRecordIdFor, parseQualificationStore } from "./qualification-store";
import { buildActivityArticle39cContribution, buildPropertyArticle39cContribution } from "./workspace-sources";
import { consolidateArticle39cFacts } from "./consolidation";

async function loadReducer() {
  process.env.NEXT_PUBLIC_SUPABASE_URL ??= "https://test.invalid.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??= "test-anon-key";
  return (await import("@/lib/lmnp/store/reducer")).lmnpReducer;
}

type Reducer = Awaited<ReturnType<typeof loadReducer>>;
type State = Parameters<Reducer>[0];

const NONE = { kind: "NONE_FIRST_YEAR" } as const;
const AT = "2026-12-01T00:00:00.000Z";

/** Applique une action de writer par le REDUCER réel, puis repasse par le chemin de persistance (sérialisation + reload). */
async function dispatch(workspace: PersistedWorkspace, action: Article39cQualificationAction | undefined, extra: Record<string, unknown> = {}): Promise<PersistedWorkspace> {
  assert.ok(action, "une action de writer était attendue");
  const reducer = await loadReducer();
  const state = { ...workspace, fileRegistry: new Map(), ...extra } as unknown as State;
  const next = reducer(state, action as unknown as Parameters<Reducer>[1]) as unknown as PersistedWorkspace;
  const { fileRegistry: _ignored, ...persistable } = next as unknown as Record<string, unknown>;
  void _ignored;
  return roundtrip(persistable as unknown as PersistedWorkspace).reloaded;
}

const facts = (ws: PersistedWorkspace, opts: { activityLines?: LigneCharge[] } = {}): ConsolidatedArticle39cFacts =>
  buildConsolidatedArticle39cFromWorkspace({ workspace: ws, expectedDossierId: DOSSIER, openingStocks: NONE, ...opts });
const readiness = (ws: PersistedWorkspace, opts: { activityLines?: LigneCharge[] } = {}): Article39cReadiness => evaluateArticle39cReadiness(facts(ws, opts));
const questions = (ws: PersistedWorkspace) => pendingArticle39cQuestions({ workspace: ws, expectedDossierId: DOSSIER });
const kindOf = (q: readonly Article39cQuestion[], kind: Article39cQuestion["kind"]) => q.filter((x) => x.kind === kind);
const find = (items: readonly Article39cContribution[], fragment: string, part?: string) =>
  items.find((c) => c.contributionId.includes(fragment) && (part === undefined || c.contributionId.endsWith(`|${part}`)));

async function answer(ws: PersistedWorkspace, question: Article39cQuestion, value: string, loanId?: string): Promise<PersistedWorkspace> {
  const res = buildArticle39cAnswerAction({ draft: ws.declarationDraft, question, answer: value, answeredAt: AT, ...(loanId !== undefined ? { loanId } : {}) });
  assert.ok(res.ok, JSON.stringify(res));
  return res.action === undefined ? ws : dispatch(ws, res.action);
}

/** Bien exact : F013 v2 confirmé, F012 confirmé, F011 « aucun crédit », F010 présent, F014 validé. */
const exactBien = (id: string, e: number, c: Parameters<typeof collected>[0] = {}, extra: Parameters<typeof bien>[1] = {}) =>
  bien(id, { rent: rentState(id, e), collected: collected(c), logement: {}, dotation: 0, ...extra });

const globalAccounting = (amount: number): LigneCharge =>
  ({
    id: "honoraires-comptable",
    description: "Comptabilité",
    montant: amount,
    categorie: "honoraires_comptable",
    deductibilite: "deductible",
    montantDeductible: amount,
    montantPreExploitation: 0,
    montantAmortissable: 0,
    source: "manual",
  }) as LigneCharge;

// ---------------------------------------------------------------------------
// Writers, reducer, invalidation
// ---------------------------------------------------------------------------

describe("INT-3 — writers de qualification", () => {
  it("INT3-01 — writer property : réponse A → reducer → reload → l'adapter de A l'utilise (mono et multi)", async () => {
    const generic = (id: string) => exactBien(id, 12000, { documentExpenses: [expense({ id: `ass-${id}`, category: "assurance_pno", montant: 400, insuranceKind: "logement" })] });
    for (const ws of [monoWorkspace("A", generic("A")), multiWorkspace({ A: generic("A"), B: generic("B") })]) {
      const q = kindOf(questions(ws), "PNO_CONFIRMATION").find((x) => x.scope.level === "PROPERTY" && x.scope.propertyId === "A")!;
      assert.ok(q);
      const after = await answer(ws, q, "YES");
      const a = find(facts(after).contributions, "A:assurance-pno", "in_year")!;
      assert.equal(a.class, "B");
      assert.deepEqual(a.scope, prop("A"));
    }
  });

  it("INT3-02 — writer activité : fait global → reload → sans propertyId", async () => {
    const ws = multiWorkspace({ A: exactBien("A", 12000), B: exactBien("B", 8000) });
    const notice = { sourceId: "cfe-2026", fiscalYear: YEAR, amountCents: eur(500) };
    const declared = await dispatch(ws, writeCfeNotice(ws.declarationDraft, { scope: ACTIVITY, notice, answeredAt: AT }));
    const q = kindOf(questions(declared), "CFE_BASE")[0]!;
    assert.deepEqual(q.scope, ACTIVITY);
    const answered = await answer(declared, q, "MINIMUM_BASE");
    const stored = (answered.declarationDraft as { article39cActivityQualifications: unknown }).article39cActivityQualifications;
    assert.ok(!JSON.stringify(stored).includes("propertyId"));
    const c = facts(answered).contributions.find((x) => x.source === "CFE_NOTICE")!;
    assert.deepEqual(c.scope, { level: "ACTIVITY" });
    assert.equal(c.class, "ACTIVITY");
  });

  it("INT3-03 — invalidation : une réponse contributive périme la génération fiscale (mono et multi) ; une réponse identique ne fait rien", async () => {
    const reducer = await loadReducer();
    const generic = (id: string) => exactBien(id, 12000, { documentExpenses: [expense({ id: `ass-${id}`, category: "assurance_pno", montant: 400, insuranceKind: "logement" })] });
    for (const ws of [monoWorkspace("A", generic("A")), multiWorkspace({ A: generic("A"), B: generic("B") })]) {
      const generated = { ...ws, fiscalYear: { ...ws.fiscalYear, declarationGeneratedAt: "2026-06-01T10:00:00Z", paidAt: "2026-06-01T09:00:00Z" } } as PersistedWorkspace;
      const q = kindOf(questions(generated), "PNO_CONFIRMATION")[0]!;
      const res = buildArticle39cAnswerAction({ draft: generated.declarationDraft, question: q, answer: "YES", answeredAt: AT });
      assert.ok(res.ok && res.action);
      const next = reducer({ ...generated, fileRegistry: new Map() } as unknown as State, res.action as unknown as Parameters<Reducer>[1]);
      assert.equal(next.fiscalYear.declarationGeneratedAt, undefined, "génération périmée");
      assert.equal(next.fiscalYear.paidAt, "2026-06-01T09:00:00Z", "le paiement n'est jamais touché");
      // Même réponse rejouée (autre horodatage) : aucune action, aucune invalidation parasite.
      const persisted = next as unknown as PersistedWorkspace;
      const again = buildArticle39cAnswerAction({ draft: persisted.declarationDraft, question: q, answer: "YES", answeredAt: "2027-01-01T00:00:00.000Z" });
      assert.ok(again.ok);
      assert.equal(again.action, undefined);
    }
  });
});

// ---------------------------------------------------------------------------
// Questions et qualifications
// ---------------------------------------------------------------------------

describe("INT-3 — questions métier", () => {
  const pnoGeneric = (id = "A") => exactBien(id, 12000, { documentExpenses: [expense({ id: "ass-1", category: "assurance_pno", montant: 400, insuranceKind: "logement" })] });

  it("INT3-04 — PNO documentaire OUI → B", async () => {
    const ws = monoWorkspace("A", pnoGeneric());
    const q = kindOf(questions(ws), "PNO_CONFIRMATION")[0]!;
    assert.equal(q.prompt, "Cette assurance correspond-elle à l'assurance propriétaire non occupant (PNO) du logement ?");
    assert.deepEqual(q.options.map((o) => o.label), ["Oui", "Non", "Je ne sais pas"]);
    const after = await answer(ws, q, "YES");
    assert.equal(find(facts(after).contributions, "assurance-pno", "in_year")!.class, "B");
  });

  it("INT3-05 — PNO NON → jamais B automatique, jamais ACTIVITY", async () => {
    const ws = monoWorkspace("A", pnoGeneric());
    const after = await answer(ws, kindOf(questions(ws), "PNO_CONFIRMATION")[0]!, "NO");
    const c = find(facts(after).contributions, "assurance-pno", "in_year")!;
    assert.equal(c.class, "NEEDS_QUALIFICATION");
    assert.ok(!facts(after).contributions.some((x) => x.class === "ACTIVITY" && x.contributionId.includes("assurance-pno")));
  });

  it("INT3-06 — PNO JE NE SAIS PAS → non résolu, et la réponse n'est pas redemandée", async () => {
    const ws = monoWorkspace("A", pnoGeneric());
    const after = await answer(ws, kindOf(questions(ws), "PNO_CONFIRMATION")[0]!, "UNKNOWN");
    assert.equal(find(facts(after).contributions, "assurance-pno", "in_year")!.class, "NEEDS_QUALIFICATION");
    assert.equal(kindOf(questions(after), "PNO_CONFIRMATION").length, 0);
  });

  const agency = () => exactBien("A", 12000, { honorairesGestion: 800 });

  it("INT3-07 — frais d'agence manuels : gestion courante → B", async () => {
    const ws = monoWorkspace("A", agency());
    const q = kindOf(questions(ws), "AGENCY_FEE_NATURE")[0]!;
    assert.equal(q.prompt, "À quoi correspondent principalement ces frais d'agence ?");
    assert.ok(q.options.every((o) => !/PROPERTY_MANAGEMENT|LETTING|INVENTORY|ADVERTISING/.test(o.label)), "libellés utilisateur, pas de noms techniques");
    const after = await answer(ws, q, "PROPERTY_MANAGEMENT");
    assert.equal(find(facts(after).contributions, "honoraires-gestion", "in_year")!.class, "B");
  });

  it("INT3-08 — frais d'agence : mise en location / état des lieux / publicité / autre → pas B automatique", async () => {
    const ws = monoWorkspace("A", agency());
    const q = kindOf(questions(ws), "AGENCY_FEE_NATURE")[0]!;
    for (const value of ["LETTING", "INVENTORY", "ADVERTISING", "OTHER", "UNKNOWN"]) {
      const after = await answer(ws, q, value);
      assert.equal(find(facts(after).contributions, "honoraires-gestion", "in_year")!.class, "NEEDS_QUALIFICATION", value);
    }
  });

  const cfeNotice = { sourceId: "cfe-2026", fiscalYear: YEAR, amountCents: eur(500) };
  const withCfe = async (ws: PersistedWorkspace, scope = ACTIVITY) => dispatch(ws, writeCfeNotice(ws.declarationDraft, { scope, notice: cfeNotice, answeredAt: AT }));

  it("INT3-09 — CFE base minimum → ACTIVITY (STRONG_INFERENCE) ; le client ne voit jamais B / ACTIVITY", async () => {
    const ws = await withCfe(monoWorkspace("A", exactBien("A", 12000)));
    const q = kindOf(questions(ws), "CFE_BASE")[0]!;
    assert.equal(q.prompt, "Votre avis de CFE est-il calculé sur une base minimum ou sur la valeur locative d'un établissement ?");
    assert.deepEqual(q.options.map((o) => o.label), ["Base minimum", "Valeur locative", "Je ne sais pas"]);
    const c = facts(await answer(ws, q, "MINIMUM_BASE")).contributions.find((x) => x.source === "CFE_NOTICE")!;
    assert.equal(c.class, "ACTIVITY");
    assert.equal(c.proofLevel, "STRONG_INFERENCE");
  });

  it("INT3-10 — CFE valeur locative matérielle → NEEDS_QUALIFICATION (matérialité = moteur exact)", async () => {
    const base = exactBien("A", 12000, { taxeFonciere: 7000 }, { dotation: 6000 });
    const ws = await withCfe(monoWorkspace("A", base));
    const after = await answer(ws, kindOf(questions(ws), "CFE_BASE")[0]!, "RENTAL_VALUE_BASE");
    const r = readiness(after);
    assert.equal(r.status, "NEEDS_QUALIFICATION");
    assert.equal(r.engine?.status, "NEEDS_QUALIFICATION");
  });

  it("INT3-11 — CFE non résolue immatérielle → COMPUTED_UNRESOLVED_IMMATERIAL (READY avec avertissement)", async () => {
    const ws = await withCfe(monoWorkspace("A", exactBien("A", 12000, { taxeFonciere: 7000 }, { dotation: 0 })));
    for (const value of ["RENTAL_VALUE_BASE", "DONT_KNOW"]) {
      const r = readiness(await answer(ws, kindOf(questions(ws), "CFE_BASE")[0]!, value));
      assert.equal(r.engine?.status, "COMPUTED_UNRESOLVED_IMMATERIAL", value);
      assert.equal(r.status, "READY");
      assert.deepEqual(r.warnings, ["UNRESOLVED_BUT_IMMATERIAL"]);
    }
  });

  const bankBien = (loans: PretFinancementExercice[] = [pret({ pretId: "loan-1", interetsEmpruntExercice: 1000 })]) =>
    exactBien("A", 12000, { fraisBancaires: 200 }, { financement: loans });

  it("INT3-12 — frais bancaires : financement du logement (prêt identifiable) → B", async () => {
    const ws = monoWorkspace("A", bankBien());
    const q = kindOf(questions(ws), "BANK_FEE_PURPOSE")[0]!;
    assert.equal(q.prompt, "Ces frais bancaires concernent-ils le financement de ce logement ou le compte utilisé pour votre activité de location meublée ?");
    const c = find(facts(await answer(ws, q, "FINANCING")).contributions, "frais-bancaires", "in_year")!;
    assert.equal(c.class, "B");
    assert.equal(c.loanId, "loan-1");
    // Plusieurs prêts, aucun lien démontré : jamais choisi automatiquement ; le client peut choisir explicitement.
    const two = monoWorkspace("A", bankBien([pret({ pretId: "loan-1", interetsEmpruntExercice: 500 }), pret({ pretId: "loan-2", interetsEmpruntExercice: 500 })]));
    const q2 = kindOf(questions(two), "BANK_FEE_PURPOSE")[0]!;
    assert.deepEqual(q2.candidateLoanIds, ["loan-1", "loan-2"]);
    const undecided = find(facts(await answer(two, q2, "FINANCING")).contributions, "frais-bancaires", "in_year")!;
    assert.equal(undecided.class, "NEEDS_QUALIFICATION");
    const chosen = find(facts(await answer(two, q2, "FINANCING", "loan-2")).contributions, "frais-bancaires", "in_year")!;
    assert.equal(chosen.class, "B");
    assert.equal(chosen.loanId, "loan-2");
    const bad = buildArticle39cAnswerAction({ draft: two.declarationDraft, question: q2, answer: "FINANCING", answeredAt: AT, loanId: "loan-9" });
    assert.deepEqual(bad, { ok: false, reason: "UNKNOWN_LOAN" });
  });

  it("INT3-13 — frais bancaires : compte de l'activité → ACTIVITY ; je ne sais pas → non résolu", async () => {
    const ws = monoWorkspace("A", bankBien());
    const q = kindOf(questions(ws), "BANK_FEE_PURPOSE")[0]!;
    assert.equal(find(facts(await answer(ws, q, "ACTIVITY_ACCOUNT")).contributions, "frais-bancaires", "in_year")!.class, "ACTIVITY");
    assert.equal(find(facts(await answer(ws, q, "UNKNOWN")).contributions, "frais-bancaires", "in_year")!.class, "NEEDS_QUALIFICATION");
  });
});

// ---------------------------------------------------------------------------
// Dedupe, F010, prêts partagés
// ---------------------------------------------------------------------------

describe("INT-3 — double comptage, F010, prêts partagés", () => {
  it("INT3-14 — frais de dossier 500 dans F011 + ligne F012 overlap → B = 500 (pas 1 000)", () => {
    const ws = monoWorkspace(
      "A",
      exactBien(
        "A",
        12000,
        { divers: [{ id: "frais-dossier-bancaire", description: "Frais de dossier bancaire", montant: 500, financementOverlap: "frais_dossier" }] },
        { financement: [pret({ pretId: "loan-1", fraisDossierDeductibles: 500 })] },
      ),
    );
    const f = facts(roundtrip(ws).reloaded);
    assert.equal(f.byClassCents.B, eur(500));
    assert.equal(find(f.contributions, "frais-dossier-bancaire", "overlap")!.class, "EXCLUDED");
    assert.deepEqual(f.violations, []);
  });

  it("INT3-14b — frais bancaire de financement de même montant que les frais F011 : conflit explicite jusqu'à décision", async () => {
    const ws = monoWorkspace("A", exactBien("A", 12000, { fraisBancaires: 500 }, { financement: [pret({ pretId: "loan-1", fraisDossierDeductibles: 500 })] }));
    const financing = await answer(ws, kindOf(questions(ws), "BANK_FEE_PURPOSE")[0]!, "FINANCING");
    const conflict = facts(financing);
    assert.equal(find(conflict.contributions, "frais-bancaires", "in_year")!.class, "NEEDS_QUALIFICATION");
    assert.equal(conflict.byClassCents.B, eur(500), "seul le B de F011 est actif");
    const follow = kindOf(questions(financing), "BANK_FEE_ALREADY_IN_LOAN")[0]!;
    assert.ok(follow);
    const same = facts(await answer(financing, follow, "ALREADY_IN_LOAN"));
    assert.equal(find(same.contributions, "frais-bancaires", "in_year")!.class, "EXCLUDED");
    assert.equal(same.byClassCents.B, eur(500));
    const distinct = facts(await answer(financing, follow, "DISTINCT"));
    assert.equal(find(distinct.contributions, "frais-bancaires", "in_year")!.class, "B");
    assert.equal(distinct.byClassCents.B, eur(1000), "frais distincts : démontrés par le client");
  });

  it("INT3-15 — F010 : frais d'acquisition capitalisés → EXCLUDED de B", () => {
    const ws = monoWorkspace("A", exactBien("A", 12000, {}, { logement: { choix: "integration", fraisNotaire: 15000 } }));
    const c = facts(ws).contributions.find((x) => x.source === "ACQUISITION_COST")!;
    assert.equal(c.class, "EXCLUDED");
    assert.deepEqual(c.scope, prop("A"));
    assert.equal(c.amountCents, eur(15000));
    assert.equal(c.provenance, "f010:state.fraisNotaire");
    assert.equal(facts(ws).byClassCents.B, 0);
  });

  it("INT3-16 — F010 : frais déduits immédiatement → non résolu ; absent / autre exercice → blocage", () => {
    const deducted = facts(monoWorkspace("A", exactBien("A", 12000, {}, { logement: { choix: "deduction", fraisEnCharges: 15000 } })));
    const c = deducted.contributions.find((x) => x.source === "ACQUISITION_COST")!;
    assert.equal(c.class, "NEEDS_QUALIFICATION");
    assert.equal(c.provenance, "f010:logementAmortissement.fraisEnCharges");
    const missing = facts(monoWorkspace("A", exactBien("A", 12000, {}, { logement: false })));
    assert.ok(missing.blockers.some((b) => b.code === "F010_SOURCE_MISSING"));
    assert.equal(evaluateArticle39cReadiness(missing).status, "INVALID");
  });

  it("INT3-17 — prêt partagé entre biens → OUT_OF_DOMAIN, jamais réparti", () => {
    const shared = (id: string, interest: number) =>
      exactBien(id, id === "A" ? 12000 : 8000, {}, { financement: [pret({ pretId: "loan-1", interetsEmpruntExercice: interest })], creditDocumentId: "doc-loan" });
    const ws = multiWorkspace({ A: shared("A", 600), B: shared("B", 400) });
    const f = facts(ws);
    const loans = f.contributions.filter((c) => c.source === "F011_LOAN");
    assert.ok(loans.length >= 2 && loans.every((c) => c.class === "OUT_OF_DOMAIN"));
    assert.equal(f.byClassCents.B, 0, "aucune part du prêt n'est attribuée en B");
    assert.equal(evaluateArticle39cReadiness(f).status, "OUT_OF_DOMAIN");
    // Deux biens, deux documents de prêt distincts : aucun partage.
    const separate = multiWorkspace({
      A: exactBien("A", 12000, {}, { financement: [pret({ pretId: "loan-1", interetsEmpruntExercice: 600 })], creditDocumentId: "doc-A" }),
      B: exactBien("B", 8000, {}, { financement: [pret({ pretId: "loan-1", interetsEmpruntExercice: 400 })], creditDocumentId: "doc-B" }),
    });
    assert.equal(facts(separate).byClassCents.B, eur(1000));
  });
});

// ---------------------------------------------------------------------------
// CFE : source unique et anti-double-comptage avec « divers »
// ---------------------------------------------------------------------------

describe("INT-3 — CFE dédiée vs charges diverses", () => {
  const diversCfe = (amount = 500) => ({ divers: [{ id: "divers-cfe", description: "CFE 2026", montant: amount }] });
  const notice = { sourceId: "cfe-2026", fiscalYear: YEAR, amountCents: eur(500) };
  const declare = async (ws: PersistedWorkspace, scope: Parameters<typeof writeCfeNotice>[1]["scope"], diversLinkage?: Parameters<typeof writeCfeNotice>[1]["diversLinkage"]) =>
    dispatch(ws, writeCfeNotice(ws.declarationDraft, { scope, notice, answeredAt: AT, ...(diversLinkage ? { diversLinkage } : {}) }));

  it("une ligne « divers » legacy contenant « CFE » n'est jamais reclassée par son libellé", () => {
    const f = facts(monoWorkspace("A", exactBien("A", 12000, diversCfe())));
    const c = find(f.contributions, "divers-cfe", "in_year")!;
    assert.equal(c.class, "NEEDS_QUALIFICATION");
    assert.equal(f.contributions.filter((x) => x.source === "CFE_NOTICE").length, 0);
  });

  it("CFE dédiée + ligne « divers » de même montant non liée : conflit explicite (jamais deux contributions actives en silence)", async () => {
    for (const scope of [prop("A"), ACTIVITY]) {
      const ws = await declare(monoWorkspace("A", exactBien("A", 12000, diversCfe())), scope);
      const f = facts(ws);
      assert.ok(f.blockers.some((b) => b.code === "CFE_DIVERS_CONFLICT"), scope.level);
      assert.equal(evaluateArticle39cReadiness(f).status, "NEEDS_QUALIFICATION");
    }
  });

  it("liaison explicite : la ligne « divers » désignée est EXCLUDED, la CFE dédiée porte le montant (une seule contribution active)", async () => {
    const ws = await declare(monoWorkspace("A", exactBien("A", 12000, diversCfe())), prop("A"), { kind: "LINKED", lineId: "divers-cfe" });
    const f = facts(ws);
    assert.equal(find(f.contributions, "divers-cfe", "in_year")!.class, "EXCLUDED");
    assert.ok(f.contributions.some((c) => c.source === "CFE_NOTICE"));
    assert.ok(!f.blockers.some((b) => b.code === "CFE_DIVERS_CONFLICT"));
    const active = f.contributions.filter((c) => (c.contributionId.includes("divers-cfe") || c.source === "CFE_NOTICE") && c.class !== "EXCLUDED");
    assert.equal(active.length, 1);
  });

  it("liaison à une ligne de montant différent ou absente : conflit explicite, aucune suppression", async () => {
    const wrongAmount = facts(await declare(monoWorkspace("A", exactBien("A", 12000, diversCfe(450))), prop("A"), { kind: "LINKED", lineId: "divers-cfe" }));
    assert.ok(wrongAmount.blockers.some((b) => b.code === "CFE_DIVERS_CONFLICT"));
    assert.notEqual(find(wrongAmount.contributions, "divers-cfe", "in_year")!.class, "EXCLUDED");
    const absent = facts(await declare(monoWorkspace("A", exactBien("A", 12000)), prop("A"), { kind: "LINKED", lineId: "n-existe-pas" }));
    assert.ok(absent.blockers.some((b) => b.code === "CFE_DIVERS_CONFLICT"));
  });

  it("déclarée distincte : les deux restent comptées, sans conflit", async () => {
    const ws = await declare(monoWorkspace("A", exactBien("A", 12000, diversCfe())), prop("A"), { kind: "DECLARED_DISTINCT" });
    const f = facts(ws);
    assert.ok(!f.blockers.some((b) => b.code === "CFE_DIVERS_CONFLICT"));
    assert.ok(f.contributions.some((c) => c.source === "CFE_NOTICE"));
    assert.equal(find(f.contributions, "divers-cfe", "in_year")!.class, "NEEDS_QUALIFICATION");
  });

  it("source CFE unique : redéclarer le même avis ne crée jamais un second enregistrement", async () => {
    const once = await declare(monoWorkspace("A", exactBien("A", 12000)), ACTIVITY);
    // Rejouer le même avis est un no-op : le writer ne produit aucune action.
    assert.equal(writeCfeNotice(once.declarationDraft, { scope: ACTIVITY, notice, answeredAt: "2027-01-01T00:00:00.000Z" }), undefined);
    const ws = once;
    const stored = (ws.declarationDraft as { article39cActivityQualifications: { records: unknown[] } }).article39cActivityQualifications;
    assert.equal(stored.records.length, 1);
    assert.equal((stored.records[0] as { recordId: string }).recordId, cfeRecordIdFor(ACTIVITY, "cfe-2026", YEAR));
  });
});

// ---------------------------------------------------------------------------
// Consolidation exacte et readiness
// ---------------------------------------------------------------------------

describe("INT-3 — consolidation exacte mono / multi", () => {
  it("INT3-18 / ORACLE 39C-01 — mono L10k B7k ACT1k dotation 2,5k → C 3k, D 2,5k, ARD 0, après −500, déficit 500", () => {
    const ws = monoWorkspace("A", exactBien("A", 10000, { taxeFonciere: 7000, honorairesComptable: 1000 }, { dotation: 2500 }));
    const f = facts(roundtrip(ws).reloaded);
    assert.equal(f.byClassCents.L, eur(10000));
    assert.equal(f.byClassCents.B, eur(7000));
    assert.equal(f.byClassCents.ACTIVITY, eur(1000));
    const r = evaluateArticle39cReadiness(f);
    assert.equal(r.status, "READY");
    assert.equal(r.consumption, "DORMANT");
    const figures = r.engine!.figures!;
    assert.equal(figures.resultatAvantAmort, 2000);
    assert.equal(figures.capacite, 3000);
    assert.equal(figures.amortDeduit, 2500);
    assert.equal(figures.ardNouvelle, 0);
    assert.equal(figures.resultatApresAmortissements, -500);
    assert.equal(figures.deficitNouveau, 500);
  });

  it("INT3-19 — multi : A L10/B2, B L8/B1, ACTIVITY globale 1, dotation 4 → L18 B3 C15 ACT1, aucune allocation", () => {
    const ws = multiWorkspace({
      A: exactBien("A", 10000, { taxeFonciere: 2000 }, { dotation: 2500 }),
      B: exactBien("B", 8000, { taxeFonciere: 1000 }, { dotation: 1500 }),
    });
    const f = facts(roundtrip(ws).reloaded, { activityLines: [globalAccounting(1000)] });
    assert.equal(f.byClassCents.L, eur(18000));
    assert.equal(f.byClassCents.B, eur(3000));
    assert.equal(f.byClassCents.ACTIVITY, eur(1000));
    assert.equal(f.activityCents.ACTIVITY, eur(1000), "l'ACTIVITY globale reste entière, niveau activité");
    assert.equal(f.byPropertyCents.A!.ACTIVITY, 0);
    assert.equal(f.byPropertyCents.B!.ACTIVITY, 0);
    const globals = f.contributions.filter((c) => c.scope.level === "ACTIVITY");
    assert.equal(globals.length, 1);
    assert.ok(!("propertyId" in globals[0]!.scope));
    // ONE F006 : une capacité globale, jamais par bien.
    assert.deepEqual(f.architecture, { capacityScope: "ACTIVITY", engineCalls: 1 });
    const r = evaluateArticle39cReadiness(f);
    assert.equal(r.status, "READY");
    const figures = r.engine!.figures!;
    assert.equal(figures.capacite, 15000);
    assert.equal(figures.resultatAvantAmort, 14000);
    assert.equal(figures.amortDeduit, 4000);
    assert.equal(figures.resultatApresAmortissements, 10000);
    assert.equal(f.currentDepreciationCents, eur(4000));
  });

  it("une ACTIVITY globale classée B (charge commune) reste bloquée ; elle n'est jamais attribuée à un bien", () => {
    const ws = multiWorkspace({ A: exactBien("A", 10000, {}, { dotation: 0 }), B: exactBien("B", 8000, {}, { dotation: 0 }) });
    const commonB = { ...globalAccounting(500), id: "taxe-fonciere", categorie: "taxe_fonciere" } as LigneCharge;
    const r = readiness(ws, { activityLines: [commonB] });
    assert.equal(r.status, "OUT_OF_DOMAIN");
    assert.ok(r.consolidated.blockers.some((b) => b.code === "COMMON_CHARGE_NOT_SUPPORTED"));
  });

  it("INT3-20 — contamination entre biens : la qualification de A ne modifie jamais B", async () => {
    const generic = (id: string) => exactBien(id, id === "A" ? 12000 : 8000, { documentExpenses: [expense({ id: `ass-${id}`, category: "assurance_pno", montant: 400, insuranceKind: "logement" })] });
    const ws = multiWorkspace({ A: generic("A"), B: generic("B") });
    const qA = kindOf(questions(ws), "PNO_CONFIRMATION").find((q) => q.scope.level === "PROPERTY" && q.scope.propertyId === "A")!;
    const after = await answer(ws, qA, "YES");
    const f = facts(after);
    assert.equal(find(f.contributions, "A:assurance-pno", "in_year")!.class, "B");
    assert.equal(find(f.contributions, "B:assurance-pno", "in_year")!.class, "NEEDS_QUALIFICATION");
    // B reste interrogeable ; A ne l'est plus.
    const still = kindOf(questions(after), "PNO_CONFIRMATION");
    assert.deepEqual(still.map((q) => (q.scope.level === "PROPERTY" ? q.scope.propertyId : "")), ["B"]);
  });

  it("une contribution d'un autre bien dans la partie d'un bien est une violation de périmètre (jamais le bien « actif »)", () => {
    const part = (id: string, e: number) =>
      buildPropertyArticle39cContribution({ bien: exactBien(id, e, { taxeFonciere: 1000 }), propertyId: id, fiscalYear: YEAR, expectedDossierId: DOSSIER, stateDossierId: DOSSIER });
    const a = part("A", 10000);
    const b = part("B", 8000);
    const activity = buildActivityArticle39cContribution({ fiscalYear: YEAR, store: parseQualificationStore(undefined) });
    const tampered = consolidateArticle39cFacts({ dossierId: DOSSIER, fiscalYear: YEAR, properties: [a, { ...b, contributions: a.contributions }], activity, openingStocks: NONE });
    assert.ok(tampered.blockers.some((x) => x.code === "CONSOLIDATION_SCOPE_VIOLATION"));
    assert.equal(evaluateArticle39cReadiness(tampered).status, "INVALID");
    const dup = consolidateArticle39cFacts({ dossierId: DOSSIER, fiscalYear: YEAR, properties: [a, a], activity, openingStocks: NONE });
    assert.ok(dup.blockers.some((x) => x.code === "DUPLICATE_PROPERTY"));
  });

  it("readiness : F013 v1 / absent / non confirmé n'est JAMAIS READY (le proxy productif continue)", () => {
    const noRent = bien("A", { collected: collected({ taxeFonciere: 7000 }), logement: {}, dotation: 0 });
    const r = readiness(monoWorkspace("A", noRent));
    assert.equal(r.status, "INVALID");
    assert.ok(r.reasons.includes("F013_V2_NOT_PRESENT"));
    const v1 = { ...noRent, revenusAssistant: { exerciceFiscal: YEAR, totalRecettes: 12000 } } as typeof noRent;
    const rv1 = readiness(monoWorkspace("A", v1));
    assert.equal(rv1.status, "INVALID");
    assert.equal(rv1.consolidated.contributions.filter((c) => c.class === "L").length, 0, "totalRecettes v1 n'est jamais un L");
  });

  it("readiness : réconciliation F012 en échec → RECONCILIATION_FAILURE ; stocks non fournis → INVALID ; identité", () => {
    const b = exactBien("A", 12000, { taxeFonciere: 7000 });
    const tampered = { ...b, chargesAssistant: { ...b.chargesAssistant!, totalDeductible: b.chargesAssistant!.totalDeductible + 0.01 } };
    assert.equal(readiness(monoWorkspace("A", tampered)).status, "RECONCILIATION_FAILURE");
    const noStocks = evaluateArticle39cReadiness(buildConsolidatedArticle39cFromWorkspace({ workspace: monoWorkspace("A", b), expectedDossierId: DOSSIER }));
    assert.equal(noStocks.status, "INVALID");
    assert.ok(noStocks.reasons.includes("OPENING_STOCKS_UNKNOWN"));
    const wrongDossier = evaluateArticle39cReadiness(buildConsolidatedArticle39cFromWorkspace({ workspace: monoWorkspace("A", b), expectedDossierId: "autre", openingStocks: NONE }));
    assert.equal(wrongDossier.status, "INVALID");
    assert.equal(wrongDossier.consolidated.contributions.length, 0);
  });

  it("readiness : stocks fournis (ARD historique, déficits) → mêmes règles du moteur exact ; READY exige F010 et F014", () => {
    const b = exactBien("A", 12000, { taxeFonciere: 7000 }, { dotation: 1500 });
    const r = evaluateArticle39cReadiness(
      buildConsolidatedArticle39cFromWorkspace({
        workspace: monoWorkspace("A", b),
        expectedDossierId: DOSSIER,
        openingStocks: { kind: "PROVIDED", historicalArdStock: 1500, priorDeficits: [{ millesime: 2024, montant: 100 }] },
      }),
    );
    assert.equal(r.status, "READY");
    assert.equal(r.engine!.figures!.ardConsomme, 1500);
    const noDotation = readiness(monoWorkspace("A", bien("A", { rent: rentState("A", 12000), collected: collected({ taxeFonciere: 7000 }), logement: {} })));
    assert.ok(noDotation.reasons.includes("F014_NOT_VALIDATED"));
  });

  it("ORACLE C (SAV-032) rejoué jusqu'au résultat dormant : ACT 1 000, dotation 1 500, ARD 1 500 → après −1 000, H 1 500 (mapper 2033-B non modifié)", () => {
    const b = exactBien("A", 10000, { taxeFonciere: 7000, honorairesComptable: 1000 }, { dotation: 1500 });
    const r = evaluateArticle39cReadiness(
      buildConsolidatedArticle39cFromWorkspace({
        workspace: monoWorkspace("A", b),
        expectedDossierId: DOSSIER,
        openingStocks: { kind: "PROVIDED", historicalArdStock: 1500, priorDeficits: [] },
      }),
    );
    const f = r.engine!.figures!;
    assert.equal(f.resultatAvantAmort, 2000);
    assert.equal(f.amortDeduit, 1500);
    assert.equal(f.ardConsomme, 1500);
    assert.equal(f.resultatApresAmortissements, -1000);
    assert.equal(f.deficitNouveau, 1000);
  });
});

// ---------------------------------------------------------------------------
// Pas de question inutile
// ---------------------------------------------------------------------------

describe("INT-3 — aucune question inutile", () => {
  it("PNO explicite connue, gestionKind connue, CFE absente, aucun frais bancaire → aucune question", () => {
    const ws = monoWorkspace(
      "A",
      exactBien("A", 12000, {
        assurancePno: 400,
        documentExpenses: [expense({ id: "gest-1", category: "honoraires_gestion", montant: 800, gestionKind: "gestion" })],
      }),
    );
    assert.deepEqual(questions(ws), []);
  });

  it("une qualification fraîche n'est pas redemandée ; une source modifiée la fait redemander", async () => {
    const base = (amount: number) => exactBien("A", 12000, { fraisBancaires: amount }, { financement: [pret({ pretId: "loan-1", interetsEmpruntExercice: 100 })] });
    const ws = monoWorkspace("A", base(200));
    const answered = await answer(ws, kindOf(questions(ws), "BANK_FEE_PURPOSE")[0]!, "ACTIVITY_ACCOUNT");
    assert.equal(kindOf(questions(answered), "BANK_FEE_PURPOSE").length, 0);
    // Le montant des frais change : la qualification est périmée, la question revient.
    const changed = monoWorkspace("A", { ...base(250), article39cQualifications: (answered.declarationDraft as { article39cQualifications: never }).article39cQualifications });
    assert.equal(kindOf(questions(changed), "BANK_FEE_PURPOSE").length, 1);
    assert.equal(find(facts(changed).contributions, "frais-bancaires", "in_year")!.class, "NEEDS_QUALIFICATION");
  });

  it("aucune question tant que F012 n'est pas réconcilié ; réponse hors options refusée", () => {
    const b = exactBien("A", 12000, { honorairesGestion: 800 });
    const tampered = { ...b, chargesAssistant: { ...b.chargesAssistant!, totalDeductible: 1 } };
    assert.deepEqual(kindOf(questions(monoWorkspace("A", tampered)), "AGENCY_FEE_NATURE"), []);
    const q = kindOf(questions(monoWorkspace("A", b)), "AGENCY_FEE_NATURE")[0]!;
    assert.deepEqual(buildArticle39cAnswerAction({ draft: undefined, question: q, answer: "B", answeredAt: AT }), { ok: false, reason: "UNKNOWN_ANSWER" });
    assert.deepEqual(buildArticle39cAnswerAction({ draft: undefined, question: q, answer: "ACTIVITY", answeredAt: AT }), { ok: false, reason: "UNKNOWN_ANSWER" });
  });
});

// ---------------------------------------------------------------------------
// Pureté / déterminisme
// ---------------------------------------------------------------------------

describe("INT-3 — déterminisme", () => {
  it("même workspace → même consolidation ; l'ordre des biens n'a aucun effet fiscal ; aucune horloge", () => {
    const A = exactBien("A", 10000, { taxeFonciere: 2000 }, { dotation: 100 });
    const B = exactBien("B", 8000, { taxeFonciere: 1000 }, { dotation: 200 });
    const RealDate = globalThis.Date;
    class NoClockDate extends RealDate {
      constructor(...args: ConstructorParameters<typeof Date>) {
        if (args.length === 0) throw new Error("horloge système interdite");
        super(...args);
      }
      static override now(): number {
        throw new Error("horloge système interdite");
      }
    }
    globalThis.Date = NoClockDate as unknown as DateConstructor;
    try {
      const one = facts(multiWorkspace({ A, B }));
      const two = facts(multiWorkspace({ B, A }));
      assert.deepEqual(one.contributions, two.contributions);
      assert.deepEqual(one.byClassCents, two.byClassCents);
      assert.deepEqual(readiness(multiWorkspace({ A, B })).engine, readiness(multiWorkspace({ B, A })).engine);
    } finally {
      globalThis.Date = RealDate;
    }
  });
});
