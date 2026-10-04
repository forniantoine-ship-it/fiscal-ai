/**
 * R2C.3c1 — barrières de sécurité multi-bien (AUCUNE génération multi activée).
 * Tant que les capacités d'activation multi (MULTI_PROPERTY_CAPABILITIES) sont fermées, un dossier multi ne peut ni payer, ni clôturer, ni créer N+1, ni
 * appeler la transition serveur, ni obtenir un PDF Cerfa. Scoped mono != multi : un seul bien reste un dossier MONO.
 *
 * Run: npx tsx --test src/lib/lmnp/dossier/r2c3c1-multi-barriers.test.ts
 */
import "@/lab/v2-dossier/test-public-env";
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";

import {
  MULTI_PROPERTY_CAPABILITIES,
  isMultiPropertyCapabilityOpen,
  isMultiPropertyGenerationBlocked,
  isMultiPropertyDeliveryBlocked,
  isMultiPropertyClosingBlocked,
  isMultiPropertyNextYearBlocked,
  f006FlatAssistantMountable,
  f014GlobalUsageNoteApplicable,
    isMultiPropertyRfs,
  isMultiPropertySnapshotRow,
  isMultiPropertyWorkspace,
  resolveWorkspacePropertyMode,
} from "@/lib/lmnp/dossier/multi-property-activation";
import { canCloseFiscalYear, canCreateNextFiscalYear } from "@/lib/lmnp/services/dossier/fiscal-year-cycle";
import { prepareFiscalYearTransitionCandidate } from "@/lib/lmnp/services/fiscal-year-transition/prepare-transition";
import { runCloseAndCreateNextFiscalYear } from "@/lib/lmnp/store/close-and-create-next-fiscal-year";
import { runCreateNextFiscalYear, __testResetCreateNextFiscalYearGuard } from "@/lib/lmnp/store/create-next-fiscal-year";
import type { PersistedWorkspace } from "@/lib/lmnp/store/persistence";
import type { FiscalYear } from "@/lib/lmnp/types/domain";

const ROOT = process.cwd();
const source = (relative: string) => readFileSync(path.join(ROOT, relative), "utf8");
const NOW = "2026-09-21T20:00:00.000Z";

const prop = (id: string) => ({ id, label: id, address: "1 rue X", city: "Lyon", postalCode: "69000" });
function fy(propertyIds: string[], overrides: Partial<FiscalYear> = {}): FiscalYear {
  return {
    id: "fy-n", year: 2025, status: "ready_to_close", regime: "reel", propertyIds, dossierId: "d1",
    declarationGeneratedAt: NOW, closures: [], createdAt: "2025-01-01T00:00:00.000Z", updatedAt: NOW, ...overrides,
  } as FiscalYear;
}
function legacyMono(): PersistedWorkspace {
  return { fiscalYear: fy(["A"]), properties: [prop("A")], documents: [], extractions: [], validationItems: [], ledgerEntries: [], declarationDraft: { completedSteps: [] } };
}
function scopedMono(): PersistedWorkspace {
  return { ...legacyMono(), declarationDraft: { completedSteps: [], biens: { A: { propertyId: "A", completedSteps: [] } } } };
}
function scopedMulti(): PersistedWorkspace {
  return {
    ...legacyMono(),
    fiscalYear: fy(["A", "B"]),
    properties: [prop("A"), prop("B")],
    declarationDraft: { completedSteps: [], biens: { A: { propertyId: "A", completedSteps: [] }, B: { propertyId: "B", completedSteps: [] } } },
  };
}

