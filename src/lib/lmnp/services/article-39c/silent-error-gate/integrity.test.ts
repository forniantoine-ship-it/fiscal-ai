/* eslint-disable @typescript-eslint/no-explicit-any -- fixtures de brouillons hétérogènes (test) */
/**
 * GATE-1 §12/§13/§14 — persistance, faits PÉRIMÉS (mutation après validation), COLLISIONS (identité insuffisante).
 * Run: npx tsx --test src/lib/lmnp/services/article-39c/silent-error-gate/integrity.test.ts
 */
import "@/lab/v2-dossier/test-public-env";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { PersistedWorkspace } from "@/lib/lmnp/store/persistence";
import { DOSSIER, expense, pret, roundtrip } from "./../article-39c-test-fixtures";
import { exactDossier } from "./../exact-generation-fixtures";
import { buildConsolidatedArticle39cFromWorkspace } from "./../consolidation";
import { cfeRecordIdFor, editCfeNotice, emptyQualificationStore, parseQualificationStore, recordCfeAnswer } from "./../qualification-store";
import { resolveExactSwitch } from "@/lib/lmnp/services/declaration/exact-39c-switch";
import { caseDossier, genProd, multiDossier, type Case } from "./fixtures.test";
import { answer, declareCfe, ofKind } from "./flows";

const consolidated = (ws: PersistedWorkspace) => buildConsolidatedArticle39cFromWorkspace({ workspace: roundtrip(ws).reloaded, expectedDossierId: DOSSIER });
const cfeOf = (ws: PersistedWorkspace) => consolidated(ws).contributions.find((x) => x.source === "CFE_NOTICE");
const blocked = (ws: PersistedWorkspace) => (resolveExactSwitch(ws) as any).status === "BLOCKED" && genProd(ws).status === "blocked";
const set = (ws: any, patch: Record<string, unknown>) => ({ ...ws, declarationDraft: { ...ws.declarationDraft, ...patch } }) as PersistedWorkspace;

