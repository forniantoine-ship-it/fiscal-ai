/**
 * F013-HOTFIX-1 — isolation `propertyId` du bridge revenus V1 : une source scopée à un bien ne contribue qu'à ce bien.
 * Run: npx tsx --test src/lib/lmnp/services/revenus-bridge-property-scope.test.ts
 */
import "@/lab/v2-dossier/test-public-env";
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { buildRevenusAssistantFromSession, resolveRevenusBridgeScope } from "./revenus-upload-to-assistant-bridge";
import type { RevenueGptSession, RevenuePropertySession, RevenueTransaction } from "../types";

const YEAR = 2025;
const row = (loyers: number) => [{ monthKey: "2025-11", month: "Novembre", loyers, autresRevenus: 0, charges: 0 }];
const gridSession = (id: string, propertyId: string | undefined, loyers: number, edited = true): RevenuePropertySession => ({
  id, label: id, ...(propertyId ? { propertyId } : {}), rows: row(loyers), gridUserEdited: edited,
});
const tx = (id: string, amount: number): RevenueTransaction => ({
  id, description: id, amount, direction: "credit", category: "rent", date: "2025-11-05",
});
const txSession = (id: string, propertyId: string | undefined, amount: number): RevenuePropertySession => ({
  id, label: id, ...(propertyId ? { propertyId } : {}), rows: row(0), transactions: [tx(`${id}-t`, amount)],
});
const session = (...properties: RevenuePropertySession[]): RevenueGptSession => ({ mode: "upload", properties });
const forProperty = (s: RevenueGptSession, propertyId: string | undefined, includeUnattributed?: boolean) =>
  buildRevenusAssistantFromSession(s, YEAR, "2020-01-01", { kind: "property", propertyId, ...(includeUnattributed ? { includeUnattributed } : {}) });
const total = (r: ReturnType<typeof forProperty>) => r.revenusAssistant.totalRecettes;
const hasError = (r: ReturnType<typeof forProperty>) => r.anomalies.some((a) => a.severity === "error" || a.severity === "fatal");

describe("HOTFIX-1 — bridge revenus V1 par propertyId", () => {
  it("HOTFIX-01 contamination A+B : bridge(A) = 1 000 €, jamais 1 700 €", () => {
    const s = session(gridSession("sA", "A", 1000), gridSession("sB", "B", 700, false));
    assert.equal(total(forProperty(s, "A")), 1000);
  });
  it("HOTFIX-01b mêmes sources, grille de B corrigée ou issue de transactions : A inchangé", () => {
    assert.equal(total(forProperty(session(gridSession("sA", "A", 1000), gridSession("sB", "B", 700, true)), "A")), 1000);
    assert.equal(total(forProperty(session(gridSession("sA", "A", 1000), txSession("sB", "B", 700)), "A")), 1000);
    assert.equal(total(forProperty(session(txSession("sA", "A", 1000), gridSession("sB", "B", 700, true)), "A")), 1000);
  });
  it("HOTFIX-02 symétrie : bridge(B) = 700 €", () => {
    // Contrat v1 inchangé : une grille non corrigée sans transactions ne compte pas ; B a ici une grille corrigée.
    const s = session(gridSession("sA", "A", 1000), gridSession("sB", "B", 700));
    assert.equal(total(forProperty(s, "B")), 700);
    const withTransactions = session(gridSession("sA", "A", 1000), txSession("sB", "B", 700));
    assert.equal(total(forProperty(withTransactions, "B")), 700);
  });
  it("HOTFIX-03 navigation A→B→A→B : résultats stables", () => {
    const s = session(gridSession("sA", "A", 1000), gridSession("sB", "B", 700));
    const seen = ["A", "B", "A", "B"].map((id) => total(forProperty(s, id)));
    assert.deepEqual(seen, [1000, 700, 1000, 700]);
  });
  it("HOTFIX-04 modification de B : A reste 1 000 €, B devient 900 €", () => {
    const before = session(gridSession("sA", "A", 1000), gridSession("sB", "B", 700));
    const after = session(gridSession("sA", "A", 1000), gridSession("sB", "B", 900));
    assert.equal(total(forProperty(before, "A")), 1000);
    assert.equal(total(forProperty(after, "A")), 1000);
    assert.equal(total(forProperty(after, "B")), 900);
  });
  it("HOTFIX-05 source sans propertyId en multi : ne contamine ni A ni B", () => {
    const s = session(gridSession("sA", "A", 1000), gridSession("sB", "B", 700), gridSession("sX", undefined, 500));
    assert.equal(total(forProperty(s, "A")), 1000);
    assert.equal(total(forProperty(s, "B")), 700);
  });
  it("HOTFIX-06 mono historique : session sans propertyId conservée (sans scope, ou avec includeUnattributed)", () => {
    const s = session(gridSession("sM", undefined, 1000));
    assert.equal(buildRevenusAssistantFromSession(s, YEAR, "2020-01-01").revenusAssistant.totalRecettes, 1000);
    assert.equal(total(forProperty(s, "A", true)), 1000);
  });
  it("HOTFIX-07 source explicitement A : jamais attribuée à B, quel que soit le bien demandé ensuite", () => {
    const s = session(gridSession("sA", "A", 1000));
    assert.notEqual(total(forProperty(s, "B")), 1000);
    assert.equal(total(forProperty(s, "A")), 1000);
  });
  it("HOTFIX-08 aucune source pour A (seules des sources B) : jamais le montant de B ; anomalie bloquante explicite", () => {
    const s = session(gridSession("sB", "B", 700), txSession("sB2", "B", 300));
    const r = forProperty(s, "A");
    assert.equal(total(r), 0);
    assert.equal(hasError(r), true, "aucune source attribuée : bloqué, jamais un zéro silencieux");
    assert.ok(r.anomalies.some((a) => /aucune source/i.test(a.message)));
  });
  it("sans scope : comportement historique inchangé (toutes les sessions)", () => {
    const s = session(gridSession("sA", "A", 1000), gridSession("sB", "B", 700));
    assert.equal(buildRevenusAssistantFromSession(s, YEAR, "2020-01-01").revenusAssistant.totalRecettes, 1700);
  });
});

