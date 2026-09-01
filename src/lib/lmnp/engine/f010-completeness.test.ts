/**
 * Cycle 0 (F010) — complétude unifiée Logement : vérifie que les 4 consommateurs existants
 * (dashboard, declaration-progress, document-journey-progress, dossier-status) s'accordent
 * tous sur declarationDraft.logementConfirmedAt, que la confirmation vienne de F010
 * (qui ne collecte ni adresse ni ville) ou de l'ancien Tunnel A (qui les collecte).
 *
 * declaration-progress.ts conserve un repli sur properties[0].address/city (cas 4) : aucun
 * code de ce dépôt ne peut aujourd'hui produire cet état sans aussi écrire logementConfirmedAt
 * (seul CONFIRM_LOGEMENT_PROFILE écrit address/city, et ce même case écrit toujours
 * logementConfirmedAt dans le même dispatch — vérifié par grep exhaustif et par historique
 * git : les deux ont été introduits ensemble). Le repli est gardé par prudence pour un dossier
 * hérité dont l'origine ne serait pas visible dans ce dépôt (import, script d'admin, etc.).
 *
 * Run: npx tsx src/lib/lmnp/engine/f010-completeness.test.ts
 */
import { deriveStatutDossier } from "./dossier-status";
import { resolveDeclarationProgress } from "./declaration-progress";
import { isDocumentStepComplete } from "./document-journey-progress";
import { resolveDashboardWorkflow } from "@/components/lmnp/dashboard/dashboard-workflow-model";
import type { DashboardWorkspace } from "@/components/lmnp/dashboard/dashboard-workflow-model";
import type { PersistedWorkspace } from "../store/persistence";
import type { DeclarationDraft, FiscalYear, FiscalYearStatus, Property } from "../types";

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
    propertyIds: ["prop-1"],
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

function emptyProperty(): Property {
  return { id: "prop-1", label: "", address: "", city: "", postalCode: "" };
}

function addressedProperty(): Property {
  return {
    id: "prop-1",
    label: "Appartement",
    address: "1 rue du Test",
    city: "Paris",
    postalCode: "75001",
  };
}

function basePersistedWorkspace(
  fiscalYear: FiscalYear,
  declarationDraft?: Partial<DeclarationDraft>,
  properties: Property[] = [emptyProperty()],
): PersistedWorkspace {
  return {
    fiscalYear,
    properties,
    documents: [],
    extractions: [],
    validationItems: [],
    ledgerEntries: [],
    declarationDraft: declarationDraft ? { completedSteps: [], ...declarationDraft } : undefined,
  };
}

/** Même construction que `f009-completeness.test.ts` — seuls declarationDraft/documents/alerts comptent pour `isComplete("logement")`. */
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

/** Ce que F010LogementAssistantPanel.persistCompletion écrit à COMPLETE (reducer.ts, cases
 * CONFIRM_LOGEMENT_PROFILE + DECLARATION_COMPLETE_STEP) — reproduit sans store React.
 * `properties[0].address`/`.city` restent VIDES : F010 ne les collecte pas (aucun input
 * adresse/ville dans collect_bien, cf. audit F010 §3/§10). */
const F010_CONFIRMED_DRAFT: Partial<DeclarationDraft> = {
  logementConfirmedAt: "2026-08-27T10:00:00.000Z",
  propertyBackgroundExtraction: { acquisitionPrice: 245_000, notaryFees: 18_500, furnitureAmount: 12_000 },
  documentStepsCompleted: ["logement"],
  completedSteps: ["logement", "logement-assistant"],
};

/** Ancien dossier confirmé via Tunnel A — logementConfirmedAt présent, adresse/ville aussi. */
const LEGACY_TUNNEL_A_CONFIRMED_DRAFT: Partial<DeclarationDraft> = {
  logementConfirmedAt: "2026-01-15T09:00:00.000Z",
  documentStepsCompleted: ["logement"],
  completedSteps: ["logement"],
};

function assertAllComplete(
  persisted: PersistedWorkspace,
  dashboard: DashboardWorkspace,
  label: string,
): void {
  assertEqual(
    resolveDashboardWorkflow(dashboard).find((s) => s.id === "logement")?.status,
    "completed",
    `${label} — carte dashboard`,
  );
  assertEqual(
    resolveDeclarationProgress(persisted).steps.find((s) => s.id === "logement")?.status,
    "completed",
    `${label} — declaration-progress`,
  );
  assertTrue(isDocumentStepComplete("logement", persisted), `${label} — document-journey-progress`);
}

