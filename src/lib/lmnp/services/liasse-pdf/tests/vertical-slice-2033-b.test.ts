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
  return {
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
  return fiscalResult({
    resultatAvantAmort: extras.resultatAvantAmort ?? 0,
    amortCalcule: extras.amortCalcule ?? 0,
    amortDeduct: app.amortDeduct,
    amortReporte: app.amortReporte,
    amortReportesUtilises: app.amortReportesUtilises,
    resultatFiscal: app.resultatFiscal,
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

  it("352/354/322/324/249/251 sont OUT_OF_SCOPE ou NOT_PRODUCED — jamais REQUIRED", () => {
    for (const caseId of ["352", "354", "322", "324", "249", "251"]) {
      const entry = scopeStatusFor2033BCase(caseId);
      assert.ok(entry);
      assert.notEqual(entry?.status, "REQUIRED_FOR_SCOPE");
      assert.equal(resolveVisualMapping(CERFA_2033B_FORM_ID, CERFA_2033B_MILLESIME, caseId), undefined);
    }
  });
});

describe("P1-PDF-01 — scénarios mapper (A–G)", () => {
  it("A — resultatFiscal positif → 370 alimentée, 372 absente", () => {
    const app = applyAmortissementStocks({
      exercice: 2025,
      resultatAvantAmort: 3000,
      amortCalcule: 800,
      stockDeficitsAnterieurs: [{ millesime: 2023, montant: 600 }],
      stockAmortissementsReportes: 200,
    });
    const form = map2033BFromRfs(rfs(packFromApplication(app, { resultatAvantAmort: 3000, amortCalcule: 800 })));
    assert.equal(findCase(form.cases, "370")?.value, 1400);
    assert.equal(findCase(form.cases, "372"), undefined);
    assert.equal(findCase(form.cases, "330"), undefined);
  });

  it("B — déficit nouveau → 330 alimentée, 372 absente", () => {
    const form = map2033BFromRfs(buildDossierTemoinRfs());
    assert.equal(findCase(form.cases, "330")?.value, 9862);
    assert.equal(findCase(form.cases, "372"), undefined);
    assert.equal(findCase(form.cases, "370"), undefined);
  });

  it("C — resultatFiscal nul → 370 et 372 absentes", () => {
    const form = map2033BFromRfs(rfs(fiscalResult({ resultatFiscal: 0, deficitNouveau: 0, deficitsImputes: 0 })));
    assert.equal(findCase(form.cases, "370"), undefined);
    assert.equal(findCase(form.cases, "372"), undefined);
  });

  it("D — deficitsImputes → 350 = montant imputé", () => {
    const app = applyAmortissementStocks({
      exercice: 2025,
      resultatAvantAmort: 2000,
      amortCalcule: 800,
      stockDeficitsAnterieurs: [{ millesime: 2023, montant: 600 }],
      stockAmortissementsReportes: 500,
    });
    const form = map2033BFromRfs(rfs(packFromApplication(app, { resultatAvantAmort: 2000, amortCalcule: 800 })));
    assert.equal(findCase(form.cases, "350")?.value, 600);
  });

  it("E — deficitsImputes = 0 → 350 = 0 (zéro réel, pas une absence)", () => {
    const form = map2033BFromRfs(buildDossierTemoinRfs());
    assert.equal(findCase(form.cases, "350")?.value, 0);
    assert.notEqual(findCase(form.cases, "350"), undefined);
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
    assert.ok(!result.manifest.some((m) => m.caseId === "352"));
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
    assert.equal(pageText.filter((s) => s === "9 862").length, 1, "330 unique");
    assert.ok(pageText.includes("0"), "350=0 dessiné");
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
