/** Integration check against a RUNNING Next dev or production server.
 * From project root: node --import tsx scripts/verify-pdf-runtime.ts URL OUTPUT_DIR
 * Uses synthetic data only; never reads or changes a user's dossier.
 */
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createRequire } from "node:module";
import { PDFDocument } from "pdf-lib";
import { POST } from "../src/app/api/lmnp/declaration/cerfa-pdf/route";
import { runDeclarationGeneration } from "../src/lib/lmnp/services/declaration/run-declaration-generation";
import { CERFA_PDF_FORMS } from "../src/lib/lmnp/services/declaration/download-cerfa-pdf";
import { buildClientSummaryDocument } from "../src/lib/lmnp/services/declaration/build-client-summary-document";
import { renderAide2042Pdf } from "../src/lib/lmnp/services/declaration/render-aide-2042-pdf";
import { assembleLiasseFiscalePdf } from "../src/lib/lmnp/services/declaration/download-liasse-fiscale-pdf";
import { collectLiasseDossierExtras } from "../src/lib/lmnp/services/declaration/collect-liasse-dossier-extras";
import { extractDrawnStringsForPage } from "../src/lib/lmnp/services/liasse-pdf/tests/extract-rendered-text";
import type { DeclarationDraft } from "../src/lib/lmnp/types/domain";

