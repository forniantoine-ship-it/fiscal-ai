"use strict";
/**
 * Upload context / journey tunnel where a document is expected.
 * Drives pattern priors, validation rules, and human-review routing.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.TUNNEL_DOCUMENT_TYPE_PRIOR = exports.DOCUMENT_TUNNELS = void 0;
exports.isDocumentTunnel = isDocumentTunnel;
exports.DOCUMENT_TUNNELS = [
    "inpi",
    "logement",
    "credit_immobilier",
    "bail",
    "taxe_fonciere",
    "assurance",
    "factures_travaux",
    "factures_mobilier",
    "charges",
    "revenus",
    "generic",
];
function isDocumentTunnel(value) {
    return typeof value === "string" && exports.DOCUMENT_TUNNELS.includes(value);
}
/** Default document type prior when classification is inconclusive. */
exports.TUNNEL_DOCUMENT_TYPE_PRIOR = {
    inpi: "inpi",
    logement: "p0i",
    credit_immobilier: "offre_pret",
    factures_travaux: "facture_travaux",
    factures_mobilier: "facture_mobilier",
};
