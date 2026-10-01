/**
 * F011-R2 — le cycle de vie du statut d'un document suit les ÉVÉNEMENTS RÉELS de l'analyse F011 :
 *   pending (upload) → processing (analyse commencée) → completed | failed (analyse terminée).
 * « Extraction réussie » et « échéancier exploitable » sont deux faits distincts : un tableau lu avec succès mais rejeté par
 * `resolveDocumentaryEcheances` reste `completed`. Le statut est une métadonnée best-effort : son échec ne change jamais le
 * résultat F011.
 *
 * Run: npx tsx --test src/lib/lmnp/services/f011/f011-document-lifecycle.test.ts
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { resolveDocumentaryEcheances } from "@/runtime/capabilities/f011/resolve-documentary-echeances";
import type { CreditGptPipelineResult } from "@/lib/lmnp/services/credit-gpt-pipeline";
import { runF011UploadFlowWithStatusLifecycle, type ExtractionStatusReporter } from "./f011-document-lifecycle";

const file = new File(["%PDF"], "Tableau d'amortissement.pdf", { type: "application/pdf" });

type Params = Parameters<typeof runF011UploadFlowWithStatusLifecycle>[0];
type Analyze = NonNullable<Params["analyze"]>;

/**
 * Extraction réussie au sens de `deriveF011ExtractionState` : les quatre champs cœur (capital, durée, date de 1re mensualité
 * lus sur le tableau ; taux lu sur l'offre — le tableau ne le porte jamais), plus les lignes du tableau.
 */
function successfulPipeline(rows: Array<Record<string, unknown>> = []): CreditGptPipelineResult {
  return {
    success: true,
    amortization: {
      extraction: { loanAmount: 100000, loanDurationMonths: 240, firstPaymentDate: "2025-01-05", installments: rows },
    },
    loanOffer: { extraction: { interestRate: 2 } },
  } as unknown as CreditGptPipelineResult;
}

function recorder(fail = false) {
  const events: string[] = [];
  const report: ExtractionStatusReporter = async status => {
    events.push(status);
    if (fail) throw new Error("status endpoint down");
  };
  return { events, report };
}

const params = (analyze: Analyze, report: ExtractionStatusReporter | undefined): Params =>
  ({ file, documentId: "doc-1", fiscalYearId: "fy-1", fiscalYear: 2025, analyze, reportStatus: report });

describe("F011-R2 — succès, échec, attente", () => {
  it("TEST A — analyse démarrée → processing, puis terminée avec succès → completed (dans cet ordre)", async () => {
    const { events, report } = recorder();
    const order: string[] = [];
    const analyze: Analyze = async () => { order.push(`analyze(after:${events.join(",")})`); return successfulPipeline(); };
    const result = await runF011UploadFlowWithStatusLifecycle(params(analyze, report));
    assert.deepEqual(events, ["processing", "completed"]);
    assert.deepEqual(order, ["analyze(after:processing)"], "processing est écrit avant que l'analyse ne démarre");
    assert.equal(result.outcome.state, "success");
  });

  it("TEST C — pipeline d'extraction en erreur (rien d'exploitable lu) → failed", async () => {
    const { events, report } = recorder();
    const analyze: Analyze = async () => ({ success: false } as unknown as CreditGptPipelineResult);
    const result = await runF011UploadFlowWithStatusLifecycle(params(analyze, report));
    assert.equal(result.outcome.state, "failed");
    assert.deepEqual(events, ["processing", "failed"]);
  });

  it("TEST C bis — le pipeline lève une exception → failed, puis l'exception est propagée telle quelle", async () => {
    const { events, report } = recorder();
    const analyze: Analyze = async () => { throw new Error("OCR indisponible"); };
    await assert.rejects(() => runF011UploadFlowWithStatusLifecycle(params(analyze, report)), /OCR indisponible/);
    assert.deepEqual(events, ["processing", "failed"]);
  });

  it("extraction partielle (certains champs lus) → completed : l'analyse a bien produit un résultat", async () => {
    const { events, report } = recorder();
    const analyze: Analyze = async () => ({
      success: false,
      amortization: { extraction: { loanAmount: 100000 } },
    } as unknown as CreditGptPipelineResult);
    const result = await runF011UploadFlowWithStatusLifecycle(params(analyze, report));
    assert.equal(result.outcome.state, "partial");
    assert.deepEqual(events, ["processing", "completed"]);
  });

  it("TEST D (attente) — tant que l'analyse n'est pas terminée, aucun statut final n'est écrit", async () => {
    const { events, report } = recorder();
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const analyze: Analyze = async () => { await gate; return successfulPipeline(); };
    const running = runF011UploadFlowWithStatusLifecycle(params(analyze, report));
    await new Promise(resolve => setImmediate(resolve));
    assert.deepEqual(events, ["processing"], "seulement processing pendant l'analyse");
    release();
    await running;
    assert.deepEqual(events, ["processing", "completed"]);
  });
});

