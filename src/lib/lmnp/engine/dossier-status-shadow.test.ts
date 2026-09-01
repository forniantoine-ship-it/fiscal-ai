/**
 * dossier-status-shadow.ts tests + rapport de comparaison — Phase 2.
 * Run: npm run test:dossier-status-shadow
 *
 * Ce script sert aussi de rapport : il imprime, pour chaque scénario, si la comparaison
 * converge ou diverge, et pourquoi. En l'absence de dossiers réels dans cet environnement
 * de développement, les scénarios ci-dessous couvrent les combinaisons plausibles
 * identifiées par lecture du code (pas des cas arbitraires).
 */
import { compareDossierStatusShadow } from "./dossier-status-shadow";
import type { PersistedWorkspace } from "../store/persistence";
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

function baseWorkspace(fiscalYear: FiscalYear, declarationDraft?: Partial<DeclarationDraft>): PersistedWorkspace {
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

const ALL_DOCUMENT_JOURNEY_STEPS = [
  "inpi",
  "logement",
  "credit-immobilier",
  "bail",
  "taxe-fonciere",
  "assurance",
  "factures-travaux",
];

const STEPS_UP_TO_PAIEMENT = [
  "documents", "siren", "exploitant", "logement", "amortissement", "recettes",
  "charges-exploitation", "charges-financieres", "usages-personnels", "bareme-carburant",
  "statut-lmnp", "regime-social", "tva", "paiement",
];

const ALL_DECLARATION_STEPS = [...STEPS_UP_TO_PAIEMENT, "signature", "teletransmission"];

// Utilise `completedSteps`, qui court-circuite les vérifications par étape de
// resolveDeclarationProgress (properties/ledgerEntries) — cf. isStepComplete().
// Reconstituer un dossier réaliste jusqu'à ce niveau de détail (biens, écritures de
// grand livre par domaine) sort du périmètre de cette comparaison de Phase 2 ; ce
// raccourci teste la même divergence de niveau "phase" sans dépendre de cette
// mécanique plus fine, non concernée par STATE-001.
const FULL_DECLARATION_FIELDS: Partial<DeclarationDraft> = {
  siren: "123456789",
  exploitantFirstName: "Marie",
  exploitantLastName: "Dupont",
  regimeSocial: "micro-social",
  tvaRegime: "franchise",
  usagesPersonnelsConfirmed: true,
  baremeCarburantConfirmed: true,
  documentStepsCompleted: ALL_DOCUMENT_JOURNEY_STEPS,
};

function runTests(): void {
  let passed = 0;
  let total = 0;
  const report: string[] = [];

  function test(name: string, fn: () => ReturnType<typeof compareDossierStatusShadow> | void): void {
    total++;
    try {
      const result = fn();
      passed++;
      console.log(`  ✓ ${name}`);
      if (result) {
        report.push(
          `${result.divergent ? "⚠ DIVERGENCE" : "  convergent "} — ${name} : dérivé=${result.derived}, ` +
            `phase attendue=${result.expectedPhase}, phase observée=${result.actualPhase} ` +
            `(declaration.currentStepId=${result.declarationCurrentStepId})`,
        );
      }
    } catch (err) {
      console.error(`  ✗ ${name}`);
      console.error(`    ${err instanceof Error ? err.message : err}`);
    }
  }

  console.log("dossier-status-shadow.ts — Phase 2 : shadow comparison\n");

  test("dossier en construction, aucune divergence attendue", () => {
    const ws = baseWorkspace(baseFiscalYear("draft"));
    const result = compareDossierStatusShadow(ws);
    assertEqual(result.divergent, false, "ne doit pas diverger");
    return result;
  });

  test("dossier clos par documents/validations, déclaration entièrement remplie → convergent", () => {
    const ws = baseWorkspace(
      baseFiscalYear("closed", {
        regimeConfirmedAt: "2026-01-02T00:00:00Z",
        paidAt: "2026-04-01T00:00:00Z",
      }),
      {
        ...FULL_DECLARATION_FIELDS,
        inpiConfirmedAt: "x",
        logementConfirmedAt: "x",
        completedSteps: STEPS_UP_TO_PAIEMENT,
      },
    );
    const result = compareDossierStatusShadow(ws);
    assertEqual(result.divergent, false, "ne doit pas diverger — tout est réellement complet");
    return result;
  });

  test("ÉCART RÉEL — fiscalYear « closed » (documents/validations traités) mais champs de déclaration jamais renseignés", () => {
    const ws = baseWorkspace(
      baseFiscalYear("closed", { regimeConfirmedAt: "2026-01-02T00:00:00Z" }),
      { inpiConfirmedAt: "x", logementConfirmedAt: "x" },
      // FULL_DECLARATION_FIELDS volontairement absent : siren/regimeSocial/tva jamais remplis
    );
    const result = compareDossierStatusShadow(ws);
    assertEqual(result.divergent, true, "doit diverger — deux notions de complétude différentes");
    return result;
  });

  test("déclaration télétransmise, dérivation cohérente → convergent", () => {
    const ws = baseWorkspace(
      baseFiscalYear("closed", {
        declarationGeneratedAt: "2026-04-10T00:00:00Z",
        transmittedAt: "2026-04-15T00:00:00Z",
      }),
      {
        ...FULL_DECLARATION_FIELDS,
        signedAt: "2026-04-14T00:00:00Z",
        inpiConfirmedAt: "x",
        logementConfirmedAt: "x",
        completedSteps: ALL_DECLARATION_STEPS,
      },
    );
    const result = compareDossierStatusShadow(ws);
    assertEqual(result.divergent, false, "ne doit pas diverger");
    return result;
  });

  console.log(`\n${passed}/${total} tests passés\n`);
  console.log("── Rapport des écarts observés (Phase 2) ──────────────────────────");
  report.forEach((line) => console.log(line));
  const divergences = report.filter((l) => l.startsWith("⚠")).length;
  console.log(`\n${divergences} écart(s) sur ${report.length} scénario(s) comparé(s).`);

  if (passed !== total) process.exit(1);
}

runTests();