describe("GATE-1 — faits périmés : une qualification validée ne survit jamais à la mutation du fait", () => {
  const cfeBase = (dotation = 2500) => caseDossier({ E: 10000, TF: 7000, dotation });

  it("CFE : montant modifié → STALE (plus ACTIVITY) ; document modifié → STALE ; année différente → ignorée ; résultat jamais calculé sur une classe périmée", async () => {
    const ws = await answer(await declareCfe(cfeBase(), "1000"), "CFE_BASE", "MINIMUM_BASE");
    assert.equal(cfeOf(ws)!.class, "ACTIVITY");
    const store = (ws.declarationDraft as any).article39cActivityQualifications;
    const recordId = cfeRecordIdFor({ level: "ACTIVITY" }, parseQualificationStore(store)!.records.find((r) => r.recordKind === "CFE")!.notice.sourceId, 2026);
    for (const patch of [{ amountCents: 110000 }, { evidenceRefs: ["doc-autre"] }]) {
      const mutated = set(ws, { article39cActivityQualifications: editCfeNotice(parseQualificationStore(store)!, recordId, patch) });
      assert.deepEqual([cfeOf(mutated)!.class, cfeOf(mutated)!.qualificationStatus], ["NEEDS_QUALIFICATION", "STALE"], JSON.stringify(patch));
      assert.equal(blocked(mutated), true, "dotation matérielle + qualification périmée → BLOQUÉ");
    }
    // année : un avis de CFE de 2025 n'est ni une charge ni une qualification de 2026
    const other = recordCfeAnswer(emptyQualificationStore(), { scope: { level: "ACTIVITY" }, notice: { sourceId: "cfe-2025", fiscalYear: 2025, amountCents: 100000 }, cfeBaseKind: "MINIMUM", provenance: "declaration", answeredAt: "t" });
    const wrongYear = set(cfeBase(), { article39cActivityQualifications: other });
    assert.equal(cfeOf(wrongYear), undefined);
    const g: any = genProd(wrongYear);
    assert.equal(g.status, "generated");
    assert.equal(g.rfs.fiscalResult.resultatAvantAmort, 3000, "la CFE 2025 n'entre pas dans le résultat 2026");
  });

  it("frais bancaires « déjà dans les frais du prêt » : montant modifié → périmée ; prêt renommé (même montant) → périmée ET non dédupliquée → BLOQUÉ ; fait d'un autre bien → refusé", async () => {
    const loan = (id: string) => [pret({ pretId: id, fraisDossierDeductibles: 500 })];
    const mk = (fraisBancaires: number, loanId = "loan-1", qualifications?: unknown): PersistedWorkspace => {
      const ws: any = exactDossier({ cash: 12000, dotation: 0, collected: { fraisBancaires } as any, bien: { financement: loan(loanId), ...(qualifications ? { qualifications: qualifications as any } : {}) } });
      return set(ws, { creditDeclaredNoneAt: undefined, creditConfirmedAt: "2026-01-01T00:00:00.000Z" });
    };
    const answered = await answer(await answer(mk(500), "BANK_FEE_PURPOSE", "FINANCING"), "BANK_FEE_ALREADY_IN_LOAN", "ALREADY_IN_LOAN");
    const g0: any = genProd(answered);
    assert.equal(g0.status, "generated");
    assert.equal(g0.rfs.fiscalResult.resultatAvantAmort, 11500);
    const q = (answered.declarationDraft as any).article39cQualifications;
    // montant 500 → 600 : périmée ; montants différents (600 ≠ 500) → deux frais, 11 000 − 100
    const amountChanged = mk(600, "loan-1", q);
    assert.equal(consolidated(amountChanged).contributions.find((x) => x.contributionId.includes("frais-bancaires"))!.qualificationStatus, "STALE");
    const g1: any = genProd(amountChanged);
    assert.equal(g1.status, "generated");
    assert.equal(g1.rfs.fiscalResult.resultatAvantAmort, 12000 - 600 - 500, "faits différents : les deux sont comptés, jamais la dédup périmée");
    // prêt renommé : même montant 500, fait périmé → ambigu → BLOQUÉ
    assert.equal(blocked(mk(500, "loan-2", q)), true);
    // fait copié dans un autre bien (scope) : refusé
    const multi: any = multiDossier({ biens: [{ id: "A", E: 10000, dotation: 0, extra: { collected: { fraisBancaires: 200 } as any } }, { id: "B", E: 8000, dotation: 0, extra: { collected: { fraisBancaires: 200 } as any } }] });
    const answeredA = await answer(multi, "BANK_FEE_PURPOSE", "ACTIVITY_ACCOUNT", { propertyId: "A" });
    const storeA = (answeredA.declarationDraft as any).biens.A.article39cQualifications;
    const contaminated = { ...answeredA, declarationDraft: { ...(answeredA.declarationDraft as any), biens: { ...(answeredA.declarationDraft as any).biens, B: { ...(answeredA.declarationDraft as any).biens.B, article39cQualifications: storeA } } } } as PersistedWorkspace;
    const c = consolidated(contaminated);
    assert.ok(c.blockers.some((b) => b.code === "QUALIFICATION_WRONG_SCOPE"), "la qualification de A présente dans B est détectée");
    assert.equal(genProd(contaminated).status, "blocked");
  });

  it("PNO « oui » : montant du document modifié → périmée → NEEDS_QUALIFICATION, question reposée", async () => {
    const mk = (montant: number, q?: unknown): PersistedWorkspace => caseDossier({ E: 12000, dotation: 0, extra: { collected: { documentExpenses: [expense({ id: "ass-1", category: "assurance_pno", montant, insuranceKind: "logement" })] } as any, ...(q ? { bien: { qualifications: q as any } } : {}) } });
    const yes = await answer(mk(400), "PNO_CONFIRMATION", "YES");
    const cls = (w: PersistedWorkspace) => consolidated(w).contributions.find((x) => x.contributionId.includes("assurance-pno"))!;
    assert.equal(cls(yes).class, "B");
    const mutated = mk(450, (yes.declarationDraft as any).article39cQualifications);
    assert.deepEqual([cls(mutated).class, cls(mutated).qualificationStatus], ["NEEDS_QUALIFICATION", "STALE"]);
    assert.equal(ofKind(mutated, "PNO_CONFIRMATION").length, 1);
  });
});

