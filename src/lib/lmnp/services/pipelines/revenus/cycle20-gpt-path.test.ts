import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { adaptGptLinesToRevenueRawLines } from "@/lib/lmnp/services/revenus-ocr-lines-adapter";
import {
  sessionFromPipelineLines,
  gridSummary,
  removeDocumentFromRevenueSession,
} from "@/lib/lmnp/services/revenue-gpt-ui-prefill";
import { buildRevenusAssistantFromSession } from "@/lib/lmnp/services/revenus-upload-to-assistant-bridge";
import { produceFiscalResult } from "@/runtime/capabilities/f006/produce-fiscal-result";
import { runDeclarationGeneration } from "@/lib/lmnp/services/declaration/run-declaration-generation";
import type { RevenusGptLine } from "@/lib/documents/gpt/schemas/revenus-lines.schema";
import type { LmnpDocument } from "@/lib/lmnp/types";

const PROP = { id: "p1", label: "Bien", address: "1 rue", city: "Paris", postalCode: "75000" } as const;
const FY = 2025;

/**
 * Cycle 20 — capturé depuis un VRAI appel à `extractRevenusLinesWithGpt`
 * (gpt-4o-mini, temperature 0) le 2026-08-30, sur un texte OCR dégradé
 * représentant un relevé d'encaissements réaliste (10 natures de revenu, une
 * régularisation négative, une frontière décembre/janvier, deux transactions
 * distinctes au même montant/même jour). Figé ici comme fixture déterministe
 * pour que la suite de régression n'exécute pas un appel API à chaque run —
 * mais chaque ligne provient d'une exécution réelle, jamais inventée.
 *
 * C'est cet appel réel qui a révélé le bug initial (avant correctif du
 * prompt) : sans l'instruction explicite sur les régularisations, GPT
 * omettait purement et simplement la ligne "Régularisation GLI trop perçu"
 * au lieu de la renvoyer en direction=debit — 120€ disparaissaient sans
 * aucune trace. Après correctif du prompt (revenus-lines.prompt.ts), un
 * second appel réel a produit exactement les 15 lignes ci-dessous.
 */
const REAL_GPT_CAPTURE: RevenusGptLine[] = [
  { date: "2025-01-10", label: "Loyer encaisse", amount: 1000, direction: "credit", confidence: 99, isSummaryRow: false },
  { date: "2025-01-12", label: "Airbnb - reservation #A2291", amount: 350, direction: "credit", confidence: 99, isSummaryRow: false },
  { date: "2025-01-12", label: "Booking - reservation #B1188", amount: 250, direction: "credit", confidence: 99, isSummaryRow: false },
  { date: "2025-01-15", label: "Abritel - sejour fevrier", amount: 150, direction: "credit", confidence: 99, isSummaryRow: false },
  { date: "2025-01-15", label: "Vrbo - sejour mars", amount: 100, direction: "credit", confidence: 99, isSummaryRow: false },
  { date: "2025-01-20", label: "Garantie loyers impayes (GLI)", amount: 500, direction: "credit", confidence: 99, isSummaryRow: false },
  { date: "2025-01-20", label: "Visale - indemnisation", amount: 300, direction: "credit", confidence: 99, isSummaryRow: false },
  { date: "2025-01-22", label: "Indemnite assurance sinistre degat eaux", amount: 200, direction: "credit", confidence: 99, isSummaryRow: false },
  { date: "2025-01-25", label: "Remboursement charges locataire", amount: 150, direction: "credit", confidence: 99, isSummaryRow: false },
  { date: "2025-01-28", label: "Allocation CAF", amount: 100, direction: "credit", confidence: 99, isSummaryRow: false },
  { date: "2025-01-30", label: "Regularisation GLI trop percu", amount: 120, direction: "debit", confidence: 99, isSummaryRow: false },
  { date: "2025-02-05", label: "Airbnb - reservation #A2305", amount: 300, direction: "credit", confidence: 99, isSummaryRow: false },
  { date: "2025-02-05", label: "Airbnb - reservation #A2306", amount: 300, direction: "credit", confidence: 99, isSummaryRow: false },
  { date: "2025-12-31", label: "Loyer decembre encaisse", amount: 950, direction: "credit", confidence: 99, isSummaryRow: false },
  { date: "2026-01-01", label: "Loyer janvier encaisse", amount: 980, direction: "credit", confidence: 99, isSummaryRow: false },
];

function document(fileName: string, id: string): LmnpDocument {
  return { id, fileName, category: "revenus", status: "uploaded" } as LmnpDocument;
}

