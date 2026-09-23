/**
 * Lot 5.6-A — liasse réelle GEFFROY FRERES (2033-A/B/C/D/E/F/G, texte natif).
 * Run: npx tsx --test src/lib/lmnp/services/takeover/lot56a-geffroy-liasse-real-pdf.test.ts
 *
 * Bytes PDF réels, lecture native uniquement (aucun réseau, aucun modèle vision).
 * Oracle établi indépendamment du pipeline avant toute exécution (cf. rapport
 * de mission "GEFFROY — REAL CLIENT END-TO-END TAKEOVER") :
 *   2033A/028 = 52345, 2033A/030 = 37204, 2033C/496 = 52345, 2033C/576 = 37204.
 *
 * Ce document réel a révélé deux anomalies d'extraction :
 *  A — le vrai formulaire 2033-C imprime « DGFiP N° 2033-C2024 » (millésime
 *      collé, sans le token « -SD »), contrairement au Cerfa officiel vierge
 *      qui imprime « 2033-C-SD ». identifyTaxPackageLiasseForm ne reconnaissait
 *      que la forme « -SD » → 2033-C jamais identifié → 496/576 document_absent
 *      alors que les valeurs sont lisibles.
 *  B — la ligne physique de la case 030 (« Immobilisations corporelles* 028
 *      52 345 030 37 204 15 141 22 005 ») contient DEUX colonnes supplémentaires
 *      (Net / Net N-1) sans numéro de case Cerfa pour les borner : la fenêtre de
 *      proximité après 030 capte 3 montants confiants (37 204 / 15 141 / 22 005)
 *      et reste extraction_impossible — fail closed, comportement attendu et
 *      volontairement NON changé dans ce lot (aucune heuristique de position de
 *      colonne fiable sans nouvelle architecture — cf. rapport de mission).
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

import { isCandidatePresent } from "./candidate-value";
import { extractNativeTaxPackageControlFactsFromPdf } from "./extract-native-tax-package-from-pdf";
import { reconcileHistoricalTaxPackageControls } from "./reconcile-historical-tax-package-controls";
import {
  extractTaxPackageLiassePrintedFormYear,
  identifyTaxPackageLiasseForm,
} from "./extract-tax-package-liasse-observations";

const GEFFROY_LIASSE_PDF_PATH =
  "/Users/forniantoine/Desktop/liasse fec aide/reprise fiscale test/dossier sans titre/goeffrois liasses good.pdf";

function loadGeffroyLiasseFile(): File {
  const bytes = readFileSync(GEFFROY_LIASSE_PDF_PATH);
  const copy = Uint8Array.from(bytes);
  return new File([copy], path.basename(GEFFROY_LIASSE_PDF_PATH), {
    type: "application/pdf",
  });
}

describe("Lot 5.6-A — identification 2033-C sans -SD (générique, non spécifique GEFFROY)", () => {
  it("reconnaît la variante Cerfa réelle « lettre + millésime collé, sans -SD »", () => {
    assert.equal(identifyTaxPackageLiasseForm("DGFiP N° 2033-C2024 tableau"), "2033C");
    assert.equal(
      extractTaxPackageLiassePrintedFormYear("DGFiP N° 2033-C2024 tableau", "2033C"),
      2024,
    );
  });

  it("continue de reconnaître la forme officielle -SD (non régressé)", () => {
    assert.equal(identifyTaxPackageLiasseForm("N° 2033-C-SD tableau"), "2033C");
    assert.equal(
      extractTaxPackageLiassePrintedFormYear("N° 2033-C-SD 2024 tableau", "2033C"),
      2024,
    );
  });

  it("une mention narrative sans millésime adjacent reste non identifiée", () => {
    assert.equal(identifyTaxPackageLiasseForm("N° 2033-C tableau"), null);
    assert.equal(
      identifyTaxPackageLiasseForm("Merci de nous renvoyer votre 2033-C signée."),
      null,
    );
  });
});

describe("Lot 5.6-A — liasse réelle GEFFROY : 028/496 extraits, 030/576 fail closed", () => {
  it("extrait 028 (2033A) et 496 (2033C) sur le vrai document, jamais 030 par excès de confiance", async () => {
    const file = loadGeffroyLiasseFile();

    const result = await extractNativeTaxPackageControlFactsFromPdf({
      file,
      documentId: "doc-geffroy-liasse-2023",
      formYear: 2024,
      fiscalYear: 2023,
      packageId: "pkg-geffroy-liasse-2023",
    });

    assert.equal(result.status, "extracted");
    if (result.status !== "extracted") return;

    assert.ok(result.identifiedForms.includes("2033A"));
    assert.ok(
      result.identifiedForms.includes("2033C"),
      "2033-C doit être identifié même sans le token -SD sur ce document réel",
    );

    const factByCase = (formType: "2033A" | "2033C", sourceCase: string) =>
      result.package.facts.find(
        (fact) => fact.formType === formType && fact.sourceCase === sourceCase,
      );

    const case028 = factByCase("2033A", "028");
    assert.ok(case028, "028 doit être un fait extrait");
    assert.ok(isCandidatePresent(case028!.value));
    assert.equal(case028!.value.value, 52345);

    const case496 = factByCase("2033C", "496");
    assert.ok(case496, "496 doit être un fait extrait — plus document_absent");
    assert.ok(
      isCandidatePresent(case496!.value),
      "496 doit être present sur ce document réel (valeur lisible : 52 345)",
    );
    assert.equal(case496!.value.value, 52345);

    const case576 = factByCase("2033C", "576");
    assert.ok(case576, "576 doit être un fait extrait — plus document_absent");
    assert.ok(
      isCandidatePresent(case576!.value),
      "576 doit être present sur ce document réel (valeur lisible : 37 204)",
    );
    assert.equal(case576!.value.value, 37204);

    // 030 reste fail closed : ligne physique avec 2 colonnes non casées
    // (Net / Net N-1) qui rendent l'association case→montant non démontrable.
    // Documenté comme limite connue, pas comme bug — voir docstring du fichier.
    const case030 = factByCase("2033A", "030");
    assert.ok(case030);
    assert.equal(
      isCandidatePresent(case030!.value),
      false,
      "030 doit rester extraction_impossible : aucune heuristique de valeur par défaut introduite",
    );

    const reconciliation = reconcileHistoricalTaxPackageControls({
      packageId: result.package.packageId,
      facts: result.package.facts,
    });

    assert.equal(
      reconciliation.totalGross.status,
      "concordant",
      "028 (52345) ↔ 496 (52345) doivent désormais se réconcilier réellement",
    );
    // 030 reste extraction_impossible → le contrôle 030↔576 ne peut pas être
    // concordant ; il reste not_comparable (comportement 4E inchangé, non modifié
    // dans ce lot).
    assert.equal(reconciliation.totalCumulativeDepreciation.status, "not_comparable");
  });
});
