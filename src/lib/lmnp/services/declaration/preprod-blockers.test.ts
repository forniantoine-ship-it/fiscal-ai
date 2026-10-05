import "@/lab/v2-dossier/test-public-env";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import ts from "typescript";

import { computeChargesExercice } from "@/runtime/capabilities/f012/compute-charges-exercice";
import { collectedToChargeRegistry } from "@/runtime/assistants/f012-charges/collected-to-registry";
import { chargeRegistryToComputeInput } from "@/runtime/assistants/f012-charges/registry-to-compute-input";
import type { F012PersistedState } from "@/runtime/assistants/f012-charges/types";
import { produceFiscalResult } from "@/runtime/capabilities/f006/produce-fiscal-result";
import { buildChargesAssistantOutput } from "@/lib/lmnp/services/f012/charges-assistant-output";
import { exactDossier } from "@/lib/lmnp/services/article-39c/exact-generation-fixtures";
import { bumpYear, rentFull, withConsistentPlan } from "@/lib/lmnp/services/article-39c/silent-error-gate/fixtures.test";
import { parseWorkspaceSnapshot, serializeWorkspaceSnapshot } from "@/lib/lmnp/store/workspace-snapshot";
import { applyFactsChange } from "@/lib/lmnp/services/f013/v2/f013-v2-state";
import { resolveExactSwitch, resolveFiscalCalculationMode } from "./exact-39c-switch";
import type * as GenerationModule from "./generation-workspace";

const YEAR = 2025;
const PROPERTY = "prop-1";
const NOW = "2026-10-05T20:00:00.000Z";

function countedGeneration() {
  let calls = 0;
  const engine = { produceFiscalResult: (input: Parameters<typeof produceFiscalResult>[0]) => { calls += 1; return produceFiscalResult(input); } };
  // The existing options.engine seam covers multi only. Instrument the actual
  // imported F006 function in both production modules without changing their code.
  const load = (name: string, replacements: Record<string, unknown>) => {
    const file = fileURLToPath(new URL(name, import.meta.url));
    const compiled = ts.transpileModule(readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS } });
    const localRequire = createRequire(file);
    const loaded = { exports: {} };
    new Function("require", "module", "exports", compiled.outputText)(
      (id: string) => id in replacements ? replacements[id] : localRequire(id), loaded, loaded.exports,
    );
    return loaded.exports;
  };
  const dependencies = { "@/runtime/capabilities/f006/produce-fiscal-result": engine };
  const core = load("./run-declaration-generation.ts", dependencies);
  const generation = load("./generation-workspace.ts", { ...dependencies, "./run-declaration-generation": core }) as typeof GenerationModule;
  return { run: generation.runDeclarationGenerationFromWorkspace, calls: () => calls };
}

function oracleWorkspace() {
  const ws = bumpYear(withConsistentPlan(exactDossier({ cash: 12000, dotation: 2500 }), 2500), YEAR);
  const draft = ws.declarationDraft!;
  const collected = { coproLignes: [{ type: "provisions" as const, montant: 7000 }], travaux: [], divers: [], skippedCategories: [], honorairesComptable: 1000 };
  const registry = collectedToChargeRegistry({ collected, categoryInventory: [], fieldSources: {}, exercise: YEAR });
  const dateMiseEnService = "2025-02-20";
  const { charges } = computeChargesExercice(chargeRegistryToComputeInput(registry, { dateMiseEnService }));
  const state: F012PersistedState = { step: "complete", categoryInventory: [], currentCategoryIndex: 0, collected, registry, fieldSources: {}, updatedAt: NOW };
  ws.declarationDraft = { ...draft, dateMiseEnService,
    rentReconciliationV2: rentFull(PROPERTY, { E: 12000 }, YEAR),
    chargesAssistantState: state, chargesAssistant: buildChargesAssistantOutput(charges, {}, NOW), chargesConfirmedAt: NOW,
  };
  const saved = serializeWorkspaceSnapshot(ws);
  assert.ok(saved.ok);
  assert.equal(saved.envelope.schemaVersion, 3);
  const reloaded = parseWorkspaceSnapshot(JSON.parse(JSON.stringify(saved.envelope)));
  assert.ok(reloaded.ok);
  return { workspace: reloaded.envelope.workspace, charges };
}

test("PREPROD: 2025 February, persisted v2 + F012 accounting → exact oracle and ONE F006", () => {
  const { workspace, charges } = oracleWorkspace();
  assert.equal(charges.totalPreExploitation, 0);
  assert.equal(charges.parCategorie.honoraires_comptable, 1000);
  assert.equal(resolveFiscalCalculationMode(workspace), "EXACT_39C_V2");
  const exact = resolveExactSwitch(workspace);
  assert.equal(exact.mode, "EXACT_39C_V2");
  assert.ok(exact.mode === "EXACT_39C_V2" && exact.status === "READY", JSON.stringify(exact));
  const figures = exact.contract.gate.preSwitch.exact.consolidated;
  assert.deepEqual([figures.byClassCents.L, figures.byClassCents.B, figures.byClassCents.ACTIVITY, exact.contract.capacite], [1200000, 700000, 100000, 5000]);
  const engine = countedGeneration();
  const generated = engine.run(workspace);
  assert.equal(generated.status, "generated", JSON.stringify(generated.status === "blocked" ? generated.blockingReasons : null));
  assert.equal(engine.calls(), 1);
  if (generated.status !== "generated") return;
  const result = generated.rfs.fiscalResult;
  assert.equal(result.article39cMode, "EXACT_39C_V2");
  assert.deepEqual([result.recettes.total, result.resultatAvantAmort, result.amortDeduct, result.amortNonDeduitExercice,
    result.amortReportesUtilises, result.stocks.amortissementsReportes, result.resultatFiscalAvantDeficits, result.resultatFiscal],
  [12000, 4000, 2500, 0, 0, 0, 1500, 1500]);
  assert.deepEqual(result.stocks.deficits, []);
});

test("PREPROD: explicit v2 incomplete or invalid after reload blocks generation, zero F006 calls, no proxy fallback", () => {
  for (const variant of ["unconfirmed", "unknown", "wrong-scope"] as const) {
    const { workspace } = oracleWorkspace();
    const rent = workspace.declarationDraft!.rentReconciliationV2!;
    workspace.declarationDraft!.rentReconciliationV2 = variant === "unconfirmed" ? { ...rent, confirmation: undefined }
      : variant === "unknown" ? applyFactsChange(rent, { closingReceivables: { status: "UNKNOWN" } })
        : { ...rent, facts: { ...rent.facts, propertyId: "other-property" } };
    assert.equal(resolveFiscalCalculationMode(workspace), "EXACT_39C_V2", variant);
    const engine = countedGeneration();
    const generated = engine.run(workspace);
    assert.equal(generated.status, "blocked", variant);
    assert.equal(engine.calls(), 0, variant);
  }
});
