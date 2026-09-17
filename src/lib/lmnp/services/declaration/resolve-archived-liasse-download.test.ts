/**
 * Étape 6B — liasse historique : isolation archive vs workspace, versionId,
 * régénération Cerfa depuis le RFS historique (millésime du moteur actuel,
 * aucun byte Cerfa figé à la clôture).
 *
 * Run: npx tsx --test src/lib/lmnp/services/declaration/resolve-archived-liasse-download.test.ts
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
import type { DeclarationDraft, FiscalYear } from "@/lib/lmnp/types/domain";
import type { FiscalYearClosure } from "@/lib/lmnp/types/dossier";
import type { FiscalRepresentation } from "@/runtime/capabilities/rfs/types";

import { assembleLiasseFiscalePdf } from "./download-liasse-fiscale-pdf";
import { buildCerfaPdfRequestPayload } from "./download-cerfa-pdf";
import { liasseFiscalePdfFileName } from "./merge-liasse-dossier-with-cerfa";
import { LIASSE_DOSSIER_PDF_TITLE } from "./render-liasse-dossier-pdf";
import {
  resolveArchivedDeclarationVersionId,
  resolveArchivedLiasseDownload,
  type ArchivedLiasseDownloadRecord,
} from "./resolve-archived-liasse-download";

const SIX_FORMS = [
  "2031-SD",
  "2031-bis-SD",
  "2033-A-SD",
  "2033-B-SD",
  "2033-C-SD",
  "2033-D-SD",
] as const;

const ADRESSE_A = "1 Impasse Archive-A";
const ADRESSE_B = "99 Boulevard Workspace-B";
const PRET_A = "pret-archive-A";
const PRET_B = "pret-workspace-B";
const VERSION_A = "version-archive-2025";
const VERSION_B = "version-workspace-2026";

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

function generationDraft(
  year: number,
  totalRecettes: number,
  extras: {
    adresse: string;
    pretId: string;
    versionId: string;
    capitalInitial: number;
  },
): DeclarationDraft {
  return {
    completedSteps: [],
    siret: "12345678901234",
    siren: "123456789",
    exploitantFirstName: "Marie",
    exploitantLastName: "Dupont",
    dateMiseEnService: "2020-01-01",
    activityStartDate: "2020-01-01",
    activityType: "LMNP",
    revenusAssistant: { exerciceFiscal: year, totalRecettes },
    chargesAssistant: { exerciceFiscal: year, totalDeductible: 2000, totalPreExploitation: 0 },
    amortissementAssistant: { exerciceFiscal: year, totalDotations: 1500, status: "validated" },
    declaration: {
      id: `decl-${year}`,
      fiscalYearId: `fy-${year}`,
      currentVersionId: extras.versionId,
      createdAt: "2026-01-01T00:00:00.000Z",
    },
    logementAssistantState: {
      step: "complete",
      adresse: extras.adresse,
      typeBien: "appartement",
      fieldSources: {},
      updatedAt: "2026-01-01T00:00:00.000Z",
    },
    financementAssistantState: {
      step: "complete",
      currentLoanIndex: 0,
      loans: [
        {
          pretId: extras.pretId,
          typePret: "amortissable",
          capitalInitial: extras.capitalInitial,
          tauxNominal: 0.032,
          dureeMois: 240,
          datePremiereMensualite: "2024-02-01",
        },
      ],
      fieldSources: {},
      updatedAt: "2026-01-01T00:00:00.000Z",
    },
  } as DeclarationDraft;
}

function generatedArchive(
  year: number,
  totalRecettes: number,
  extras: { adresse: string; pretId: string; versionId: string; capitalInitial: number },
  stocksOuverture?: FiscalYear["stocksOuverture"],
): { record: ArchivedLiasseDownloadRecord; rfs: FiscalRepresentation; draft: DeclarationDraft } {
  const draftBase = generationDraft(year, totalRecettes, extras);
  const generation = runDeclarationGeneration(draftBase, year);
  assert.equal(generation.status, "generated", `précondition — exercice ${year} générable`);
  if (generation.status !== "generated") throw new Error("unreachable");
  const draft: DeclarationDraft = {
    ...draftBase,
    fiscalResult: generation.fiscalResult,
    rfs: generation.rfs,
  };
  return {
    rfs: generation.rfs,
    draft,
    record: {
      year,
      stocksOuverture,
      declarationDraft: draft,
    },
  };
}

function closure(sourceDeclarationVersionId: string): FiscalYearClosure {
  return {
    id: "closure-1",
    fiscalYearId: "fy-2025",
    sourceDeclarationVersionId,
    stocks: { deficits: [], amortissementsReportes: 0 },
    computedAt: "2026-09-04T00:00:00.000Z",
    closedAt: "2026-09-04T00:00:00.000Z",
  };
}

async function mockSixPageCerfa(): Promise<Uint8Array> {
  const cerfa = await PDFDocument.create();
  const font = await cerfa.embedFont(StandardFonts.Helvetica);
  for (const marker of SIX_FORMS) {
    const page = cerfa.addPage([595.28, 841.89]);
    page.drawText(marker, { x: 40, y: 800, size: 12, font });
  }
  return cerfa.save();
}

describe("resolveArchivedLiasseDownload — gardes", () => {
  it("RFS absent → liasse indisponible, aucun ID inventé", () => {
    const result = resolveArchivedLiasseDownload({
      year: 2025,
      declarationDraft: {
        completedSteps: [],
        declaration: {
          id: "decl",
          fiscalYearId: "fy",
          currentVersionId: "version-presente",
          createdAt: "2026-01-01T00:00:00.000Z",
        },
      },
    });
    assert.equal(result.status, "unavailable");
    if (result.status !== "unavailable") throw new Error("unreachable");
    assert.equal(result.reason, "missing_rfs");
  });

  it("declarationVersionId absent → aucun appel Cerfa, pas d'ID inventé ni courant", () => {
    const rfs = { exercice: 2025 } as FiscalRepresentation;
    const result = resolveArchivedLiasseDownload({
      year: 2025,
      declarationDraft: { completedSteps: [], rfs },
    });
    assert.equal(result.status, "unavailable");
    if (result.status !== "unavailable") throw new Error("unreachable");
    assert.equal(result.reason, "missing_version_id");
    assert.equal(resolveArchivedDeclarationVersionId({ year: 2025, declarationDraft: { completedSteps: [], rfs } }), undefined);
  });

  it("priorité : currentVersionId du draft archivé, sinon sourceDeclarationVersionId de la closure", () => {
    const rfs = { exercice: 2025 } as FiscalRepresentation;
    const withDraftId = resolveArchivedLiasseDownload({
      year: 2025,
      closures: [closure("version-from-closure")],
      declarationDraft: {
        completedSteps: [],
        rfs,
        declaration: {
          id: "decl",
          fiscalYearId: "fy",
          currentVersionId: "version-from-draft",
          createdAt: "2026-01-01T00:00:00.000Z",
        },
      },
    });
    assert.equal(withDraftId.status, "ready");
    if (withDraftId.status !== "ready") throw new Error("unreachable");
    assert.equal(withDraftId.input.declarationVersionId, "version-from-draft");

    const fromClosureOnly = resolveArchivedLiasseDownload({
      year: 2025,
      closures: [closure("version-from-closure")],
      declarationDraft: { completedSteps: [], rfs },
    });
    assert.equal(fromClosureOnly.status, "ready");
    if (fromClosureOnly.status !== "ready") throw new Error("unreachable");
    assert.equal(fromClosureOnly.input.declarationVersionId, "version-from-closure");
  });

  /**
   * NEXT-5 — une archive n'est pas un byte figé (voir en-tête de fichier) :
   * sa liasse reste régénérée à la demande depuis le RFS historique, donc
   * soumise au même prédicat de déclarabilité qu'une génération courante
   * (final-declarability.ts). Fixture identique à celle qui déclenche
   * réellement la garde de divergence F-010/F-014 dans
   * final-declarability.test.ts (Case E) : logementAmortissement.plan
   * (totalAnnuelExercice 372) diverge de amortissementAssistant.totalDotations
   * (1500).
   */
  it("liasseRfs archivé avec divergence F-010/F-014 prouvée → indisponible, reason internal_projection_issue", () => {
    const draft: DeclarationDraft = {
      completedSteps: [],
      siret: "12345678901234",
      siren: "123456789",
      exploitantFirstName: "Marie",
      exploitantLastName: "Dupont",
      dateMiseEnService: "2020-01-01",
      revenusAssistant: { exerciceFiscal: 2025, totalRecettes: 9000 },
      chargesAssistant: { exerciceFiscal: 2025, totalDeductible: 2000, totalPreExploitation: 0 },
      amortissementAssistant: { exerciceFiscal: 2025, totalDotations: 1500, status: "validated" },
      logementAmortissement: {
        prixRevient: 125136,
        valeurTerrain: 17960,
        valeurBati: 107176,
        baseAmortissableBati: 107176,
        montantMobilier: 5400,
        dotationAnnuelle: 1500,
        dureeMoyenneAnnees: 30,
        prorataRatio: 1,
        plan: {
          lignes: [
            { label: "Gros œuvre", montant: 37186, dureeAnnees: 75, dotationExercice: 372, amortissementsCumules: 372, vnc: 36814 },
          ],
          totalAnnuelExercice: 372,
          totalBrut: 37186,
        },
        fieldSources: {},
        computedAt: "2026-08-31T00:00:00.000Z",
      },
      declaration: {
        id: "decl-2025",
        fiscalYearId: "fy-2025",
        currentVersionId: "version-archive-divergente",
        createdAt: "2026-01-01T00:00:00.000Z",
      },
    } as unknown as DeclarationDraft;

    const generation = runDeclarationGeneration(draft, 2025);
    assert.equal(generation.status, "generated", "précondition — dossier générable malgré la divergence");
    if (generation.status !== "generated") throw new Error("unreachable");
    assert.ok(
      generation.liasseRfs.form2033A.casesNonAlimentees.some((c) => c.caseId === "028" && c.categorie === "incoherence_modele"),
      "précondition — la divergence F-010/F-014 doit être réellement présente dans cette fixture",
    );

    const archivedDraft: DeclarationDraft = { ...draft, rfs: generation.rfs, liasseRfs: generation.liasseRfs };
    const result = resolveArchivedLiasseDownload({ year: 2025, declarationDraft: archivedDraft });

    assert.equal(result.status, "unavailable");
    if (result.status !== "unavailable") throw new Error("unreachable");
    assert.equal(result.reason, "internal_projection_issue");
  });

  it("liasseRfs absent sur l'archive (dossier antérieur à ce champ) → jamais bloqué par ce gate, fail-open", () => {
    const rfs = { exercice: 2025 } as FiscalRepresentation;
    const result = resolveArchivedLiasseDownload({
      year: 2025,
      declarationDraft: {
        completedSteps: [],
        rfs,
        declaration: {
          id: "decl",
          fiscalYearId: "fy",
          currentVersionId: "version-legacy",
          createdAt: "2026-01-01T00:00:00.000Z",
        },
        // liasseRfs volontairement absent — dossier archivé avant ce champ.
      },
    });
    assert.equal(result.status, "ready");
  });
});