describe("HOTFIX-1 — scope fourni par l'appelant productif (RevenusDocumentStep)", () => {
  const prop = (id: string) => ({ id, label: id, address: "", city: "", postalCode: "" });
  const multiLegacy = { properties: [prop("A"), prop("B")], fiscalYear: { id: "fy", year: YEAR, propertyIds: ["A", "B"] }, declarationDraft: { completedSteps: [] } } as never;
  const multiScoped = { ...(multiLegacy as object), declarationDraft: { completedSteps: [], biens: { A: { propertyId: "A", completedSteps: [] }, B: { propertyId: "B", completedSteps: [] } } } } as never;
  const mono = { properties: [prop("A")], fiscalYear: { id: "fy", year: YEAR, propertyIds: ["A"] }, declarationDraft: { completedSteps: [] } } as never;

  it("multi (legacy ou scopé) : bien actif explicite ; sans bien actif : aucune source éligible", () => {
    assert.deepEqual(resolveRevenusBridgeScope(multiLegacy, "A"), { kind: "property", propertyId: "A" });
    assert.deepEqual(resolveRevenusBridgeScope(multiScoped, "B"), { kind: "property", propertyId: "B" });
    const s = session(gridSession("sA", "A", 1000), gridSession("sB", "B", 700));
    const noActive = buildRevenusAssistantFromSession(s, YEAR, "2020-01-01", resolveRevenusBridgeScope(multiLegacy, undefined));
    assert.equal(noActive.revenusAssistant.totalRecettes, 0);
    assert.equal(noActive.anomalies.some((a) => a.severity === "error"), true);
  });
  it("HOTFIX-07 bien actif B, source explicitement A : jamais attribuée à B", () => {
    const onlyA = session(gridSession("sA", "A", 1000));
    const r = buildRevenusAssistantFromSession(onlyA, YEAR, "2020-01-01", resolveRevenusBridgeScope(multiLegacy, "B"));
    assert.equal(r.revenusAssistant.totalRecettes, 0);
  });
  it("HOTFIX-06 mono : aucun scope, comportement historique", () => {
    assert.equal(resolveRevenusBridgeScope(mono, "A"), undefined);
    assert.equal(resolveRevenusBridgeScope(mono, undefined), undefined);
    const s = session(gridSession("sM", undefined, 1000));
    assert.equal(buildRevenusAssistantFromSession(s, YEAR, "2020-01-01", resolveRevenusBridgeScope(mono, undefined)).revenusAssistant.totalRecettes, 1000);
  });
});
