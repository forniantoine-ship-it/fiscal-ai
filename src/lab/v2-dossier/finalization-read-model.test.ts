import { describe, it, test } from "node:test";
import assert from "node:assert/strict";
import { resolveV3Finalization, resolveV3FinalizationCta, type V3FinalizationReadModel } from "./finalization-read-model";
import type { PersistedWorkspace } from "@/lib/lmnp/store/persistence";
import type { V3CorrectionScope } from "./correction-scope";

function workspace(overrides: Partial<PersistedWorkspace["fiscalYear"]> = {}): PersistedWorkspace {
  return {
    fiscalYear: {
      id: "year-id", dossierId: "dossier-id", year: 2025, status: "draft", regime: "reel",
      propertyIds: ["property-id"], createdAt: "2025-01-01", updatedAt: "2025-01-01", ...overrides,
    },
    properties: [{ id: "property-id", label: "", address: "", city: "", postalCode: "" }],
    documents: [], extractions: [], validationItems: [], ledgerEntries: [],
    declarationDraft: { completedSteps: [] },
  };
}

const REQUIRED_SCOPE: V3CorrectionScope = {
  dossierId: "dossier-id", fiscalYearId: "year-id", year: 2025,
  property: { kind: "required", propertyId: "property-id" },
};

const GENERATED_DRAFT_BASE = { completedSteps: [] };

function completeDraft() {
  // Only needs to satisfy buildDossierSteps' completeness predicates enough for this test's
  // purpose — the six-domain semantics themselves are read-model.ts's own tested territory.
  return {
    completedSteps: [],
    inpiConfirmedAt: "2025-01-01",
    logementAmortissement: { schemaVersion: 1, prixRevient: 100000, fraisEnCharges: 0, fieldSources: {} },
    creditDeclaredNoneAt: "2025-01-01",
    amortissementAssistant: { status: "validated", totalDotations: 0, profil: "PROF-001" },
    revenusConfirmedAt: "2025-01-01",
    revenusAssistant: {},
    chargesAssistant: { totalDeductible: 0, totalNonDeductible: 0, totalPreExploitation: 0, totalAmortissable: 0, parCategorie: {}, fieldSources: {} },
  } as PersistedWorkspace["declarationDraft"];
}

describe("V3 finalization read model — R13.1", () => {
  it("DEMO isolation — never resolves for demo mode", () => {
    assert.equal(resolveV3Finalization({ mode: "demo" }, REQUIRED_SCOPE), undefined);
  });

  it("A/B — incomplete dossier reports its real blockers; complete dossier reports none", () => {
    const incomplete = resolveV3Finalization({ mode: "real", workspace: workspace() }, REQUIRED_SCOPE);
    assert.ok(incomplete);
    assert.equal(incomplete!.dossierComplete, false);
    assert.ok(incomplete!.blockers.length > 0);

    const ws = workspace();
    ws.declarationDraft = completeDraft();
    const complete = resolveV3Finalization({ mode: "real", workspace: ws }, REQUIRED_SCOPE);
    assert.equal(complete!.dossierComplete, true);
    assert.deepEqual(complete!.blockers, []);
  });

  it("C — multi-property is reported, and finalizeHref is null (fail closed, no dangerous CTA)", () => {
    const ws = workspace({ propertyIds: ["property-id", "other"] });
    ws.properties = [ws.properties[0]!, { ...ws.properties[0]!, id: "other" }];
    const model = resolveV3Finalization({ mode: "real", workspace: ws }, null);
    assert.equal(model!.multiProperty, true);
    assert.equal(model!.finalizeHref, null);
  });

  it("D — prior-history ineligible is reported verbatim from the existing authority, never reconstructed", () => {
    const ws = workspace();
    ws.fiscalYear.previousFiscalYearId = "prev-year";
    // No stocksOuverture → NATIVE_CONTINUITY_MISSING per prior-history-eligibility.ts
    const model = resolveV3Finalization({ mode: "real", workspace: ws }, REQUIRED_SCOPE);
    assert.equal(model!.priorHistory.eligible, false);
    if (!model!.priorHistory.eligible) assert.equal(model!.priorHistory.reason, "NATIVE_CONTINUITY_MISSING");
  });

  it("E — no DeclarationVersion at all → never_generated, lastGeneration null", () => {
    const model = resolveV3Finalization({ mode: "real", workspace: workspace() }, REQUIRED_SCOPE);
    assert.equal(model!.generationState, "never_generated");
    assert.equal(model!.lastGeneration, null);
  });

  it("F/I/J — a persisted DeclarationVersion surfaces only its own real forms, generated or missing", () => {
    const ws = workspace();
    ws.declarationDraft = {
      ...GENERATED_DRAFT_BASE,
      declaration: { id: "decl-1", fiscalYearId: "year-id", currentVersionId: "v1", createdAt: "2025-06-01" },
      declarationVersions: [{
        id: "v1", declarationId: "decl-1", versionNumber: 1, generatedAt: "2025-06-01T10:00:00Z",
        fiscalResult: {} as never, liasseResult: {} as never, rfs: {} as never,
        liasseRfs: { formulairesGeneres: ["2031-SD", "2033-A-SD"], formulairesManquants: ["2033-B-SD"] } as never,
      }],
    };
    const model = resolveV3Finalization({ mode: "real", workspace: ws }, REQUIRED_SCOPE);
    assert.deepEqual(model!.lastGeneration, {
      generatedAt: "2025-06-01T10:00:00Z", versionNumber: 1,
      formulairesGeneres: ["2031-SD", "2033-A-SD"], formulairesManquants: ["2033-B-SD"],
    });
  });

  it("G/H — generationState is honest: presence of declarationGeneratedAt is the ONLY signal, never numeric freshness", () => {
    const generated = workspace({ declarationGeneratedAt: "2025-06-01T10:00:00Z" });
    const withFlag = resolveV3Finalization({ mode: "real", workspace: generated }, REQUIRED_SCOPE);
    assert.equal(withFlag!.generationState, "generated_since_last_known_invalidation");

    const withoutFlag = resolveV3Finalization({ mode: "real", workspace: workspace() }, REQUIRED_SCOPE);
    assert.equal(withoutFlag!.generationState, "never_generated");
    // The type itself proves the honesty constraint: V3GenerationState has no "fresh"/"current" member.
  });

  it("P — price comes from the canonical GENERATION_PRICE_TTC constant", () => {
    const model = resolveV3Finalization({ mode: "real", workspace: workspace() }, REQUIRED_SCOPE);
    assert.equal(model!.priceLabel, "149 €");
  });

  it("finalizeHref reuses the R12.1A scope contract — null on unresolved scope, gated on the validation step", () => {
    const withScope = resolveV3Finalization({ mode: "real", workspace: workspace() }, REQUIRED_SCOPE);
    assert.ok(withScope!.finalizeHref);
    assert.ok(withScope!.finalizeHref!.startsWith("/documents?"));
    assert.ok(withScope!.finalizeHref!.endsWith("&step=validation"));
    assert.ok(withScope!.finalizeHref!.includes("v3Correction=1"));

    const withoutScope = resolveV3Finalization({ mode: "real", workspace: workspace() }, null);
    assert.equal(withoutScope!.finalizeHref, null);
  });
});

