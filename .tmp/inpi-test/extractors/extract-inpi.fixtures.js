"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.INPI_EXTRACTION_FIXTURES = exports.MALFORMED_INPI_FIXTURE = exports.PARTIAL_INPI_FIXTURE = exports.NOISY_OCR_INPI_FIXTURE = exports.PERFECT_INPI_FIXTURE = void 0;
exports.runExtractInpiFixtureTests = runExtractInpiFixtureTests;
const extract_inpi_1 = require("./extract-inpi");
exports.PERFECT_INPI_FIXTURE = {
    id: "perfect-inpi",
    label: "Perfect INPI — all labelled fields present",
    rawText: `INSTITUT NATIONAL DE LA PROPRIÉTÉ INDUSTRIELLE
Extrait INPI / RCS

Nom de naissance : DUPONT
Prénom : Marie
SIREN : 829 456 123
SIRET : 829 456 123 00012
Code APE : 6820A
Activité principale : Location de logements meublés (LMNP)
Adresse de l'établissement : 12 rue de la Paix, 69002 Lyon
Email : marie.dupont@example.com
Téléphone : 06 12 34 56 78`,
    expected: {
        nom: "DUPONT",
        prenom: "Marie",
        siren: "829456123",
        siret: "82945612300012",
        codeAPE: "6820A",
        activite: "Location de logements meublés (LMNP)",
        adresseEtablissement: "12 rue de la Paix, 69002 Lyon",
        email: "marie.dupont@example.com",
        telephone: "0612345678",
        minFieldCount: 9,
    },
};
exports.NOISY_OCR_INPI_FIXTURE = {
    id: "noisy-ocr-inpi",
    label: "Noisy OCR — spacing, casing, accents degraded",
    rawText: `institut  national   de  la  propriete  industrielle
EXTRAIT   INPI

NOM   DE   NAISSANCE
dupont

PRENOM :  marie

siren: 829 456 123
SIRET 829 456 123 00012

code  ape : 6820a

ACTIVITE PRINCIPALE
Location meublee non professionnelle

Adresse de l etablissement
12   rue   de  la  Paix 69002  Lyon

email: MARIE.DUPONT@EXAMPLE.COM
Tel : 06.12.34.56.78`,
    expected: {
        nom: "dupont",
        prenom: "marie",
        siren: "829456123",
        siret: "82945612300012",
        codeAPE: "6820A",
        activite: "Location meublee non professionnelle",
        adresseEtablissement: "12 rue de la Paix 69002 Lyon",
        email: "marie.dupont@example.com",
        telephone: "0612345678",
        minFieldCount: 7,
    },
};
exports.PARTIAL_INPI_FIXTURE = {
    id: "partial-inpi",
    label: "Partial INPI — identity fields only",
    rawText: `Greffe du Tribunal de Commerce
Extrait Kbis

Nom : MARTIN
Prénom : Jean
SIREN 512 345 678
SIRET : 512 345 678 00025`,
    expected: {
        nom: "MARTIN",
        prenom: "Jean",
        siren: "512345678",
        siret: "51234567800025",
        minFieldCount: 4,
        mustNotInclude: ["email", "telephone", "codeAPE"],
    },
};
exports.MALFORMED_INPI_FIXTURE = {
    id: "malformed-inpi",
    label: "Malformed INPI — invalid identifiers, no identity",
    rawText: `Document scanné illisible
SIREN : 12345
SIRET : ABC-DEF
Nom d'usage : ???
Régime fiscal : micro-BIC
Date début activité : 01/01/2020
Adresse du logement : 5 avenue Foch`,
    expected: {
        minFieldCount: 0,
        mustNotInclude: [
            "nom",
            "prenom",
            "siren",
            "siret",
            "codeAPE",
            "activite",
            "adresseEtablissement",
            "email",
            "telephone",
        ],
    },
};
exports.INPI_EXTRACTION_FIXTURES = [
    exports.PERFECT_INPI_FIXTURE,
    exports.NOISY_OCR_INPI_FIXTURE,
    exports.PARTIAL_INPI_FIXTURE,
    exports.MALFORMED_INPI_FIXTURE,
];
function assertField(fixtureId, field, actual, expected) {
    if (expected === undefined)
        return;
    const norm = (v) => v.toLowerCase().replace(/\s+/g, " ").trim();
    if (norm(actual !== null && actual !== void 0 ? actual : "") !== norm(expected)) {
        throw new Error(`[${fixtureId}] field "${field}": expected "${expected}", got "${actual !== null && actual !== void 0 ? actual : ""}"`);
    }
}
/**
 * Runs deterministic fixture assertions — throws on first failure.
 */
function runExtractInpiFixtureTests() {
    var _a, _b;
    let passed = 0;
    for (const fixture of exports.INPI_EXTRACTION_FIXTURES) {
        const { data, fields } = (0, extract_inpi_1.parseInpiFromText)(fixture.rawText, { debug: false });
        const { expected } = fixture;
        for (const field of extract_inpi_1.INPI_EXTRACTABLE_FIELDS) {
            assertField(fixture.id, field, data[field], expected[field]);
        }
        for (const field of (_a = expected.mustNotInclude) !== null && _a !== void 0 ? _a : []) {
            if (data[field]) {
                throw new Error(`[${fixture.id}] field "${field}" should be absent, got "${data[field]}"`);
            }
        }
        if (expected.minFieldCount !== undefined && fields.length < expected.minFieldCount) {
            throw new Error(`[${fixture.id}] expected at least ${expected.minFieldCount} fields, got ${fields.length}`);
        }
        for (const field of fields) {
            if (!((_b = field.evidence) === null || _b === void 0 ? void 0 : _b.trim())) {
                throw new Error(`[${fixture.id}] field "${field.key}" missing source snippet (evidence)`);
            }
            if (field.confidence.value <= 0 || field.confidence.value > 1) {
                throw new Error(`[${fixture.id}] field "${field.key}" has invalid confidence`);
            }
        }
        passed++;
    }
    return { passed, total: exports.INPI_EXTRACTION_FIXTURES.length };
}
