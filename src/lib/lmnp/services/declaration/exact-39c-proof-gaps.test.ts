/* eslint-disable @typescript-eslint/no-explicit-any -- fixtures de brouillons hétérogènes (test) */
/**
 * INT-5.1 — preuves manquantes du switch EXACT : goldens CFE (immatérielle / matérielle résolue), golden multi legacy,
 * lien CFE / « divers » de bout en bout, doublon F011 / F012 des frais bancaires, jamais de repli silencieux.
 *
 * Aucune règle nouvelle : chaque attendu découle du Knowledge approuvé (SAV-031 CFE, SAV-032 330/350, AX-009 F011/F012).
 * Run: npx tsx --test src/lib/lmnp/services/declaration/exact-39c-proof-gaps.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { produceFiscalResult } from "@/runtime/capabilities/f006/produce-fiscal-result";
import { map2033BFromRfs } from "@/runtime/capabilities/rfs/projection/map-2033b";
import { map2031FromRfs } from "@/runtime/capabilities/rfs/projection/map-2031-from-rfs";
import type { PersistedWorkspace } from "@/lib/lmnp/store/persistence";
import { exactDossier, legacyDossier, type ExactDossierSpec } from "@/lib/lmnp/services/article-39c/exact-generation-fixtures";
import { DOSSIER, pret, roundtrip } from "@/lib/lmnp/services/article-39c/article-39c-test-fixtures";
import { buildConsolidatedArticle39cFromWorkspace } from "@/lib/lmnp/services/article-39c/consolidation";
import { qualifyCfe } from "@/lib/lmnp/services/article-39c/qualification-facts";
import { parseQualificationStore, type CfeQualificationRecord } from "@/lib/lmnp/services/article-39c/qualification-store";
import { buildArticle39cAnswerAction, pendingArticle39cQuestions, type Article39cQuestion } from "@/lib/lmnp/services/article-39c/questions";
import { buildCfeNoticeDeclaration } from "@/lib/lmnp/services/article-39c/qualification-ui-model";
import type { Article39cQualificationAction } from "@/lib/lmnp/services/article-39c/qualification-writers";
import { A as LEGACY_A, B as LEGACY_B, multiWorkspace as legacyMultiWorkspace } from "./multi-property-test-support";
import { runDeclarationGenerationFromWorkspace } from "./generation-workspace";
import { EXACT_GATE_RED_CODE, resolveExactSwitch, resolveFiscalCalculationMode } from "./exact-39c-switch";

const AT = "2026-12-01T00:00:00.000Z";

async function dispatch(workspace: PersistedWorkspace, action: Article39cQualificationAction | undefined): Promise<PersistedWorkspace> {
  assert.ok(action, "une action était attendue");
  process.env.NEXT_PUBLIC_SUPABASE_URL ??= "https://test.invalid.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??= "test-anon-key";
  const reducer = (await import("@/lib/lmnp/store/reducer")).lmnpReducer;
  const next = reducer({ ...workspace, fileRegistry: new Map() } as any, action as any) as unknown as Record<string, unknown>;
  const { fileRegistry: _ignored, ...persistable } = next;
  void _ignored;
  return roundtrip(persistable as unknown as PersistedWorkspace).reloaded; // save → JSON → reload : chemin réel de persistance
}

const questions = (ws: PersistedWorkspace) => pendingArticle39cQuestions({ workspace: ws, expectedDossierId: DOSSIER });
const ofKind = (ws: PersistedWorkspace, kind: Article39cQuestion["kind"]) => questions(ws).filter((q) => q.kind === kind);
async function answer(ws: PersistedWorkspace, kind: Article39cQuestion["kind"], value: string): Promise<PersistedWorkspace> {
  const question = ofKind(ws, kind)[0];
  assert.ok(question, `question ${kind} attendue`);
  const res = buildArticle39cAnswerAction({ draft: ws.declarationDraft, question: question!, answer: value, answeredAt: AT });
  assert.ok(res.ok, JSON.stringify(res));
  return res.action === undefined ? ws : dispatch(ws, res.action);
}
async function declareCfe(ws: PersistedWorkspace, amountText: string): Promise<PersistedWorkspace> {
  const res = buildCfeNoticeDeclaration({ draft: ws.declarationDraft, fiscalYear: 2026, amountText, answeredAt: AT });
  assert.ok(res.ok);
  return dispatch(ws, res.action);
}

type Generated = Extract<ReturnType<typeof runDeclarationGenerationFromWorkspace>, { status: "generated" }>;
/** Génération avec un compteur d'appels F-006 : prouve « un seul F006 » et « aucun F006 quand le gate est rouge ». */
function generate(ws: PersistedWorkspace) {
  let calls = 0;
  const result = runDeclarationGenerationFromWorkspace(ws, { engine: { produceFiscalResult: (i) => { calls += 1; return produceFiscalResult(i); } } });
  return { result, calls };
}
const mustGenerate = (ws: PersistedWorkspace): { g: Generated; calls: number } => {
  const { result, calls } = generate(ws);
  assert.equal(result.status, "generated", JSON.stringify(result.status === "blocked" ? [(result as any).blockingReasons, (result as any).anomalies] : null));
  return { g: result as Generated, calls };
};
const mustBlock = (ws: PersistedWorkspace) => {
  const { result, calls } = generate(ws);
  assert.equal(result.status, "blocked");
  assert.equal(calls, 0, "gate rouge : F-006 n'est JAMAIS appelé (ni exact, ni proxy)");
  assert.ok(!("rfs" in result) && !("fiscalResult" in result), "aucune sortie fiscale produite");
  return result as any;
};
const val = (cases: { caseId: string; value?: unknown }[], id: string) => cases.find((c) => c.caseId === id)?.value;
const consolidated = (ws: PersistedWorkspace) => buildConsolidatedArticle39cFromWorkspace({ workspace: roundtrip(ws).reloaded, expectedDossierId: DOSSIER });
const ready = (ws: PersistedWorkspace) => {
  const s = resolveExactSwitch(ws);
  assert.ok(s.mode === "EXACT_39C_V2" && s.status === "READY", JSON.stringify(s));
  return s as Extract<typeof s, { status: "READY" }>;
};
const cfeRecord = (ws: PersistedWorkspace): CfeQualificationRecord => {
  const records = parseQualificationStore((ws.declarationDraft as any).article39cActivityQualifications)?.records ?? [];
  const r = records.find((x): x is CfeQualificationRecord => x.recordKind === "CFE");
  assert.ok(r);
  return r!;
};

