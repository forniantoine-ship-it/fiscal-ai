/**
 * Téléchargement liasse fiscale (exercice actif) — assemblage, pas de mapper Cerfa.
 * Run: npx tsx --test src/lib/lmnp/services/declaration/download-liasse-fiscale-pdf.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { PDFDocument, StandardFonts } from "pdf-lib";

import { POST } from "@/app/api/lmnp/declaration/cerfa-pdf/route";
import { runDeclarationGeneration } from "@/lib/lmnp/services/declaration/run-declaration-generation";
import { extractDrawnStringsForPage } from "@/lib/lmnp/services/liasse-pdf/tests/extract-rendered-text";
import type { DeclarationDraft } from "@/lib/lmnp/types/domain";
import type { FiscalRepresentation } from "@/runtime/capabilities/rfs/types";

import { collectLiasseDossierExtras } from "./collect-liasse-dossier-extras";
import { assembleLiasseFiscalePdf } from "./download-liasse-fiscale-pdf";
import { CERFA_PDF_ROUTE, fetchOfficialCerfaPdfBytes } from "./download-cerfa-pdf";
import { liasseFiscalePdfFileName } from "./merge-liasse-dossier-with-cerfa";
import { LIASSE_DOSSIER_PDF_TITLE } from "./render-liasse-dossier-pdf";

const SIX_FORMS = [
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

function isPdf(bytes: Uint8Array): boolean {
  return String.fromCharCode(bytes[0]!, bytes[1]!, bytes[2]!, bytes[3]!) === "%PDF";
}

function compact(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function contains(haystack: string, needle: string): boolean {
  return compact(haystack).includes(compact(needle));
}

async function extractPdfPages(bytes: Uint8Array): Promise<{ pageCount: number; pages: string[] }> {
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
  return { pageCount: pdf.numPages, pages };
}

function generationReadyDraft(overrides: Partial<DeclarationDraft> = {}): DeclarationDraft {
  return {
    completedSteps: [],
    siret: "12345678901234",
    siren: "123456789",
    exploitantFirstName: "Marie",
    exploitantLastName: "Dupont",
    dateMiseEnService: "2020-01-01",
    activityStartDate: "2020-01-01",
    activityType: "LMNP",
    revenusAssistant: { exerciceFiscal: 2025, totalRecettes: 9000 },
    chargesAssistant: { exerciceFiscal: 2025, totalDeductible: 2000, totalPreExploitation: 0 },
    amortissementAssistant: { exerciceFiscal: 2025, totalDotations: 1500, status: "validated" },
    ...overrides,
  } as DeclarationDraft;
}

function realRfs(overrides: Partial<DeclarationDraft> = {}): { rfs: FiscalRepresentation; draft: DeclarationDraft } {
  const draft = generationReadyDraft(overrides);
  const generation = runDeclarationGeneration(draft, 2025);
  assert.equal(generation.status, "generated", "précondition — fixture générable");
  if (generation.status !== "generated") throw new Error("unreachable");
  return { rfs: generation.rfs, draft };
}

describe("download-liasse-fiscale-pdf — architecture", () => {
  it("n'importe aucun mapper / générateur Cerfa ; le Cerfa passe par la route existante", () => {
    const source = readFileSync(path.join(import.meta.dirname, "download-liasse-fiscale-pdf.ts"), "utf8");
    const code = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    const valueImports = code
      .split("\n")
      .filter((line) => /^\s*import\s/.test(line) && !/^\s*import\s+type\s/.test(line))
      .join("\n");
    assert.doesNotMatch(code, /generateCerfa/);
    assert.doesNotMatch(code, /map-2033/);
    assert.doesNotMatch(code, /render-cerfa-liasse/);
    assert.doesNotMatch(code, /assembleLiasseFromRfs/);
    assert.doesNotMatch(valueImports, /liasse-pdf/);
    assert.match(code, /fetchOfficialCerfaPdfBytes/);
    assert.match(code, /buildCerfaPdfRequestPayload/);
  });

  it("le chemin historique réutilise downloadLiasseFiscalePdf depuis le record archivé", () => {
    const archived = readFileSync(
      path.join(import.meta.dirname, "../../../../components/lmnp/declaration/ArchivedDeclarationView.tsx"),
      "utf8",
    );
    const code = archived.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    assert.match(code, /downloadLiasseFiscalePdf/);
    assert.match(code, /resolveArchivedLiasseDownload/);
    assert.doesNotMatch(code, /useLmnp/);
    assert.doesNotMatch(code, /downloadOfficialCerfaPdf/);
  });

  it("le nom du fichier produit est liasse-fiscale-lmnp-{année}.pdf", () => {
    assert.equal(liasseFiscalePdfFileName(2025), "liasse-fiscale-lmnp-2025.pdf");
  });
});

describe("fetchOfficialCerfaPdfBytes — route existante uniquement", () => {
  it("POST vers /api/lmnp/declaration/cerfa-pdf et restitue les bytes", async () => {
    const payload = {
      rfs: { exercice: 2025 } as FiscalRepresentation,
      declarationVersionId: "v1",
      forms: SIX_FORMS,
    };
    const previousFetch = globalThis.fetch;
    let calledUrl = "";
    let calledMethod = "";
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      calledUrl = String(input);
      calledMethod = init?.method ?? "";
      const doc = await PDFDocument.create();
      doc.addPage();
      const bytes = await doc.save();
      return new Response(bytes, { status: 200, headers: { "content-type": "application/pdf" } });
    }) as typeof fetch;
    try {
      const bytes = await fetchOfficialCerfaPdfBytes(payload);
      assert.equal(calledUrl, CERFA_PDF_ROUTE);
      assert.equal(calledMethod, "POST");
      assert.ok(isPdf(bytes));
    } finally {
      globalThis.fetch = previousFetch;
    }
  });
});

describe("assembleLiasseFiscalePdf — chaîne documentaire + Cerfa", () => {
  it("produit un PDF documentaire-d'abord, 6 Cerfa ensuite, totaux RFS présents", async () => {
    const { rfs, draft } = realRfs({
      logementAssistantState: {
        step: "complete",
        adresse: "12 Rue des Lilas",
        typeBien: "appartement",
        fieldSources: {},
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
    });
    const extras = collectLiasseDossierExtras({ declarationDraft: draft });

    const response = await POST(
      new Request("http://localhost/api/lmnp/declaration/cerfa-pdf", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ rfs, declarationVersionId: "v1", forms: [...SIX_FORMS] }),
      }),
    );
    assert.equal(response.status, 200);
    const cerfaBytes = copyBytes(new Uint8Array(await response.arrayBuffer()));
    const cerfaPageCount = (await PDFDocument.load(copyBytes(cerfaBytes))).getPageCount();
    assert.equal(cerfaPageCount, 6);

    const originalDrawn = await extractDrawnStringsForPage(copyBytes(cerfaBytes), 1);
    const merged = await assembleLiasseFiscalePdf({ rfs, extras, cerfaPdfBytes: cerfaBytes });
    assert.ok(isPdf(merged));

    const mergedDoc = await PDFDocument.load(copyBytes(merged));
    const extracted = await extractPdfPages(copyBytes(merged));
    const documentaryPageCount = extracted.pageCount - 6;
    assert.equal(mergedDoc.getPageCount(), documentaryPageCount + 6);
    assert.ok(documentaryPageCount >= 1);
    assert.ok(contains(extracted.pages[0] ?? "", LIASSE_DOSSIER_PDF_TITLE));
    assert.ok(contains(extracted.pages[0] ?? "", "Exercice 2025"));
    assert.ok(contains(extracted.pages.join(" "), "Marie Dupont") || contains(extracted.pages.join(" "), "Dupont"));
    assert.ok(contains(extracted.pages.join(" "), "12 Rue des Lilas"), "extra F010 présent quand persisté");
    assert.ok(contains(extracted.pages.join(" "), "9 000") || contains(extracted.pages.join(" "), "9000"));

    assert.deepEqual(
      await extractDrawnStringsForPage(copyBytes(merged), documentaryPageCount + 1),
      originalDrawn,
      "première page Cerfa inchangée après assemblage",
    );
  });

  it("sans extras : PDF toujours générable, donnée absente non inventée", async () => {
    const { rfs } = realRfs();
    const cerfa = await PDFDocument.create();
    const font = await cerfa.embedFont(StandardFonts.Helvetica);
    for (const marker of SIX_FORMS) {
      const page = cerfa.addPage([595.28, 841.89]);
      page.drawText(marker, { x: 40, y: 800, size: 12, font });
    }
    const cerfaBytes = await cerfa.save();
    const merged = await assembleLiasseFiscalePdf({ rfs, cerfaPdfBytes: cerfaBytes });
    const extracted = await extractPdfPages(copyBytes(merged));
    assert.ok(isPdf(merged));
    assert.equal(extracted.pageCount, (await PDFDocument.load(copyBytes(merged))).getPageCount());
    assert.equal(contains(extracted.pages.join(" "), "12 Rue des Lilas"), false);
    assert.equal(contains(extracted.pages.join(" "), "Non renseigné"), false);
    const offset = extracted.pageCount - 6;
    assert.ok(contains(extracted.pages[offset] ?? "", "2031-SD"));
  });
});
