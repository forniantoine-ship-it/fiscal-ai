import type { InpiExtractedData, InpiExtractableField } from "./extract-inpi";
import { INPI_EXTRACTABLE_FIELDS, parseInpiFromText } from "./extract-inpi";

export type InpiFixtureExpectation = Partial<InpiExtractedData> & {
  /** Fields that must be absent */
  mustNotInclude?: InpiExtractableField[];
  /** Minimum number of fields extracted */
  minFieldCount?: number;
};

export type InpiExtractionFixture = {
  id: string;
  label: string;
  rawText: string;
  expected: InpiFixtureExpectation;
};

export const PERFECT_INPI_FIXTURE: InpiExtractionFixture = {
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

export const NOISY_OCR_INPI_FIXTURE: InpiExtractionFixture = {
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

export const PARTIAL_INPI_FIXTURE: InpiExtractionFixture = {
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

export const MALFORMED_INPI_FIXTURE: InpiExtractionFixture = {
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

export const OCR_TOLERANT_LABELS_FIXTURE: InpiExtractionFixture = {
  id: "ocr-tolerant-labels",
  label: "OCR-tolerant labels — spaced accents, multiline values",
  rawText: `EXTRAIT INPI

Pré nom
MARIE

Nom de naissance
DUPONT

829456123

82945612300012

Activité principale
Location meublée non professionnelle (LMNP)`,
  expected: {
    nom: "DUPONT",
    prenom: "MARIE",
    siren: "829456123",
    siret: "82945612300012",
    activite: "Location meublée non professionnelle (LMNP)",
    minFieldCount: 5,
    mustNotInclude: ["email", "telephone", "codeAPE"],
  },
};

export const ISOLATED_IDENTIFIERS_FIXTURE: InpiExtractionFixture = {
  id: "isolated-identifiers",
  label: "Semantic fallback — isolated SIREN/SIRET lines without labels",
  rawText: `Greffe du Tribunal de Commerce

Nom : LEBLANC
Prénom : Sophie

512345678

51234567800025

Activité principale : Conseil en gestion`,
  expected: {
    nom: "LEBLANC",
    prenom: "Sophie",
    siren: "512345678",
    siret: "51234567800025",
    activite: "Conseil en gestion",
    minFieldCount: 5,
  },
};

export const INPI_EXTRACTION_FIXTURES: InpiExtractionFixture[] = [
  PERFECT_INPI_FIXTURE,
  NOISY_OCR_INPI_FIXTURE,
  PARTIAL_INPI_FIXTURE,
  MALFORMED_INPI_FIXTURE,
  OCR_TOLERANT_LABELS_FIXTURE,
  ISOLATED_IDENTIFIERS_FIXTURE,
];

function assertField(
  fixtureId: string,
  field: InpiExtractableField,
  actual: string | undefined,
  expected: string | undefined,
): void {
  if (expected === undefined) return;
  const norm = (v: string) => v.toLowerCase().replace(/\s+/g, " ").trim();
  if (norm(actual ?? "") !== norm(expected)) {
    throw new Error(
      `[${fixtureId}] field "${field}": expected "${expected}", got "${actual ?? ""}"`,
    );
  }
}

/**
 * Runs deterministic fixture assertions — throws on first failure.
 */
export function runExtractInpiFixtureTests(): { passed: number; total: number } {
  let passed = 0;

  for (const fixture of INPI_EXTRACTION_FIXTURES) {
    const { data, fields } = parseInpiFromText(fixture.rawText, { debug: false });
    const { expected } = fixture;

    for (const field of INPI_EXTRACTABLE_FIELDS) {
      assertField(fixture.id, field, data[field], expected[field]);
    }

    for (const field of expected.mustNotInclude ?? []) {
      if (data[field]) {
        throw new Error(`[${fixture.id}] field "${field}" should be absent, got "${data[field]}"`);
      }
    }

    if (expected.minFieldCount !== undefined && fields.length < expected.minFieldCount) {
      throw new Error(
        `[${fixture.id}] expected at least ${expected.minFieldCount} fields, got ${fields.length}`,
      );
    }

    for (const field of fields) {
      if (!field.evidence?.trim()) {
        throw new Error(`[${fixture.id}] field "${field.key}" missing source snippet (evidence)`);
      }
      if (field.confidence.value <= 0 || field.confidence.value > 1) {
        throw new Error(`[${fixture.id}] field "${field.key}" has invalid confidence`);
      }
    }

    passed++;
  }

  return { passed, total: INPI_EXTRACTION_FIXTURES.length };
}
