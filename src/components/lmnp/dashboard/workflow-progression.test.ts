/**
 * Convergence hero + cartes d'étape ↔ alerts.ts (ENG-005) — Cycles 1 et 2 DIR-003.
 * Vérifie que resolveDashboardHeroState() et resolveDashboardWorkflow() détectent
 * une correction nécessaire à partir de workspace.alerts (source de vérité déjà
 * reconnue), y compris lorsqu'aucun ValidationItem pending n'existe pour ce champ.
 * Vérifie aussi que validationBadge/validationState restent, volontairement,
 * dérivés des ValidationItems (Cycle 2 ne les touche pas).
 * Run: npm run test:dashboard-hero-alerts
 */
import {
  documentOpenAlertCount,
  resolveActiveWorkflowStep,
  resolveDashboardWorkflow,
  resolveDocumentCorrectionState,
  stepHasOpenAlert,
  stepOpenAlertCount,
} from "./dashboard-workflow-model";
import { resolveDashboardHeroState } from "./workflow-progression";
import type { DashboardWorkspace } from "./dashboard-workflow-model";
import type { Alert, ValidationItem } from "@/lib/lmnp/types";

function assertEqual<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

function baseAlert(overrides: Partial<Alert> = {}): Alert {
  return {
    id: "alert-1",
    fiscalYearId: "fy-1",
    code: "A01_LOW_CONFIDENCE",
    severity: "warning",
    status: "open",
    title: "À vérifier",
    message: "Confiance de lecture faible",
    ...overrides,
  };
}

