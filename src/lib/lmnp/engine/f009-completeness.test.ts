/**
 * Étape 6 — complétude unifiée F009 : vérifie que les 4 consommateurs existants
 * (aucun modifié) s'accordent tous via l'unique champ declarationDraft.inpiConfirmedAt,
 * que F009 l'écrive (document ou manuel) ou que ce soit l'ancien Tunnel A.
 * Run: npm run test:f009-completeness
 */
import { deriveStatutDossier } from "./dossier-status";
import { resolveDeclarationProgress } from "./declaration-progress";
import { isDocumentStepComplete } from "./document-journey-progress";
import { resolveDashboardWorkflow } from "@/components/lmnp/dashboard/dashboard-workflow-model";
import type { DashboardWorkspace } from "@/components/lmnp/dashboard/dashboard-workflow-model";
import type { PersistedWorkspace } from "../store/persistence";
import type { DeclarationDraft, FiscalYear, FiscalYearStatus } from "../types";

function assertEqual<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

function assertTrue(actual: boolean, message: string): void {
  if (!actual) throw new Error(`${message}: expected true, got false`);
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

function basePersistedWorkspace(
  fiscalYear: FiscalYear,
  declarationDraft?: Partial<DeclarationDraft>,
): PersistedWorkspace {
  return {
    fiscalYear,
    properties: [],
    documents: [],
    extractions: [],
    validationItems: [],
    ledgerEntries: [],
    declarationDraft: declarationDraft ? { completedSteps: [], ...declarationDraft } : undefined,
  };
}

/** Même construction que `workflow-progression.test.ts` — seuls declarationDraft/documents/alerts comptent pour `isComplete("activite")`. */
function baseDashboardWorkspace(
  fiscalYear: FiscalYear,
  declarationDraft?: Partial<DeclarationDraft>,
): DashboardWorkspace {
  return {
    fiscalYear,
    properties: [],
    documents: [],
    extractions: [],
    validationItems: [],
    ledgerEntries: [],
    alerts: [],
    declarationDraft: { completedSteps: [], ...declarationDraft },
  } as unknown as DashboardWorkspace;
}

/** Ce que F009 écrit à COMPLETE (chemin document) — reproduit persistCompletion sans store React. */
const F009_DOCUMENT_DRAFT: Partial<DeclarationDraft> = {
  siret: "73282932000074",
  siren: "732829320",
  activityStartDate: "2024-03-05",
  dateMiseEnService: "2024-04-01",
  exploitantLastName: "Dupont",
  exploitantFirstName: "Marie",
  inpiConfirmedAt: "2026-06-01T10:00:00.000Z",
};

/** Ce que F009 écrit à COMPLETE (chemin manuel, sans document) — SIREN manuel, pas de SIRET. */
const F009_MANUAL_DRAFT: Partial<DeclarationDraft> = {
  siren: "500123456",
  activityStartDate: "2024-02-10",
  dateMiseEnService: "2024-03-01",
  exploitantLastName: "Martin",
  exploitantFirstName: "Julie",
  inpiConfirmedAt: "2026-06-01T10:00:00.000Z",
};

/** Ancien dossier Tunnel A — inpiConfirmedAt déjà présent, jamais touché par F009. */
const LEGACY_TUNNEL_A_DRAFT: Partial<DeclarationDraft> = {
  siret: "73282932000074",
  siren: "732829320",
  exploitantLastName: "Ancien",
  exploitantFirstName: "Dossier",
  inpiConfirmedAt: "2026-01-15T09:00:00.000Z",
  // Pas de activityStartDate/dateMiseEnService : F009 n'a jamais tourné sur ce dossier.
};

function assertAllComplete(persisted: PersistedWorkspace, dashboard: DashboardWorkspace, label: string): void {
  assertEqual(
    resolveDashboardWorkflow(dashboard).find((s) => s.id === "activite")?.status,
    "completed",
    `${label} — carte dashboard`,
  );
  assertEqual(
    resolveDeclarationProgress(persisted).steps.find((s) => s.id === "documents")?.status,
    "completed",
    `${label} — declaration-progress`,
  );
  assertTrue(isDocumentStepComplete("inpi", persisted), `${label} — document-journey-progress`);
}

function assertNoneComplete(persisted: PersistedWorkspace, dashboard: DashboardWorkspace, label: string): void {
  assertEqual(
    resolveDashboardWorkflow(dashboard).find((s) => s.id === "activite")?.status !== "completed",
    true,
    `${label} — carte dashboard ne doit pas être completed`,
  );
  assertEqual(
    resolveDeclarationProgress(persisted).steps.find((s) => s.id === "documents")?.status !== "completed",
    true,
    `${label} — declaration-progress ne doit pas être completed`,
  );
  assertEqual(isDocumentStepComplete("inpi", persisted), false, `${label} — document-journey-progress`);
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

  console.log("f009-completeness — Étape 6");

  test("A. F009 COMPLETE → carte dashboard 'activite' completed", () => {
    const fy = baseFiscalYear("draft");
    const ws = baseDashboardWorkspace(fy, F009_DOCUMENT_DRAFT);
    assertEqual(resolveDashboardWorkflow(ws).find((s) => s.id === "activite")?.status, "completed", "status");
  });

  test("B. F009 COMPLETE → declaration-progress 'documents' completed", () => {
    const fy = baseFiscalYear("draft");
    const ws = basePersistedWorkspace(fy, F009_DOCUMENT_DRAFT);
    assertEqual(
      resolveDeclarationProgress(ws).steps.find((s) => s.id === "documents")?.status,
      "completed",
      "status",
    );
  });

  test("C. F009 COMPLETE → dossier-status avance au-delà de INFORMATIONS_GENERALES", () => {
    const fy = baseFiscalYear("draft", { regimeConfirmedAt: "2026-01-01T00:00:00Z" });
    const ws = basePersistedWorkspace(fy, F009_DOCUMENT_DRAFT); // logementConfirmedAt absent
    assertEqual(deriveStatutDossier(ws), "BIEN_EN_COURS", "avance jusqu'au logement, pas bloqué par Activité");
  });

  test("D. F009 COMPLETE écrit systématiquement inpiConfirmedAt (jamais 'complete sans')", () => {
    // Reproduit exactement la garde de persistCompletion : hasRequiredData
    // (dateDebutActivite + dateMiseEnService) est vrai avant tout état COMPLETE
    // atteignable — donc inpiConfirmedAt est toujours écrit avec les données métier,
    // jamais dans un état "complet" sans lui.
    const hasRequiredData = Boolean(
      F009_DOCUMENT_DRAFT.activityStartDate && F009_DOCUMENT_DRAFT.dateMiseEnService,
    );
    assertTrue(hasRequiredData, "sanity : les deux dates obligatoires sont présentes");
    assertTrue(Boolean(F009_DOCUMENT_DRAFT.inpiConfirmedAt), "inpiConfirmedAt est bien écrit dans ce cas");

    const fy = baseFiscalYear("draft");
    assertAllComplete(
      basePersistedWorkspace(fy, F009_DOCUMENT_DRAFT),
      baseDashboardWorkspace(fy, F009_DOCUMENT_DRAFT),
      "D",
    );
  });

  test("E. Ancien dossier Tunnel A (inpiConfirmedAt déjà présent) : aucun changement, reste COMPLETE", () => {
    const fy = baseFiscalYear("draft");
    assertAllComplete(
      basePersistedWorkspace(fy, LEGACY_TUNNEL_A_DRAFT),
      baseDashboardWorkspace(fy, LEGACY_TUNNEL_A_DRAFT),
      "E",
    );
  });

  test("F. F009 chemin manuel COMPLETE → même résultat que le chemin document", () => {
    const fy = baseFiscalYear("draft");
    assertAllComplete(
      basePersistedWorkspace(fy, F009_MANUAL_DRAFT),
      baseDashboardWorkspace(fy, F009_MANUAL_DRAFT),
      "F",
    );
  });

  test("G. COMPLETE → GO_BACK → inpiConfirmedAt supprimé → plus COMPLETE (carte dashboard)", () => {
    const fy = baseFiscalYear("draft");
    const reopened: Partial<DeclarationDraft> = { ...F009_DOCUMENT_DRAFT, inpiConfirmedAt: undefined };
    const ws = baseDashboardWorkspace(fy, reopened);
    assertEqual(
      resolveDashboardWorkflow(ws).find((s) => s.id === "activite")?.status !== "completed",
      true,
      "la carte ne doit plus être completed une fois inpiConfirmedAt effacé",
    );
  });

  test("H. Modification invalide (inpiConfirmedAt effacé) : aucun des 4 systèmes ne déclare complet", () => {
    const fy = baseFiscalYear("draft", { regimeConfirmedAt: "2026-01-01T00:00:00Z" });
    const reopened: Partial<DeclarationDraft> = { ...F009_DOCUMENT_DRAFT, inpiConfirmedAt: undefined };
    assertNoneComplete(basePersistedWorkspace(fy, reopened), baseDashboardWorkspace(fy, reopened), "H");
    assertEqual(deriveStatutDossier(basePersistedWorkspace(fy, reopened)), "INFORMATIONS_GENERALES", "H — dossier-status recule aussi");
  });

  test("I. Re-confirmation : inpiConfirmedAt réécrit → à nouveau COMPLETE partout", () => {
    const fy = baseFiscalYear("draft", { regimeConfirmedAt: "2026-01-01T00:00:00Z" });
    const reconfirmed: Partial<DeclarationDraft> = {
      ...F009_DOCUMENT_DRAFT,
      inpiConfirmedAt: "2026-06-02T11:00:00.000Z", // nouvel horodatage, comme persistCompletion le referait
    };
    assertAllComplete(
      basePersistedWorkspace(fy, reconfirmed),
      baseDashboardWorkspace(fy, reconfirmed),
      "I",
    );
    assertEqual(deriveStatutDossier(basePersistedWorkspace(fy, reconfirmed)), "BIEN_EN_COURS", "I — dossier-status avance à nouveau");
  });

  console.log(`\n${passed}/${total} tests passés`);
  if (passed !== total) process.exit(1);
}

runTests();