describe("GATE-1 — collisions : aucune déduplication sur une identité insuffisante", () => {
  it("deux prêts de même identifiant local (« loan-1 ») dans deux biens : jamais fusionnés, jamais comptés une seule fois", () => {
    const ws: any = multiDossier({ biens: [{ id: "A", E: 10000, dotation: 0 }, { id: "B", E: 8000, dotation: 0 }] });
    const withLoan = (b: any, interest: number, doc: string) => ({ ...b, creditDeclaredNoneAt: undefined, creditDocumentId: doc, creditConfirmedAt: "t", financementCharges: { exerciceFiscal: 2026, totalInteretsEmprunt: interest, totalInteretsPreExploitation: 0, totalAssurance: 0, totalAssurancePreExploitation: 0, totalCapitalRembourse: 0, totalChargesFinancementExercice: interest, prets: [pret({ pretId: "loan-1", interetsEmpruntExercice: interest })], fieldSources: {}, computedAt: "t" } });
    const biens = { A: withLoan(ws.declarationDraft.biens.A, 600, "doc-A"), B: withLoan(ws.declarationDraft.biens.B, 400, "doc-B") };
    const two = set(ws, { biens });
    const c = consolidated(two);
    const loans = c.contributions.filter((x) => x.source === "F011_LOAN" && x.class === "B");
    assert.equal(loans.length, 2);
    assert.equal(c.byClassCents.B, 100000, "600 + 400 : deux prêts, deux charges");
    assert.deepEqual(c.violations, []);
  });

  it("deux documents d'assurance de contenu identique (SHA-256) : BLOQUÉ (GATE-1.1, voir documents.test.ts) ; sans empreinte calculée l'identité reste inconnue, jamais fusionnée", () => {
    const dup = (n: number) => Array.from({ length: n }, (_, i) => expense({ id: `e${i}`, category: "assurance_pno", montant: 400, documentId: `doc-${i}`, dateDepense: "2026-03-01", description: "Facture identique", insuranceKind: "gli" }));
    const ws = (n: number) => caseDossier({ E: 12000, dotation: 0, extra: { collected: { documentExpenses: dup(n) } as any } });
    const noHash: any = genProd(ws(2));
    assert.equal(noHash.status, "generated");
    assert.equal(noHash.rfs.fiscalResult.charges.totalDeductible, 800, "aucune identité démontrée : aucune fusion ni suppression");
    const sha = "a".repeat(64);
    const hashed: any = { ...ws(2), documents: [0, 1].map((i) => ({ id: `doc-${i}`, contentSha256: sha })) };
    assert.equal(genProd(hashed).status, "blocked");
  });

  it("deux charges de même catégorie et même montant mais lignes distinctes (taxe foncière + taxe foncière d'un autre bien) restent DEUX charges (bien différent)", () => {
    const m: { biens: Array<Case & { id: string }> } = { biens: [{ id: "A", E: 10000, TF: 2000, dotation: 0 }, { id: "B", E: 8000, TF: 2000, dotation: 0 }] };
    const g: any = genProd(multiDossier(m));
    assert.equal(g.status, "generated");
    assert.equal(g.rfs.fiscalResult.charges.totalDeductible, 4000);
  });

  it("suppression puis recréation d'une ligne : la qualification de l'ancienne ligne ne s'applique pas à la nouvelle (empreinte différente) — PNO « oui » sur 400 puis ligne recréée à 400 d'un autre document", async () => {
    const mk = (docId: string, q?: unknown): PersistedWorkspace => caseDossier({ E: 12000, dotation: 0, extra: { collected: { documentExpenses: [expense({ id: "ass-1", category: "assurance_pno", montant: 400, documentId: docId, insuranceKind: "logement" })] } as any, ...(q ? { bien: { qualifications: q as any } } : {}) } });
    const yes = await answer(mk("doc-1"), "PNO_CONFIRMATION", "YES");
    const recreated = mk("doc-2", (yes.declarationDraft as any).article39cQualifications);
    const k = consolidated(recreated).contributions.find((x) => x.contributionId.includes("assurance-pno"))!;
    assert.equal(k.class, "NEEDS_QUALIFICATION", "document source différent → la réponse précédente n'est pas rejouée");
  });
});

describe("GATE-1 — persistance / reload : calculer → sérialiser → recharger → recalculer (identité exacte des chiffres)", () => {
  it("dossier avec CFE répondue, F013 CO/CC/AO/AC, déficits et ARD : mêmes chiffres avant et après reload (JSON complet du FiscalResult)", async () => {
    const base = caseDossier({ E: 13000, CO: 500, CC: 700, AO: 300, AC: 200, TF: 7000, COMPTA: 300, dotation: 2500, ardOpen: 400, deficits: [{ millesime: 2024, montant: 900 }] });
    const ws = await answer(await declareCfe(base, "450"), "CFE_BASE", "MINIMUM_BASE");
    const a: any = genProd(ws);
    const b: any = genProd(roundtrip(ws).reloaded);
    assert.equal(a.status, "generated");
    const noClock = (v: unknown) => JSON.parse(JSON.stringify(v, (k, x) => (k === "computedAt" ? undefined : x)));
    assert.deepEqual(noClock(b.rfs.fiscalResult), noClock(a.rfs.fiscalResult));
    assert.deepEqual(roundtrip(ws).reloaded.declarationDraft, JSON.parse(JSON.stringify(ws.declarationDraft)));
  });
});
