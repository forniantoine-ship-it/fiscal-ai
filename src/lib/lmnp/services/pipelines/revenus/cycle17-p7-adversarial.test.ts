import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { produceFiscalResult } from "@/runtime/capabilities/f006/produce-fiscal-result";
import {
  gridSummary,
  removeDocumentFromRevenueSession,
} from "@/lib/lmnp/services/revenue-gpt-ui-prefill";
import { buildRevenusAssistantFromSession } from "@/lib/lmnp/services/revenus-upload-to-assistant-bridge";
import { buildWorkbook, uploadSequentially, workbookToFile } from "./spreadsheet-revenue.fixtures";

/**
 * Cycle 17 — P7 : classeur adversarial final, couvrant simultanément tous les
 * scénarios des Cycles 15A/15B/16/17 — plusieurs actions d'upload séparées,
 * une ligne TOTAL parasite, toutes les natures de revenu (loyer, plateformes,
 * GLI/Visale, remboursement, dépôt, virement générique), un montant négatif,
 * deux transactions réelles identiques le même jour, un document réimporté à
 * l'identique, un document différent (nom de fichier) aux transactions
 * identiques, et la règle de caisse décembre N encaissé en janvier N+1.
 *
 * Invariant vérifié à chaque étape sur les 3 niveaux (gridSummary,
 * revenusAssistant, produceFiscalResult) : chaque euro légitime est compté
 * exactement une fois dans le bon exercice, ou explicitement exclu/annoté —
 * jamais disparu, décompté deux fois, inversé de signe ou d'exercice.
 *
 * C'est ce classeur qui a révélé, en cours de Cycle 17, qu'une colonne
 * "Remboursement" disparaissait silencieusement de l'extraction Excel/CSV
 * (FIELD_ALIASES.complement, spreadsheet-header-recognition.ts) — corrigé et
 * verrouillé séparément par spreadsheet-header-recognition.test.ts.
 */

const PROP = { id: "p1", label: "Bien", address: "1 rue", city: "Paris", postalCode: "75000" } as const;

const DOC_A_ROWS: (string | number)[][] = [
  ["Mois", "Date", "Loyer", "Airbnb", "Booking", "Abritel", "GLI", "Visale", "Remboursement", "Depot", "Virement"],
  ["Janvier", "05/01/2025", 1000, "", "", "", "", "", "", "", ""],
  ["Février", "05/02/2025", 1000, "", "", "", "", "", 50, "", ""],
  ["Mars", "05/03/2025", "", 300, 300, "", "", "", "", "", ""],
  ["Avril", "05/04/2025", "", "", "", 250, 500, "", "", "", ""],
  ["Mai", "05/05/2025", "", "", "", "", "", 400, "", 800, 200],
  ["Juin", "10/06/2025", "", 300, "", "", "", "", "", "", ""],
  ["Juin", "10/06/2025", "", 300, "", "", "", "", "", "", ""],
  ["Total", "", 2000, 900, 300, 250, 500, 400, 50, 800, 200],
  ["Décembre", "05/01/2026", 1000, "", "", "", "", "", "", "", ""],
];

const DOC_B_ROWS: (string | number)[][] = [
  ["Mois", "Date", "Airbnb", "GLI"],
  ["Août", "10/08/2025", 450, -150],
];

function assertAllLevels(session: any, fiscalYear: number, expected: number, label: string) {
  const grid = gridSummary(session).totalRevenue;
  const bridge = buildRevenusAssistantFromSession(session, fiscalYear, "2020-01-01");
  const { result } = produceFiscalResult({
    exerciceFiscal: fiscalYear,
    activite: { dateMiseEnService: "2020-01-01" },
    revenusAssistant: bridge.revenusAssistant,
    chargesAssistant: { exerciceFiscal: fiscalYear, totalDeductible: 0, totalPreExploitation: 0 },
    financementCharges: { exerciceFiscal: fiscalYear, totalChargesFinancementExercice: 0, totalInteretsPreExploitation: 0 },
    amortissementAssistant: { exerciceFiscal: fiscalYear, totalDotations: 0, status: "validated" },
    logementAmortissement: { computedAt: "2025-01-01T00:00:00.000Z" },
  });
  assert.equal(grid, expected, `${label} — grille (écran)`);
  assert.equal(bridge.revenusAssistant.totalRecettes, expected, `${label} — revenusAssistant`);
  assert.equal(result?.recettes.total, expected, `${label} — F-006`);
  return bridge;
}

describe("Cycle 17 — P7 : classeur adversarial final", () => {
  it("suit un euro à travers accumulation, dédup, régularisation négative et ligne TOTAL", async () => {
    const fileA = workbookToFile(buildWorkbook({ Feuil1: DOC_A_ROWS }), "export-annuel-2025.xlsx");
    const fileB = workbookToFile(buildWorkbook({ Feuil1: DOC_B_ROWS }), "aout-airbnb.xlsx");
    const fileC = workbookToFile(buildWorkbook({ Feuil1: DOC_A_ROWS }), "export-annuel-2025-DOUBLON-REEL.xlsx");

    // 1000+1000+50(remboursement)+300+300+250+500+400+300+300 = 4400
    // (ligne TOTAL exclue, Dépôt/Virement exclus, Décembre exclu — encaissé en 2026)
    let session = await uploadSequentially(undefined, fileA, 2025, "docA");
    assertAllLevels(session, 2025, 4400, "après A");

    // + 450 (Airbnb) - 150 (GLI négatif, jamais ignoré ni inversé) = 300 net
    session = await uploadSequentially(session, fileB, 2025, "docB");
    const bridgeAB = assertAllLevels(session, 2025, 4700, "après A+B");
    assert.ok(
      bridgeAB.anomalies.some((a) => a.message.includes("-150")),
      "le GLI négatif doit produire une anomalie explicite, jamais un silence",
    );

    // Réimport strict de A (action séparée, même contenu) : bloqué comme doublon.
    session = await uploadSequentially(session, fileA, 2025, "docA-bis");
    assertAllLevels(session, 2025, 4700, "après réimport strict de A");

    // Document C : nom de fichier différent, contenu identique à A → un vrai
    // second document, jamais dédupliqué (règle Cycle 15A/17 : le hash inclut
    // le nom de fichier, jamais date+montant seuls).
    session = await uploadSequentially(session, fileC, 2025, "docC");
    assertAllLevels(session, 2025, 4700 + 4400, "après A+B+C (C = A renommé)");

    // Suppression de C : retour exact à l'état après A+B.
    session = removeDocumentFromRevenueSession(session, "docC", 2025);
    assertAllLevels(session, 2025, 4700, "après suppression de C");

    // Réimport de C après suppression : jamais bloqué en doublon permanent.
    session = await uploadSequentially(session, fileC, 2025, "docC-bis");
    assertAllLevels(session, 2025, 4700 + 4400, "après réimport de C");
  });

  it("le loyer de décembre (encaissé le 05/01/2026) n'apparaît que dans l'exercice 2026 — jamais 2025", async () => {
    const fileA = workbookToFile(buildWorkbook({ Feuil1: DOC_A_ROWS }), "export-annuel-2025.xlsx");
    const session2026 = await uploadSequentially(undefined, fileA, 2026, "docA-vue-2026");
    assertAllLevels(session2026, 2026, 1000, "vue exercice 2026 du même document A");
  });
});