/** L 10 000, B (taxe foncière) 7 000, stocks nuls : seule la dotation et la CFE varient. */
const base = (dotation: number, extra: Partial<ExactDossierSpec> = {}): ExactDossierSpec => ({ cash: 10000, collected: { taxeFonciere: 7000 }, dotation, ...extra });

// ---------------------------------------------------------------------------
// 1 — CFE immatérielle
// ---------------------------------------------------------------------------

describe("INT-5.1 — golden CFE incertaine sous le seuil de matérialité", () => {
  const unresolved = async (dotation: number) => answer(await declareCfe(exactDossier(base(dotation)), "500,00"), "CFE_BASE", "DONT_KNOW");

  it("dotation 0 : l'incertitude CFE n'a aucun effet sur le résultat → EXACT calculé, incertitude CONSERVÉE (jamais classée, jamais zéro)", async () => {
    const ws = await unresolved(0);
    assert.equal(resolveFiscalCalculationMode(ws), "EXACT_39C_V2");
    // source fact → qualification : « je ne sais pas » reste UNKNOWN
    assert.equal(cfeRecord(ws).fact?.cfeBaseKind, "UNKNOWN");
    const c = consolidated(ws);
    const cfe = c.contributions.find((x) => x.source === "CFE_NOTICE")!;
    assert.deepEqual([cfe.class, cfe.proofLevel, cfe.amountCents], ["NEEDS_QUALIFICATION", "UNRESOLVED", 50000]);
    assert.deepEqual([c.byClassCents.L, c.byClassCents.B, c.byClassCents.ACTIVITY], [1000000, 700000, 0], "la CFE n'est ni B ni ACTIVITY");
    // moteur exact : calculé AVEC avertissement d'incertitude immatérielle
    const s = ready(ws);
    const engine = s.contract.gate.preSwitch.exact.engine!;
    assert.equal(engine.status, "COMPUTED_UNRESOLVED_IMMATERIAL");
    assert.deepEqual((engine as any).warnings, ["UNRESOLVED_BUT_IMMATERIAL"]);
    assert.equal(s.contract.gate.preSwitch.status, "READY_WITH_IMMATERIAL_UNCERTAINTY");
    // F006 : la CFE (500) est déduite UNE fois du résultat ; aucune dotation → D 0
    const { g } = mustGenerate(ws);
    const f = g.rfs.fiscalResult;
    assert.deepEqual([f.recettes.total, f.resultatAvantAmort, f.amortDeduct, f.amortNonDeduitExercice, f.resultatFiscalAvantDeficits, f.deficitNouveau, f.resultatFiscal], [10000, 2500, 0, 0, 2500, 0, 2500]);
    const form = map2033BFromRfs(g.rfs);
    assert.equal(form.balancing.status, "BALANCED");
    assert.deepEqual([val(form.cases, "350"), val(form.cases, "352"), val(form.cases, "370")], [2500, 0, 0]);
    assert.equal(val(map2031FromRfs(g.rfs).cases, "I_7A"), 2500);
    // reload : même décision, mêmes chiffres
    const again = mustGenerate(roundtrip(ws).reloaded).g.rfs.fiscalResult;
    assert.deepEqual([again.resultatAvantAmort, again.resultatFiscal], [2500, 2500]);
  });

  it("dotation 6 000 : l'incertitude devient MATÉRIELLE → gate rouge → BLOQUÉ, aucun F-006, jamais de repli proxy", async () => {
    const ws = await unresolved(6000);
    const s = resolveExactSwitch(ws);
    assert.ok(s.mode === "EXACT_39C_V2" && s.status === "BLOCKED");
    assert.ok(s.status === "BLOCKED" && s.reasons.includes(EXACT_GATE_RED_CODE));
    const r = mustBlock(ws);
    assert.ok(r.blockingReasons.some((b: any) => b.code === EXACT_GATE_RED_CODE));
    assert.equal(consolidated(ws).contributions.find((x) => x.source === "CFE_NOTICE")!.class, "NEEDS_QUALIFICATION", "UNKNOWN jamais promu en classification certaine");
  });
});

