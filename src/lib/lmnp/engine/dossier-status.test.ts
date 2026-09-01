/**
 * dossier-status.ts tests — couvre les 13 états de STATE-001 et les deux
 * approximations runtime documentées (BIEN_COMPLETE, CALCUL_EN_COURS).
 * Run: npm run test:dossier-status
 */
import { deriveStatutDossier } from "./dossier-status";
import type { PersistedWorkspace } from "../store/persistence";
import type { FiscalYear, FiscalYearStatus } from "../types";

function assertEqual<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected) {
    throw new Error(
      `${message}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
    );
  }
}

function baseFiscalYear(status: FiscalYearStatus, overrides: Partial<FiscalYear> = {}): FiscalYear {
  return {
    id: "fy-1",
    year: 2026,
    status,
    regime: "reel",
    propertyIds: [],
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

function baseWorkspace(fiscalYear: FiscalYear, declarationDraft?: PersistedWorkspace["declarationDraft"]): PersistedWorkspace {
  return {
    fiscalYear,
    properties: [],
    documents: [],
    extractions: [],
    validationItems: [],
    ledgerEntries: [],
    declarationDraft,
  };
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

  console.log("dossier-status.ts");

  test("draft, sans regimeConfirmedAt → DOSSIER_CREE", () => {
    const ws = baseWorkspace(baseFiscalYear("draft"));
    assertEqual(deriveStatutDossier(ws), "DOSSIER_CREE", "état attendu");
  });

  test("draft, regime confirmé, sans inpiConfirmedAt → INFORMATIONS_GENERALES", () => {
    const ws = baseWorkspace(baseFiscalYear("draft", { regimeConfirmedAt: "2026-01-02T00:00:00Z" }));
    assertEqual(deriveStatutDossier(ws), "INFORMATIONS_GENERALES", "état attendu");
  });

  test("draft, activité confirmée, sans logementConfirmedAt → BIEN_EN_COURS", () => {
    const ws = baseWorkspace(
      baseFiscalYear("draft", { regimeConfirmedAt: "2026-01-02T00:00:00Z" }),
      { completedSteps: [], inpiConfirmedAt: "2026-01-03T00:00:00Z" },
    );
    assertEqual(deriveStatutDossier(ws), "BIEN_EN_COURS", "état attendu");
  });

  test("draft, logement confirmé → DOCUMENTS_EN_ATTENTE (BIEN_COMPLETE jamais produit)", () => {
    const ws = baseWorkspace(
      baseFiscalYear("draft", { regimeConfirmedAt: "2026-01-02T00:00:00Z" }),
      {
        completedSteps: [],
        inpiConfirmedAt: "2026-01-03T00:00:00Z",
        logementConfirmedAt: "2026-01-04T00:00:00Z",
      },
    );
    const result = deriveStatutDossier(ws);
    assertEqual(result, "DOCUMENTS_EN_ATTENTE", "état attendu");
    if ((result as string) === "BIEN_COMPLETE") {
      throw new Error("BIEN_COMPLETE ne doit jamais être produit par cette dérivation (approximation documentée)");
    }
  });

  test("collecting_documents → DOCUMENTS_IMPORTES", () => {
    const ws = baseWorkspace(baseFiscalYear("collecting_documents"));
    assertEqual(deriveStatutDossier(ws), "DOCUMENTS_IMPORTES", "état attendu");
  });

  test("analyzing → ANALYSE_DOCUMENTAIRE", () => {
    const ws = baseWorkspace(baseFiscalYear("analyzing"));
    assertEqual(deriveStatutDossier(ws), "ANALYSE_DOCUMENTAIRE", "état attendu");
  });

  test("pending_validation → INFORMATIONS_MANQUANTES", () => {
    const ws = baseWorkspace(baseFiscalYear("pending_validation"));
    assertEqual(deriveStatutDossier(ws), "INFORMATIONS_MANQUANTES", "état attendu");
  });

  test("ready_to_close → DOSSIER_COMPLET (CALCUL_EN_COURS jamais produit)", () => {
    const ws = baseWorkspace(baseFiscalYear("ready_to_close"));
    const result = deriveStatutDossier(ws);
    assertEqual(result, "DOSSIER_COMPLET", "état attendu");
    if ((result as string) === "CALCUL_EN_COURS") {
      throw new Error("CALCUL_EN_COURS ne doit jamais être produit par cette dérivation (approximation documentée)");
    }
  });

  test("closed, sans declarationGeneratedAt ni transmittedAt → CALCUL_TERMINE", () => {
    const ws = baseWorkspace(baseFiscalYear("closed"));
    assertEqual(deriveStatutDossier(ws), "CALCUL_TERMINE", "état attendu");
  });

  test("closed, declarationGeneratedAt renseigné, sans transmittedAt → DECLARATION_GENEREE", () => {
    const ws = baseWorkspace(
      baseFiscalYear("closed", { declarationGeneratedAt: "2026-02-01T00:00:00Z" }),
    );
    assertEqual(deriveStatutDossier(ws), "DECLARATION_GENEREE", "état attendu");
  });

  test("closed, transmittedAt renseigné → DOSSIER_TERMINE", () => {
    const ws = baseWorkspace(
      baseFiscalYear("closed", {
        declarationGeneratedAt: "2026-02-01T00:00:00Z",
        transmittedAt: "2026-02-05T00:00:00Z",
      }),
    );
    assertEqual(deriveStatutDossier(ws), "DOSSIER_TERMINE", "état attendu");
  });

  test("CALCUL_EN_COURS n'est produit par aucune valeur de FiscalYearStatus", () => {
    const statuses: FiscalYearStatus[] = [
      "draft",
      "collecting_documents",
      "analyzing",
      "pending_validation",
      "ready_to_close",
      "closed",
    ];
    for (const status of statuses) {
      const ws = baseWorkspace(
        baseFiscalYear(status, {
          regimeConfirmedAt: "2026-01-02T00:00:00Z",
          declarationGeneratedAt: "2026-02-01T00:00:00Z",
          transmittedAt: "2026-02-05T00:00:00Z",
        }),
        { completedSteps: [], inpiConfirmedAt: "x", logementConfirmedAt: "x" },
      );
      if ((deriveStatutDossier(ws) as string) === "CALCUL_EN_COURS") {
        throw new Error(`CALCUL_EN_COURS produit pour status=${status} — régression de l'approximation documentée`);
      }
    }
  });

  console.log(`\n${passed}/${total} tests passés`);
  if (passed !== total) process.exit(1);
}

runTests();
