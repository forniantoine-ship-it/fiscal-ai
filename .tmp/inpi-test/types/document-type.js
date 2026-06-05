"use strict";
/**
 * Canonical document families for the intelligence pipeline.
 * Distinct from workspace `LmnpDocument.documentType` and AI classifier enums —
 * this is the tunnel-oriented taxonomy used by patterns, extractors, and learning.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.PIPELINE_DOCUMENT_TYPES = void 0;
exports.isPipelineDocumentType = isPipelineDocumentType;
exports.PIPELINE_DOCUMENT_TYPES = [
    "inpi",
    "p0i",
    "offre_pret",
    "facture_travaux",
    "facture_mobilier",
    "unknown",
];
function isPipelineDocumentType(value) {
    return (typeof value === "string" &&
        exports.PIPELINE_DOCUMENT_TYPES.includes(value));
}