// ---------------------------------------------------------------------------
// 2 — CFE matérielle résolue
// ---------------------------------------------------------------------------

describe("INT-5.1 — golden CFE matérielle explicitement résolue", () => {
  it("source fact → qualification → contribution → consolidation → moteur exact → F006 → liasse (L 10k, B 7k, CFE 1k, A 2,5k)", async () => {
    const declared = await declareCfe(exactDossier(base(2500)), "1000,00");
    // CFE déclarée mais base inconnue + dotation matérielle : BLOQUÉ (la question CFE_BASE est posée).
    mustBlock(declared);
    assert.equal(ofKind(declared, "CFE_BASE").length, 1);

    const ws = await answer(declared, "CFE_BASE", "MINIMUM_BASE");
    // (1) source fact + (2) qualification persistés
    const record = cfeRecord(ws);
    assert.equal(record.notice.amountCents, 100000);
    assert.equal(record.fact?.cfeBaseKind, "MINIMUM");
    const q = qualifyCfe(record.notice, record.fact)!;
    assert.deepEqual([q.class, q.proofLevel], ["ACTIVITY", "STRONG_INFERENCE"]);
    // (3) contribution + (4) consolidation
    const c = consolidated(ws);
    assert.deepEqual([c.byClassCents.L, c.byClassCents.B, c.byClassCents.ACTIVITY], [1000000, 700000, 100000]);
    assert.equal(c.contributions.filter((x) => x.source === "CFE_NOTICE").length, 1);
    // (5) moteur exact : C = max(0, L − B) = 3 000 ; la CFE ACTIVITY ne réduit jamais C
    const s = ready(ws);
    assert.equal(s.contract.capacite, 3000);
    assert.equal(s.contract.exactOnlyChargesEuros, 1000);
    assert.equal(s.contract.gate.preSwitch.exact.engine!.status, "COMPUTED");
    // (6) F006 : un seul appel ; avant 2 000, D 2 500 (≤ C), après −500, déficit 500
    const { g } = mustGenerate(ws);
    const f = g.rfs.fiscalResult;
    assert.deepEqual([f.resultatAvantAmort, f.amortDeduct, f.amortNonDeduitExercice, f.stocks.amortissementsReportes, f.resultatFiscalAvantDeficits, f.deficitNouveau, f.resultatFiscal], [2000, 2500, 0, 0, -500, 500, 0]);
    // (7) liasse : 2033-B bouclée, 330 = 500, 7b = 500 (même dossier que l'oracle A, CFE au lieu d'honoraires)
    const form = map2033BFromRfs(g.rfs);
    assert.equal(form.balancing.status, "BALANCED");
    assert.deepEqual([val(form.cases, "314"), val(form.cases, "330"), val(form.cases, "350"), val(form.cases, "352"), val(form.cases, "370")], [500, 500, undefined, 0, 0]);
    assert.equal(val(map2031FromRfs(g.rfs).cases, "I_7B"), 500);
    // reload : identique
    const again = mustGenerate(roundtrip(ws).reloaded).g.rfs.fiscalResult;
    assert.deepEqual([again.amortDeduct, again.deficitNouveau], [2500, 500]);
  });

  it("base « valeur locative » (B ou ACTIVITY non tranché) + dotation matérielle → BLOQUÉ ; MINIMUM → généré", async () => {
    const declared = await declareCfe(exactDossier(base(2500)), "1000");
    const rental = await answer(declared, "CFE_BASE", "RENTAL_VALUE_BASE");
    assert.equal(consolidated(rental).contributions.find((x) => x.source === "CFE_NOTICE")!.class, "NEEDS_QUALIFICATION");
    mustBlock(rental);
  });
});

