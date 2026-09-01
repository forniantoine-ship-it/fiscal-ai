/**
 * Run: npx tsx src/lib/lmnp/services/activite-document-step-view.test.ts
 */
import {
  ACTIVITE_PROCESSING_TIMEOUT_MS,
  ACTIVITE_UPLOAD_TRIGGER_GRACE_MS,
  resolveActiviteDocumentState,
} from "./activite-document-state";
import { deriveActiviteDocumentStepView } from "./activite-document-step-view";
import type { DeclarationDraft, LmnpDocument } from "@/lib/lmnp/types";

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

const NOW = Date.parse("2026-08-26T12:00:00.000Z");

function isoMinusMs(ms: number): string {
  return new Date(NOW - ms).toISOString();
}

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

function viewFor(
  draft: DeclarationDraft | undefined,
  doc: LmnpDocument | undefined,
  overrides: Partial<Parameters<typeof deriveActiviteDocumentStepView>[0]> = {},
) {
  const documentState = resolveActiviteDocumentState(draft, doc, NOW);
  return deriveActiviteDocumentStepView({
    documentState,
    manualMode: false,
    confirmed: false,
    validatedSuccess: false,
    isEditing: false,
    hasUploaded: Boolean(draft?.inpiDocumentId),
    hasPersistedData: false,
    hasInpiDocumentId: Boolean(draft?.inpiDocumentId),
    hasInpiDoc: Boolean(doc),
    aiAnimationDone: false,
    pipelineRunning: false,
    showOcrFailureMessage: false,
    inpiDocFailed: doc?.status === "failed",
    ...overrides,
  });
}

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

console.log("activite-document-step-view.ts");

test("empty : upload / guide manuel", () => {
  const draft = baseDraft({ inpiDocumentId: undefined });
  const view = viewFor(draft, undefined);
  assert(view.showInitialExtras, "extras visibles");
  assert(!view.showAiProcessing, "pas de processing");
  assert(!view.showInterrupted, "pas d'interrupted");
  assert(!view.showExtractionForm, "pas de formulaire");
  assert(!view.showConfiguredCard, "pas de carte configurée");
});

test("processing : ActiviteAiProcessing", () => {
  const draft = baseDraft();
  const doc = baseDoc({
    status: "uploaded",
    uploadedAt: isoMinusMs(ACTIVITE_UPLOAD_TRIGGER_GRACE_MS - 1),
  });
  const view = viewFor(draft, doc, { hasUploaded: true, aiAnimationDone: false });
  assert(view.showAiProcessing, "processing visible");
  assert(!view.showInterrupted, "pas d'interrupted");
  assert(!view.showExtractionForm, "pas de formulaire");
});

test("done : formulaire après animation", () => {
  const draft = baseDraft({ inpiGptPrefillAppliedAt: isoMinusMs(1_000) });
  const doc = baseDoc({ status: "analyzed" });
  const view = viewFor(draft, doc, { hasUploaded: true, aiAnimationDone: true });
  assert(view.showExtractionForm, "formulaire visible");
  assert(!view.showAiProcessing, "pas de processing");
  assert(!view.showConfiguredCard, "pas encore confirmé");
});

test("interrupted : écran dédié (upload expiré)", () => {
  const draft = baseDraft();
  const doc = baseDoc({
    status: "uploaded",
    uploadedAt: isoMinusMs(ACTIVITE_UPLOAD_TRIGGER_GRACE_MS + 1),
  });
  const view = viewFor(draft, doc, { hasUploaded: true });
  assert(view.showInterrupted, "interrupted visible");
  assert(!view.showAiProcessing, "pas de processing");
  assert(!view.showExtractionForm, "pas de formulaire");
});

test("manuel : formulaire sans document", () => {
  const draft = baseDraft({ inpiDocumentId: undefined });
  const view = viewFor(draft, undefined, {
    manualMode: true,
    hasUploaded: false,
    hasInpiDocumentId: false,
    aiAnimationDone: true,
  });
  assert(view.showExtractionForm, "formulaire manuel visible");
  assert(!view.showInitialExtras, "pas d'extras upload");
  assert(!view.showInterrupted, "pas d'interrupted");
});

test("confirmé : ConfiguredDossierCard", () => {
  const draft = baseDraft({ inpiConfirmedAt: isoMinusMs(1_000), inpiGptPrefillAppliedAt: isoMinusMs(2_000) });
  const doc = baseDoc({ status: "analyzed" });
  const view = viewFor(draft, doc, {
    hasUploaded: true,
    confirmed: true,
    validatedSuccess: true,
    aiAnimationDone: true,
  });
  assert(view.showConfiguredCard, "carte configurée visible");
  assert(!view.showExtractionForm, "pas de formulaire");
});

test("document processing > timeout : interrupted", () => {
  const draft = baseDraft({ inpiExtractionStartedAt: isoMinusMs(ACTIVITE_PROCESSING_TIMEOUT_MS + 1) });
  const doc = baseDoc({ status: "processing" });
  const view = viewFor(draft, doc, { hasUploaded: true });
  assert(view.showInterrupted, "timeout → interrupted");
  assert(!view.showAiProcessing, "pas de processing");
});

test("failed : interrupted", () => {
  const draft = baseDraft();
  const doc = baseDoc({ status: "failed" });
  const view = viewFor(draft, doc, { hasUploaded: true, inpiDocFailed: true });
  assert(view.showInterrupted, "failed → interrupted");
  assert(!view.showExtractionForm, "pas de formulaire");
  assert(view.isFailed, "isFailed legacy conservé");
});

test("données persistées + doc expiré : formulaire, pas interrupted", () => {
  const draft = baseDraft({ siren: "123456789" });
  const doc = baseDoc({
    status: "uploaded",
    uploadedAt: isoMinusMs(ACTIVITE_UPLOAD_TRIGGER_GRACE_MS + 1),
  });
  const view = viewFor(draft, doc, {
    hasUploaded: true,
    hasPersistedData: true,
    aiAnimationDone: true,
  });
  assert(view.showExtractionForm, "formulaire restauré");
  assert(!view.showInterrupted, "pas d'écran interrupted");
  assert(!view.showAiProcessing, "pas de processing bloqué");
});

test("upload optimiste terminé sans inpiDocumentId : pas de processing infini", () => {
  const draft = baseDraft({ inpiDocumentId: undefined });
  const view = viewFor(draft, undefined, {
    hasUploaded: true,
    hasPersistedData: true,
    hasInpiDocumentId: false,
    aiAnimationDone: true,
  });
  assert(!view.showAiProcessing, "animation terminée → pas de processing");
  assert(view.showExtractionForm, "formulaire visible");
});

console.log(`\n${passed}/${total} tests passés`);
if (passed !== total) process.exit(1);
