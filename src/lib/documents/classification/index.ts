export {
  CLASSIFICATION_SCHEMA_VERSION,
  createClassificationRegistry,
  defaultClassificationRegistry,
  type ClassificationProvider,
  type ClassificationProviderId,
  type ClassificationRegistry,
} from "./classification-registry";

export { classifyDocument, type ClassifyDocumentInput, type ClassifyDocumentOptions } from "./classify-document";

export {
  scoreDocumentAgainstPattern,
  scoreDocumentAgainstPatterns,
  type PatternScoreResult,
  type ScoreDocumentInput,
} from "./score-document";