// ---------------------------------------------------------------------------
// 3 — golden multi LEGACY
// ---------------------------------------------------------------------------

describe("INT-5.1 — golden multi legacy (F013 v1) : LEGACY_PROXY, jamais EXACT", () => {
  // Baseline mesurée à l'identique sur a4f8d71 (avant le switch) et 8bf8ac8 (INT-5) : même fixture, mêmes chiffres.
  const GOLDEN_F006 = { recettes: 23321.29, avantAmort: 16653.96, amortDeduct: 5444.21, nonDeduit: 0, apres: 11209.75, resultat: 11209.75 };
  const GOLDEN_2033B: Record<string, number> = { "232": 23321.29, "264": 9701.14, "270": 13620.15, "254": 5444.21, "294": 2410.4, "310": 11209.75, "242": 2556.77, "244": 1700.16, "312": 11209.75, "350": 11209.75, "352": 0, "370": 0 };

  it("décision LEGACY_PROXY ; aucun passage dans EXACT ; UN SEUL F006 ; chiffres de la baseline ; aucune migration F013 v2", () => {
    const ws = legacyMultiWorkspace();
    assert.equal(resolveFiscalCalculationMode(ws), "LEGACY_PROXY");
    assert.deepEqual(resolveExactSwitch(ws), { mode: "LEGACY_PROXY" });
    const seen: any[] = [];
    let calls = 0;
    const r = runDeclarationGenerationFromWorkspace(ws, { engine: { produceFiscalResult: (i) => { calls += 1; seen.push(i); return produceFiscalResult(i); } } });
    assert.equal(r.status, "generated", JSON.stringify((r as any).anomalies ?? (r as any).blockingReasons));
    if (r.status !== "generated") return;
    assert.equal(calls, 1, "UN SEUL F006 multi");
    assert.equal(seen[0].article39cExact, undefined, "aucune capacité exacte injectée : proxy");
    assert.equal(seen[0].stockAmortissementsReportes, undefined);
    const f = r.rfs.fiscalResult;
    assert.deepEqual(
      { recettes: f.recettes.total, avantAmort: f.resultatAvantAmort, amortDeduct: f.amortDeduct, nonDeduit: f.amortNonDeduitExercice, apres: f.resultatFiscalAvantDeficits, resultat: f.resultatFiscal },
      GOLDEN_F006,
    );
    const form = map2033BFromRfs(r.rfs);
    for (const [id, expected] of Object.entries(GOLDEN_2033B)) assert.equal(val(form.cases, id), expected, `2033-B ${id}`);
    assert.equal(val(map2031FromRfs(r.rfs).cases, "I_7A"), 11209.75);
    // aucune migration implicite : le brouillon régénéré n'a acquis aucun état F013 v2
    assert.equal(JSON.stringify(ws).includes("rentReconciliationV2"), false);
    assert.equal(resolveFiscalCalculationMode(roundtrip(ws).reloaded), "LEGACY_PROXY");
    for (const id of [LEGACY_A, LEGACY_B]) assert.equal((ws.declarationDraft as any).biens[id].rentReconciliationV2, undefined);
  });
});

