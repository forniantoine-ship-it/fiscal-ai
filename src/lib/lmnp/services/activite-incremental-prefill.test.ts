import assert from "node:assert/strict";
import fs from "node:fs";
import { pathToFileURL } from "node:url";

import { INPI_RNE_808900351_OCR } from "@/lib/documents/facts/extraction/inpi-rne/fixtures/inpi-rne-808900351.fixture";
import { normalizeOcrText } from "@/lib/documents/normalizers";
import {
  extractedInpiFieldProvenance,
  proposedEstablishmentAddressProvenance,
  userActiviteFieldProvenance,
} from "@/lib/lmnp/services/activite-field-provenance";
import {
  hydrateActiviteFormFromWorkspace,
  shouldSkipGptPrefill,
} from "@/lib/lmnp/services/activite-form-state";
import { prefillActiviteFormFromGpt } from "@/lib/lmnp/services/activite-gpt-ui-prefill";

const EMPTY_WORKSPACE = {
  fiscalYear: { id: "fy-1", year: 2025 },
  properties: [],
  documents: [],
  extractions: [],
  validationItems: [],
  ledgerEntries: [],
  declarationDraft: { completedSteps: [] },
};

function run(name: string, fn: () => void | Promise<void>) {
  return Promise.resolve(fn()).then(
    () => console.log(`  ✓ ${name}`),
    (error) => {
      console.error(`  ✗ ${name}`);
      throw error;
    },
  );
}

async function extractPdfLegacy(pdfPath: string): Promise<string> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  pdfjs.GlobalWorkerOptions.workerSrc = pathToFileURL(
    require.resolve("pdfjs-dist/legacy/build/pdf.worker.min.mjs"),
  ).href;
  const buffer = new Uint8Array(fs.readFileSync(pdfPath));
  const pdf = await pdfjs.getDocument({ data: buffer }).promise;
  const parts: string[] = [];

  for (let pageNum = 1; pageNum <= Math.min(pdf.numPages, 4); pageNum++) {
    const page = await pdf.getPage(pageNum);
    const content = await page.getTextContent();
    const items = content.items
      .filter(
        (item): item is { str: string; transform?: number[] } =>
          "str" in item && Boolean(item.str?.trim()),
      )
      .map((item) => ({
        text: item.str.trim(),
        x: item.transform?.[4] ?? 0,
        y: item.transform?.[5] ?? 0,
      }));
    items.sort((a, b) => b.y - a.y || a.x - b.x);
    const rows: string[] = [];
    let currentY: number | null = null;
    let row: string[] = [];
    for (const item of items) {
      if (currentY === null || Math.abs(item.y - currentY) <= 4) {
        row.push(item.text);
        currentY = item.y;
      } else {
        if (row.length) rows.push(row.join(" "));
        row = [item.text];
        currentY = item.y;
      }
    }
    if (row.length) rows.push(row.join(" "));
    parts.push(rows.join("\n"));
  }

  return normalizeOcrText(parts.join("\n\n--- PAGE ---\n\n").trim());
}

console.log("activite-incremental-prefill.test.ts");

