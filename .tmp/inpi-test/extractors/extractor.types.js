"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EXTRACTION_SCHEMA_VERSION = void 0;
exports.createExtractorRegistry = createExtractorRegistry;
exports.EXTRACTION_SCHEMA_VERSION = "documents.extraction.v1";
function createExtractorRegistry(initial = []) {
    const map = new Map();
    for (const e of initial)
        map.set(e.documentType, e);
    return {
        get: (documentType) => map.get(documentType),
        register(extractor) {
            map.set(extractor.documentType, extractor);
        },
        list: () => [...map.values()],
    };
}