function assertNoneComplete(
  persisted: PersistedWorkspace,
  dashboard: DashboardWorkspace,
  label: string,
): void {
  assertEqual(
    resolveDashboardWorkflow(dashboard).find((s) => s.id === "logement")?.status !== "completed",
    true,
    `${label} — carte dashboard ne doit pas être completed`,
  );
  assertEqual(
    resolveDeclarationProgress(persisted).steps.find((s) => s.id === "logement")?.status !== "completed",
    true,
    `${label} — declaration-progress ne doit pas être completed`,
  );
  assertEqual(isDocumentStepComplete("logement", persisted), false, `${label} — document-journey-progress`);
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

  console.log("f010-completeness — Cycle 0");

  test("1. F010 confirmé (sans adresse/ville) → complet partout", () => {
    const fy = baseFiscalYear("draft", { regimeConfirmedAt: "2026-01-01T00:00:00Z" });
    const persisted = basePersistedWorkspace(
      fy,
      { ...F010_CONFIRMED_DRAFT, inpiConfirmedAt: "2026-06-01T00:00:00.000Z" },
      [emptyProperty()],
    );
    const dashboard = baseDashboardWorkspace(fy, F010_CONFIRMED_DRAFT);
    assertAllComplete(persisted, dashboard, "1");
    assertEqual(
      deriveStatutDossier(persisted),
      "DOCUMENTS_EN_ATTENTE",
      "1 — dossier-status avance au-delà de BIEN_EN_COURS",
    );
  });

  test("2. F010 non confirmé → incomplet partout", () => {
    const fy = baseFiscalYear("draft", { regimeConfirmedAt: "2026-01-01T00:00:00Z" });
    const draft: Partial<DeclarationDraft> = { inpiConfirmedAt: "2026-06-01T00:00:00.000Z" };
    const persisted = basePersistedWorkspace(fy, draft, [emptyProperty()]);
    const dashboard = baseDashboardWorkspace(fy, draft);
    assertNoneComplete(persisted, dashboard, "2");
    assertEqual(deriveStatutDossier(persisted), "BIEN_EN_COURS", "2 — dossier-status bloqué avant le logement");
  });

  test("3. Ancien dossier avec logementConfirmedAt (Tunnel A, adresse/ville présentes) → complet", () => {
    const fy = baseFiscalYear("draft", { regimeConfirmedAt: "2026-01-01T00:00:00Z" });
    const draft = { ...LEGACY_TUNNEL_A_CONFIRMED_DRAFT, inpiConfirmedAt: "2026-01-10T00:00:00.000Z" };
    assertAllComplete(
      basePersistedWorkspace(fy, draft, [addressedProperty()]),
      baseDashboardWorkspace(fy, draft),
      "3",
    );
  });

  test("4. Adresse/ville présentes mais logementConfirmedAt absent → repli legacy conservé (declaration-progress)", () => {
    // Aucun code de ce dépôt ne produit cet état aujourd'hui (seul CONFIRM_LOGEMENT_PROFILE
    // écrit address/city, et il écrit toujours logementConfirmedAt dans le même dispatch).
    // Le repli est vérifié ici pour ne pas régresser un éventuel dossier hérité hors dépôt,
    // conformément à la consigne Cycle 0 de ne pas le supprimer sans preuve qu'il est mort.
    const fy = baseFiscalYear("draft");
    const persisted = basePersistedWorkspace(fy, {}, [addressedProperty()]);
    assertEqual(
      resolveDeclarationProgress(persisted).steps.find((s) => s.id === "logement")?.status,
      "completed",
      "4 — declaration-progress reconnaît toujours le repli adresse/ville",
    );
    // Les 3 autres systèmes, eux, restent sur logementConfirmedAt : divergence attendue et
    // déjà existante avant Cycle 0 pour ce cas non atteignable — non traitée ici (hors périmètre).
    assertEqual(
      isDocumentStepComplete("logement", persisted),
      false,
      "4 — document-journey-progress ne connaît pas le repli adresse/ville (inchangé, hors périmètre Cycle 0)",
    );
  });

  test("5. Aucune donnée → incomplet partout", () => {
    const fy = baseFiscalYear("draft", { regimeConfirmedAt: "2026-01-01T00:00:00Z" });
    const draft: Partial<DeclarationDraft> = { inpiConfirmedAt: "2026-06-01T00:00:00.000Z" };
    assertNoneComplete(
      basePersistedWorkspace(fy, draft, [emptyProperty()]),
      baseDashboardWorkspace(fy, draft),
      "5",
    );
  });

  console.log(`\n${passed}/${total} tests passés`);
  if (passed !== total) process.exit(1);
}

runTests();
