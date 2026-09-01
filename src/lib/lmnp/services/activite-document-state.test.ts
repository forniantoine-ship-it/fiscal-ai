/**
 * Run: npx tsx src/lib/lmnp/services/activite-document-state.test.ts
 */
import {
  ACTIVITE_PROCESSING_TIMEOUT_MS,
  ACTIVITE_UPLOAD_TRIGGER_GRACE_MS,
  resolveActiviteDocumentState,
} from "./activite-document-state";
import type { DeclarationDraft, LmnpDocument } from "@/lib/lmnp/types";

function assertEqual<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

const NOW = Date.parse("2026-08-26T12:00:00.000Z");

function baseDraft(overrides: Partial<DeclarationDraft> = {}): DeclarationDraft {
  return {
    completedSteps: [],
    inpiDocumentId: "doc-1",
    ...overrides,
  } as DeclarationDraft;
}

function baseDoc(overrides: Partial<LmnpDocument> = {}): LmnpDocument {
  return {
    id: "doc-1",
    fiscalYearId: "fy-1",
    fileName: "extrait-inpi.pdf",
    mimeType: "application/pdf",
    sizeBytes: 1024,
    category: "autre",
    documentType: "unknown",
    status: "uploaded",
    uploadedAt: new Date(NOW).toISOString(),
    ...overrides,
  };
}

function isoMinusMs(ms: number): string {
  return new Date(NOW - ms).toISOString();
}

function runTests(): void {
  let passed = 0;
  let total = 0;

  function test(name: string, fn: () => void): void {
    total++;
    try {
      fn();
      passed++;
      console.log(`  ✓ ${name}`);
    } catch (err) {
      console.error(`  ✗ ${name}`);
      console.error(`    ${err instanceof Error ? err.message : err}`);
    }
  }

  console.log("activite-document-state.ts");

  test("empty : aucun inpiDocumentId", () => {
    const draft = baseDraft({ inpiDocumentId: undefined });
    assertEqual(resolveActiviteDocumentState(draft, undefined, NOW), "empty", "state");
  });

  test("uploaded récent → processing", () => {
    const draft = baseDraft();
    const doc = baseDoc({ status: "uploaded", uploadedAt: isoMinusMs(ACTIVITE_UPLOAD_TRIGGER_GRACE_MS - 1) });
    assertEqual(resolveActiviteDocumentState(draft, doc, NOW), "processing", "state");
  });

  test("uploaded expiré → interrupted", () => {
    const draft = baseDraft();
    const doc = baseDoc({ status: "uploaded", uploadedAt: isoMinusMs(ACTIVITE_UPLOAD_TRIGGER_GRACE_MS + 1) });
    assertEqual(resolveActiviteDocumentState(draft, doc, NOW), "interrupted", "state");
  });

  test("processing récent (avec inpiExtractionStartedAt) → processing", () => {
    const draft = baseDraft({ inpiExtractionStartedAt: isoMinusMs(ACTIVITE_PROCESSING_TIMEOUT_MS - 1) });
    const doc = baseDoc({ status: "processing" });
    assertEqual(resolveActiviteDocumentState(draft, doc, NOW), "processing", "state");
  });

  test("processing expiré (au-delà du timeout) → interrupted", () => {
    const draft = baseDraft({ inpiExtractionStartedAt: isoMinusMs(ACTIVITE_PROCESSING_TIMEOUT_MS + 1) });
    const doc = baseDoc({ status: "processing" });
    assertEqual(resolveActiviteDocumentState(draft, doc, NOW), "interrupted", "state");
  });

  test("processing sans inpiExtractionStartedAt → interrupted", () => {
    const draft = baseDraft({ inpiExtractionStartedAt: undefined });
    const doc = baseDoc({ status: "processing" });
    assertEqual(resolveActiviteDocumentState(draft, doc, NOW), "interrupted", "state");
  });

  test("failed → interrupted", () => {
    const draft = baseDraft();
    const doc = baseDoc({ status: "failed" });
    assertEqual(resolveActiviteDocumentState(draft, doc, NOW), "interrupted", "state");
  });

  test("analyzed + inpiGptPrefillAppliedAt → done", () => {
    const draft = baseDraft({ inpiGptPrefillAppliedAt: isoMinusMs(1_000) });
    const doc = baseDoc({ status: "analyzed" });
    assertEqual(resolveActiviteDocumentState(draft, doc, NOW), "done", "state");
  });

  test("analyzed sans inpiGptPrefillAppliedAt → interrupted (état ambigu, pas de règle 'done' dédiée)", () => {
    const draft = baseDraft({ inpiGptPrefillAppliedAt: undefined });
    const doc = baseDoc({ status: "analyzed" });
    assertEqual(resolveActiviteDocumentState(draft, doc, NOW), "interrupted", "state");
  });

  test("confirmed (inpiConfirmedAt) → done, quel que soit le statut document", () => {
    const draft = baseDraft({ inpiConfirmedAt: isoMinusMs(1_000) });
    const doc = baseDoc({ status: "processing" });
    assertEqual(resolveActiviteDocumentState(draft, doc, NOW), "done", "state");
  });

  console.log(`\n${passed}/${total} tests passés`);
  if (passed !== total) process.exit(1);
}

runTests();