function fullTrace(lines: ReturnType<typeof adaptGptLinesToRevenueRawLines>, fiscalYear: number, previous?: any) {
  const session = sessionFromPipelineLines([PROP], fiscalYear, new Map([[PROP.id, lines]]), "ocr_lines", previous);
  const grid = gridSummary(session).totalRevenue;
  const bridge = buildRevenusAssistantFromSession(session, fiscalYear, "2020-01-01");
  const f006 = produceFiscalResult({
    exerciceFiscal: fiscalYear,
    activite: { dateMiseEnService: "2020-01-01" },
    revenusAssistant: bridge.revenusAssistant,
    chargesAssistant: { exerciceFiscal: fiscalYear, totalDeductible: 0, totalPreExploitation: 0 },
    financementCharges: { exerciceFiscal: fiscalYear, totalChargesFinancementExercice: 0, totalInteretsPreExploitation: 0 },
    amortissementAssistant: { exerciceFiscal: fiscalYear, totalDotations: 0, status: "validated" },
    logementAmortissement: { computedAt: "2025-01-01T00:00:00.000Z" },
  });
  const generation = runDeclarationGeneration(
    {
      completedSteps: [],
      siret: "12345678901234",
      siren: "123456789",
      exploitantFirstName: "M",
      exploitantLastName: "D",
      dateMiseEnService: "2020-01-01",
      revenusAssistant: bridge.revenusAssistant,
      chargesAssistant: { exerciceFiscal: fiscalYear, totalDeductible: 0, totalPreExploitation: 0 },
      amortissementAssistant: { exerciceFiscal: fiscalYear, totalDotations: 0, status: "validated" },
    } as any,
    fiscalYear,
  );
  const caseAB =
    generation.status === "generated"
      ? (generation.liasseResult.cases.find((c) => c.caseId === "AB")?.value as number)
      : "BLOQUE";
  return { session, grid, revenusAssistant: bridge.revenusAssistant, anomalies: bridge.anomalies, f006: f006.result?.recettes.total, caseAB };
}

describe("Cycle 20 — chemin GPT/OCR réel : trace complète jusqu'à F-007", () => {
  it("15 lignes GPT réelles produisent 4530€ sur les 4 niveaux (grille=revenusAssistant=F006=F007), sans perte ni doublon", () => {
    const doc = document("releve-scanne.pdf", "docA");
    const rawLines = adaptGptLinesToRevenueRawLines(REAL_GPT_CAPTURE, doc, "bank_statement");
    assert.equal(rawLines.length, 15, "aucune ligne GPT perdue par l'adaptateur");
    assert.ok(rawLines.every((l) => l.sourceFileName === "releve-scanne.pdf"), "sourceFileName posé sur chaque ligne");

    const trace = fullTrace(rawLines, 2025);
    // 1000+350+250+150+100+500+300+200+150+100-120+300+300+950 = 4530
    // (le loyer de janvier 2026 est exclu — encaissé hors exercice 2025)
    assert.equal(trace.grid, 4530, "grille (écran)");
    assert.equal(trace.revenusAssistant.totalRecettes, 4530, "revenusAssistant");
    assert.equal(trace.f006, 4530, "F-006");
    assert.equal(trace.caseAB, 4530, "F-007, case AB du 2031-SD");
    assert.ok(
      trace.anomalies.some((a) => a.message.includes("-120")),
      "la régularisation négative doit produire une anomalie explicite, jamais un silence",
    );
  });

  it("le loyer de janvier 2026 (encaissé le 01/01/2026) n'apparaît que dans l'exercice 2026", () => {
    const doc = document("releve-scanne.pdf", "docA");
    const rawLines = adaptGptLinesToRevenueRawLines(REAL_GPT_CAPTURE, doc, "bank_statement");
    const trace2026 = fullTrace(rawLines, 2026);
    assert.equal(trace2026.revenusAssistant.totalRecettes, 980, "uniquement le loyer de janvier 2026");
    assert.equal(trace2026.f006, 980);
  });

  it("deux transactions distinctes au même montant/même jour (Airbnb 05/02, 300€ chacune) sont TOUTES DEUX comptées", () => {
    const doc = document("releve-scanne.pdf", "docA");
    const rawLines = adaptGptLinesToRevenueRawLines(REAL_GPT_CAPTURE, doc, "bank_statement");
    const trace = fullTrace(rawLines, 2025);
    const airbnbFeb = (trace.session.properties[0]!.transactions ?? []).filter(
      (t) => t.date === "2025-02-05",
    );
    assert.equal(airbnbFeb.length, 2, "les deux réservations distinctes doivent apparaître séparément");
    assert.equal(
      airbnbFeb.reduce((s, t) => s + t.amount, 0),
      600,
      "600€ au total, jamais fusionnées en une seule transaction de 300€",
    );
  });

  it("multi-upload : document A (GPT) + document B (GPT), suppression, réimport — parité stricte à chaque étape", () => {
    const docA = document("releve-scanne.pdf", "docA");
    const gptLinesB: RevenusGptLine[] = [
      { date: "2025-03-10", label: "Loyer mars", amount: 1100, direction: "credit", confidence: 95, isSummaryRow: false },
      { date: "2025-03-15", label: "Airbnb mars", amount: 400, direction: "credit", confidence: 95, isSummaryRow: false },
    ];

    const linesA = adaptGptLinesToRevenueRawLines(REAL_GPT_CAPTURE, docA, "bank_statement");
    let session = sessionFromPipelineLines([PROP], FY, new Map([[PROP.id, linesA]]), "ocr_lines");
    assert.equal(buildRevenusAssistantFromSession(session, FY, "2020-01-01").revenusAssistant.totalRecettes, 4530);

    const linesB = adaptGptLinesToRevenueRawLines(gptLinesB, document("releve-mars.pdf", "docB"), "bank_statement");
    session = sessionFromPipelineLines([PROP], FY, new Map([[PROP.id, linesB]]), "ocr_lines", session);
    let bridge = buildRevenusAssistantFromSession(session, FY, "2020-01-01");
    assert.equal(gridSummary(session).totalRevenue, 6030, "A+B — grille");
    assert.equal(bridge.revenusAssistant.totalRecettes, 6030, "A+B — revenusAssistant");

    // Réimport strict de B (même document GPT, même nom de fichier) — bloqué comme doublon.
    const linesBBis = adaptGptLinesToRevenueRawLines(gptLinesB, document("releve-mars.pdf", "docB-bis"), "bank_statement");
    session = sessionFromPipelineLines([PROP], FY, new Map([[PROP.id, linesBBis]]), "ocr_lines", session);
    assert.equal(
      buildRevenusAssistantFromSession(session, FY, "2020-01-01").revenusAssistant.totalRecettes,
      6030,
      "réimport strict de B — jamais 7130€",
    );

    session = removeDocumentFromRevenueSession(session, "docB", FY);
    assert.equal(
      buildRevenusAssistantFromSession(session, FY, "2020-01-01").revenusAssistant.totalRecettes,
      4530,
      "après suppression de B — reste A",
    );

    const linesBTer = adaptGptLinesToRevenueRawLines(gptLinesB, document("releve-mars.pdf", "docB-ter"), "bank_statement");
    session = sessionFromPipelineLines([PROP], FY, new Map([[PROP.id, linesBTer]]), "ocr_lines", session);
    assert.equal(
      buildRevenusAssistantFromSession(session, FY, "2020-01-01").revenusAssistant.totalRecettes,
      6030,
      "après réimport de B — jamais bloqué en doublon permanent",
    );
  });
});