// ---------------------------------------------------------------------------
// 4 — CFE / « divers » : lien explicite de bout en bout
// ---------------------------------------------------------------------------

describe("INT-5.1 — CFE dédiée ↔ ligne « divers » : lien explicite, jamais de double comptage, jamais par texte", () => {
  const withDivers = (montant: number, description: string, dotation = 2500) =>
    exactDossier(base(dotation, { collected: { taxeFonciere: 7000, divers: [{ id: "divers-1", description, montant }] } }));

  it("même dépense déclarée liée : UNE seule charge de 500 (résultat 2 500, jamais 2 000), conservé après reload", async () => {
    let ws = await declareCfe(withDivers(500, "CFE 2026"), "500,00");
    // avant décision : conflit explicite → BLOQUÉ (jamais résolu par défaut ni par le libellé)
    assert.ok(consolidated(ws).blockers.some((b) => b.code === "CFE_DIVERS_CONFLICT"));
    mustBlock(ws);
    ws = await answer(ws, "CFE_DIVERS_LINK", "SAME");
    ws = await answer(ws, "CFE_BASE", "MINIMUM_BASE");
    const c = consolidated(ws);
    const active = c.contributions.filter((x) => (x.contributionId.includes("divers-1") || x.source === "CFE_NOTICE") && x.class !== "EXCLUDED");
    assert.equal(active.length, 1, "une seule contribution active pour la CFE");
    assert.equal(active[0]!.source, "CFE_NOTICE");
    assert.equal(c.byClassCents.ACTIVITY, 50000);
    assert.equal(c.byClassCents.B, 700000);
    const s = ready(ws);
    assert.equal(s.contract.exactOnlyChargesEuros, 0, "CFE liée : déjà portée par la ligne F012, non ajoutée une seconde fois à F-006");
    const { g } = mustGenerate(ws);
    const f = g.rfs.fiscalResult;
    assert.deepEqual([f.resultatAvantAmort, f.amortDeduct, f.resultatFiscalAvantDeficits, f.resultatFiscal], [2500, 2500, 0, 0]);
    assert.equal(map2033BFromRfs(g.rfs).balancing.status, "BALANCED");
    // reload / persistance : même lien, mêmes chiffres
    const reloaded = roundtrip(ws).reloaded;
    assert.equal(cfeRecord(reloaded).diversLinkage?.kind, "LINKED");
    assert.equal(mustGenerate(reloaded).g.rfs.fiscalResult.resultatAvantAmort, 2500);
  });

  it("« deux dépenses différentes » : les deux sont comptées (résultat 2 000)", async () => {
    let ws = await declareCfe(withDivers(500, "CFE 2026"), "500,00");
    ws = await answer(ws, "CFE_DIVERS_LINK", "DISTINCT");
    ws = await answer(ws, "CFE_BASE", "MINIMUM_BASE");
    const { g } = mustGenerate(ws);
    assert.equal(g.rfs.fiscalResult.resultatAvantAmort, 2000);
  });

  it("« je ne sais pas » : conflit conservé → BLOQUÉ ; question non reposée", async () => {
    let ws = await declareCfe(withDivers(500, "CFE 2026"), "500,00");
    ws = await answer(ws, "CFE_DIVERS_LINK", "UNKNOWN");
    ws = await answer(ws, "CFE_BASE", "MINIMUM_BASE");
    assert.equal(ofKind(ws, "CFE_DIVERS_LINK").length, 0);
    mustBlock(ws);
  });

  it("aucune détection par texte : libellé « CFE » mais montant différent → aucun conflit, aucun lien ; libellé sans rapport mais même montant → conflit (jamais fusionné)", async () => {
    // libellé « CFE 2026 », montant 600 ≠ 500 : pas de jumeau, pas de lien, les deux sont comptés
    let text = await declareCfe(withDivers(600, "CFE 2026", 0), "500,00");
    text = await answer(text, "CFE_BASE", "MINIMUM_BASE");
    assert.ok(!consolidated(text).blockers.some((b) => b.code === "CFE_DIVERS_CONFLICT"));
    assert.equal(ofKind(text, "CFE_DIVERS_LINK").length, 0);
    assert.equal(mustGenerate(text).g.rfs.fiscalResult.resultatAvantAmort, 10000 - 7000 - 600 - 500);
    // libellé neutre, même montant : seul le montant fait poser la question ; rien n'est supprimé sans réponse
    const neutral = await declareCfe(withDivers(500, "Dépense X", 0), "500,00");
    assert.ok(consolidated(neutral).blockers.some((b) => b.code === "CFE_DIVERS_CONFLICT"));
    assert.equal(consolidated(neutral).contributions.filter((x) => x.class !== "EXCLUDED" && (x.source === "CFE_NOTICE" || x.contributionId.includes("divers-1"))).length, 2);
  });
});