async function main() {
  const [baseUrl, outputDir] = process.argv.slice(2);
  assert.ok(baseUrl && outputDir, "Usage: verify-pdf-runtime.ts URL OUTPUT_DIR");
  // Do not accidentally submit synthetic fiscal data to an external deployment.
  assert.ok(["localhost", "127.0.0.1", "[::1]"].includes(new URL(baseUrl).hostname));
  await mkdir(outputDir, { recursive: true });
  const draft = {
    completedSteps: [], siret: "12345678901234", siren: "123456789",
    exploitantFirstName: "Marie", exploitantLastName: "Dupont",
    dateMiseEnService: "2020-01-01", activityStartDate: "2020-01-01", activityType: "LMNP",
    revenusAssistant: { exerciceFiscal: 2025, totalRecettes: 9000 },
    chargesAssistant: { exerciceFiscal: 2025, totalDeductible: 2000, totalPreExploitation: 0 },
    amortissementAssistant: { exerciceFiscal: 2025, totalDotations: 1500, status: "validated" },
    logementAssistantState: { step: "complete", adresse: "12 Rue des Lilas", typeBien: "appartement", fieldSources: {}, updatedAt: "2026-01-01T00:00:00Z" },
  } as DeclarationDraft;
  const generation = runDeclarationGeneration(draft, 2025);
  assert.equal(generation.status, "generated");
  if (generation.status !== "generated") throw new Error("Fixture not generated");
  const rfs = generation.rfs;
  const payload = { rfs, declarationVersionId: "pdf-runtime-fixture-2025", forms: [...CERFA_PDF_FORMS] };
  const record = { year: 2025, closures: [], declarationDraft: { ...draft, rfs, fiscalResult: rfs.fiscalResult, declaration: { currentVersionId: payload.declarationVersionId } } };
  await writeFile(path.join(outputDir, "fixture.json"), JSON.stringify(record));
  const report: unknown[] = [];
  async function remote(body: unknown) {
    return fetch(new URL("/api/lmnp/declaration/cerfa-pdf", baseUrl), {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
      signal: AbortSignal.timeout(120000),
    });
  }
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  pdfjs.GlobalWorkerOptions.workerSrc = pathToFileURL(createRequire(import.meta.url).resolve("pdfjs-dist/legacy/build/pdf.worker.min.mjs")).href;
  async function inspect(bytes: Uint8Array) {
    assert.ok(bytes.length > 100);
    assert.equal(Buffer.from(bytes.subarray(0, 5)).toString(), "%PDF-");
    const doc = await PDFDocument.load(bytes.slice());
    assert.ok(doc.getPageCount() > 0);
    const parsed = await pdfjs.getDocument({ data: bytes.slice(), standardFontDataUrl: path.join(process.cwd(), "node_modules/pdfjs-dist/standard_fonts/") }).promise;
    const pages = [];
    for (let i = 0; i < doc.getPageCount(); i++) {
      const content = await (await parsed.getPage(i + 1)).getTextContent();
      const text = content.items.filter(item => "str" in item).map(item => "str" in item ? item.str : "").join(" ");
      pages.push({ size: doc.getPage(i).getSize(), text, drawn: await extractDrawnStringsForPage(bytes.slice(), i + 1) });
    }
    await parsed.destroy();
    return pages;
  }
  let combined = new Uint8Array();
  for (const forms of [...CERFA_PDF_FORMS.map(form => [form]), [...CERFA_PDF_FORMS]]) {
    const name = forms.length === 1 ? forms[0] : "six-cerfa";
    const body = { ...payload, forms };
    const response = await remote(body);
    assert.equal(response.status, 200, `${name}: ${await response.clone().text().then(t => response.ok ? "" : t)}`);
    assert.match(response.headers.get("content-type") ?? "", /^application\/pdf\b/);
    const bytes = new Uint8Array(await response.arrayBuffer());
    const pages = await inspect(bytes);
    assert.equal(pages.length, forms.length);
    const nodeResponse = await POST(new Request("http://localhost/api/lmnp/declaration/cerfa-pdf", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }));
    assert.equal(nodeResponse.status, 200);
    assert.deepEqual(pages, await inspect(new Uint8Array(await nodeResponse.arrayBuffer())), `${name}: compiled runtime matches Node pages`);
    await writeFile(path.join(outputDir, `${name}.pdf`), bytes);
    report.push({ name, status: response.status, contentType: response.headers.get("content-type"), contentDisposition: response.headers.get("content-disposition"), bytes: bytes.length, pages: pages.length, forms, nodePageParity: true });
    if (forms.length > 1) combined = bytes;
  }
  const merged = await assembleLiasseFiscalePdf({ rfs, extras: collectLiasseDossierExtras({ declarationDraft: draft }), cerfaPdfBytes: combined });
  const mergedPages = await inspect(merged);
  assert.deepEqual(mergedPages.slice(-6), await inspect(combined), "All six Cerfa pages preserved after documentary merge");
  const documentaryText = mergedPages.slice(0, -6).map(p => p.text).join(" ");
  for (const needle of ["Identité et exercice", "Formation du résultat", "Charges", "Déficits et amortissements reportés"]) assert.ok(documentaryText.toLowerCase().includes(needle.toLowerCase()), needle);
  await writeFile(path.join(outputDir, "liasse-professionnelle.pdf"), merged);
  report.push({ name: "liasse-professionnelle", bytes: merged.length, pages: mergedPages.length, forms: CERFA_PDF_FORMS, sixCerfaPageParity: true });
  const aide = new Uint8Array(renderAide2042Pdf(buildClientSummaryDocument(rfs, { activityStartDate: draft.activityStartDate })).output("arraybuffer"));
  const aidePages = await inspect(aide);
  assert.ok(aidePages.map(p => p.text).join(" ").includes("5NA"));
  await writeFile(path.join(outputDir, "aide-2042.pdf"), aide);
  report.push({ name: "aide-2042", bytes: aide.length, pages: aidePages.length, case5NA: true, generation: "Node client-renderer; browser validated separately" });
  for (const [name, body, expected] of [
    ["missing-version", { ...payload, declarationVersionId: "" }, 400],
    ["unknown-form", { ...payload, forms: ["unknown"] }, 400],
    ["blocked-overflow", { ...payload, rfs: { ...rfs, fiscalResult: { ...rfs.fiscalResult, recettes: { ...rfs.fiscalResult.recettes, total: 1e16 } } } }, 422],
  ] as const) {
    const response = await remote(body);
    assert.equal(response.status, expected, name);
    assert.match(response.headers.get("content-type") ?? "", /application\/json/);
    report.push({ name, status: response.status, noPartialPdf: true });
  }
  await writeFile(path.join(outputDir, "http-report.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}
main().catch(error => { console.error(error); process.exitCode = 1; });