function baseValidationItem(overrides: Partial<ValidationItem> = {}): ValidationItem {
  return {
    id: "vi-1",
    fiscalYearId: "fy-1",
    fieldKey: "property.address",
    label: "Adresse du bien",
    proposedValue: { type: "text", text: "1 rue de la Paix" },
    status: "pending",
    isRequired: false,
    extractionIds: [],
    confidence: 92,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

function baseWorkspace(overrides: {
  alerts?: Alert[];
  validationItems?: DashboardWorkspace["validationItems"];
  journeyStartedAt?: string;
} = {}): DashboardWorkspace {
  return {
    fiscalYear: {
      id: "fy-1",
      year: 2026,
      status: "collecting_documents",
      regime: "reel",
      propertyIds: [],
      createdAt: "2026-01-01T00:00:00Z",
      updatedAt: "2026-01-01T00:00:00Z",
    },
    properties: [],
    documents: [],
    extractions: [],
    validationItems: overrides.validationItems ?? [],
    ledgerEntries: [],
    alerts: overrides.alerts ?? [],
    declarationDraft: {
      completedSteps: [],
      journeyStartedAt: overrides.journeyStartedAt ?? "2026-01-01T00:00:00Z",
    },
  } as unknown as DashboardWorkspace;
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

  console.log("workflow-progression.ts / dashboard-workflow-model.ts — convergence alerts.ts");

  test("stepHasOpenAlert: alerte ouverte, sévérité warning, fieldKey logement → true pour logement", () => {
    const ws = baseWorkspace({
      alerts: [baseAlert({ fieldKey: "property.address" })],
    });
    assertEqual(stepHasOpenAlert("logement", ws), true, "logement doit détecter l'alerte");
    // FIELD_REGISTRY["property.address"].tab === "activite" (préexistant à ce cycle) : le
    // matchValidation générique de l'étape "activite" couvre déjà ce fieldKey, indépendamment
    // de la source (alerts ou validationItems). stepHasOpenAlert hérite fidèlement de ce
    // chevauchement existant plutôt que de le corriger — hors périmètre de ce cycle.
    assertEqual(stepHasOpenAlert("activite", ws), true, "activite partage déjà ce fieldKey via FIELD_REGISTRY");
    assertEqual(stepHasOpenAlert("credit", ws), false, "credit ne doit pas être affecté");
  });

  test("stepHasOpenAlert: alerte severity=info → ignorée", () => {
    const ws = baseWorkspace({
      alerts: [baseAlert({ fieldKey: "property.address", severity: "info" })],
    });
    assertEqual(stepHasOpenAlert("logement", ws), false, "une alerte info ne doit jamais déclencher de correction");
  });

  test("stepHasOpenAlert: alerte status=resolved → ignorée", () => {
    const ws = baseWorkspace({
      alerts: [baseAlert({ fieldKey: "property.address", status: "resolved" })],
    });
    assertEqual(stepHasOpenAlert("logement", ws), false, "une alerte résolue ne doit plus déclencher de correction");
  });

  test("resolveDashboardHeroState: alerte ouverte sans ValidationItem pending correspondant → hero détecte la correction", () => {
    const ws = baseWorkspace({
      alerts: [baseAlert({ fieldKey: "property.address" })],
      validationItems: [],
    });
    const hero = resolveDashboardHeroState(ws);
    assertEqual(hero.title, "Informations à confirmer", "le hero doit converger avec alerts.ts, pas avec validationItems");
  });

  test("resolveDashboardHeroState: aucune alerte, aucun ValidationItem pending → pas de correction signalée", () => {
    const ws = baseWorkspace({ alerts: [], validationItems: [] });
    const hero = resolveDashboardHeroState(ws);
    assertEqual(hero.title === "Informations à confirmer", false, "aucune correction ne doit être signalée sans alerte");
  });

  test("Cycle 2 — scénario 1 : ValidationItem pending sans alerte (confiance haute, non required) → correctionsRemaining = 0", () => {
    const ws = baseWorkspace({
      validationItems: [baseValidationItem({ fieldKey: "property.address", status: "pending", confidence: 92, isRequired: false })],
      alerts: [],
    });
    assertEqual(stepOpenAlertCount("logement", ws), 0, "aucune alerte ne doit être comptée");
    const steps = resolveDashboardWorkflow(ws);
    const logement = steps.find((s) => s.id === "logement")!;
    assertEqual(logement.correctionsRemaining, 0, "la carte ne doit plus réclamer de correction sans alerte");
    // Non-régression volontaire : validationBadge reste dérivé des ValidationItems, pas des alerts.
    assertEqual(logement.validationBadge, "pending", "validationBadge doit rester inchangé (hors périmètre du Cycle 2)");
  });

  test("Cycle 2 — scénario 2 : alerte ouverte sans ValidationItem (document requis absent) → correctionsRemaining > 0", () => {
    const ws = baseWorkspace({
      validationItems: [],
      alerts: [baseAlert({ code: "A11_REQUIRED_FIELD_EMPTY", fieldKey: "property.address" })],
    });
    const steps = resolveDashboardWorkflow(ws);
    const logement = steps.find((s) => s.id === "logement")!;
    assertEqual(logement.correctionsRemaining, 1, "la carte doit désormais réclamer une correction depuis alerts.ts");
    assertEqual(logement.validationBadge, "none", "validationBadge reste 'none' : aucun ValidationItem, hors périmètre");
  });

  test("Cycle 2 — stepOpenAlertCount compte plusieurs alertes ouvertes pour une même étape", () => {
    const ws = baseWorkspace({
      alerts: [
        baseAlert({ id: "a1", fieldKey: "property.address" }),
        baseAlert({ id: "a2", fieldKey: "property.label" }),
      ],
    });
    assertEqual(stepOpenAlertCount("logement", ws), 2, "les deux alertes doivent être comptées");
  });

  test("Cycle 3 — resolveFocusStepId (via resolveActiveWorkflowStep) : alerte ouverte sans ValidationItem → le focus suit alerts.ts", () => {
    const ws = baseWorkspace({
      alerts: [baseAlert({ fieldKey: "income.annualRent" })],
      validationItems: [],
    });
    const active = resolveActiveWorkflowStep(ws);
    assertEqual(active.id, "revenus", "le focus doit désigner l'étape avec l'alerte ouverte");
  });

  test("Cycle 3 — resolveFocusStepId : ValidationItem pending sans alerte ne détermine plus le focus", () => {
    const ws = baseWorkspace({
      alerts: [],
      validationItems: [
        baseValidationItem({ fieldKey: "income.annualRent", status: "pending", confidence: 92, isRequired: false }),
      ],
    });
    const active = resolveActiveWorkflowStep(ws);
    assertEqual(active.id, "activite", "sans alerte, le focus retombe sur la première étape incomplète, pas sur revenus");
  });

  test("Cycle 3 — resolveDocumentCorrectionState/documentOpenAlertCount : alerte liée via validationItemId → correction comptée", () => {
    const vi = baseValidationItem({
      id: "vi-doc-1",
      fieldKey: "income.annualRent",
      documentId: "doc-1",
      status: "pending",
      confidence: 70,
    });
    const ws = baseWorkspace({
      validationItems: [vi],
      alerts: [baseAlert({ validationItemId: "vi-doc-1", fieldKey: "income.annualRent" })],
    });
    assertEqual(documentOpenAlertCount("doc-1", ws), 1, "l'alerte doit être comptée pour ce document");
    assertEqual(resolveDocumentCorrectionState("doc-1", ws), "1 à corriger", "le tableau doit converger avec alerts.ts");
  });

  test("Cycle 3 — resolveDocumentCorrectionState : ValidationItem pending sans alerte (confiance haute, non required) → Aucune", () => {
    const vi = baseValidationItem({
      id: "vi-doc-2",
      fieldKey: "income.annualRent",
      documentId: "doc-2",
      status: "pending",
      confidence: 92,
      isRequired: false,
    });
    const ws = baseWorkspace({ validationItems: [vi], alerts: [] });
    assertEqual(resolveDocumentCorrectionState("doc-2", ws), "Aucune", "sans alerte, le tableau ne doit plus signaler de correction");
  });

  test("Cycle 3 — documentOpenAlertCount : une alerte liée à un autre document n'est pas comptée", () => {
    const vi = baseValidationItem({ id: "vi-doc-3", fieldKey: "income.annualRent", documentId: "doc-3", status: "pending" });
    const ws = baseWorkspace({
      validationItems: [vi],
      alerts: [baseAlert({ validationItemId: "vi-doc-other", fieldKey: "income.annualRent" })],
    });
    assertEqual(documentOpenAlertCount("doc-3", ws), 0, "une alerte liée à un autre ValidationItem ne doit pas déborder sur ce document");
  });

  console.log(`\n${passed}/${total} tests passés`);
  if (passed !== total) process.exit(1);
}

runTests();