// ---------------------------------------------------------------------------
// 5 — F011 / F012 : frais de financement
// ---------------------------------------------------------------------------

describe("INT-5.1 — frais bancaires F012 vs frais de prêt F011 : une contribution par fait démontré", () => {
  const spec = (fraisBancaires: number, dotation = 0): ExactDossierSpec => ({
    cash: 12000,
    dotation,
    collected: { fraisBancaires },
    bien: { financement: [pret({ pretId: "loan-1", fraisDossierDeductibles: 500 })] },
  });
  /** Un prêt confirmé : l'état « aucun crédit » du brouillon de base est retiré (sinon AMBIGU). */
  const withLoan = (ws: PersistedWorkspace): PersistedWorkspace =>
    ({ ...ws, declarationDraft: { ...ws.declarationDraft, creditDeclaredNoneAt: undefined, creditConfirmedAt: "2026-01-01T00:00:00.000Z" } }) as PersistedWorkspace;
  const financing = async (fraisBancaires: number, dotation = 0) => answer(withLoan(exactDossier(spec(fraisBancaires, dotation))), "BANK_FEE_PURPOSE", "FINANCING");
  const bCents = (ws: PersistedWorkspace) => consolidated(ws).byClassCents.B;

  it("MÊME fait démontré (réponse explicite « déjà dans les frais du prêt ») → UNE contribution B (500), F-006 concorde, liasse bouclée", async () => {
    const ws = await answer(await financing(500), "BANK_FEE_ALREADY_IN_LOAN", "ALREADY_IN_LOAN");
    assert.equal(bCents(ws), 50000, "500 € comptés une seule fois");
    const s = ready(ws);
    assert.equal(s.contract.f011DuplicateBankFeesEuros, 500);
    const { g } = mustGenerate(ws);
    const f = g.rfs.fiscalResult;
    assert.equal(f.charges.totalDeductible, 500, "F011 500 + F012 0 : jamais 1 000");
    assert.equal(f.charges.detailParCategorie.frais_bancaires ?? 0, 0);
    assert.equal(f.resultatAvantAmort, 11500);
    assert.equal(map2033BFromRfs(g.rfs).balancing.status, "BALANCED");
    // reload
    assert.equal(mustGenerate(roundtrip(ws).reloaded).g.rfs.fiscalResult.resultatAvantAmort, 11500);
  });

  it("MÊME montant mais faits DIFFÉRENTS (réponse explicite « deux frais distincts ») → DEUX contributions B (1 000)", async () => {
    const ws = await answer(await financing(500), "BANK_FEE_ALREADY_IN_LOAN", "DISTINCT");
    assert.equal(bCents(ws), 100000);
    const { g } = mustGenerate(ws);
    assert.equal(g.rfs.fiscalResult.charges.totalDeductible, 1000);
    assert.equal(g.rfs.fiscalResult.resultatAvantAmort, 11000);
    assert.equal(ready(ws).contract.f011DuplicateBankFeesEuros, 0);
  });

  it("montants DIFFÉRENTS (300 ≠ 500) : aucune déduplication, aucune question — deux faits, deux contributions B", async () => {
    const ws = await financing(300);
    assert.equal(ofKind(ws, "BANK_FEE_ALREADY_IN_LOAN").length, 0);
    assert.equal(bCents(ws), 80000);
    assert.equal(mustGenerate(ws).g.rfs.fiscalResult.resultatAvantAmort, 12000 - 800);
  });

  it("identité AMBIGUË (même montant, aucune réponse / « je ne sais pas ») : jamais dédupliqué sur le montant ; si matériel → fail-closed", async () => {
    // immatériel (dotation 0) : calculé, mais le frais F012 reste NON classé (ni EXCLUDED, ni B) et compté une fois par F-006
    const immaterial = await financing(500, 0);
    const c = consolidated(immaterial);
    assert.equal(c.contributions.find((x) => x.contributionId.includes("frais-bancaires"))!.class, "NEEDS_QUALIFICATION");
    assert.equal(c.byClassCents.B, 50000, "seul le B de F011 est actif : le montant seul ne déduplique rien");
    assert.equal(ready(immaterial).contract.f011DuplicateBankFeesEuros, 0);
    assert.equal(mustGenerate(immaterial).g.rfs.fiscalResult.charges.totalDeductible, 1000, "F-006 ne retire rien sans décision explicite");
    // matériel (dotation 11 300 : B → C 11 000, ACTIVITY → C 11 500 : l'issue dépend de la classe) : BLOQUÉ, y compris après « je ne sais pas »
    const material = await financing(500, 11300);
    mustBlock(material);
    mustBlock(await answer(material, "BANK_FEE_ALREADY_IN_LOAN", "UNKNOWN"));
  });
});

