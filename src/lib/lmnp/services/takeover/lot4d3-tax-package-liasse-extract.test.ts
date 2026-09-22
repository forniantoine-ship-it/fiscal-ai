/**
 * Lot 4D.3 — extracteur minimal liasse N-1 → TaxPackageLiasseCaseObservation[].
 * Run: npx tsx --test src/lib/lmnp/services/takeover/lot4d3-tax-package-liasse-extract.test.ts
 *
 * Fixtures texte déterministes + mocks Vision. Aucun appel réseau.
 * Validation ultérieure sur vraies liasses tierces recommandée avant exposition client.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  isCandidateAbsent,
  isCandidatePresent,
} from "./candidate-value";
import { extractTaxPackageControlFactsFromLiasse } from "./extract-tax-package-control-facts-from-liasse";
import {
  extractTaxPackageLiasseObservations,
  extractTaxPackageLiassePrintedFormYear,
  identifyTaxPackageLiasseForm,
  isTaxPackageLiasseFormYearCompatible,
  readNativeTaxPackageCase,
  type TaxPackageLiassePageText,
  type TaxPackageLiasseVisionFormPayload,
  type TaxPackageLiasseVisionRequester,
} from "./extract-tax-package-liasse-observations";
import { isTaxPackageControlFact } from "./tax-package-control-facts";

const DOC = "doc-liasse-n1-4d3";
const FORM_YEAR = 2026;
const FY = 2025;

function page(pageNumber: number, text: string): TaxPackageLiassePageText {
  return { pageNumber, text };
}

function page2033A(
  body: string,
  pageNumber = 1,
  printedYear = FORM_YEAR,
): TaxPackageLiassePageText {
  return page(pageNumber, `Cerfa N° 2033-A-SD ${printedYear}\n${body}`);
}

function page2033C(
  body: string,
  pageNumber = 2,
  printedYear = FORM_YEAR,
): TaxPackageLiassePageText {
  return page(pageNumber, `Cerfa N° 2033-C-SD ${printedYear}\n${body}`);
}

async function extract(
  pages: TaxPackageLiassePageText[],
  options?: {
    visionRequester?: TaxPackageLiasseVisionRequester;
    formYear?: number;
    fiscalYear?: number;
    documentId?: string;
  },
) {
  return extractTaxPackageLiasseObservations({
    documentId: options?.documentId ?? DOC,
    formYear: options?.formYear ?? FORM_YEAR,
    fiscalYear: options?.fiscalYear ?? FY,
    pages,
    visionRequester: options?.visionRequester,
  });
}

function obsFor(
  observations: Awaited<ReturnType<typeof extract>>["observations"],
  sourceCase: string,
) {
  return observations.filter((o) => o.sourceCase === sourceCase);
}

describe("Lot 4D.3 — identification formulaires (A/B)", () => {
  it("A — identifie 2033-A via marqueurs Cerfa forts (…-SD)", () => {
    assert.equal(identifyTaxPackageLiasseForm("Formulaire 2033-A-SD exercice"), "2033A");
    assert.equal(identifyTaxPackageLiasseForm("N° 2033-A-SD bilans"), "2033A");
    assert.equal(identifyTaxPackageLiasseForm("N° 2033-A bilans"), null);
    assert.equal(identifyTaxPackageLiasseForm("simple page sans marqueur"), null);
  });

  it("B — identifie 2033-C via marqueurs Cerfa forts (…-SD)", () => {
    assert.equal(identifyTaxPackageLiasseForm("Annexe 2033-C-SD immobilisations"), "2033C");
    assert.equal(identifyTaxPackageLiasseForm("N° 2033-C-SD tableau"), "2033C");
    assert.equal(identifyTaxPackageLiasseForm("N° 2033-C tableau"), null);
  });

  it("refuse une page ambiguë A+C", () => {
    assert.equal(
      identifyTaxPackageLiasseForm("2033-A-SD et aussi 2033-C-SD"),
      null,
    );
  });
});

describe("Lot 4D.3 — extraction native cases (C–H)", () => {
  it("C–H — extrait 028/030/426/476/496/576", async () => {
    const result = await extract([
      page2033A("028: 150000\n030: 42000"),
      page2033C("426: 60000\n476: 12000\n496: 150000\n576: 42000"),
    ]);
    assert.deepEqual(result.identifiedForms.sort(), ["2033A", "2033C"]);
    assert.equal(result.visionCalled, false);

    const byCase = Object.fromEntries(
      result.observations
        .filter((o) => isCandidatePresent(o.value))
        .map((o) => [o.sourceCase, o.value.value]),
    );
    assert.deepEqual(byCase, {
      "028": 150_000,
      "030": 42_000,
      "426": 60_000,
      "476": 12_000,
      "496": 150_000,
      "576": 42_000,
    });
  });
});

describe("Lot 4D.3 — zero / missing / absent / ambigu (I–L)", () => {
  it("I — valeur 0 → present(0)", async () => {
    const result = await extract([page2033A("028: 0\n030: 0")]);
    const o28 = obsFor(result.observations, "028")[0]!;
    assert.ok(isCandidatePresent(o28.value));
    assert.equal(o28.value.value, 0);
  });

  it("J — case vide → missing (jamais 0)", async () => {
    const result = await extract([page2033A("028:\n030: 1000")]);
    const o28 = obsFor(result.observations, "028")[0]!;
    assert.ok(isCandidateAbsent(o28.value));
    assert.equal(o28.value.status, "missing");
  });

  it("K — formulaire/page absent → document_absent", async () => {
    const result = await extract([
      page2033A("028: 150000\n030: 42000"),
      // pas de 2033-C
    ]);
    for (const sourceCase of ["426", "476", "496", "576"]) {
      const o = obsFor(result.observations, sourceCase)[0]!;
      assert.equal(o.value.status, "document_absent");
    }
    assert.equal(result.visionCalled, false);
  });

  it("L — montant voisin ambigu → extraction_impossible (pas d'attribution)", () => {
    const read = readNativeTaxPackageCase(
      "028 150000 148000 total",
      "028",
      1,
    );
    assert.equal(read.status, "extraction_impossible");
  });

  it("L — montant ailleurs sans proximité → missing, pas d'attribution", () => {
    const text = [
      "Cerfa N° 2033-A-SD",
      "028",
      "autre ligne sans case",
      "montant orphelin 999999",
    ].join("\n");
    const read = readNativeTaxPackageCase(text, "028", 1);
    assert.equal(read.status, "missing");
  });
});

describe("Lot 4D.3 — partiel / années / décimales / provenance / interdits (M–Q)", () => {
  it("M — package partiel 2033-C seule", async () => {
    const result = await extract([
      page2033C("426: 60000\n476: 12000\n496: 150000\n576: 42000", 1),
    ]);
    assert.deepEqual(result.identifiedForms, ["2033C"]);
    assert.equal(obsFor(result.observations, "028")[0]!.value.status, "document_absent");
    assert.ok(isCandidatePresent(obsFor(result.observations, "496")[0]!.value));
  });

  it("N — formYear != fiscalYear préservés", async () => {
    const result = await extract([page2033A("028: 1\n030: 2")], {
      formYear: 2026,
      fiscalYear: 2024,
    });
    for (const o of result.observations.filter((x) => x.formType === "2033A")) {
      assert.equal(o.formYear, 2026);
      assert.equal(o.fiscalYear, 2024);
    }
  });

  it("O — décimales préservées", async () => {
    const result = await extract([page2033C("496: 149999,64\n426: 1\n476: 2\n576: 3")]);
    const o = obsFor(result.observations, "496")[0]!;
    assert.ok(isCandidatePresent(o.value));
    assert.equal(o.value.value, 149_999.64);
  });

  it("P — documentId / provenance / documentRole", async () => {
    const result = await extract([page2033A("028: 10\n030: 20")], {
      documentId: "doc-immut-4d3",
    });
    const o = obsFor(result.observations, "028")[0]!;
    assert.ok(isCandidatePresent(o.value));
    assert.equal(o.value.provenance.documentId, "doc-immut-4d3");
    assert.equal(o.value.provenance.documentRole, "prior_tax_package");
    assert.equal(o.value.provenance.extractionMethod, "native_pdf_text_liasse_v1");
    assert.equal(o.value.provenance.evidence?.page, 1);
    assert.ok(o.value.provenance.confidence);
  });

  it("Q — aucune extraction de 490/570/572/318", async () => {
    const result = await extract([
      page2033A("028: 150000\n030: 42000\n490: 999\n570: 888"),
      page2033C("426: 1\n476: 2\n496: 3\n576: 4\n572: 777\n318: 666"),
    ]);
    const cases = new Set(result.observations.map((o) => o.sourceCase));
    for (const forbidden of ["490", "570", "572", "318"]) {
      assert.equal(cases.has(forbidden), false);
    }
  });
});

describe("Lot 4D.3 — Vision fallback (mocks, aucun réseau)", () => {
  it("native suffisant (y compris formulaire absent) → Vision NON appelée", async () => {
    let calls = 0;
    const visionRequester: TaxPackageLiasseVisionRequester = async () => {
      calls += 1;
      return { formType: "2033A", cases: [] };
    };
    // 2033-C absent → document_absent, PAS Vision
    const result = await extract([page2033A("028: 150000\n030: 42000")], {
      visionRequester,
    });
    assert.equal(result.visionCalled, false);
    assert.equal(calls, 0);
    for (const sourceCase of ["426", "476", "496", "576"]) {
      assert.equal(obsFor(result.observations, sourceCase)[0]!.value.status, "document_absent");
    }

    const full = await extract(
      [
        page2033A("028: 150000\n030: 42000"),
        page2033C("426: 1\n476: 2\n496: 3\n576: 4"),
      ],
      { visionRequester },
    );
    assert.equal(full.visionCalled, false);
    assert.equal(calls, 0);
  });

  it("page formulaire identifiée + case ambiguë → Vision appelée", async () => {
    let calls = 0;
    const visionRequester: TaxPackageLiasseVisionRequester = async ({ formType }) => {
      calls += 1;
      return {
        formType,
        cases: v1VisionCases(formType, {
          "028": { status: "present", value: 150_000 },
          "030": { status: "present", value: 42_000 },
        }),
      };
    };
    // Montants multiples → extraction_impossible natif → Vision
    const result = await extract(
      [page2033A("028 150000 148000\n030 42000 41000")],
      { visionRequester },
    );
    assert.equal(result.visionCalled, true);
    assert.equal(calls, 1);
    assert.ok(isCandidatePresent(obsFor(result.observations, "028")[0]!.value));
    assert.equal(
      (obsFor(result.observations, "028")[0]!.value as { value: number }).value,
      150_000,
    );
  });

  it("aucune page formulaire → Vision NON appelée + document_absent", async () => {
    let calls = 0;
    const visionRequester: TaxPackageLiasseVisionRequester = async () => {
      calls += 1;
      return { formType: "2033A", cases: [] };
    };
    const result = await extract([page(1, "scan illisible sans marqueur")], {
      visionRequester,
    });
    assert.equal(result.visionCalled, false);
    assert.equal(calls, 0);
    assert.equal(obsFor(result.observations, "028")[0]!.value.status, "document_absent");
  });

  it("Vision present(0) → present(0)", async () => {
    const visionRequester: TaxPackageLiasseVisionRequester = async ({ formType }) => ({
      formType,
      cases: v1VisionCases(formType, {
        "028": { status: "present", value: 1 },
        "030": { status: "present", value: 0 },
      }),
    });
    const result = await extract(
      [page2033A("028 10 20\n030 30 40")],
      { visionRequester },
    );
    const o = obsFor(result.observations, "030")[0]!;
    assert.ok(isCandidatePresent(o.value));
    assert.equal(o.value.value, 0);
  });

  it("Vision missing → missing", async () => {
    const visionRequester: TaxPackageLiasseVisionRequester = async ({ formType }) => ({
      formType,
      cases: v1VisionCases(formType, { "028": { status: "missing", value: null } }),
    });
    const result = await extract([page2033A("028 10 20\n030 30 40")], {
      visionRequester,
    });
    assert.equal(obsFor(result.observations, "028")[0]!.value.status, "missing");
  });

  it("Vision extraction_impossible → extraction_impossible", async () => {
    const visionRequester: TaxPackageLiasseVisionRequester = async ({ formType }) => ({
      formType,
      cases: v1VisionCases(formType, {
        "028": { status: "extraction_impossible", value: null },
      }),
    });
    const result = await extract([page2033A("028 10 20\n030 30 40")], {
      visionRequester,
    });
    assert.equal(
      obsFor(result.observations, "028")[0]!.value.status,
      "extraction_impossible",
    );
  });

  it("Vision valeur invalide → pas de present silencieux", async () => {
    const visionRequester: TaxPackageLiasseVisionRequester = async ({ formType }) => ({
      formType,
      cases: v1VisionCases(formType, {
        "028": { status: "present", value: Number.NaN },
        "030": { status: "present", value: -10 },
      }),
    });
    const result = await extract([page2033A("028 10 20\n030 30 40")], {
      visionRequester,
    });
    assert.equal(
      obsFor(result.observations, "028")[0]!.value.status,
      "extraction_impossible",
    );
    assert.equal(
      obsFor(result.observations, "030")[0]!.value.status,
      "extraction_impossible",
    );
  });

  it("Vision requester reject → erreur propagée, aucune CandidateValue inventée", async () => {
    const visionRequester: TaxPackageLiasseVisionRequester = async () => {
      throw new Error("vision network failure");
    };
    await assert.rejects(
      () => extract([page2033A("028 10 20\n030 30 40")], { visionRequester }),
      /vision network failure/,
    );
  });
});

function v1VisionCases(
  formType: "2033A" | "2033C",
  overrides: Record<
    string,
    { status: "present" | "missing" | "extraction_impossible"; value: number | null }
  >,
): TaxPackageLiasseVisionFormPayload["cases"] {
  const cases = formType === "2033A" ? ["028", "030"] : ["426", "476", "496", "576"];
  return cases.map((sourceCase) => {
    const override = overrides[sourceCase];
    if (override) return { sourceCase, ...override };
    return { sourceCase, status: "missing" as const, value: null };
  });
}

describe("Lot 4D.3 — E2E 4D.3 → 4D.2", () => {
  it("six cases traversent sans perte ni réconciliation", async () => {
    const extracted = await extract([
      page2033A("028: 150000\n030: 0"),
      page2033C("426: 60000\n476: 12000\n496: 149999.64\n576: 42000"),
    ]);

    const adapted = extractTaxPackageControlFactsFromLiasse({
      packageId: "pkg-4d3-e2e",
      observations: extracted.observations.filter(
        (o) => o.formType === "2033A" || o.formType === "2033C",
      ),
    });

    // document_absent sur aucune des 6 — toutes présentes
    const facts = adapted.package.facts.filter((f) =>
      ["028", "030", "426", "476", "496", "576"].includes(f.sourceCase),
    );
    // missing/document_absent peuvent aussi devenir facts 4D.2 — on vérifie les present
    const presentFacts = facts.filter((f) => isCandidatePresent(f.value));
    assert.equal(presentFacts.length, 6);

    const byCase = Object.fromEntries(
      presentFacts.map((f) => {
        assert.ok(isTaxPackageControlFact(f));
        assert.ok(isCandidatePresent(f.value));
        return [f.sourceCase, f.value.value] as const;
      }),
    );
    assert.equal(byCase["028"], 150_000);
    assert.equal(byCase["030"], 0);
    assert.equal(byCase["426"], 60_000);
    assert.equal(byCase["476"], 12_000);
    assert.equal(byCase["496"], 149_999.64);
    assert.equal(byCase["576"], 42_000);

    for (const f of presentFacts) {
      assert.ok(isCandidatePresent(f.value));
      assert.equal(f.value.provenance.documentId, DOC);
      assert.equal(f.formYear, FORM_YEAR);
      assert.equal(f.fiscalYear, FY);
      assert.equal(f.periodPosition, "closing");
    }

    assert.equal("canonicalValue" in adapted.package, false);
    assert.equal("reconciliation" in adapted, false);
  });
});

describe("Lot 4D.3 — boundaries source", () => {
  it("aucune canonicalisation / Opening / stocks / cast dans le module", () => {
    const source = readFileSync(
      new URL("./extract-tax-package-liasse-observations.ts", import.meta.url),
      "utf8",
    );
    assert.doesNotMatch(source, /canonicalValue/);
    assert.doesNotMatch(source, /\btolerance\b/);
    assert.doesNotMatch(source, /reconciliation/);
    assert.doesNotMatch(source, /OpeningFact|OpeningAsset/);
    assert.doesNotMatch(source, /CandidateHistoricalAsset/);
    assert.doesNotMatch(source, /CandidateFiscalStocks/);
    assert.doesNotMatch(source, /as TaxPackageControlFact/);
    assert.doesNotMatch(source, /LMNP_OCR_JSON_SCHEMA/);
  });
});

describe("Lot 4D.3 — contre-audit probes (BLOCKERS + MAJOR)", () => {
  it("PROBE A — narratif 2033-A + 028 : 4500 → aucune identification, pas present(4500)", async () => {
    const narrative = [
      "Cabinet Comptable Dupont",
      "Objet : transmission de votre 2033-A pour votre dossier.",
      "Dossier 028 : 4500",
    ].join("\n");
    assert.equal(identifyTaxPackageLiasseForm(narrative), null);
    const result = await extract([page(1, narrative)]);
    assert.equal(result.identifiedForms.includes("2033A"), false);
    for (const o of obsFor(result.observations, "028")) {
      assert.notEqual(o.value.status, "present");
      if (isCandidatePresent(o.value)) {
        assert.notEqual(o.value.value, 4500);
      }
    }
    assert.equal(obsFor(result.observations, "028")[0]!.value.status, "document_absent");
  });

  it("PROBE A' — narratif 2033-C + 496 : 999 → aucune identification", async () => {
    const narrative = [
      "Merci de nous renvoyer votre 2033-C signée.",
      "Réf dossier 496 : 999",
    ].join("\n");
    assert.equal(identifyTaxPackageLiasseForm(narrative), null);
    const result = await extract([page(1, narrative)]);
    assert.equal(result.identifiedForms.includes("2033C"), false);
    assert.equal(obsFor(result.observations, "496")[0]!.value.status, "document_absent");
  });

  it("PROBE B — négatif 028/030/496 → extraction_impossible, jamais present(positif)", async () => {
    const result = await extract([
      page2033A("028: -4500\n030: -100"),
      page2033C("426: 1\n476: 2\n496: -999\n576: 3"),
    ]);
    for (const sourceCase of ["028", "030", "496"]) {
      const o = obsFor(result.observations, sourceCase)[0]!;
      assert.equal(o.value.status, "extraction_impossible");
      assert.equal(isCandidatePresent(o.value), false);
    }
    // Pas de positif fabriqué sur ces cases
    const presents = result.observations.filter(
      (o) =>
        ["028", "030", "496"].includes(o.sourceCase) && isCandidatePresent(o.value),
    );
    assert.equal(presents.length, 0);
  });

  it("PROBE C — 2 pages 2033-A → 2 appels Vision indépendants + provenance", async () => {
    const calls: number[] = [];
    const visionRequester: TaxPackageLiasseVisionRequester = async ({
      formType,
      pageNumber,
    }) => {
      calls.push(pageNumber ?? -1);
      const value = pageNumber === 1 ? 111 : 555;
      return {
        formType,
        cases: v1VisionCases(formType, {
          "028": { status: "present", value },
          "030": { status: "present", value: value + 1 },
        }),
      };
    };
    const result = await extract(
      [
        page2033A("028 10 20\n030 30 40", 1),
        page2033A("028 50 60\n030 70 80", 5),
      ],
      { visionRequester },
    );
    assert.equal(result.visionCalled, true);
    assert.deepEqual(calls.sort((a, b) => a - b), [1, 5]);

    const o28 = obsFor(result.observations, "028");
    assert.equal(o28.length, 2);
    const page1 = o28.find(
      (o) => isCandidatePresent(o.value) && o.value.provenance.evidence?.page === 1,
    );
    const page5 = o28.find(
      (o) => isCandidatePresent(o.value) && o.value.provenance.evidence?.page === 5,
    );
    assert.ok(page1 && isCandidatePresent(page1.value));
    assert.ok(page5 && isCandidatePresent(page5.value));
    assert.equal(page1.value.value, 111);
    assert.equal(page5.value.value, 555);
  });

  it("PROBE D — aucune 2033-C → 0 Vision pour C + document_absent", async () => {
    let cCalls = 0;
    const visionRequester: TaxPackageLiasseVisionRequester = async ({ formType }) => {
      if (formType === "2033C") cCalls += 1;
      return { formType, cases: v1VisionCases(formType, {}) };
    };
    const result = await extract([page2033A("028: 150000\n030: 42000")], {
      visionRequester,
    });
    assert.equal(cCalls, 0);
    assert.equal(result.visionCalled, false);
    for (const sourceCase of ["426", "476", "496", "576"]) {
      assert.equal(obsFor(result.observations, sourceCase)[0]!.value.status, "document_absent");
    }
  });

  it("PROBE E — même ligne 028 150000 030 42000 → association bornée, pas de croisement", async () => {
    const line = "028 150000 030 42000";
    const r028 = readNativeTaxPackageCase(
      `Cerfa N° 2033-A-SD ${FORM_YEAR}\n${line}`,
      "028",
      1,
    );
    const r030 = readNativeTaxPackageCase(
      `Cerfa N° 2033-A-SD ${FORM_YEAR}\n${line}`,
      "030",
      1,
    );
    assert.equal(r028.status, "present");
    assert.equal(r028.value, 150_000);
    assert.equal(r030.status, "present");
    assert.equal(r030.value, 42_000);

    const result = await extract([page2033A(line)]);
    const o28 = obsFor(result.observations, "028")[0]!;
    const o30 = obsFor(result.observations, "030")[0]!;
    assert.ok(isCandidatePresent(o28.value));
    assert.ok(isCandidatePresent(o30.value));
    assert.equal(o28.value.value, 150_000);
    assert.equal(o30.value.value, 42_000);
  });

  it("SAFETY — rangée de codes case 026…030 → 028 jamais present(29)", () => {
    const read = readNativeTaxPackageCase("026 027 028 029 030", "028", 1);
    assert.notEqual(read.status, "present");
    assert.equal(read.status, "extraction_impossible");
  });

  it("SAFETY — 028 999 030 → 028 jamais present(999)", () => {
    const read = readNativeTaxPackageCase("028 999 030", "028", 1);
    assert.notEqual(read.status, "present");
    assert.equal(read.status, "extraction_impossible");
  });

  it("SAFETY — 028 111 222 030 → 028 jamais present(111222)", () => {
    const read = readNativeTaxPackageCase("028 111 222 030", "028", 1);
    assert.notEqual(read.status, "present");
    assert.equal(read.status, "extraction_impossible");
  });

  it("SAFETY — montants légitimes non ambiguës restent present()", () => {
    assert.deepEqual(readNativeTaxPackageCase("028: 150000", "028", 1), {
      status: "present",
      value: 150_000,
      pageNumber: 1,
    });
    assert.deepEqual(readNativeTaxPackageCase("028 150000", "028", 1), {
      status: "present",
      value: 150_000,
      pageNumber: 1,
    });
    assert.deepEqual(readNativeTaxPackageCase("028: 150 000", "028", 1), {
      status: "present",
      value: 150_000,
      pageNumber: 1,
    });
    assert.deepEqual(readNativeTaxPackageCase("028: 150 000 000", "028", 1), {
      status: "present",
      value: 150_000_000,
      pageNumber: 1,
    });
    assert.deepEqual(readNativeTaxPackageCase("028: 0", "028", 1), {
      status: "present",
      value: 0,
      pageNumber: 1,
    });
  });

  it("SAFETY — montant à gauche seul → missing (zone associable = droite uniquement)", () => {
    const read = readNativeTaxPackageCase("148000 028", "028", 1);
    assert.equal(read.status, "missing");
  });

  it("SAFETY — montant gauche ignoré si droite claire (pas d'invention cross-case)", () => {
    // Sur une rangée, la gauche de 030 appartient à 028 — ne doit pas polluer 030.
    const read = readNativeTaxPackageCase("028 150000 030 42000", "030", 1);
    assert.equal(read.status, "present");
    assert.equal(read.value, 42_000);
  });
});

describe("Lot 4D.3.1 — garde millésime formYear", () => {
  it("A — bon formulaire / bon millésime → nominal inchangé", async () => {
    const result = await extract([
      page2033A("028: 150000\n030: 42000"),
      page2033C("426: 60000\n476: 12000\n496: 150000\n576: 42000"),
    ]);
    assert.ok(isCandidatePresent(obsFor(result.observations, "028")[0]!.value));
    assert.equal(
      (obsFor(result.observations, "028")[0]!.value as { value: number }).value,
      150_000,
    );
  });

  it("B/E — 2033-A mauvais millésime + 028: 150000 → aucun present", async () => {
    const result = await extract(
      [page2033A("028: 150000\n030: 42000", 1, 2025)],
      { formYear: 2026, fiscalYear: 2025 },
    );
    assert.equal(result.identifiedForms.includes("2033A"), false);
    for (const sourceCase of ["028", "030"]) {
      const o = obsFor(result.observations, sourceCase)[0]!;
      assert.equal(o.value.status, "extraction_impossible");
      assert.equal(isCandidatePresent(o.value), false);
    }
    assert.ok(
      result.diagnostics.some((d) => d.includes("millésime incompatible")),
    );
  });

  it("C/F — 2033-C mauvais millésime + 496: 150000 → aucun present", async () => {
    const result = await extract(
      [page2033C("426: 1\n476: 2\n496: 150000\n576: 3", 2, 2024)],
      { formYear: 2026, fiscalYear: 2025 },
    );
    assert.equal(result.identifiedForms.includes("2033C"), false);
    const o496 = obsFor(result.observations, "496")[0]!;
    assert.equal(o496.value.status, "extraction_impossible");
    assert.equal(isCandidatePresent(o496.value), false);
  });

  it("D — formYear != fiscalYear toujours supporté", async () => {
    const result = await extract(
      [page2033A("028: 10\n030: 20", 1, 2026)],
      { formYear: 2026, fiscalYear: 2024 },
    );
    const o = obsFor(result.observations, "028")[0]!;
    assert.ok(isCandidatePresent(o.value));
    assert.equal(o.formYear, 2026);
    assert.equal(o.fiscalYear, 2024);
    assert.notEqual(o.formYear, o.fiscalYear);
  });

  it("G — deux pages valides même formulaire → observations indépendantes, pas de dédup", async () => {
    const result = await extract([
      page2033A("028: 111\n030: 11", 1, 2026),
      page2033A("028: 222\n030: 22", 5, 2026),
    ]);
    const o28 = obsFor(result.observations, "028");
    assert.equal(o28.length, 2);
    assert.ok(isCandidatePresent(o28[0]!.value));
    assert.ok(isCandidatePresent(o28[1]!.value));
    assert.deepEqual(
      o28.map((o) => (isCandidatePresent(o.value) ? o.value.value : null)),
      [111, 222],
    );
    assert.deepEqual(
      o28.map((o) =>
        isCandidatePresent(o.value) ? o.value.provenance.evidence?.page : null,
      ),
      [1, 5],
    );
  });

  it("signal millésime : année après 2033-*-SD (pdfjs officiel)", () => {
    assert.equal(
      extractTaxPackageLiassePrintedFormYear(
        "DGFiP N° 2033-A-SD 2026 N° 15948 * 08",
        "2033A",
      ),
      2026,
    );
    assert.equal(
      extractTaxPackageLiassePrintedFormYear(
        "DGFiP N° 2033-C-SD 2026 Formulaire",
        "2033C",
      ),
      2026,
    );
    assert.equal(
      isTaxPackageLiasseFormYearCompatible("DGFiP N° 2033-A-SD 2026", "2033A", 2026),
      true,
    );
    assert.equal(
      isTaxPackageLiasseFormYearCompatible("DGFiP N° 2033-A-SD 2025", "2033A", 2026),
      false,
    );
    assert.equal(
      isTaxPackageLiasseFormYearCompatible(
        "Cerfa N° 2033-A-SD\nsans année",
        "2033A",
        2026,
      ),
      false,
    );
  });

  it("A11 — Cerfa 15948*08 ne valide jamais 2033-C seul", async () => {
    const result = await extract(
      [
        page(
          1,
          ["2033-C-SD", "N° 15948 * 08", "496: 150000"].join("\n"),
        ),
      ],
      { formYear: 2026, fiscalYear: 2025 },
    );
    const o496 = obsFor(result.observations, "496")[0]!;
    assert.equal(o496.value.status, "extraction_impossible");
    assert.equal(isCandidatePresent(o496.value), false);
    assert.equal(
      extractTaxPackageLiassePrintedFormYear(
        ["2033-C-SD", "N° 15948 * 08"].join("\n"),
        "2033C",
      ),
      null,
    );
  });

  it("yearless A via API publique → extraction_impossible, jamais present", async () => {
    const result = await extract(
      [page(1, ["2033-A-SD", "028: 150000"].join("\n"))],
      { formYear: 2026, fiscalYear: 2025 },
    );
    const o28 = obsFor(result.observations, "028")[0]!;
    assert.equal(o28.value.status, "extraction_impossible");
    assert.equal(isCandidatePresent(o28.value), false);
  });

  it("yearless C via API publique → extraction_impossible, jamais present", async () => {
    const result = await extract(
      [page(1, ["2033-C-SD", "496: 150000"].join("\n"))],
      { formYear: 2026, fiscalYear: 2025 },
    );
    const o496 = obsFor(result.observations, "496")[0]!;
    assert.equal(o496.value.status, "extraction_impossible");
    assert.equal(isCandidatePresent(o496.value), false);
  });

  it("Cerfa fallback A — 2033-A-SD + 15948*08 sans année → compatible 2026", async () => {
    const result = await extract(
      [
        page(
          1,
          ["2033-A-SD", "N° 15948 * 08", "028: 150000", "030: 1"].join("\n"),
        ),
      ],
      { formYear: 2026, fiscalYear: 2025 },
    );
    const o28 = obsFor(result.observations, "028")[0]!;
    assert.ok(isCandidatePresent(o28.value));
    assert.equal(o28.value.value, 150_000);
  });

  it("conflit primaire 2025 + Cerfa 15948*08 → extraction_impossible", async () => {
    const result = await extract(
      [
        page(
          1,
          ["2033-A-SD 2025", "N° 15948 * 08", "028: 150000", "030: 1"].join("\n"),
        ),
      ],
      { formYear: 2026, fiscalYear: 2025 },
    );
    const o28 = obsFor(result.observations, "028")[0]!;
    assert.equal(o28.value.status, "extraction_impossible");
    assert.equal(isCandidatePresent(o28.value), false);
    assert.equal(
      extractTaxPackageLiassePrintedFormYear(
        "2033-A-SD 2025\nN° 15948 * 08",
        "2033A",
      ),
      2025,
    );
  });
});
