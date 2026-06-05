"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.extractOffrePret = exports.OFFRE_PRET_EXTRACTOR_ID = void 0;
const confidence_score_1 = require("../types/confidence-score");
const extractor_types_1 = require("./extractor.types");
exports.OFFRE_PRET_EXTRACTOR_ID = "extractor.offre_pret";
exports.extractOffrePret = {
    id: exports.OFFRE_PRET_EXTRACTOR_ID,
    documentType: "offre_pret",
    version: "0.1.0",
    supportedSchemaVersion: extractor_types_1.EXTRACTION_SCHEMA_VERSION,
    async extract(context) {
        return {
            documentType: "offre_pret",
            extractorId: exports.OFFRE_PRET_EXTRACTOR_ID,
            fields: [],
            data: {},
            confidence: (0, confidence_score_1.createConfidenceScore)(0, ["stub:pending_implementation"]),
            needsReview: true,
            explainability: [`file:${context.fileName}`, "stage:extractor_stub"],
            schemaVersion: extractor_types_1.EXTRACTION_SCHEMA_VERSION,
        };
    },
};