async function main() {
await run("A. premier import INPI — comportement conservé", () => {
  const result = prefillActiviteFormFromGpt(
    { success: true, data: {} },
    EMPTY_WORKSPACE,
    { rawText: INPI_RNE_808900351_OCR },
  );

  assert.equal(result.skipped, false);
  assert.equal(result.formValues.lastName, "FORNI");
  assert.equal(result.formValues.firstName, "ANTOINE");
  assert.equal(result.formValues.siren, "808900351");
  assert.equal(result.formValues.establishmentAddress, "353 RUE DE PREMARCHAND");
  assert.equal(result.fieldProvenance.establishmentAddress?.status, "proposed");
  assert.equal(result.formValues.personalAddress, undefined);
  assert.equal(result.fieldProvenance.personalAddress?.status, "missing");
});

await run("B. ré-import avec draft FORNI/ANTOINE/SIREN — establishment PROPOSED", () => {
  const workspace = {
    ...EMPTY_WORKSPACE,
    declarationDraft: {
      completedSteps: [],
      exploitantLastName: "FORNI",
      exploitantFirstName: "ANTOINE",
      siren: "808900351",
      activiteFieldProvenance: {
        lastName: extractedInpiFieldProvenance(),
        firstName: extractedInpiFieldProvenance(),
        siren: extractedInpiFieldProvenance(),
      },
    },
  };

  assert.equal(shouldSkipGptPrefill(workspace.declarationDraft), false);

  const result = prefillActiviteFormFromGpt(
    { success: true, data: {} },
    workspace,
    { rawText: INPI_RNE_808900351_OCR },
  );

  assert.equal(result.skipped, false);
  assert.equal(result.formValues.lastName, "FORNI");
  assert.equal(result.formValues.firstName, "ANTOINE");
  assert.equal(result.formValues.siren, "808900351");
  assert.equal(result.formValues.establishmentAddress, "353 RUE DE PREMARCHAND");
  assert.equal(result.fieldProvenance.establishmentAddress?.status, "proposed");
  assert.equal(result.fieldProvenance.establishmentAddress?.origin, "fiscal_ai");
  assert.ok(result.fieldProvenance.establishmentAddress?.evidence?.includes("80890035100020"));
});

await run("C. ré-import ne doit jamais écraser nom userValidated", () => {
  const workspace = {
    ...EMPTY_WORKSPACE,
    declarationDraft: {
      completedSteps: [],
      exploitantLastName: "DUPONT",
      exploitantFirstName: "ANTOINE",
      siren: "808900351",
      activiteUserValidatedFields: { lastName: true },
      activiteFieldProvenance: {
        lastName: userActiviteFieldProvenance(true),
        firstName: extractedInpiFieldProvenance(),
        siren: extractedInpiFieldProvenance(),
      },
    },
  };

  const result = prefillActiviteFormFromGpt(
    { success: true, data: {} },
    workspace,
    { rawText: INPI_RNE_808900351_OCR },
  );

  assert.equal(result.formValues.lastName, "DUPONT");
  assert.equal(result.fieldProvenance.lastName?.origin, "user");
  assert.equal(result.formValues.establishmentAddress, "353 RUE DE PREMARCHAND");
});

await run("D. ré-import transforme MISSING email en MISSING (absent du doc)", () => {
  const workspace = {
    ...EMPTY_WORKSPACE,
    declarationDraft: {
      completedSteps: [],
      exploitantLastName: "FORNI",
      siren: "808900351",
      activiteFieldProvenance: {
        lastName: extractedInpiFieldProvenance(),
        siren: extractedInpiFieldProvenance(),
        email: { status: "missing", origin: "inpi_document" },
      },
    },
  };

  const result = prefillActiviteFormFromGpt(
    { success: true, data: {} },
    workspace,
    { rawText: INPI_RNE_808900351_OCR },
  );

  assert.equal(result.formValues.email, undefined);
  assert.equal(result.fieldProvenance.email?.status, "missing");
  assert.equal(result.formValues.establishmentAddress, "353 RUE DE PREMARCHAND");
});

await run("E. proposition PROPOSED existante remplacée par nouveau document", () => {
  const existingEvidence = "Ancienne proposition · SIRET 80890035100020";
  const workspace = {
    ...EMPTY_WORKSPACE,
    declarationDraft: {
      completedSteps: [],
      establishmentAddress: "Adresse déjà proposée",
      establishmentCity: "Bordeaux",
      establishmentPostalCode: "33000",
      activiteFieldProvenance: {
        establishmentAddress: proposedEstablishmentAddressProvenance({ evidence: existingEvidence }),
        establishmentCity: proposedEstablishmentAddressProvenance({ evidence: existingEvidence }),
        establishmentPostalCode: proposedEstablishmentAddressProvenance({ evidence: existingEvidence }),
      },
    },
  };

  const result = prefillActiviteFormFromGpt(
    { success: true, data: {} },
    workspace,
    { rawText: INPI_RNE_808900351_OCR, documentId: "doc-rne-replace" },
  );

  assert.ok(result.formValues.establishmentAddress?.includes("353 RUE DE PREMARCHAND"));
  assert.notEqual(result.formValues.establishmentAddress, "Adresse déjà proposée");
  assert.equal(result.fieldProvenance.establishmentAddress?.status, "proposed");
});

await run("F. rechargement draft conserve valeurs/provenances enrichies", () => {
  const workspace = {
    ...EMPTY_WORKSPACE,
    declarationDraft: {
      completedSteps: [],
      exploitantLastName: "FORNI",
      exploitantFirstName: "ANTOINE",
      siren: "808900351",
      establishmentAddress: "353 RUE DE PREMARCHAND",
      establishmentCity: "CADAUJAC",
      establishmentPostalCode: "33140",
      activiteFieldProvenance: {
        lastName: extractedInpiFieldProvenance(),
        firstName: extractedInpiFieldProvenance(),
        siren: extractedInpiFieldProvenance(),
        establishmentAddress: proposedEstablishmentAddressProvenance({
          evidence: "353 RUE · Type Principal · Statut actif · SIRET 80890035100020",
        }),
        establishmentCity: proposedEstablishmentAddressProvenance({
          evidence: "353 RUE · Type Principal · Statut actif · SIRET 80890035100020",
        }),
        establishmentPostalCode: proposedEstablishmentAddressProvenance({
          evidence: "353 RUE · Type Principal · Statut actif · SIRET 80890035100020",
        }),
      },
      inpiGptPrefillAppliedAt: "2026-08-21T12:00:00.000Z",
    },
  };

  const hydrated = hydrateActiviteFormFromWorkspace(workspace);
  assert.equal(hydrated.formValues.establishmentAddress, "353 RUE DE PREMARCHAND");
  assert.equal(hydrated.fieldProvenance.establishmentAddress?.status, "proposed");
});

await run("G. PDF réel 808900351 — enrichissement depuis draft identité seule", async () => {
  const pdfPath = "/Users/forniantoine/Downloads/extrait_immatriculation_inpi_808900351.pdf";
  if (!fs.existsSync(pdfPath)) {
    console.log("  (skip PDF — fichier absent, fallback fixture OCR)");
    return;
  }

  const rawText = await extractPdfLegacy(pdfPath);
  const workspace = {
    ...EMPTY_WORKSPACE,
    declarationDraft: {
      completedSteps: [],
      exploitantLastName: "FORNI",
      exploitantFirstName: "ANTOINE",
      siren: "808900351",
      activiteFieldProvenance: {
        lastName: extractedInpiFieldProvenance(),
        firstName: extractedInpiFieldProvenance(),
        siren: extractedInpiFieldProvenance(),
      },
    },
  };

  const result = prefillActiviteFormFromGpt({ success: true, data: {} }, workspace, { rawText });

  assert.equal(result.formValues.lastName, "FORNI");
  assert.equal(result.formValues.firstName, "ANTOINE");
  assert.equal(result.formValues.siren, "808900351");
  assert.equal(result.formValues.personalAddress, undefined);
  assert.equal(result.fieldProvenance.personalAddress?.status, "missing");
  assert.equal(result.formValues.establishmentAddress, "353 RUE DE PREMARCHAND");
  assert.equal(result.fieldProvenance.establishmentAddress?.status, "proposed");
  assert.equal(result.formValues.email, undefined);
  assert.equal(result.formValues.telephone, undefined);
});

console.log("All activite-incremental-prefill tests passed.");
}

void main();
