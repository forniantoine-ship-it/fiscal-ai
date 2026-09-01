import { extractInpi } from "./extract-inpi";
import { extractOffrePret } from "./extract-offre-pret";
import { extractP0i } from "./extract-p0i";
import { createExtractorRegistry } from "./extractor.types";

export {
  EXTRACTION_SCHEMA_VERSION,
  createExtractorRegistry,
  type DocumentExtractor,
  type ExtractorContext,
  type ExtractorRegistry,
} from "./extractor.types";

export { extractInpi, INPI_EXTRACTOR_ID, type InpiExtractedData } from "./extract-inpi";
export { extractP0i, P0I_EXTRACTOR_ID, type P0iExtractedData } from "./extract-p0i";
export {
  extractOffrePret,
  OFFRE_PRET_EXTRACTOR_ID,
  type OffrePretExtractedData,
} from "./extract-offre-pret";

export const defaultExtractorRegistry = createExtractorRegistry([
  extractInpi,
  extractP0i,
  extractOffrePret,
]);
