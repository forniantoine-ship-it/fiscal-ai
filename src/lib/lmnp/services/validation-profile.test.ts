/**
 * Étape 7A — correctif routing Activité sur l'écran de validation.
 * Cycle 0 (F010) — correctif miroir pour Logement.
 * Run: npx tsx src/lib/lmnp/services/validation-profile.test.ts
 */
import {
  buildDossierSteps,
  buildFiscalSummary,
  buildMissingItems,
  buildValidationFiscalDisplay,
} from "./validation-profile";
import { LMNP_ROUTES } from "../routes";
import type { DeclarationDraft, FiscalEngineOutput } from "../types";

function assertEqual<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

function runTests(): void {
  let passed = 0;
  let total = 0;

  function test(name: string, fn: () => void): void {
    total++;
    try {
      fn();
      passed++;
      console.log(`  ✓ ${name}`);
    } catch (err) {
      console.error(`  ✗ ${name}`);
      console.error(`    ${err instanceof Error ? err.message : err}`);
    }
  }

  console.log("validation-profile.ts — Étape 7A");

  test("Activité incomplète → buildMissingItems() → href === LMNP_ROUTES.activite (ouvre F009, pas Tunnel A)", () => {
    const draft: DeclarationDraft = { completedSteps: [] };
    const steps = buildDossierSteps(draft);
    const missing = buildMissingItems(steps);
    const activite = missing.find((item) => item.id === "activite");
    if (!activite) throw new Error("item 'activite' introuvable dans buildMissingItems()");
    assertEqual(activite.href, LMNP_ROUTES.activite, "href");
    assertEqual(activite.href, "/assistants/activite", "href littéral");
  });

  test("Logement incomplet → buildMissingItems() → href === LMNP_ROUTES.logement (ouvre F010, pas Tunnel A)", () => {
    const draft: DeclarationDraft = { completedSteps: [] };
    const steps = buildDossierSteps(draft);
    const missing = buildMissingItems(steps);
    const logement = missing.find((item) => item.id === "logement");
    if (!logement) throw new Error("item 'logement' introuvable dans buildMissingItems()");
    assertEqual(logement.href, LMNP_ROUTES.logement, "href");
    assertEqual(logement.href, "/assistants/logement", "href littéral");
  });

  test("Cycle 22 — dossier vide : synthèse fiscale à 0, jamais 8 120 € inventés", () => {
    const summary = buildFiscalSummary({ completedSteps: [] }, [], 2025);
    assertEqual(summary.rentalIncome, 0, "revenus");
    assertEqual(summary.detectedCharges, 0, "charges");
    assertEqual(summary.calculatedAmortization, 0, "amortissements");
    assertEqual(summary.estimatedFiscalResult, 0, "résultat");
  });

  test("F-015 — revenus de synthèse = revenusAssistant.totalRecettes, pas l'extraction legacy vide", () => {
    const summary = buildFiscalSummary(
      {
        completedSteps: [],
        revenusConfirmedAt: "2026-08-31T00:00:00.000Z",
        revenusAssistant: {
          exerciceFiscal: 2026,
          totalRecettes: 12000,
          loyersEncaisses: 12000,
          indemnitesAssurance: 0,
          recettesPlateforme: 0,
          ajustementsJanDec: 0,
          moisLocationEffectifs: 12,
          fieldSources: {},
          computedAt: "2026-08-31T00:00:00.000Z",
        },
      } as DeclarationDraft,
      [],
      2026,
    );
    assertEqual(summary.rentalIncome, 12000, "revenus");
  });

  test("F-015 — charges de synthèse = chargesAssistant.totalDeductible, pas l'extraction legacy vide", () => {
    const summary = buildFiscalSummary(
      {
        completedSteps: [],
        chargesConfirmedAt: "2026-08-31T00:00:00.000Z",
        chargesAssistant: {
          exerciceFiscal: 2026,
          totalDeductible: 5000,
          totalNonDeductible: 0,
          totalAmortissable: 0,
          totalPreExploitation: 0,
          parCategorie: {},
          composantsNouveaux: [],
          fieldSources: {},
          computedAt: "2026-08-31T00:00:00.000Z",
        },
      } as DeclarationDraft,
      [],
      2026,
    );
    assertEqual(summary.detectedCharges, 5000, "charges");
  });

  test("F-015 — parcours /assistants/* pur (sans revenusExtraction/chargesExtraction) : synthèse fidèle à F-006, plus jamais 0 €", () => {
    const summary = buildFiscalSummary(
      {
        completedSteps: [],
        revenusAssistant: { exerciceFiscal: 2026, totalRecettes: 12000 } as DeclarationDraft["revenusAssistant"],
        chargesAssistant: {
          exerciceFiscal: 2026,
          totalDeductible: 5000,
          totalNonDeductible: 0,
          totalAmortissable: 0,
          totalPreExploitation: 0,
          parCategorie: {},
          composantsNouveaux: [],
          fieldSources: {},
          computedAt: "2026-08-31T00:00:00.000Z",
        },
        amortissementAssistant: {
          exerciceFiscal: 2026,
          totalDotations: 3000,
          status: "validated",
          planVersion: "v1",
          profil: "PROF-001",
          validatedAt: "2026-08-31T00:00:00.000Z",
        },
      } as DeclarationDraft,
      [],
      2026,
    );
    assertEqual(summary.rentalIncome, 12000, "revenus");
    assertEqual(summary.detectedCharges, 5000, "charges");
    assertEqual(summary.calculatedAmortization, 3000, "amortissements");
    assertEqual(summary.estimatedFiscalResult, 4000, "résultat estimé (12000-5000-3000)");
  });

  test("Cycle 24 — amortissements de synthèse = totalDotations F-014, pas la ventilation logement vide", () => {
    const summary = buildFiscalSummary(
      {
        completedSteps: [],
        amortissementConfirmedAt: "2026-08-30T20:00:00.000Z",
        amortissementAssistant: {
          exerciceFiscal: 2026,
          totalDotations: 6410,
          status: "validated",
          planVersion: "v1",
          profil: "PROF-001",
          validatedAt: "2026-08-30T20:00:00.000Z",
        },
      },
      [],
      2026,
    );
    assertEqual(summary.calculatedAmortization, 6410, "amortissements");
  });

  test("Cycle 22 — étape incomplète expose incompleteLabel, pas le libellé « validé »", () => {
    const steps = buildDossierSteps({ completedSteps: [] });
    const activite = steps.find((step) => step.id === "activite");
    if (!activite) throw new Error("étape activite introuvable");
    assertEqual(activite.status, "incomplete", "status");
    assertEqual(activite.incompleteLabel, "Activité à compléter", "incompleteLabel");
  });

  test("Crédit / Revenus / Charges / Amortissement incomplets → assistants, pas Tunnel A", () => {
    const draft: DeclarationDraft = { completedSteps: [] };
    const missing = buildMissingItems(buildDossierSteps(draft));
    const credit = missing.find((item) => item.id === "credit");
    const revenus = missing.find((item) => item.id === "revenus");
    const charges = missing.find((item) => item.id === "charges");
    const amortissement = missing.find((item) => item.id === "amortissement");
    if (!credit || !revenus || !charges || !amortissement) {
      throw new Error("items manquants dans buildMissingItems()");
    }
    assertEqual(credit.href, LMNP_ROUTES.financement, "credit href");
    assertEqual(revenus.href, LMNP_ROUTES.revenusAssistant, "revenus href");
    assertEqual(charges.href, LMNP_ROUTES.chargesAssistant, "charges href");
    assertEqual(amortissement.href, LMNP_ROUTES.amortissementsAssistant, "amortissement href");
  });

  function fiscalResult(overrides: Partial<FiscalEngineOutput> = {}): FiscalEngineOutput {
    return {
      exercice: 2026,
      resultatFiscal: 0,
      resultatAvantAmort: 0,
      totalRecettes: 0,
      totalCharges: 0,
      amortDeduct: 0,
      amortReporte: 0,
      deficitNouveau: 0,
      stocks: { deficits: [], amortissementsReportes: 0, deficitsExpires: [] },
      trace: { ksArtifacts: [], computedAt: "2026-08-31T00:00:00.000Z", journal: [] },
      computedAt: "2026-08-31T00:00:00.000Z",
      ...overrides,
    };
  }

  const FALLBACK_SUMMARY = { rentalIncome: 0, detectedCharges: 0, calculatedAmortization: 0, estimatedFiscalResult: 0 };

  test("Cycle 24 — buildValidationFiscalDisplay() sans FiscalResult : repli sur l'estimation, exact=false", () => {
    const display = buildValidationFiscalDisplay(undefined, {
      rentalIncome: 9000,
      detectedCharges: 2000,
      calculatedAmortization: 1500,
      estimatedFiscalResult: 5500,
    });
    assertEqual(display.exact, false, "exact");
    const resultat = display.rows.find((r) => r.key === "resultat");
    if (!resultat) throw new Error("ligne 'resultat' introuvable");
    assertEqual(resultat.label, "Résultat fiscal estimé", "label du repli");
    assertEqual(resultat.value, 5500, "valeur du repli");
  });

  test("Cycle 24 — buildValidationFiscalDisplay() avec un FiscalResult bénéficiaire : exact=true, résultat = resultatFiscal", () => {
    const display = buildValidationFiscalDisplay(
      fiscalResult({ totalRecettes: 9000, totalCharges: 2000, amortDeduct: 1500, amortReporte: 0, resultatFiscal: 5500 }),
      FALLBACK_SUMMARY,
    );
    assertEqual(display.exact, true, "exact");
    const resultat = display.rows.find((r) => r.key === "resultat");
    if (!resultat) throw new Error("ligne 'resultat' introuvable");
    assertEqual(resultat.label, "Résultat fiscal", "label — jamais 'estimé' quand le vrai FiscalResult est disponible");
    assertEqual(resultat.value, 5500, "valeur exacte issue de FiscalResult.resultatFiscal");
  });

  test("Cycle 24 — buildValidationFiscalDisplay() en déficit : la ligne 'résultat' bascule sur deficitNouveau, jamais un resultatFiscal négatif inventé", () => {
    const display = buildValidationFiscalDisplay(
      fiscalResult({
        totalRecettes: 5100,
        totalCharges: 14962,
        amortDeduct: 0,
        amortReporte: 3720,
        resultatFiscal: 0,
        deficitNouveau: 9862,
      }),
      FALLBACK_SUMMARY,
    );
    const resultat = display.rows.find((r) => r.key === "resultat");
    if (!resultat) throw new Error("ligne 'resultat' introuvable");
    assertEqual(resultat.label, "Déficit fiscal", "label en cas de déficit");
    assertEqual(resultat.value, 9862, "montant du déficit, pas resultatFiscal (0)");
    const amortReporte = display.rows.find((r) => r.key === "amortReporte");
    if (!amortReporte) throw new Error("ligne 'amortReporte' introuvable");
    assertEqual(amortReporte.value, 3720, "amortissement intégralement reporté (art. 39C), visible séparément");
  });

  // P0-3b — même correction que build-client-summary-document.ts : sans la
  // ligne "Charges déductibles de pré-exploitation", l'écran de validation
  // laissait croire que Recettes − "Charges déductibles" (exercice seul)
  // menait au résultat final, alors que fiscalResult.chargesPreExploitation
  // (A+B+C, transport pur via FiscalEngineOutput.chargesPreExploitation,
  // P0-3b) est aussi déduit dans resultatAvantAmort/resultatFiscal.

  test("P0-3b — pré-exploitation = 1000 : la ligne est présente et vaut exactement 1000", () => {
    const display = buildValidationFiscalDisplay(
      fiscalResult({ totalRecettes: 10000, totalCharges: 2000, chargesPreExploitation: 1000, amortDeduct: 3000, resultatFiscal: 4000 }),
      FALLBACK_SUMMARY,
    );
    const ligne = display.rows.find((r) => r.key === "chargesPreExploitation");
    if (!ligne) throw new Error("ligne 'chargesPreExploitation' introuvable");
    assertEqual(ligne.label, "Charges déductibles de pré-exploitation", "label");
    assertEqual(ligne.value, 1000, "restitution directe, jamais recalculée");
  });

  test("P0-3b — même dossier : les lignes s'enchaînent dans le bon ordre (exercice puis pré-exploitation)", () => {
    const display = buildValidationFiscalDisplay(
      fiscalResult({ totalRecettes: 10000, totalCharges: 2000, chargesPreExploitation: 1000, amortDeduct: 3000, resultatFiscal: 4000 }),
      FALLBACK_SUMMARY,
    );
    const iCharges = display.rows.findIndex((r) => r.key === "charges");
    const iPreExploitation = display.rows.findIndex((r) => r.key === "chargesPreExploitation");
    const iAmortDeduct = display.rows.findIndex((r) => r.key === "amortDeduct");
    assertEqual(display.rows[iCharges]?.label, "Charges déductibles de l'exercice", "label renommé");
    if (iPreExploitation < 0) throw new Error("ligne 'chargesPreExploitation' introuvable");
    assertEqual(iCharges < iPreExploitation, true, "ordre : charges exercice avant pré-exploitation");
    assertEqual(iPreExploitation < iAmortDeduct, true, "ordre : pré-exploitation avant amortissement déduit");
  });

  test("P0-3b — zéro pré-exploitation (absent) : la ligne est absente, comportement strictement identique à avant", () => {
    const display = buildValidationFiscalDisplay(
      fiscalResult({ totalRecettes: 9000, totalCharges: 2000, amortDeduct: 1500, resultatFiscal: 5500 }),
      FALLBACK_SUMMARY,
    );
    const ligne = display.rows.find((r) => r.key === "chargesPreExploitation");
    assertEqual(ligne, undefined, "aucune ligne inventée quand chargesPreExploitation est absent/0");
  });

  test("P0-3b — aucune modification du résultat fiscal source : resultatFiscal reste une restitution directe", () => {
    const display = buildValidationFiscalDisplay(
      fiscalResult({ totalRecettes: 10000, totalCharges: 2000, chargesPreExploitation: 1000, amortDeduct: 3000, resultatFiscal: 4000 }),
      FALLBACK_SUMMARY,
    );
    const resultat = display.rows.find((r) => r.key === "resultat");
    if (!resultat) throw new Error("ligne 'resultat' introuvable");
    assertEqual(resultat.value, 4000, "jamais recalculé — transport pur de fiscalResult.resultatFiscal");
  });

  // ---------------------------------------------------------------------
  // P0-2b (audit "périmètre fiscal / documentaire", défaut D2) —
  // isChargesComplete() doit refléter chargesAssistant (le seul champ lu
  // par produceFiscalResult()/validateFiscalInputs()), jamais
  // chargesConfirmedAt seul (posé aussi par le chemin legacy
  // ChargesDocumentStep.tsx / CONFIRM_CHARGES, qui n'écrit jamais
  // chargesAssistant).
  // ---------------------------------------------------------------------
  test("D2 — chargesConfirmedAt présent, chargesAssistant absent (legacy) → Charges NON complètes", () => {
    const draft: DeclarationDraft = {
      completedSteps: [],
      chargesConfirmedAt: "2026-08-31T00:00:00.000Z",
    };
    const steps = buildDossierSteps(draft);
    const charges = steps.find((s) => s.id === "charges");
    if (!charges) throw new Error("step 'charges' introuvable dans buildDossierSteps()");
    assertEqual(charges.status, "incomplete", "chargesConfirmedAt seul ne doit plus suffire");
  });

  test("D2 — chargesAssistant présent (et valide) → Charges complètes", () => {
    const draft: DeclarationDraft = {
      completedSteps: [],
      chargesConfirmedAt: "2026-08-31T00:00:00.000Z",
      chargesAssistant: {
        exerciceFiscal: 2025,
        totalDeductible: 2000,
        totalPreExploitation: 0,
      },
    } as DeclarationDraft;
    const steps = buildDossierSteps(draft);
    const charges = steps.find((s) => s.id === "charges");
    if (!charges) throw new Error("step 'charges' introuvable dans buildDossierSteps()");
    assertEqual(charges.status, "complete", "chargesAssistant présent doit suffire");
  });

  test("D2 — chargesAssistant absent (même sans chargesConfirmedAt) → Charges NON complètes, jamais 'prêt' sur ce seul flag", () => {
    const draft: DeclarationDraft = { completedSteps: [] };
    const steps = buildDossierSteps(draft);
    const charges = steps.find((s) => s.id === "charges");
    if (!charges) throw new Error("step 'charges' introuvable dans buildDossierSteps()");
    assertEqual(charges.status, "incomplete", "aucun signal de complétude sans chargesAssistant");
  });

  console.log(`\n${passed}/${total} tests passés`);
  if (passed !== total) process.exit(1);
}

runTests();
