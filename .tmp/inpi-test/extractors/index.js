"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.defaultExtractorRegistry = exports.OFFRE_PRET_EXTRACTOR_ID = exports.extractOffrePret = exports.P0I_EXTRACTOR_ID = exports.extractP0i = exports.INPI_EXTRACTOR_ID = exports.extractInpi = exports.createExtractorRegistry = exports.EXTRACTION_SCHEMA_VERSION = void 0;
const extract_inpi_1 = require("./extract-inpi");
const extract_offre_pret_1 = require("./extract-offre-pret");
const extract_p0i_1 = require("./extract-p0i");
const extractor_types_1 = require("./extractor.types");
var extractor_types_2 = require("./extractor.types");
Object.defineProperty(exports, "EXTRACTION_SCHEMA_VERSION", { enumerable: true, get: function () { return extractor_types_2.EXTRACTION_SCHEMA_VERSION; } });
Object.defineProperty(exports, "createExtractorRegistry", { enumerable: true, get: function () { return extractor_types_2.createExtractorRegistry; } });
var extract_inpi_2 = require("./extract-inpi");
Object.defineProperty(exports, "extractInpi", { enumerable: true, get: function () { return extract_inpi_2.extractInpi; } });
Object.defineProperty(exports, "INPI_EXTRACTOR_ID", { enumerable: true, get: function () { return extract_inpi_2.INPI_EXTRACTOR_ID; } });
var extract_p0i_2 = require("./extract-p0i");
Object.defineProperty(exports, "extractP0i", { enumerable: true, get: function () { return extract_p0i_2.extractP0i; } });
Object.defineProperty(exports, "P0I_EXTRACTOR_ID", { enumerable: true, get: function () { return extract_p0i_2.P0I_EXTRACTOR_ID; } });
var extract_offre_pret_2 = require("./extract-offre-pret");
Object.defineProperty(exports, "extractOffrePret", { enumerable: true, get: function () { return extract_offre_pret_2.extractOffrePret; } });
Object.defineProperty(exports, "OFFRE_PRET_EXTRACTOR_ID", { enumerable: true, get: function () { return extract_offre_pret_2.OFFRE_PRET_EXTRACTOR_ID; } });
exports.defaultExtractorRegistry = (0, extractor_types_1.createExtractorRegistry)([
    extract_inpi_1.extractInpi,
    extract_p0i_1.extractP0i,
    extract_offre_pret_1.extractOffrePret,
]);
