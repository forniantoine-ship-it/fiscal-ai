/**
 * Étape 5 — UX exercice actif : exactement deux téléchargements fiscaux client.
 *
 * Pas de jsdom : inspection source, comme les tests UX F011/F012.
 * Run: npx tsx --test src/components/lmnp/declaration/DeclarationReadyView.ux.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "path";

const source = readFileSync(
  path.join(path.dirname(fileURLToPath(import.meta.url)), "DeclarationReadyView.tsx"),
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

describe("DeclarationReadyView — deux documents fiscaux client", () => {
  it("expose le bouton d'aide 2042-C-PRO", () => {
    assert.equal(countLiteral(source, AIDE_BUTTON), 1);
  });

  it("expose le bouton de liasse fiscale", () => {
    assert.equal(countLiteral(source, LIASSE_BUTTON), 1);
  });

  it("le bouton liasse appelle downloadLiasseFiscalePdf, pas le Cerfa seul", () => {
    assert.ok(source.includes('from "@/lib/lmnp/services/declaration/download-liasse-fiscale-pdf"'));
    assert.ok(source.includes("onClick={handleDownloadLiasseFiscale}"));
    assert.ok(source.includes("await downloadLiasseFiscalePdf("));
    assert.ok(source.includes("const handleDownloadLiasseFiscale"));
    assert.equal(source.includes("downloadOfficialCerfaPdf"), false);
    assert.equal(source.includes('from "@/lib/lmnp/services/declaration/download-cerfa-pdf"'), false);
  });

  it("n'expose plus « Télécharger ma synthèse fiscale »", () => {
    assert.equal(source.includes("Télécharger ma synthèse fiscale"), false);
    assert.equal(source.includes("downloadClientSummaryPdf"), false);
  });

  it("n'expose plus « Télécharger le PDF officiel »", () => {
    assert.equal(source.includes("Télécharger le PDF officiel"), false);
  });

  it("n'expose plus les dumps texte (.txt / liasse / formulaires complémentaires)", () => {
    assert.equal(source.includes("Télécharger la liasse\n"), false);
    assert.equal(source.includes(">Télécharger la liasse<"), false);
    assert.equal(/\bTélécharger la liasse\b/.test(source), false);
    assert.equal(source.includes("Télécharger les formulaires complémentaires"), false);
    assert.equal(source.includes("downloadLiasseDocument"), false);
    assert.equal(source.includes("downloadLiasseRfsDocument"), false);
    assert.equal(source.includes('from "@/lib/lmnp/services/declaration/export-liasse-document"'), false);
    assert.equal(source.includes('.txt"'), false);
  });

  it("n'expose aucun troisième téléchargement fiscal client", () => {
    assert.equal(countLiteral(source, AIDE_BUTTON), 1);
    assert.equal(countLiteral(source, LIASSE_BUTTON), 1);
    assert.equal(countLiteral(source, "Télécharger "), 2);
  });

  it("l'aide 2042-C-PRO reste branchée sur son chemin existant", () => {
    // Payment V1 — le PDF est produit par le serveur (exercice payé requis), plus rendu dans le navigateur.
    assert.ok(source.includes('from "@/lib/lmnp/services/declaration/download-aide-2042-pdf"'));
    assert.ok(
      source.includes("downloadAide2042Pdf({ rfs, activityStartDate, fiscalYear: fiscalYear.year })"),
    );
    assert.equal(source.includes("render-aide-2042-pdf"), false);
    assert.equal(source.includes("buildClientSummaryDocument"), false);
    assert.equal(source.includes("render-client-summary-pdf"), false);
  });

  /**
   * NEXT-5B — les deux téléchargements doivent dépendre du même prédicat de
   * déclarabilité (final-declarability.ts), jamais l'un bloqué et l'autre
   * livré depuis la même projection incomplète.
   */
  it("les deux téléchargements dépendent de resolveFinalDeclarabilityState()", () => {
    assert.ok(source.includes('from "@/lib/lmnp/services/declaration/final-declarability"'));
    assert.ok(source.includes("const declarability = resolveFinalDeclarabilityState("));
  });

  it("le bouton liasse est désactivé quand declarability.deliverable est faux", () => {
    assert.ok(source.includes("const canDownloadLiasse = Boolean("));
    const canDownloadLiasseBlock = source.slice(
      source.indexOf("const canDownloadLiasse = Boolean("),
      source.indexOf(");", source.indexOf("const canDownloadLiasse = Boolean(")),
    );
    assert.ok(
      canDownloadLiasseBlock.includes("declarability.deliverable"),
      "canDownloadLiasse doit référencer declarability.deliverable dans la même expression",
    );
  });

  it("le bouton aide 2042-C-PRO est désactivé quand declarability.deliverable est faux", () => {
    const aideButtonIndex = source.indexOf(AIDE_BUTTON);
    const aideBlockStart = source.lastIndexOf("<Button", aideButtonIndex);
    const aideBlock = source.slice(aideBlockStart, aideButtonIndex);
    assert.ok(
      aideBlock.includes("!declarability.deliverable"),
      "le bouton d'aide 2042-C-PRO doit être désactivé par !declarability.deliverable",
    );
  });
});
