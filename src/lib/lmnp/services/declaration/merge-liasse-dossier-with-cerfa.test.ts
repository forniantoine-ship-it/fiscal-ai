/**
 * Fusion pages documentaires + Cerfa — assemblage PDF, aucun recalcul.
 * Run: npx tsx --test src/lib/lmnp/services/declaration/merge-liasse-dossier-with-cerfa.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { PDFDocument, StandardFonts } from "pdf-lib";

import { handleCerfaPdfRequest } from "@/app/api/lmnp/declaration/cerfa-pdf/handler";
// Payment V1 — ces tests portent sur le CONTENU fiscal du PDF, pas sur l'accès
// payant : le résolveur d'accès est injecté (autorisé). L'authentification, la
// propriété et l'entitlement payé sont prouvés dans route.payment.test.ts.
const POST = (request: Request) => handleCerfaPdfRequest(request, async () => ({ ok: true }));
import { runDeclarationGeneration } from "@/lib/lmnp/services/declaration/run-declaration-generation";
import { extractDrawnStringsForPage } from "@/lib/lmnp/services/liasse-pdf/tests/extract-rendered-text";
import type { DeclarationDraft } from "@/lib/lmnp/types/domain";
import type { FiscalResult } from "@/runtime/capabilities/f006/types";
import type { IdentiteDeclarante } from "@/runtime/capabilities/f007/types";
import type { FiscalRepresentation } from "@/runtime/capabilities/rfs/types";

import { buildLiasseDossierDocument } from "./build-liasse-dossier-document";
import {
  liasseFiscalePdfFileName,
  mergeLiasseDossierWithCerfa,
} from "./merge-liasse-dossier-with-cerfa";
import { LIASSE_DOSSIER_PDF_TITLE, renderLiasseDossierPdf } from "./render-liasse-dossier-pdf";

const CERFA_FORM_MARKERS = [
  "2031-SD",
  "2031-bis-SD",
  "2033-A-SD",
  "2033-B-SD",
  "2033-C-SD",
  "2033-D-SD",
] as const;

function copyBytes(bytes: Uint8Array): Uint8Array {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy;
}

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function isPdf(bytes: Uint8Array): boolean {
  return String.fromCharCode(bytes[0]!, bytes[1]!, bytes[2]!, bytes[3]!) === "%PDF";
}

function compact(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function contains(haystack: string, needle: string): boolean {
  return compact(haystack).includes(compact(needle));
}

async function extractPdfPages(bytes: Uint8Array): Promise<{ pageCount: number; pages: string[]; all: string }> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  pdfjs.GlobalWorkerOptions.workerSrc = pathToFileURL(
    require.resolve("pdfjs-dist/legacy/build/pdf.worker.min.mjs"),
  ).href;
  const pdf = await pdfjs.getDocument({ data: bytes }).promise;
  const pages: string[] = [];
  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum += 1) {
    const page = await pdf.getPage(pageNum);
    const content = await page.getTextContent();
    const items = content.items
      .filter((item): item is { str: string } => "str" in item && Boolean(item.str?.trim()))
      .map((item) => item.str);
    pages.push(items.join(" "));
  }
  return { pageCount: pdf.numPages, pages, all: pages.join("\n") };
}

function fiscalResult(): FiscalResult {
  return {
    exercice: 2025,
    recettes: { total: 5100 },
    charges: {
      totalDeductible: 2267,
      chargesExploitation: 738,
      chargesFinancement: 1529,
      chargesPreExploitation: 0,
      totalNonDeductible: 99,
    },
    resultatAvantAmort: 2734,
    amortCalcule: 3720,
    amortDeduct: 0,
    amortReporte: 3720,
    amortNonDeduitExercice: 3720,
    amortReportesUtilises: 0,
    resultatFiscal: 0,
    deficitNouveau: 9862,
    deficitsImputes: 0,
    perteExceptionnelle: 0,
    stocks: { deficits: [{ millesime: 2025, montant: 9862 }], amortissementsReportes: 3720, deficitsExpires: [] },
    trace: { ksArtifacts: ["TRF-0032"], computedAt: "2026-08-31T00:00:00.000Z", journal: [] },
    status: "computed",
    anomalies: [],
  };
}

const IDENTITE: IdentiteDeclarante = {
  siren: "104545108",
  siret: "10454510800011",
  denomination: "Elsa Bouvard",
  adresseEntreprise: "15 Rue Saint-Germain, 29600 Saint-Martin-Des-Champs",
};

function documentaryRfs(): FiscalRepresentation {
  const fr = fiscalResult();
  return {
    exercice: fr.exercice,
    identite: IDENTITE,
    fiscalResult: fr,
    trace: {
      ksArtifacts: fr.trace.ksArtifacts,
      assembledAt: "2026-08-31T00:00:00.000Z",
      sourceFiscalResultAt: fr.trace.computedAt,
      sources: { identite: "IdentiteDeclarante (ENT-013)", fiscalResult: "FiscalResult (F-006)" },
    },
  };
}

function documentaryBytes(): Uint8Array {
  return renderLiasseDossierPdf(buildLiasseDossierDocument(documentaryRfs()));
}

async function syntheticCerfaBytes(): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (const marker of CERFA_FORM_MARKERS) {
    const page = doc.addPage([595.28, 841.89]);
    page.drawText(marker, { x: 50, y: 800, size: 14, font });
  }
  return doc.save();
}

function generationReadyDraft(): DeclarationDraft {
  return {
    completedSteps: [],
    siret: "12345678901234",
    siren: "123456789",
    exploitantFirstName: "Marie",
    exploitantLastName: "Dupont",
    dateMiseEnService: "2020-01-01",
    revenusAssistant: { exerciceFiscal: 2025, totalRecettes: 9000 },
    chargesAssistant: { exerciceFiscal: 2025, totalDeductible: 2000, totalPreExploitation: 0 },
    amortissementAssistant: { exerciceFiscal: 2025, totalDotations: 1500, status: "validated" },
  } as DeclarationDraft;
}

function realCerfaRfs(): FiscalRepresentation {
  const generation = runDeclarationGeneration(generationReadyDraft(), 2025);
  assert.equal(generation.status, "generated", "précondition — le fixture Cerfa doit être générable");
  if (generation.status !== "generated") throw new Error("unreachable");
  return generation.rfs;
}

function jsonRequest(body: unknown): Request {
  return new Request("http://localhost/api/lmnp/declaration/cerfa-pdf", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("mergeLiasseDossierWithCerfa — architecture", () => {
  it("n'importe aucune couche fiscale ni aucun générateur Cerfa", () => {
    const source = readFileSync(path.join(import.meta.dirname, "merge-liasse-dossier-with-cerfa.ts"), "utf8");
    const code = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    const valueImports = code
      .split("\n")
      .filter((line) => /^\s*import\s/.test(line) && !/^\s*import\s+type\s/.test(line))
      .join("\n");
    assert.doesNotMatch(code, /produceFiscalResult/);
    assert.doesNotMatch(code, /buildLiasseDossierDocument/);
    assert.doesNotMatch(code, /renderLiasseDossierPdf/);
    assert.doesNotMatch(code, /generateCerfa/);
    assert.doesNotMatch(code, /map-2033/);
    assert.doesNotMatch(code, /render-cerfa-liasse/);
    assert.doesNotMatch(code, /assembleLiasseFromRfs/);
    assert.doesNotMatch(valueImports, /capabilities\/f00[6-9]/);
    assert.doesNotMatch(valueImports, /capabilities\/f01[0-4]/);
    assert.doesNotMatch(valueImports, /liasse-pdf/);
    assert.match(valueImports, /pdf-lib/);
  });
});

describe("liasseFiscalePdfFileName", () => {
  it("fixe le nom du PDF unique côté produit, sans toucher à l'UX", () => {
    assert.equal(liasseFiscalePdfFileName(2025), "liasse-fiscale-lmnp-2025.pdf");
  });
});

describe("mergeLiasseDossierWithCerfa — assemblage mécanique", () => {
  it("documentaire + 6 pages Cerfa → PDF valide, documentaire d'abord, Cerfa ensuite, total = N + 6", async () => {
    const notes = documentaryBytes();
    const cerfa = await syntheticCerfaBytes();
    const notesDoc = await PDFDocument.load(copyBytes(notes));
    const cerfaDoc = await PDFDocument.load(copyBytes(cerfa));
    assert.equal(cerfaDoc.getPageCount(), 6);

    const beforeNotesSha = sha256(notes);
    const beforeCerfaSha = sha256(cerfa);

    const merged = await mergeLiasseDossierWithCerfa(notes, cerfa);
    assert.ok(isPdf(merged));

    const mergedDoc = await PDFDocument.load(merged);
    assert.equal(
      mergedDoc.getPageCount(),
      notesDoc.getPageCount() + 6,
      "total = pages documentaires + 6 Cerfa",
    );

    assert.equal(sha256(notes), beforeNotesSha, "les bytes documentaires d'entrée ne sont pas mutés");
    assert.equal(sha256(cerfa), beforeCerfaSha, "les bytes Cerfa d'entrée ne sont pas mutés");

    const extracted = await extractPdfPages(merged);
    assert.ok(contains(extracted.pages[0] ?? "", LIASSE_DOSSIER_PDF_TITLE), "page 1 = pages documentaires");
    assert.ok(contains(extracted.pages[0] ?? "", "Exercice 2025"));

    const cerfaOffset = notesDoc.getPageCount();
    for (let i = 0; i < CERFA_FORM_MARKERS.length; i += 1) {
      const pageText = extracted.pages[cerfaOffset + i] ?? "";
      assert.ok(
        contains(pageText, CERFA_FORM_MARKERS[i]!),
        `page ${cerfaOffset + i + 1} doit porter ${CERFA_FORM_MARKERS[i]}`,
      );
    }
  });

  it("après copyPages, le texte Cerfa de chaque page fusionnée est identique à la page d'origine", async () => {
    const notes = documentaryBytes();
    const cerfa = await syntheticCerfaBytes();
    const notesPageCount = (await PDFDocument.load(copyBytes(notes))).getPageCount();
    const merged = await mergeLiasseDossierWithCerfa(notes, cerfa);

    for (let i = 0; i < 6; i += 1) {
      const original = await extractDrawnStringsForPage(copyBytes(cerfa), i + 1);
      const copied = await extractDrawnStringsForPage(copyBytes(merged), notesPageCount + i + 1);
      assert.deepEqual(
        copied,
        original,
        `page Cerfa ${i + 1} (${CERFA_FORM_MARKERS[i]}) : texte dessiné inchangé après fusion`,
      );
    }
  });
});

describe("mergeLiasseDossierWithCerfa — Cerfa officiel existant, intouché", () => {
  it("le PDF Cerfa de la route inchangée survit à la fusion : 6 pages, texte et dimensions identiques", async () => {
    const rfs = realCerfaRfs();
    const notes = renderLiasseDossierPdf(buildLiasseDossierDocument(rfs));
    const notesPageCount = (await PDFDocument.load(copyBytes(notes))).getPageCount();

    const response = await POST(
      jsonRequest({
        rfs,
        declarationVersionId: "v1",
        forms: [...CERFA_FORM_MARKERS],
      }),
    );
    assert.equal(response.status, 200, "précondition — la route Cerfa existante doit produire le PDF officiel");
    const cerfaBytes = copyBytes(new Uint8Array(await response.arrayBuffer()));
    assert.ok(isPdf(cerfaBytes), "précondition — la route doit renvoyer un PDF");
    const cerfaShaBeforeMerge = sha256(cerfaBytes);
    const cerfaDoc = await PDFDocument.load(copyBytes(cerfaBytes));
    assert.equal(cerfaDoc.getPageCount(), 6, "précondition — liasse officielle = 6 pages");

    const originalDrawn: string[][] = [];
    const originalSizes: Array<{ width: number; height: number }> = [];
    for (let i = 0; i < 6; i += 1) {
      originalDrawn.push(await extractDrawnStringsForPage(copyBytes(cerfaBytes), i + 1));
      originalSizes.push(cerfaDoc.getPages()[i]!.getSize());
    }

    const merged = await mergeLiasseDossierWithCerfa(notes, cerfaBytes);
    assert.ok(isPdf(merged));
    assert.equal(sha256(cerfaBytes), cerfaShaBeforeMerge, "la fusion ne mute pas le PDF Cerfa source");

    const mergedDoc = await PDFDocument.load(copyBytes(merged));
    assert.equal(mergedDoc.getPageCount(), notesPageCount + 6);

    const extracted = await extractPdfPages(copyBytes(merged));
    assert.ok(contains(extracted.pages[0] ?? "", LIASSE_DOSSIER_PDF_TITLE));

    for (let i = 0; i < 6; i += 1) {
      const mergedPageIndex = notesPageCount + i;
      assert.deepEqual(
        await extractDrawnStringsForPage(copyBytes(merged), mergedPageIndex + 1),
        originalDrawn[i],
        `Cerfa page ${i + 1} (${CERFA_FORM_MARKERS[i]}) : overlay inchangé après copyPages`,
      );
      const mergedSize = mergedDoc.getPages()[mergedPageIndex]!.getSize();
      assert.equal(mergedSize.width, originalSizes[i]!.width);
      assert.equal(mergedSize.height, originalSizes[i]!.height);
    }
  });
});