describe("resolveArchivedLiasseDownload — isolation N-1 vs workspace N", () => {
  it("le handler de liasse historique utilise exclusivement les données A de l'archive", () => {
    const archive = generatedArchive(2025, 4242, {
      adresse: ADRESSE_A,
      pretId: PRET_A,
      versionId: VERSION_A,
      capitalInitial: 130751,
    });
    const workspaceN = generatedArchive(2026, 9999, {
      adresse: ADRESSE_B,
      pretId: PRET_B,
      versionId: VERSION_B,
      capitalInitial: 777000,
    });

    const resolved = resolveArchivedLiasseDownload(archive.record);
    assert.equal(resolved.status, "ready");
    if (resolved.status !== "ready") throw new Error("unreachable");

    assert.equal(resolved.input.rfs, archive.rfs);
    assert.notEqual(resolved.input.rfs, workspaceN.rfs);
    assert.equal(resolved.input.rfs.exercice, 2025);
    assert.equal(resolved.input.rfs.fiscalResult.recettes.total, 4242);
    assert.equal(resolved.input.declarationVersionId, VERSION_A);
    assert.equal(resolved.input.fiscalYear, 2025);
    assert.equal(resolved.input.extras?.bien?.adresse, ADRESSE_A);
    assert.equal(resolved.input.extras?.pretsDescriptifs?.[0]?.pretId, PRET_A);
    assert.equal(resolved.input.extras?.pretsDescriptifs?.[0]?.capitalInitial, 130751);
    assert.notEqual(resolved.input.extras?.bien?.adresse, ADRESSE_B);
    assert.notEqual(resolved.input.extras?.pretsDescriptifs?.[0]?.pretId, PRET_B);
    assert.equal(liasseFiscalePdfFileName(resolved.input.fiscalYear), "liasse-fiscale-lmnp-2025.pdf");

    const workspaceResolved = resolveArchivedLiasseDownload(workspaceN.record);
    assert.equal(workspaceResolved.status, "ready");
    if (workspaceResolved.status !== "ready") throw new Error("unreachable");
    assert.equal(workspaceResolved.input.rfs.exercice, 2026);
    assert.equal(workspaceResolved.input.extras?.bien?.adresse, ADRESSE_B);
  });

  it("n'importe aucun workspace / useLmnp / Dossier vivant", () => {
    const source = readFileSync(path.join(import.meta.dirname, "resolve-archived-liasse-download.ts"), "utf8");
    const code = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    assert.doesNotMatch(code, /useLmnp/);
    assert.doesNotMatch(code, /workspace\./);
    assert.doesNotMatch(code, /Dossier\.properties/);
    assert.doesNotMatch(code, /Dossier\.financements/);
  });
});

