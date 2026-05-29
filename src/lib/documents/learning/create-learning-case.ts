import type { LearningCase } from "../types/learning-case";
import type { CreateLearningCaseInput, LearningCaseStore } from "./learning-case.types";

function hashOcrText(text: string): string {
  let h = 0;
  for (let i = 0; i < text.length; i++) {
    h = (Math.imul(31, h) + text.charCodeAt(i)) | 0;
  }
  return `ocr_${(h >>> 0).toString(16)}`;
}

function generateId(): string {
  return `lc_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * Creates a learning case when classification/extraction needs human review
 * or after corrections — feeds future pattern / model improvements.
 */
export function createLearningCase(input: CreateLearningCaseInput): LearningCase {
  const shouldCapture =
    input.classification.needsReview ||
    (input.extraction?.needsReview ?? false) ||
    (input.corrections?.length ?? 0) > 0;

  return {
    id: generateId(),
    documentId: input.documentId,
    tunnel: input.tunnel,
    documentType: input.classification.documentType,
    classification: input.classification,
    extraction: input.extraction,
    corrections: input.corrections ?? [],
    ocrTextHash: hashOcrText(input.ocrText),
    status: shouldCapture ? "open" : "archived",
    createdAt: new Date().toISOString(),
    notes: input.notes,
  };
}

export async function persistLearningCase(
  input: CreateLearningCaseInput,
  store: LearningCaseStore,
): Promise<LearningCase> {
  const learningCase = createLearningCase(input);
  return store.save(learningCase);
}

export function createInMemoryLearningCaseStore(): import("./learning-case.types").InMemoryLearningCaseStore {
  const cases = new Map<string, LearningCase>();

  return {
    async save(learningCase) {
      cases.set(learningCase.id, learningCase);
      return learningCase;
    },
    async getById(id) {
      return cases.get(id) ?? null;
    },
    list() {
      return [...cases.values()];
    },
  };
}