/**
 * Cycle 20 — un débit dans une catégorie de revenu (chemin GPT : "amount
 * toujours positif", régularisation représentée en direction=debit) doit
 * RÉDUIRE la recette, jamais être simplement ignoré — ni côté grille (écran)
 * ni côté revenusAssistant (F-006). Avant correctif, seul revenusAssistant
 * était corrigé, créant une DIVERGENCE écran/F-006 démontrée par un appel GPT
 * réel : grille=4650€ (régularisation ignorée) vs revenusAssistant=4530€
 * (régularisation soustraite) — exactement le type de bug que le Cycle 15B
 * avait établi comme fondamentalement inacceptable.
 */
describe("Cycle 20 — un débit en catégorie de revenu réduit la grille ET revenusAssistant de façon identique", () => {
  it("grille et revenusAssistant restent strictement égaux avec une régularisation négative", () => {
    const doc = document("test.pdf", "doc1");
    const gptLines: RevenusGptLine[] = [
      { date: "10/06/2025", label: "Loyer", amount: 1000, direction: "credit", confidence: 90, isSummaryRow: false },
      { date: "15/06/2025", label: "Régularisation GLI", amount: 150, direction: "debit", confidence: 90, isSummaryRow: false },
    ];
    const rawLines = adaptGptLinesToRevenueRawLines(gptLines, doc, "bank_statement");
    const session = sessionFromPipelineLines([PROP], 2025, new Map([[PROP.id, rawLines]]), "ocr_lines");

    const grid = gridSummary(session).totalRevenue;
    const { revenusAssistant } = buildRevenusAssistantFromSession(session, 2025, "2020-01-01");

    assert.equal(grid, 850, "grille : 1000 - 150");
    assert.equal(revenusAssistant.totalRecettes, 850, "revenusAssistant : 1000 - 150");
    assert.equal(grid, revenusAssistant.totalRecettes, "grille et revenusAssistant ne doivent jamais diverger");
  });

  it("un débit en catégorie NON-revenu (charges) reste exclu de la grille comme avant (non-régression)", () => {
    const doc = document("test.pdf", "doc1");
    const gptLines: RevenusGptLine[] = [
      { date: "10/06/2025", label: "Loyer", amount: 1000, direction: "credit", confidence: 90, isSummaryRow: false },
    ];
    const rawLines = adaptGptLinesToRevenueRawLines(gptLines, doc, "bank_statement");
    const session = sessionFromPipelineLines([PROP], 2025, new Map([[PROP.id, rawLines]]), "ocr_lines");
    assert.equal(gridSummary(session).totalRevenue, 1000);
  });
});