describe("F011-R2 — extraction réussie ≠ échéancier exploitable", () => {
  /** Tableau lu avec succès mais lacunaire DANS l'exercice : mars 2025 absent. */
  const holedRows = ["2025-01", "2025-02", "2025-04", "2025-05"].map((month, index) => ({
    date: `${month}-05`, principal: 400, interest: 100, insurance: 10, totalPayment: 510, remainingCapital: 99600 - index * 400,
  }));

  it("TEST B — extraction réussie + échéancier non_exploitable → completed (jamais failed)", async () => {
    const { events, report } = recorder();
    const analyze: Analyze = async () => successfulPipeline(holedRows);
    const result = await runF011UploadFlowWithStatusLifecycle(params(analyze, report));
    // Précondition : le contrat documentaire refuse bien ce tableau — c'est un fait métier, pas un échec d'extraction.
    const resolution = resolveDocumentaryEcheances({ rows: holedRows as never, exerciceFiscal: 2025 });
    assert.equal(resolution.status, "non_exploitable");
    assert.equal(result.outcome.state, "success");
    assert.deepEqual(events, ["processing", "completed"]);
    assert.equal(events.includes("failed"), false);
  });

  it("TEST A bis — extraction réussie + échéancier exploitable → completed", async () => {
    const rows = ["2025-01", "2025-02", "2025-03"].map((month, index) => ({
      date: `${month}-05`, principal: 400, interest: 100, insurance: 10, totalPayment: 510, remainingCapital: index === 2 ? 0 : 100 - index,
    }));
    assert.equal(resolveDocumentaryEcheances({ rows: rows as never, exerciceFiscal: 2025 }).status, "exploitable");
    const { events, report } = recorder();
    await runF011UploadFlowWithStatusLifecycle(params(async () => successfulPipeline(rows), report));
    assert.deepEqual(events, ["processing", "completed"]);
  });
});

describe("F011-R2 — best-effort : le statut n'est jamais une autorité", () => {
  it("TEST D — l'écriture du statut échoue après une analyse réussie → résultat F011 intact, aucune exception", async () => {
    const { events, report } = recorder(true);
    const rows = [{ date: "2025-01-05", principal: 400, interest: 100, insurance: 10, totalPayment: 510, remainingCapital: 99600 }];
    const reference = await runF011UploadFlowWithStatusLifecycle(params(async () => successfulPipeline(rows), undefined));
    const result = await runF011UploadFlowWithStatusLifecycle(params(async () => successfulPipeline(rows), report));
    assert.deepEqual(events, ["processing", "completed"], "les deux écritures ont été tentées");
    assert.equal(result.outcome.state, "success", "le succès n'est pas transformé en échec");
    assert.deepEqual(result.prefill.fields, reference.prefill.fields, "les données extraites sont identiques");
    assert.deepEqual(result.prefill.installments, reference.prefill.installments);
  });

  it("l'écriture de statut échoue pendant une analyse en échec → l'échec d'analyse reste l'échec d'analyse", async () => {
    const { report } = recorder(true);
    const result = await runF011UploadFlowWithStatusLifecycle(params(async () => ({ success: false } as unknown as CreditGptPipelineResult), report));
    assert.equal(result.outcome.state, "failed");
  });

  it("aucun rapporteur (dossier inconnu côté client) → le flux F011 se comporte exactement comme avant", async () => {
    const result = await runF011UploadFlowWithStatusLifecycle(params(async () => successfulPipeline(), undefined));
    assert.equal(result.outcome.state, "success");
  });
});

describe("F011-R2 — câblage : une seule frontière, sans écriture client directe", () => {
  const root = path.resolve(__dirname, "../../../../..");
  const panel = readFileSync(path.join(root, "src/components/lmnp/assistants/F011FinancementAssistantPanel.tsx"), "utf8");

  it("le panneau F011 analyse via le cycle de vie du statut, pas via runF011UploadFlow nu", () => {
    assert.match(panel, /runF011UploadFlowWithStatusLifecycle\(/);
    assert.doesNotMatch(panel, /await runF011UploadFlow\(/);
  });

  it("aucune écriture directe de documents.extraction_status depuis le navigateur (aucune policy UPDATE client : P0-S0)", () => {
    const client = readFileSync(path.join(root, "src/lib/lmnp/dossier/document-extraction-status-client.ts"), "utf8");
    assert.doesNotMatch(client, /\.from\(\s*["']documents["']\s*\)/);
    assert.doesNotMatch(client, /SERVICE_ROLE|getServerSupabaseUnscoped/);
    assert.doesNotMatch(panel, /\.from\(\s*["']documents["']\s*\)\s*\.update/);
  });

  it("la migration RLS n'est pas rouverte : aucune policy UPDATE sur documents", () => {
    const rls = readFileSync(path.join(root, "supabase/migrations/20260920100000_documents_owner_rls.sql"), "utf8");
    assert.doesNotMatch(rls, /create policy[^;]*for update/i);
  });
});