describe("R2C.3c1 — constante d'activation et résolveur multi unique", () => {
  it("S21 — capacités d'activation multi : seule la GÉNÉRATION est ouverte (constantes pures, aucune source dynamique) ; remplace l'ancien flag unique", () => {
    for (const capability of ["edition", "generation", "delivery", "payment", "closing", "nextYear"] as const) {
      assert.equal(MULTI_PROPERTY_CAPABILITIES[capability], ["edition", "generation", "delivery", "payment"].includes(capability), `capacité multi ${capability} : seuls la génération, la livraison et le paiement sont ouverts (MB-MULTI-CAPABILITY / DELIVERY / PAYMENT-WIRING-1)`);
      assert.equal(isMultiPropertyCapabilityOpen(capability), ["edition", "generation", "delivery", "payment"].includes(capability), `capacité multi ${capability}`);
    }
    const code = source("src/lib/lmnp/dossier/multi-property-activation.ts");
    assert.doesNotMatch(code, /process\.env|localStorage|sessionStorage|supabase|fetch\(/i);
  });

  it("S1 — legacy mono : jamais multi, jamais bloqué", () => {
    assert.equal(resolveWorkspacePropertyMode(legacyMono()).kind, "legacy_mono");
    assert.equal(isMultiPropertyWorkspace(legacyMono()), false);
    for (const blocked of [isMultiPropertyGenerationBlocked, isMultiPropertyDeliveryBlocked, isMultiPropertyClosingBlocked, isMultiPropertyNextYearBlocked]) assert.equal(blocked(legacyMono()), false);
  });

  it("S2 — scoped mono (biens = {A}, propertyIds = [A]) : MONO, jamais bloqué", () => {
    assert.equal(resolveWorkspacePropertyMode(scopedMono()).kind, "scoped_mono");
    assert.equal(isMultiPropertyWorkspace(scopedMono()), false);
    for (const blocked of [isMultiPropertyGenerationBlocked, isMultiPropertyDeliveryBlocked, isMultiPropertyClosingBlocked, isMultiPropertyNextYearBlocked]) assert.equal(blocked(scopedMono()), false);
  });

  it("S3 — scoped multi A+B : reconnu multi ; clôture et N+1 bloqués ; génération et livraison débloquées (MB-MULTI-CAPABILITY-WIRING-1 / MB-MULTI-DELIVERY-WIRING-1)", () => {
    assert.equal(resolveWorkspacePropertyMode(scopedMulti()).kind, "scoped_multi");
    assert.equal(isMultiPropertyWorkspace(scopedMulti()), true);
    for (const blocked of [isMultiPropertyClosingBlocked, isMultiPropertyNextYearBlocked]) assert.equal(blocked(scopedMulti()), true);
    for (const blocked of [isMultiPropertyGenerationBlocked, isMultiPropertyDeliveryBlocked]) assert.equal(blocked(scopedMulti()), false);
  });

  it("fail-closed : plusieurs biens à plat (sans biens) ou périmètres divergents avec >1 identifiant = multi", () => {
    const flatTwo = { ...legacyMono(), fiscalYear: fy(["A", "B"]), properties: [prop("A"), prop("B")] };
    assert.equal(isMultiPropertyWorkspace(flatTwo), true);
    const diverging = { ...legacyMono(), fiscalYear: fy(["A"]), properties: [prop("A"), prop("B")] };
    assert.equal(isMultiPropertyWorkspace(diverging), true);
    const biensTwoOnly = { ...scopedMono(), declarationDraft: { completedSteps: [], biens: { A: { propertyId: "A", completedSteps: [] }, B: { propertyId: "B", completedSteps: [] } } } };
    assert.equal(isMultiPropertyWorkspace(biensTwoOnly), true);
  });

  it("aucun bien / entrée dégradée : pas multi (jamais une règle bloquante inventée pour un état vide)", () => {
    assert.equal(isMultiPropertyWorkspace({ fiscalYear: { propertyIds: [] }, properties: [] }), false);
    assert.equal(isMultiPropertyWorkspace({}), false);
  });

  it("marqueur snapshot serveur : multi / mono / absent / schéma futur (fail-closed)", () => {
    const env = (workspace: PersistedWorkspace, schemaVersion = 2) => ({ schemaVersion, payload: { schemaVersion, workspace } });
    assert.equal(isMultiPropertySnapshotRow(env(scopedMulti())), true);
    assert.equal(isMultiPropertySnapshotRow(env(scopedMono())), false);
    assert.equal(isMultiPropertySnapshotRow(env(legacyMono(), 1)), false);
    assert.equal(isMultiPropertySnapshotRow({ schemaVersion: 1, payload: legacyMono() }), false, "payload workspace nu toléré");
    assert.equal(isMultiPropertySnapshotRow(null), false, "absence de snapshot : jamais bloquante");
    assert.equal(isMultiPropertySnapshotRow({ schemaVersion: 99, payload: { garbage: true } }), true, "schéma plus récent que ce client : fail-closed");
    assert.equal(isMultiPropertySnapshotRow({ schemaVersion: 1, payload: "oops" }), false);
  });

  it("marqueur RFS : seul `immobilisationsParBien` défini (contrat R2C.3a : absent en mono) est un marqueur multi", () => {
    assert.equal(isMultiPropertyRfs({ exercice: 2025 }), false);
    assert.equal(isMultiPropertyRfs({ exercice: 2025, immobilisationsParBien: undefined }), false);
    assert.equal(isMultiPropertyRfs({ exercice: 2025, immobilisationsParBien: [{ propertyId: "A" }, { propertyId: "B" }] }), true);
    assert.equal(isMultiPropertyRfs({ exercice: 2025, immobilisationsParBien: [] }), true, "contrat : mono = clé absente");
    assert.equal(isMultiPropertyRfs({ exercice: 2025, emprunts: [{ propertyId: "A" }] }), false, "propertyId seul n'est pas un marqueur");
    assert.equal(isMultiPropertyRfs(null), false);
  });
});

describe("R2C.3c1 — cycle fiscal", () => {
  it("S12 — canCloseFiscalYear multi : refus explicite structuré, indépendant du statut/génération/gate", () => {
    const ws = scopedMulti();
    for (const fiscalYear of [ws.fiscalYear, { ...ws.fiscalYear, status: "draft" as const }, { ...ws.fiscalYear, declarationGeneratedAt: undefined }]) {
      const result = canCloseFiscalYear({ fiscalYear, declarationDraft: ws.declarationDraft, properties: ws.properties });
      assert.equal(result.ok, false);
      if (!result.ok) assert.equal((result as { code?: string }).code, "multi_property_not_enabled");
    }
  });

  it("canCloseFiscalYear mono / scoped mono : raison historique inchangée (pas de code multi)", () => {
    for (const ws of [legacyMono(), scopedMono()]) {
      const result = canCloseFiscalYear({ fiscalYear: { ...ws.fiscalYear, status: "draft" }, declarationDraft: ws.declarationDraft, properties: ws.properties });
      assert.deepEqual(result, { ok: false, reason: "L'exercice n'est pas prêt à être clôturé." });
    }
  });

  it("S11 — canCreateNextFiscalYear multi : refus même si l'exercice source est déjà clos avec closure", () => {
    const closed = fy(["A", "B"], { status: "closed", closures: [{ id: "c1" } as never] });
    const result = canCreateNextFiscalYear(closed);
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal((result as { code?: string }).code, "multi_property_not_enabled");
  });

  it("canCreateNextFiscalYear mono clos avec closure : ok, inchangé (scoped mono compris via contexte)", () => {
    const closed = fy(["A"], { status: "closed", closures: [{ id: "c1" } as never] });
    assert.deepEqual(canCreateNextFiscalYear(closed), { ok: true });
    assert.deepEqual(canCreateNextFiscalYear(closed, scopedMono()), { ok: true });
    assert.equal(canCreateNextFiscalYear(closed, scopedMulti()).ok, false, "le contexte biens/properties multi suffit aussi");
  });

  it("S13 — prepareFiscalYearTransitionCandidate multi : refus explicite, source ouverte ET déjà close", () => {
    const open = prepareFiscalYearTransitionCandidate({ workspace: scopedMulti(), dossierId: "d1", now: NOW });
    assert.equal(open.ok, false);
    if (!open.ok) assert.equal(open.code, "multi_property_not_enabled");
    const closedWs = { ...scopedMulti(), fiscalYear: fy(["A", "B"], { status: "closed", closures: [{ id: "c1" } as never] }) };
    const closed = prepareFiscalYearTransitionCandidate({ workspace: closedWs, dossierId: "d1", now: NOW });
    assert.equal(closed.ok, false);
    if (!closed.ok) assert.equal(closed.code, "multi_property_not_enabled");
  });

  it("prepare mono / scoped mono non prêt : code historique not_ready (jamais multi)", () => {
    for (const base of [legacyMono(), scopedMono()]) {
      const ws = { ...base, fiscalYear: { ...base.fiscalYear, status: "draft" as const } };
      const result = prepareFiscalYearTransitionCandidate({ workspace: ws, dossierId: "d1", now: NOW });
      assert.equal(result.ok, false);
      if (!result.ok) assert.equal(result.code, "not_ready");
    }
  });
});

describe("R2C.3c1 — reducer / chemin local N+1 / dossier-db", () => {
  function counters() {
    const calls = { flush: 0, commit: 0, mirror: 0, dispatch: 0, errors: [] as (string | null)[], auth: 0 };
    return {
      calls,
      params: {
        flushForTransition: async () => { calls.flush += 1; return { status: "ok" as const, revision: 1 }; },
        commitOnServer: async () => { calls.commit += 1; throw new Error("commit must not be called"); },
        mirrorLocalAfterCommit: async () => { calls.mirror += 1; },
        getAuthToken: async () => { calls.auth += 1; return "tok"; },
        onError: (message: string | null) => { calls.errors.push(message); },
      },
    };
  }

  it("S14 — CLOSE_FISCAL_YEAR_AND_CREATE_NEXT local multi : refus avant flush, serveur et dispatch", async () => {
    __testResetCreateNextFiscalYearGuard();
    const c = counters();
    await runCloseAndCreateNextFiscalYear({
      dossierId: "d1", userId: "u1", workspace: scopedMulti(), now: NOW,
      dispatchCloseAndCreateNext: () => { c.calls.dispatch += 1; },
      ...c.params,
    });
    assert.deepEqual({ ...c.calls, errors: c.calls.errors.length }, { flush: 0, commit: 0, mirror: 0, dispatch: 0, errors: 1, auth: 0 });
    assert.match(String(c.calls.errors[0]), /plusieurs biens|multi/i);
  });

  it("S14 — CREATE_NEXT_FISCAL_YEAR local multi (exercice déjà clos) : refus, aucun effet", async () => {
    __testResetCreateNextFiscalYearGuard();
    const c = counters();
    const closedWs = { ...scopedMulti(), fiscalYear: fy(["A", "B"], { status: "closed", closures: [{ id: "c1" } as never] }) };
    await runCreateNextFiscalYear({
      dossierId: "d1", userId: "u1", workspace: closedWs, now: NOW,
      dispatchCreateNextFiscalYear: () => { c.calls.dispatch += 1; },
      ...c.params,
    });
    assert.deepEqual({ ...c.calls, errors: c.calls.errors.length }, { flush: 0, commit: 0, mirror: 0, dispatch: 0, errors: 1, auth: 0 });
  });

  it("parité — scoped mono et legacy mono atteignent toujours le flush (chemin historique), puis not_ready", async () => {
    for (const ws of [legacyMono(), scopedMono()]) {
      __testResetCreateNextFiscalYearGuard();
      const c = counters();
      await runCloseAndCreateNextFiscalYear({
        dossierId: "d1", userId: "u1", workspace: { ...ws, fiscalYear: { ...ws.fiscalYear, status: "draft" } }, now: NOW,
        dispatchCloseAndCreateNext: () => { c.calls.dispatch += 1; },
        ...c.params,
      });
      assert.equal(c.calls.flush, 1);
      assert.equal(c.calls.commit, 0);
      assert.equal(c.calls.dispatch, 0);
    }
  });

  it("S15 — persistFiscalYear(ClosureAnd)Transition (dossier-db) : AUCUN appelant de production ⇒ pas de garde redondant", () => {
    const files = execSync("git ls-files 'src/**/*.ts' 'src/**/*.tsx'", { cwd: ROOT, encoding: "utf8" }).split("\n").filter(Boolean);
    const offenders = files.filter((file) => {
      if (/\.test\.tsx?$/.test(file) || file.endsWith("store/dossier-db.ts")) return false;
      const text = source(file);
      return /persistFiscalYearClosureAndTransition\s*\(|persistFiscalYearTransition\s*\(/.test(text) && !/^\s*(\/\/|\*|\/\*)/m.test("") ;
    }).filter((file) => {
      // ignore les mentions en commentaire : on exige un import réel.
      return /import[^;]*\b(persistFiscalYearClosureAndTransition|persistFiscalYearTransition)\b[^;]*from/s.test(source(file));
    });
    assert.deepEqual(offenders, []);
  });

  it("S15 — les actions reducer N+1 ne sont dispatchées que par le provider, derrière les wrappers gardés", () => {
    const files = execSync("git ls-files 'src/**/*.ts' 'src/**/*.tsx'", { cwd: ROOT, encoding: "utf8" }).split("\n").filter(Boolean);
    const dispatchers = files.filter((file) => !/\.test\.tsx?$/.test(file) && /type:\s*"(CREATE_NEXT_FISCAL_YEAR|CLOSE_FISCAL_YEAR_AND_CREATE_NEXT)"/.test(source(file)) && !file.endsWith("store/reducer.ts"));
    assert.deepEqual(dispatchers, ["src/lib/lmnp/store/provider.tsx"]);
  });
});

describe("R2C.3c1 — panels et moteur", () => {
  it("S18 — F006 : assistant à plat non monté en scoped multi ; monté en legacy mono et scoped mono", () => {
    assert.equal(f006FlatAssistantMountable(scopedMulti()), false);
    assert.equal(f006FlatAssistantMountable(scopedMono()), true);
    assert.equal(f006FlatAssistantMountable(legacyMono()), true);
    const panel = source("src/components/lmnp/assistants/F006FiscalEnginePanel.tsx");
    assert.match(panel, /f006FlatAssistantMountable\(/);
  });

  it("S19 — F014 : usageNote du FiscalResult GLOBAL non affichée en multi ; inchangée en mono / scoped mono", () => {
    assert.equal(f014GlobalUsageNoteApplicable(scopedMulti()), false);
    assert.equal(f014GlobalUsageNoteApplicable(scopedMono()), true);
    assert.equal(f014GlobalUsageNoteApplicable(legacyMono()), true);
    const panel = source("src/components/lmnp/assistants/F014AmortissementsAssistantPanel.tsx");
    assert.match(panel, /f014GlobalUsageNoteApplicable\(/);
  });

  it("S20 — le moteur R2C.3b et les fichiers de gate/readiness ne sont pas modifiés par 3c1", () => {
    const untouched = [
      "src/lib/lmnp/services/declaration/generation-workspace.ts",
      "src/lib/lmnp/services/declaration/run-declaration-generation.ts",
      "src/lib/lmnp/dossier/fiscal-consolidation.ts",
      "src/lib/lmnp/dossier/property-immobilisations.ts",
      "src/lib/lmnp/services/declaration/declaration-generation-gate.ts",
      "src/lib/lmnp/services/declaration/validation-profile.ts",
      "src/lib/lmnp/services/declaration/declaration-freshness.ts",
      "src/components/lmnp/documents/ValidationDocumentStep.tsx",
      "src/components/lmnp/declaration/DeclarationReadyView.tsx",
    ];
    // Ancré sur le commit 3c1 lui-même (08ac113..7c18ece) : l'invariant « 3c1 ne touche pas le moteur » ne dépend pas des slices suivantes.
    const diff = execSync(`git diff --name-only 08ac1133caaf05ce12666ba01e21d4c84aecd455 7c18eceb6f1a841e7a77a999be13ccb601e23046 -- ${untouched.join(" ")}`, { cwd: ROOT, encoding: "utf8" }).trim();
    assert.equal(diff, "");
  });

  it("S22 — appelants de production de runDeclarationGenerationFromWorkspace : le preview pur de la gate (R2C.3c2c) et l'écran de validation, gardé contre le multi (R2C.3c2d) ; la livraison serveur autoritative (TRUST-2)", () => {
    const files = execSync("git ls-files 'src/**/*.ts' 'src/**/*.tsx'", { cwd: ROOT, encoding: "utf8" }).split("\n").filter(Boolean);
    const callers = files.filter((file) => !/\.test\.tsx?$/.test(file) && !file.endsWith("generation-workspace.ts") && source(file).includes("runDeclarationGenerationFromWorkspace"));
    assert.deepEqual(callers, [
      "src/components/lmnp/documents/ValidationDocumentStep.tsx",
      // MB-MULTI-SERVER-TRUST-2 (857c248) — la livraison recalcule côté serveur via le MÊME pipeline (un seul F-006), jamais depuis une RFS client.
      "src/lib/lmnp/services/declaration/authoritative-delivery.ts",
      "src/lib/lmnp/services/declaration/declaration-generation-gate.ts",
    ]);
  });
});
