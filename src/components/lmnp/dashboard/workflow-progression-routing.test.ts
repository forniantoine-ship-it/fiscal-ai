/**
 * Run: npm run test:workflow-progression-routing
 */
import {
  resolveAssistantHref,
  resolveNextAssistantHref,
  resolveNextContinueLabel,
  resolveWorkflowProgressionCta,
} from "./workflow-progression";
import {
  resolveDashboardWorkflow,
  resolveWorkflowStepNavigationHref,
} from "./dashboard-workflow-model";
import type { DashboardWorkspace } from "./dashboard-workflow-model";
import { documentJourneyRoute, LMNP_ROUTES } from "@/lib/lmnp/routes";

function assertEqual<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

function baseWorkspace(): DashboardWorkspace {
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
    validationItems: [],
    ledgerEntries: [],
    alerts: [],
    declarationDraft: {
      completedSteps: [],
      journeyStartedAt: "2026-01-01T00:00:00Z",
    },
  } as unknown as DashboardWorkspace;
}

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

console.log("workflow-progression-routing");

test("resolveAssistantHref : activite → /assistants/activite", () => {
  assertEqual(resolveAssistantHref("activite"), LMNP_ROUTES.activite, "activite");
});

test("resolveAssistantHref : logement → /assistants/logement", () => {
  assertEqual(resolveAssistantHref("logement"), LMNP_ROUTES.logement, "logement");
});

test("resolveAssistantHref : credit → /assistants/financement", () => {
  assertEqual(resolveAssistantHref("credit"), LMNP_ROUTES.financement, "credit");
});

test("resolveAssistantHref : revenus → /assistants/revenus", () => {
  assertEqual(resolveAssistantHref("revenus"), LMNP_ROUTES.revenusAssistant, "revenus");
});

test("resolveAssistantHref : charges → /assistants/charges", () => {
  assertEqual(resolveAssistantHref("charges"), LMNP_ROUTES.chargesAssistant, "charges");
});

test("resolveAssistantHref : amortissement → /assistants/amortissements", () => {
  assertEqual(
    resolveAssistantHref("amortissement"),
    LMNP_ROUTES.amortissementsAssistant,
    "amortissement",
  );
});

test("resolveAssistantHref : validation → document journey validation", () => {
  assertEqual(
    resolveAssistantHref("validation"),
    documentJourneyRoute("validation"),
    "validation",
  );
});

test("document Activité → assistant activité", () => {
  const cta = resolveWorkflowProgressionCta("activite");
  assertEqual(cta?.continueHref, LMNP_ROUTES.activite, "href");
  assertEqual(cta?.continueLabel, "Continuer", "label");
});

test("document Logement → assistant logement", () => {
  const cta = resolveWorkflowProgressionCta("logement");
  assertEqual(cta?.continueHref, LMNP_ROUTES.logement, "href");
});

test("document Crédit → assistant financement", () => {
  const cta = resolveWorkflowProgressionCta("credit");
  assertEqual(cta?.continueHref, LMNP_ROUTES.financement, "href");
});

test("document Revenus → assistant revenus", () => {
  const cta = resolveWorkflowProgressionCta("revenus");
  assertEqual(cta?.continueHref, LMNP_ROUTES.revenusAssistant, "href");
});

test("document Charges → assistant charges", () => {
  const cta = resolveWorkflowProgressionCta("charges");
  assertEqual(cta?.continueHref, LMNP_ROUTES.chargesAssistant, "href");
});

test("document Amortissement → assistant amortissements", () => {
  const cta = resolveWorkflowProgressionCta("amortissement");
  assertEqual(cta?.continueHref, LMNP_ROUTES.amortissementsAssistant, "href");
});

test("validation inchangée → /declarations", () => {
  const cta = resolveWorkflowProgressionCta("validation");
  assertEqual(cta?.continueHref, LMNP_ROUTES.declarations, "href");
  assertEqual(cta?.continueLabel, "Préparer la déclaration", "label");
});

test("carte dashboard Activité → /assistants/activite", () => {
  const steps = resolveDashboardWorkflow(baseWorkspace());
  const activite = steps.find((step) => step.id === "activite");
  if (!activite) throw new Error("étape activite introuvable");
  assertEqual(activite.href, LMNP_ROUTES.activite, "href");
  assertEqual(activite.uploadHref, LMNP_ROUTES.activite, "uploadHref");
  assertEqual(resolveWorkflowStepNavigationHref(activite), LMNP_ROUTES.activite, "navigation");
});

test("cartes Logement / Crédit inchangées", () => {
  const steps = resolveDashboardWorkflow(baseWorkspace());
  const logement = steps.find((step) => step.id === "logement");
  const credit = steps.find((step) => step.id === "credit");
  assertEqual(logement?.href, LMNP_ROUTES.logement, "logement href");
  assertEqual(credit?.href, LMNP_ROUTES.financement, "credit href");
});

test("assistants : destinations Tunnel B → Tunnel B inchangées", () => {
  assertEqual(LMNP_ROUTES.activite, "/assistants/activite", "F009 base");
  assertEqual(LMNP_ROUTES.logement, "/assistants/logement", "F010 → financement chain");
  assertEqual(LMNP_ROUTES.financement, "/assistants/financement", "F011 base");
  assertEqual(LMNP_ROUTES.chargesAssistant, "/assistants/charges", "F012 base");
});

test("Cycle 22 — Continuer suit WORKFLOW_STEP_SEQUENCE, sans saut ni retour arrière", () => {
  assertEqual(resolveNextAssistantHref("activite"), LMNP_ROUTES.logement, "F009 → F010");
  assertEqual(resolveNextAssistantHref("logement"), LMNP_ROUTES.financement, "F010 → F011");
  assertEqual(resolveNextAssistantHref("credit"), LMNP_ROUTES.revenusAssistant, "F011 → F013");
  assertEqual(resolveNextAssistantHref("revenus"), LMNP_ROUTES.chargesAssistant, "F013 → F012");
  assertEqual(resolveNextAssistantHref("charges"), LMNP_ROUTES.amortissementsAssistant, "F012 → F014");
  assertEqual(resolveNextAssistantHref("amortissement"), documentJourneyRoute("validation"), "F014 → validation");
  assertEqual(resolveNextContinueLabel("credit"), "Continuer vers Revenus", "label F011");
  assertEqual(resolveNextContinueLabel("revenus"), "Continuer vers Charges", "label F013");
  assertEqual(resolveNextContinueLabel("charges"), "Continuer vers Amortissements", "label F012");
  assertEqual(resolveNextContinueLabel("amortissement"), "Préparer la déclaration", "label F014");
});

console.log(`\n${passed}/${total} tests passés`);
if (passed !== total) process.exit(1);
