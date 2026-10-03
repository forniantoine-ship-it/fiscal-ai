/**
 * P1-PDF-01 — Vertical slice complet 2033-B-SD 2026.
 *
 * Run:
 *   npx tsx --test src/lib/lmnp/services/liasse-pdf/tests/vertical-slice-2033-b.test.ts
 *
 * Couvre les scénarios A–N de la mission (mapper fiscal + gate + renderer),
 * sans recalcul fiscal dans la couche PDF.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { PDFDocument, StandardFonts } from "pdf-lib";

import { applyAmortissementStocks } from "@/runtime/capabilities/f006/apply-amortissement-stocks";
import type { FiscalResult } from "@/runtime/capabilities/f006/types";
import { map2033BFromRfs } from "@/runtime/capabilities/rfs/projection/map-2033b";
import type { FiscalRepresentation } from "@/runtime/capabilities/rfs/types";

import {
  CERFA_2033B_FORM_ID,
  CERFA_2033B_MILLESIME,
  generateCerfa2033BFromRfs,
} from "../generate-cerfa-2033b";
import { generateCerfaLiassePdf } from "../generator/render-cerfa-liasse";
import {
  checkAssetIntegrity,
  checkCoordinateBounds,
  checkOverflow,
  runStructuralAndMappingGate,
} from "../gate/generation-gate";
import { CERFA_ASSET_MANIFEST_2026 } from "../asset-manifest";
import { readAssetBytes } from "../assets/load-asset";
import { resolveVisualMapping } from "../registry";
import { CERFA_2033B_REGISTRY_CASE_IDS, scopeStatusFor2033BCase } from "../scope/2033-b-2026";
import type { CerfaCase } from "../types";
import { buildDossierTemoinRfs } from "./golden-master-technical-pipeline.test";
import { extractDrawnStringsForPage } from "./extract-rendered-text";

const OUTPUT_DIR = path.join(__dirname, "output");

function cerfaCase(caseId: string, value: CerfaCase["value"], label = caseId): CerfaCase {
  return { caseId, label, value, trace: { source: "FiscalResult", path: "test", ksArtifacts: [] } };
}

function findCase(cases: CerfaCase[], caseId: string) {
  return cases.find((c) => c.caseId === caseId);
}

function fiscalResult(overrides: Partial<FiscalResult> = {}): FiscalResult {
  const merged: FiscalResult = {
    exercice: 2025,
    recettes: { total: 9000 },
    charges: {
      totalDeductible: 2000,
      chargesExploitation: 2000,
      chargesFinancement: 0,
      chargesPreExploitation: 0,
      totalNonDeductible: 0,
    },
    resultatAvantAmort: 7000,
    amortCalcule: 1500,
    amortDeduct: 1500,
    amortReporte: 0,
    amortNonDeduitExercice: 0,
    amortReportesUtilises: 0,
    resultatFiscal: 5500,
    deficitNouveau: 0,
    deficitsImputes: 0,
    perteExceptionnelle: 0,
    stocks: { deficits: [], amortissementsReportes: 0, deficitsExpires: [] },
    trace: { ksArtifacts: ["TRF-0032"], computedAt: "2026-01-01T00:00:00.000Z", journal: [] },
    status: "computed",
    anomalies: [],
    ...overrides,
  };
  if (overrides.amortNonDeduitExercice === undefined) {
    merged.amortNonDeduitExercice = Math.round((merged.amortCalcule - merged.amortDeduct) * 100) / 100;
  }
  if (overrides.resultatFiscalAvantDeficits === undefined) {
    // Reconstruction manuelle fidèle à F-006 (TRF-0031) : année déficitaire → −deficitNouveau ; sinon
    // resultatFiscal + déficits imputés.
    merged.resultatFiscalAvantDeficits =
      merged.deficitNouveau > 0
        ? -merged.deficitNouveau
        : Math.round((merged.resultatFiscal + merged.deficitsImputes) * 100) / 100;
  }
  return merged;
}

function rfs(fr: FiscalResult): FiscalRepresentation {
  return {
    exercice: fr.exercice,
    identite: { siren: "104545108", denomination: "TEST" },
    fiscalResult: fr,
    trace: {
      ksArtifacts: fr.trace.ksArtifacts,
      assembledAt: "2026-01-01T00:00:00.000Z",
      sourceFiscalResultAt: fr.trace.computedAt,
      sources: { identite: "test", fiscalResult: "test" },
    },
  };
}

function packFromApplication(
  app: ReturnType<typeof applyAmortissementStocks>,
  extras: Partial<FiscalResult> = {},
): FiscalResult {
  const amortCalcule = extras.amortCalcule ?? 0;
  return fiscalResult({
    resultatAvantAmort: extras.resultatAvantAmort ?? 0,
    amortCalcule,
    amortDeduct: app.amortDeduct,
    amortReporte: app.amortReporte,
    amortNonDeduitExercice: Math.round((amortCalcule - app.amortDeduct) * 100) / 100,
    amortReportesUtilises: app.amortReportesUtilises,
    resultatFiscal: app.resultatFiscal,
    resultatFiscalAvantDeficits: app.resultatFiscalAvantDeficits,
    deficitNouveau: app.deficitNouveau,
    deficitsImputes: app.deficitsImputes,
    ...extras,
  });
}

describe("P1-PDF-01 — périmètre registry 2033-B", () => {
  it("chaque case du registre vertical slice a une entrée visuelle calibrée", () => {
    for (const caseId of CERFA_2033B_REGISTRY_CASE_IDS) {
      const mapping = resolveVisualMapping(CERFA_2033B_FORM_ID, CERFA_2033B_MILLESIME, caseId);
      assert.ok(mapping, `${caseId} doit avoir une entrée de registre`);
      assert.equal(mapping?.calibration, "mesure-empirique");
      assert.ok(scopeStatusFor2033BCase(caseId), `${caseId} doit être classée dans le scope`);
    }
  });

  it("354/322/324/249/251 sont OUT_OF_SCOPE ou NOT_PRODUCED — jamais REQUIRED, aucune entrée de registre", () => {
    for (const caseId of ["354", "322", "324", "249", "251"]) {
      const entry = scopeStatusFor2033BCase(caseId);
      assert.ok(entry);
      assert.notEqual(entry?.status, "REQUIRED_FOR_SCOPE");
      assert.equal(resolveVisualMapping(CERFA_2033B_FORM_ID, CERFA_2033B_MILLESIME, caseId), undefined);
    }
  });

  it("SAV-032 — 352 et 370 (0 par neutralisation) sont REQUIRED_FOR_SCOPE avec une entrée de registre calibrée ; 350 est OPTIONAL (vide si E ≤ 0)", () => {
    for (const caseId of ["352", "370"]) {
      assert.equal(scopeStatusFor2033BCase(caseId)?.status, "REQUIRED_FOR_SCOPE");
      assert.equal(resolveVisualMapping(CERFA_2033B_FORM_ID, CERFA_2033B_MILLESIME, caseId)?.calibration, "mesure-empirique");
    }
    assert.equal(scopeStatusFor2033BCase("350")?.status, "OPTIONAL");
  });
});

describe("P1-PDF-01 — scénarios mapper (A–G)", () => {
  it("A — résultat positif → 350 = E (ARD inclus), 352 = 370 = 0, 372 absente (SAV-032)", () => {
    const app = applyAmortissementStocks({
      exercice: 2025,
      resultatAvantAmort: 3000,
      amortCalcule: 800,
      stockDeficitsAnterieurs: [{ millesime: 2023, montant: 600 }],
      stockAmortissementsReportes: 200,
    });
    const form = map2033BFromRfs(rfs(packFromApplication(app, { resultatAvantAmort: 3000, amortCalcule: 800 })));
    // Calcul à la main : 3 000 − 800 (dotation) − 200 (ARD) = 2 000 avant déficits ; déficits imputés 600 ; résultat fiscal 1 400.
    // E = 2 000 + 200 = 2 200 = 3 000 − 800 → 350 ; les 600 de déficits antérieurs ne figurent pas dans la 2033-B.
    assert.equal(findCase(form.cases, "350")?.value, 2200);
    assert.equal(findCase(form.cases, "352")?.value, 0);
    assert.equal(findCase(form.cases, "370")?.value, 0);
    assert.equal(findCase(form.cases, "372"), undefined);
    assert.equal(findCase(form.cases, "330"), undefined);
  });

  it("B — déficit nouveau → 330 = déficit + non-déductible (9 961, oracle EDI), 354/372 absentes, 370 = 0", () => {
    const form = map2033BFromRfs(buildDossierTemoinRfs());
    assert.equal(findCase(form.cases, "330")?.value, 9961);
    assert.equal(findCase(form.cases, "354"), undefined);
    assert.equal(findCase(form.cases, "372"), undefined);
    assert.equal(findCase(form.cases, "370")?.value, 0);
  });

  it("C — résultat nul → 370 = 0 imprimé (SAV-032), 372 absente", () => {
    const form = map2033BFromRfs(rfs(fiscalResult({ resultatFiscal: 0, deficitNouveau: 0, deficitsImputes: 0 })));
    assert.equal(findCase(form.cases, "370")?.value, 0);
    assert.equal(findCase(form.cases, "372"), undefined);
  });

  it("D — déficits antérieurs + ARD : 350 = E (non deficitsImputes)", () => {
    const app = applyAmortissementStocks({
      exercice: 2025,
      resultatAvantAmort: 2000,
      amortCalcule: 800,
      stockDeficitsAnterieurs: [{ millesime: 2023, montant: 600 }],
      stockAmortissementsReportes: 500,
    });
    const form = map2033BFromRfs(rfs(packFromApplication(app, { resultatAvantAmort: 2000, amortCalcule: 800 })));
    // E = 700 (avant déficits) + 500 (ARD) = 1 200 = 2 000 − 800 ; les 600 de déficits antérieurs n'y figurent pas.
    assert.equal(findCase(form.cases, "350")?.value, 1200);
  });

  it("E — dossier témoin déficitaire (E < 0) → 350 vide (comme la 2033-B acceptée en EDI), jamais un zéro imprimé", () => {
    const form = map2033BFromRfs(buildDossierTemoinRfs());
    assert.equal(findCase(form.cases, "350"), undefined);
  });

  it("F — taxe foncière absente → 244 absente", () => {
    const form = map2033BFromRfs(rfs(fiscalResult()));
    assert.equal(findCase(form.cases, "244"), undefined);
  });

  it("G — taxe foncière présente → 244 = montant", () => {
    const form = map2033BFromRfs(
      rfs(
        fiscalResult({
          // A1 — détail cohérent : la taxe foncière est ici la seule charge d'exploitation, donc 244 l'explique en
          // totalité (un détail partiel n'est plus publié, voir rfs-2033b.test.ts R4).
          charges: {
            totalDeductible: 1200,
            chargesExploitation: 1200,
            chargesFinancement: 0,
            chargesPreExploitation: 0,
            totalNonDeductible: 0,
            detailParCategorie: { taxe_fonciere: 1200 },
          },
        }),
      ),
    );
    assert.equal(findCase(form.cases, "244")?.value, 1200);
  });
});

describe("P1-PDF-01 — generation gate (H–N)", () => {
  it("H — case non produite → aucune écriture PDF", async () => {
    const form = map2033BFromRfs(rfs(fiscalResult()));
    const result = await generateCerfaLiassePdf({
      millesime: CERFA_2033B_MILLESIME,
      forms: [{ form: CERFA_2033B_FORM_ID, cases: form.cases }],
    });
    assert.equal(result.status, "generated");
    if (result.status !== "generated") return;
    assert.ok(!result.manifest.some((m) => m.caseId === "244"));
    assert.ok(!result.manifest.some((m) => m.caseId === "354"), "354 (colonne déficit) n'est jamais écrite : vide par neutralisation");
  });

  it("I — case registry inconnue → BLOCK", () => {
    const violations = runStructuralAndMappingGate({
      millesime: CERFA_2033B_MILLESIME,
      forms: [{ form: CERFA_2033B_FORM_ID, cases: [cerfaCase("CASE_INCONNUE", 1)] }],
    });
    assert.equal(violations[0]?.code, "case-sans-mapping-visuel");
  });

  it("J — mauvais millésime → BLOCK", () => {
    const violations = runStructuralAndMappingGate({
      millesime: 2099,
      forms: [{ form: CERFA_2033B_FORM_ID, cases: [cerfaCase("218", 5100)] }],
    });
    assert.equal(violations[0]?.code, "millesime-inconnu");
  });

  it("K — coordonnées hors page → BLOCK", () => {
    const violation = checkCoordinateBounds({
      form: CERFA_2033B_FORM_ID,
      caseId: "218",
      mapping: {
        form: CERFA_2033B_FORM_ID,
        millesime: 2026,
        caseId: "218",
        page: 1,
        position: { space: "top-left", x: -1, y: 100 },
        width: 85,
        format: "eur-arrondi",
        calibration: "mesure-empirique",
      },
      pageWidth: 595.3,
      pageHeight: 841.9,
    });
    assert.equal(violation?.code, "coordonnee-hors-page");
  });

  it("L — overflow → BLOCK", async () => {
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const mapping = resolveVisualMapping(CERFA_2033B_FORM_ID, CERFA_2033B_MILLESIME, "218")!;
    const violation = checkOverflow({
      form: CERFA_2033B_FORM_ID,
      caseValue: cerfaCase("218", 5100),
      mapping: { ...mapping, width: 3 },
      font,
    });
    assert.equal(violation?.code, "debordement-largeur");
  });

  it("M — doublon de case → BLOCK", () => {
    const violations = runStructuralAndMappingGate({
      millesime: CERFA_2033B_MILLESIME,
      forms: [{ form: CERFA_2033B_FORM_ID, cases: [cerfaCase("218", 5100), cerfaCase("218", 5100)] }],
    });
    assert.equal(violations[0]?.code, "case-id-dupliquee");
  });

  it("N — Cerfa source altéré → BLOCK (empreinte SHA-256)", () => {
    const manifestEntry = CERFA_ASSET_MANIFEST_2026.find((e) => e.form === CERFA_2033B_FORM_ID)!;
    const violation = checkAssetIntegrity({
      form: CERFA_2033B_FORM_ID,
      assetFile: manifestEntry.assetFile,
      bytes: new TextEncoder().encode("pdf-corrompu"),
      manifestEntry,
    });
    assert.equal(violation?.code, "asset-empreinte-invalide");
  });
});

describe("P1-PDF-01 — golden master JD2M (2033-B seul)", () => {
  it("génère un PDF Cerfa officiel 2033-B 2026 à partir du dossier témoin", async () => {
    const result = await generateCerfa2033BFromRfs({
      rfs: buildDossierTemoinRfs(),
      declarationVersionId: "decl-version-jd2m-test",
      generatedAt: "2026-09-06T12:00:00.000Z",
    });

    if (result.status === "blocked") {
      assert.fail(`Génération bloquée :\n${JSON.stringify(result.violations, null, 2)}`);
      return;
    }

    assert.equal(result.pageCount, 1);
    assert.ok(result.sizeBytes > 50_000);
    assert.equal(result.sha256.length, 64);
    assert.equal(result.form, CERFA_2033B_FORM_ID);
    assert.equal(result.generatedRecord.forms[0], CERFA_2033B_FORM_ID);
    assert.equal(result.generatedRecord.ediStatus, "not_submitted");

    const pageText = await extractDrawnStringsForPage(result.pdfBytes, 1);
    assert.ok(pageText.includes("5 100"));
    assert.ok(pageText.includes("3 720"));
    assert.ok(pageText.includes("14 180"));
    assert.ok(pageText.includes("(9 080)"));
    assert.ok(pageText.includes("4 602"));
    assert.ok(pageText.includes("(13 681)"));
    assert.ok(pageText.includes("13 681"));
    // ORACLE EDI RÉEL (SAV-032) : 330 = 9 961 (déficit 9 862 + 99 non déductibles), 352 = 370 = 0, 350/354/372 vides.
    assert.equal(pageText.filter((s) => s === "9 961").length, 1, "330 unique = 9 961");
    assert.equal(pageText.filter((s) => s === "9 862").length, 0, "9 862 n'est plus sur la 2033-B (déficit neutralisé avec le non-déductible)");
    assert.ok(pageText.includes("0"), "352 = 370 = 0 dessinés");
    assert.ok(!pageText.some((s) => s === "9862" && !s.includes(" ")), "pas de format sans espace milliers");

    mkdirSync(OUTPUT_DIR, { recursive: true });
    const outputPath = path.join(OUTPUT_DIR, "jd2m-2033b-2026.pdf");
    writeFileSync(outputPath, result.pdfBytes);

    const assetBytes = readAssetBytes(CERFA_2033B_MILLESIME, "2033-sd.pdf");
    const assetSha = createHash("sha256").update(assetBytes).digest("hex");
    assert.equal(assetSha, CERFA_ASSET_MANIFEST_2026.find((e) => e.form === CERFA_2033B_FORM_ID)!.sha256);
    assert.notEqual(result.sha256, assetSha, "le PDF généré ne doit pas être identique au fond source");

    // Exposer le chemin pour le rapport final (visible dans la sortie du test).
    console.log(`P1-PDF-01 output: ${outputPath} (${result.pageCount} page, ${result.sizeBytes} bytes, sha256=${result.sha256})`);
  });
});

describe("P1-PDF-01 — renderer sans règle fiscale", () => {
  it("generate-cerfa-2033b.ts n'importe aucun moteur fiscal ni assistant", async () => {
    const { readFileSync } = await import("node:fs");
    const source = readFileSync(path.join(__dirname, "..", "generate-cerfa-2033b.ts"), "utf-8");
    const importLines = source.split("\n").filter((line) => /^\s*import\b/.test(line)).join("\n");
    for (const forbidden of [
      "produceFiscalResult",
      "applyAmortissementStocks",
      "capabilities/f010",
      "capabilities/f011",
      "capabilities/f012",
    ]) {
      assert.equal(importLines.includes(forbidden), false, `generate-cerfa-2033b ne doit pas importer ${forbidden}`);
    }
    assert.ok(importLines.includes("map2033BFromRfs"), "seul le mapper RFS est autorisé côté fiscal");
  });
});