describe("liasse historique — documentaire A + régénération Cerfa (millésime actuel)", () => {
  it("assemble la liasse depuis l'archive A : pages documentaires A, pas les données B", async () => {
    const archive = generatedArchive(2025, 4242, {
      adresse: ADRESSE_A,
      pretId: PRET_A,
      versionId: VERSION_A,
      capitalInitial: 130751,
    });
    const workspaceN = generatedArchive(2026, 9999, {
      adresse: ADRESSE_B,
      pretId: PRET_B,
      versionId: VERSION_B,
      capitalInitial: 777000,
    });
    const resolved = resolveArchivedLiasseDownload(archive.record);
    assert.equal(resolved.status, "ready");
    if (resolved.status !== "ready") throw new Error("unreachable");

    const merged = await assembleLiasseFiscalePdf({
      rfs: resolved.input.rfs,
      extras: resolved.input.extras,
      cerfaPdfBytes: await mockSixPageCerfa(),
    });
    const extracted = await extractPdfPages(copyBytes(merged));
    const documentary = extracted.pages.slice(0, extracted.pageCount - 6).join(" ");

    assert.equal(extracted.pageCount - 6 >= 1, true);
    assert.ok(contains(extracted.pages[0] ?? "", LIASSE_DOSSIER_PDF_TITLE));
    assert.ok(contains(extracted.pages[0] ?? "", "Exercice 2025"));
    assert.ok(contains(documentary, ADRESSE_A));
    assert.ok(contains(documentary, "130 751") || contains(documentary, "130751"));
    assert.equal(contains(documentary, ADRESSE_B), false);
    assert.equal(contains(documentary, "777 000") || contains(documentary, "777000"), false);
    assert.ok(contains(documentary, "4 242") || contains(documentary, "4242"));
    assert.equal(contains(documentary, "9 999") || contains(documentary, "9999"), false);
    void workspaceN;
  });

  it("RFS historique + versionId historique → fetch Cerfa route actuelle → merge documentaire + 6 Cerfa", async () => {
    const archive = generatedArchive(2025, 4242, {
      adresse: ADRESSE_A,
      pretId: PRET_A,
      versionId: VERSION_A,
      capitalInitial: 130751,
    });
    const resolved = resolveArchivedLiasseDownload(archive.record);
    assert.equal(resolved.status, "ready");
    if (resolved.status !== "ready") throw new Error("unreachable");

    const payload = buildCerfaPdfRequestPayload(resolved.input.rfs, resolved.input.declarationVersionId);
    assert.equal(payload.rfs, archive.rfs);
    assert.equal(payload.declarationVersionId, VERSION_A);

    const response = await POST(
      new Request("http://localhost/api/lmnp/declaration/cerfa-pdf", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      }),
    );
    assert.equal(response.status, 200);
    const cerfaBytes = copyBytes(new Uint8Array(await response.arrayBuffer()));
    assert.equal((await PDFDocument.load(copyBytes(cerfaBytes))).getPageCount(), 6);
    const originalDrawn = await extractDrawnStringsForPage(copyBytes(cerfaBytes), 1);

    const merged = await assembleLiasseFiscalePdf({
      rfs: resolved.input.rfs,
      extras: resolved.input.extras,
      cerfaPdfBytes: cerfaBytes,
    });
    const extracted = await extractPdfPages(copyBytes(merged));
    const documentaryPageCount = extracted.pageCount - 6;
    assert.ok(isPdf(merged));
    assert.ok(documentaryPageCount >= 1);
    assert.ok(contains(extracted.pages[0] ?? "", LIASSE_DOSSIER_PDF_TITLE));
    assert.ok(contains(extracted.pages.join(" "), ADRESSE_A));
    assert.deepEqual(
      await extractDrawnStringsForPage(copyBytes(merged), documentaryPageCount + 1),
      originalDrawn,
      "première page Cerfa inchangée après fusion — régénération depuis RFS historique, millésime du moteur actuel",
    );
  });
});