describe("V3 finalization CTA — R13.1 §6/§7/§8/§9/§10", () => {
  const base: V3FinalizationReadModel = {
    dossierComplete: true, multiProperty: false, blockers: [],
    priorHistory: { eligible: true, status: "FIRST_REAL_YEAR", basis: "declared_by_client" },
    generationState: "never_generated", lastGeneration: null,
    priceLabel: "149 €", finalizeHref: "/documents?dossierId=d&fiscalYearId=f&year=2025&v3Correction=1&step=validation",
  };
  const firstAction = { label: "Continuer l'activité", href: "/assistants/activite" };

  it("A — multi-property always wins, no action at all regardless of other fields", () => {
    const cta = resolveV3FinalizationCta({ ...base, multiProperty: true, dossierComplete: false }, firstAction);
    assert.deepEqual(cta, { kind: "multi_property", actionLabel: null, actionHref: null });
  });

  it("B — incomplete dossier never offers 'Finaliser', only R9's first action", () => {
    const cta = resolveV3FinalizationCta({ ...base, dossierComplete: false, blockers: ["Activité incomplète"] }, firstAction);
    assert.equal(cta.kind, "dossier_incomplete");
    assert.equal(cta.actionLabel, firstAction.label);
    assert.equal(cta.actionHref, firstAction.href);
  });

  it("D — prior-history unresolved routes to the owner/recovery screen, not a fake finalize", () => {
    const cta = resolveV3FinalizationCta({
      ...base, priorHistory: { eligible: false, status: "UNKNOWN", reason: "ANSWER_REQUIRED", needsAnswer: true },
    }, firstAction);
    assert.equal(cta.kind, "prior_history_unresolved");
    assert.equal(cta.actionHref, base.finalizeHref);
  });

  it("complete + eligible + never generated → 'Finaliser ma déclaration'", () => {
    const cta = resolveV3FinalizationCta(base, firstAction);
    assert.deepEqual(cta, { kind: "ready_to_finalize", actionLabel: "Finaliser ma déclaration", actionHref: base.finalizeHref });
  });

  it("already generated → 'Voir ma déclaration', never a stronger claim", () => {
    const cta = resolveV3FinalizationCta({ ...base, generationState: "generated_since_last_known_invalidation" }, firstAction);
    assert.deepEqual(cta, { kind: "already_generated", actionLabel: "Voir ma déclaration", actionHref: base.finalizeHref });
  });

  it("unresolved scope (finalizeHref null) never offers an action, even when otherwise ready", () => {
    const cta = resolveV3FinalizationCta({ ...base, finalizeHref: null }, firstAction);
    assert.equal(cta.actionHref, null);
    assert.equal(cta.actionLabel, null);
  });
});

test("R/S/T — static safety: no F006/F007/RFS call, no generation-gate call, no mutation at all", async () => {
  const fs = await import("node:fs/promises");
  const source = await fs.readFile(new URL("./finalization-read-model.ts", import.meta.url), "utf8");
  const code = source.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
  for (const forbidden of [
    "resolveDeclarationGenerationGate(", "runDeclarationGeneration(", "produceFiscalResult(",
    "produceLiasse(", "assembleLiasseFromRfs(", "dispatch(", "fetch(", "supabase", ".from(",
    "checkout", "Stripe", "paidAt",
  ]) {
    assert.equal(code.includes(forbidden), false, `finalization-read-model.ts ne doit jamais contenir ${forbidden}`);
  }
  for (const forbiddenImport of [
    "declaration-generation-gate", "run-declaration-generation", "declaration-freshness",
    "@/lib/supabase",
  ]) {
    assert.equal(code.includes(forbiddenImport), false, `finalization-read-model.ts ne doit jamais importer depuis ${forbiddenImport}`);
  }
});
