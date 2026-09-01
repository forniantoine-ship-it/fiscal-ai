/**
 * dossier-completeness-shadow.ts tests + rapport — Phase 4.2 (requalifiée, mesure seule).
 * Run: npm run test:dossier-completeness-shadow
 */
import { compareDossierCompletenessShadow } from "./dossier-completeness-shadow";
import type { DashboardWorkspace } from "@/components/lmnp/dashboard/dashboard-workflow-model";
import type { FiscalYear, FiscalYearStatus, DeclarationDraft } from "../types";

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

// Fixture volontairement partielle : businessStepsComplete() et deriveStatutDossier()
// ne lisent que fiscalYear, properties, documents, extractions, validationItems, alerts,
// declarationDraft. `alerts` a été ajouté ici (Cycle 21) : `resolveDashboardWorkflow()`
// appelle `stepOpenAlertCount()` pour CHAQUE étape (badge de correction), qui lit
// `workspace.alerts` — un champ requis de `LmnpWorkspace` (domain.ts), toujours peuplé
// (même vide) dans un workspace réel. Son absence ici faisait planter `.filter()` sur
// `undefined` : un défaut de fixture (jamais mis à jour quand ce champ est devenu requis
// par le chemin testé), pas un bug de production — `alerts` n'est jamais absent d'un
// vrai workspace, seul ce fixture partiel l'omettait. Le cast reflète la portée réelle
// du code testé, pas une négligence de typage.
function baseWorkspace(fiscalYear: FiscalYear, declarationDraft?: Partial<DeclarationDraft>): DashboardWorkspace {
  return {
    fiscalYear,
    properties: [],
    documents: [],
    extractions: [],
    validationItems: [],
    ledgerEntries: [],
    alerts: [],
    declarationDraft: declarationDraft ? { completedSteps: [], ...declarationDraft } : undefined,
  } as unknown as DashboardWorkspace;
}

const ALL_FEATURES_CONFIRMED: Partial<DeclarationDraft> = {
  inpiConfirmedAt: "x",
  logementConfirmedAt: "x",
  creditDeclaredNoneAt: "x",
  revenusConfirmedAt: "x",
  chargesConfirmedAt: "x",
  amortissementConfirmedAt: "x",
};

function runTests(): void {
  let passed = 0;
  let total = 0;
  const report: string[] = [];

  function test(name: string, fn: () => ReturnType<typeof compareDossierCompletenessShadow>): void {
    total++;
    try {
      const result = fn();
      passed++;
      console.log(`  ✓ ${name}`);
      report.push(
        `${result.divergent ? "⚠ DIVERGENCE" : "  convergent "} — ${name} : ` +
          `businessStepsComplete=${result.businessStepsComplete}, derived=${result.derivedStatus} ` +
          `(DOSSIER_COMPLET=${result.derivedIsDossierComplet}, pastDossierComplet=${result.derivedPastDossierComplet})`,
      );
    } catch (err) {
      console.error(`  ✗ ${name}`);
      console.error(`    ${err instanceof Error ? err.message : err}`);
    }
  }

  console.log("dossier-completeness-shadow.ts — Phase 4.2 (mesure seule)\n");

  test("dossier en construction, aucune étape confirmée → convergent (les deux disent non)", () => {
    const ws = baseWorkspace(baseFiscalYear("draft"));
    const result = compareDossierCompletenessShadow(ws);
    assertEqual(result.divergent, false, "ne doit pas diverger");
    assertEqual(result.businessStepsComplete, false, "aucune étape confirmée");
    return result;
  });

  test("ready_to_close ET toutes les étapes confirmées → convergent (les deux disent oui)", () => {
    const ws = baseWorkspace(baseFiscalYear("ready_to_close"), ALL_FEATURES_CONFIRMED);
    const result = compareDossierCompletenessShadow(ws);
    assertEqual(result.divergent, false, "ne doit pas diverger");
    assertEqual(result.businessStepsComplete, true, "toutes les étapes confirmées");
    assertEqual(result.derivedIsDossierComplet, true, "ready_to_close ⇒ DOSSIER_COMPLET");
    return result;
  });

  test("ÉCART POSSIBLE — étapes confirmées manuellement, mais documents requis absents/non analysés", () => {
    // fiscalYear reste "draft" ou "collecting_documents" car dossierDone (hasMissingRequiredDocs)
    // exige des documents de type précis analysés — jamais fournis ici, même si l'utilisateur
    // a confirmé chaque étape via saisie manuelle (cf. F010LogementAssistant, option manuelle).
    const ws = baseWorkspace(baseFiscalYear("draft", { regimeConfirmedAt: "x" }), ALL_FEATURES_CONFIRMED);
    const result = compareDossierCompletenessShadow(ws);
    assertEqual(result.businessStepsComplete, true, "étapes confirmées manuellement");
    assertEqual(result.derivedIsDossierComplet, false, "dossierDone non atteint sans documents requis");
    assertEqual(result.divergent, true, "doit être signalé — deux responsabilités distinctes en désaccord");
    return result;
  });

  test("dossier passé au calcul — non-égalité attendue, pas une divergence", () => {
    const ws = baseWorkspace(baseFiscalYear("closed"), ALL_FEATURES_CONFIRMED);
    const result = compareDossierCompletenessShadow(ws);
    assertEqual(result.derivedIsDossierComplet, false, "l'état a progressé au-delà de DOSSIER_COMPLET");
    assertEqual(result.derivedPastDossierComplet, true, "closed est postérieur à DOSSIER_COMPLET");
    assertEqual(result.divergent, false, "non-égalité attendue par progression normale, pas une vraie divergence");
    return result;
  });

  console.log(`\n${passed}/${total} tests passés\n`);
  console.log("── Rapport de convergence businessStepsComplete ↔ DOSSIER_COMPLET (Phase 4.2) ──");
  report.forEach((line) => console.log(line));
  const divergences = report.filter((l) => l.startsWith("⚠")).length;
  console.log(`\n${divergences} divergence(s) réelle(s) sur ${report.length} scénario(s).`);
  console.log(
    "Conclusion : les deux notions restent deux responsabilités distinctes, aucune fusion effectuée.",
  );

  if (passed !== total) process.exit(1);
}

runTests();