// ---------------------------------------------------------------------------
// 7 — pas de repli silencieux : EXACT + gate rouge → BLOCK
// ---------------------------------------------------------------------------

describe("INT-5.1 — EXACT + gate rouge → BLOCK, jamais OLD_PROXY", () => {
  const reds: Array<[string, () => Promise<PersistedWorkspace> | PersistedWorkspace]> = [
    ["stocks d'ouverture inconnus", () => { const ws = exactDossier(base(0)); return { ...ws, fiscalYear: { ...ws.fiscalYear, priorHistoryDeclaration: undefined } } as PersistedWorkspace; }],
    ["CFE matérielle non qualifiée", async () => answer(await declareCfe(exactDossier(base(6000)), "500"), "CFE_BASE", "DONT_KNOW")],
    ["conflit CFE / divers", async () => declareCfe(exactDossier(base(2500, { collected: { taxeFonciere: 7000, divers: [{ id: "d", description: "x", montant: 500 }] } })), "500")],
  ];
  for (const [label, build] of reds) {
    it(`${label} → blocked, F-006 jamais appelé, mode toujours EXACT_39C_V2`, async () => {
      const ws = await build();
      assert.equal(resolveFiscalCalculationMode(ws), "EXACT_39C_V2");
      const s = resolveExactSwitch(ws);
      assert.ok(s.mode === "EXACT_39C_V2" && s.status === "BLOCKED");
      mustBlock(ws);
    });
  }
  it("le même dossier sous l'ancien contrat reste LEGACY_PROXY et ne se débloque pas par migration", () => {
    const legacy = legacyDossier(base(6000));
    assert.equal(resolveFiscalCalculationMode(legacy), "LEGACY_PROXY");
    assert.equal(generate(legacy).result.status, "generated", "proxy historique inchangé pour un dossier explicitement legacy");
  });
});
