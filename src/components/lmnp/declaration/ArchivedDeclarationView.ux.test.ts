/**
 * Étape 6B — UX exercices archivés : exactement deux téléchargements client,
 * exclusivement depuis le record historique.
 *
 * Pas de jsdom : inspection source. Isolation N-1 vs N : voir
 * resolve-archived-liasse-download.test.ts
 *
 * Run: npx tsx --test src/components/lmnp/declaration/ArchivedDeclarationView.ux.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "path";

const viewSource = readFileSync(
  path.join(path.dirname(fileURLToPath(import.meta.url)), "ArchivedDeclarationView.tsx"),
  "utf-8",
);

const pageSource = readFileSync(
  path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    "../../../app/(dashboard)/declarations/[fiscalYearId]/ArchivedDeclarationPageClient.tsx",
  ),
  "utf-8",
);

const resolverSource = readFileSync(
  path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    "../../../lib/lmnp/services/declaration/resolve-archived-liasse-download.ts",
  ),
  "utf-8",
);

const AIDE_BUTTON = "Télécharger mon aide pour la déclaration 2042-C-PRO";
const LIASSE_BUTTON = "Télécharger ma liasse fiscale";

function countLiteral(haystack: string, needle: string): number {
  let count = 0;
  let from = 0;
  while (from < haystack.length) {
    const at = haystack.indexOf(needle, from);
    if (at < 0) break;
    count += 1;
    from = at + needle.length;
  }
  return count;
}

describe("ArchivedDeclarationView — deux documents fiscaux historiques", () => {
  it("expose exactement deux téléchargements client", () => {
    assert.equal(countLiteral(viewSource, AIDE_BUTTON), 1);
    assert.equal(countLiteral(viewSource, LIASSE_BUTTON), 1);
    assert.equal(countLiteral(viewSource, "Télécharger "), 2);
  });

  it("expose l'aide 2042-C-PRO branchée sur le RFS et activityStartDate archivés", () => {
    assert.ok(viewSource.includes(AIDE_BUTTON));
    assert.ok(viewSource.includes('from "@/lib/lmnp/services/declaration/render-aide-2042-pdf"'));
    assert.ok(
      viewSource.includes("downloadAide2042Pdf(buildClientSummaryDocument(rfs, { activityStartDate }))"),
    );
    assert.ok(viewSource.includes("const archivedDraft = record.declarationDraft"));
    assert.ok(viewSource.includes("const rfs = archivedDraft?.rfs"));
    assert.ok(viewSource.includes("const activityStartDate = archivedDraft?.activityStartDate"));
  });

  it("expose la liasse fiscale via resolveArchivedLiasseDownload + downloadLiasseFiscalePdf", () => {
    assert.ok(viewSource.includes(LIASSE_BUTTON));
    assert.ok(viewSource.includes("resolveArchivedLiasseDownload(record)"));
    assert.ok(viewSource.includes("await downloadLiasseFiscalePdf(resolved.input)"));
    assert.equal(viewSource.includes("downloadOfficialCerfaPdf"), false);
  });

  it("n'expose plus la synthèse fiscale, le Cerfa seul, ni les dumps .txt", () => {
    assert.equal(viewSource.includes("Télécharger ma synthèse fiscale"), false);
    assert.equal(viewSource.includes("downloadClientSummaryPdf"), false);
    assert.equal(viewSource.includes("Télécharger le PDF officiel"), false);
    assert.equal(viewSource.includes("Télécharger les formulaires complémentaires"), false);
    assert.equal(/\bTélécharger la liasse\b/.test(viewSource), false);
    assert.equal(viewSource.includes("downloadLiasseDocument"), false);
    assert.equal(viewSource.includes("downloadLiasseRfsDocument"), false);
    assert.equal(viewSource.includes('.txt"'), false);
  });

  it("n'importe jamais useLmnp ni le workspace courant", () => {
    const viewCode = viewSource.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    const pageCode = pageSource.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    assert.equal(viewCode.includes("useLmnp"), false);
    assert.equal(viewCode.includes("workspace.declarationDraft"), false);
    assert.equal(viewCode.includes("workspace.fiscalYear"), false);
    assert.equal(viewCode.includes("workspace.properties"), false);
    assert.equal(viewCode.includes("Dossier.properties"), false);
    assert.equal(viewCode.includes("Dossier.financements"), false);
    assert.equal(pageCode.includes("useLmnp"), false);
    assert.ok(pageSource.includes("<ArchivedDeclarationView record={state.record} />"));
  });

  it("les extras et le versionId viennent du record historique, sans ID inventé", () => {
    assert.ok(resolverSource.includes("collectLiasseDossierExtras({"));
    assert.ok(resolverSource.includes("declarationDraft: archivedDraft"));
    assert.ok(resolverSource.includes("fiscalYear: record"));
    assert.ok(resolverSource.includes("declaration?.currentVersionId"));
    assert.ok(resolverSource.includes("latestClosure(record)?.sourceDeclarationVersionId"));
    assert.ok(resolverSource.includes('reason: "missing_rfs"'));
    assert.ok(resolverSource.includes('reason: "missing_version_id"'));
    assert.equal(resolverSource.includes("useLmnp"), false);
    assert.equal(resolverSource.includes("workspace."), false);
  });

  it("si la liasse est indisponible, le bouton est désactivé sans faux PDF", () => {
    assert.ok(viewSource.includes("Liasse fiscale indisponible pour cet exercice."));
    assert.ok(viewSource.includes("disabled={liasseDownloading || !canDownloadLiasse}"));
    assert.ok(viewSource.includes("if (liasseDownloading || resolved.status !== \"ready\") return"));
  });

  /**
   * NEXT-5B — l'archive n'est pas un byte figé (voir en-tête de fichier de
   * resolve-archived-liasse-download.ts) : sa liasse reste régénérée à la
   * demande, donc soumise au même prédicat de déclarabilité que l'exercice
   * actif. Les deux téléchargements doivent en dépendre.
   */
  it("resolveArchivedLiasseDownload() bloque sur resolveFinalDeclarabilityState(), pas seulement rfs/versionId", () => {
    assert.ok(resolverSource.includes('from "./final-declarability"'));
    assert.ok(resolverSource.includes("resolveFinalDeclarabilityState(archivedDraft?.liasseRfs)"));
    assert.ok(resolverSource.includes('reason: "internal_projection_issue"'));
  });

  it("le bouton aide 2042-C-PRO archivé est désactivé quand declarability.deliverable est faux", () => {
    assert.ok(viewSource.includes('from "@/lib/lmnp/services/declaration/final-declarability"'));
    assert.ok(viewSource.includes("const declarability = resolveFinalDeclarabilityState("));
    const aideButtonIndex = viewSource.indexOf(AIDE_BUTTON);
    const aideBlockStart = viewSource.lastIndexOf("<Button", aideButtonIndex);
    const aideBlock = viewSource.slice(aideBlockStart, aideButtonIndex);
    assert.ok(
      aideBlock.includes("!declarability.deliverable"),
      "le bouton d'aide 2042-C-PRO archivé doit être désactivé par !declarability.deliverable",
    );
  });
});
