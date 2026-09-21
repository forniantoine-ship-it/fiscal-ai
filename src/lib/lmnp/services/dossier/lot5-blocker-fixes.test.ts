/**
 * Lot 5 — corrections blockers audit contradictoire (B1 / B2 / B3).
 *
 * Run: npx tsx --test src/lib/lmnp/services/dossier/lot5-blocker-fixes.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { computeAmortizationPlan } from "@/runtime/capabilities/f010/compute-amortization-plan";
import { composePlanAmortissement } from "@/runtime/capabilities/f014/compose-plan-amortissement";
import { map2033CFromRfs } from "@/runtime/capabilities/rfs/projection/map-2033c";
import { produceFiscalResult } from "@/runtime/capabilities/f006/produce-fiscal-result";
import type { ComposantNouveau } from "@/runtime/capabilities/f012/types";
import type { DeclarationDraft, FiscalYear } from "@/lib/lmnp/types/domain";
import {
  buildNextExerciseFromClosedYear,
  latestClosure,
  mergeComposantsF012,
} from "@/lib/lmnp/services/dossier/fiscal-year-cycle";
import {
  enrichImmobilisationsRfs,
  reconcileImmobilisationsContinuity,
  snapshotImmobilisationsComptables,
} from "@/lib/lmnp/services/dossier/immobilisations-comptables";
import { seedLogementAssistantForNextYear } from "@/lib/lmnp/services/dossier/n-plus-1-durable-prefill";
import { prepareFiscalYearTransitionCandidate } from "@/lib/lmnp/services/fiscal-year-transition/prepare-transition";
import {
  IMMOBILISATIONS_CONTINUITY_RECONCILIATION_FAILED,
  runDeclarationGeneration,
} from "@/lib/lmnp/services/declaration/run-declaration-generation";
import {
  runCloseAndCreateNextFiscalYear,
  __testResetCloseAndCreateNextFiscalYearGuard,
} from "@/lib/lmnp/store/close-and-create-next-fiscal-year";
import type { PersistedWorkspace } from "@/lib/lmnp/store/persistence";
import type { TransitionCommitResult } from "@/lib/lmnp/services/fiscal-year-transition/types";
import { round2 } from "@/runtime/capabilities/f010/types";
import { resolveNextMissingF010Field } from "@/lib/lmnp/services/f010/f010-document-prefill";

const NOW = "2026-09-01T00:00:00.000Z";

function identityFields() {
  return {
    siret: "12345678901234",
    siren: "123456789",
    exploitantFirstName: "Marie",
    exploitantLastName: "Dupont",
    exploitantEmail: "marie.dupont@example.com",
    exploitantTelephone: "0601020304",
    personalAddress: "10 rue des Lilas",
    personalCity: "Lyon",
    personalPostalCode: "69001",
  } as const;
}

function caseValue(form: ReturnType<typeof map2033CFromRfs>, caseId: string): number | undefined {
  return form.cases.find((c) => c.caseId === caseId)?.value as number | undefined;
}

function buildValidNWorkspace(): {
  workspace: PersistedWorkspace;
  snapBrut: number;
  snapCumul: number;
} {
  const f010 = computeAmortizationPlan({
    prixAcquisition: 250000,
    mobilierInclus: true,
    montantMobilier: 5000,
    fraisNotaire: 10000,
    choixTraitementFrais: "deduction",
    typeBien: "appartement",
    ratioTerrain: 0.2,
    dateMiseEnService: "2025-07-01",
    exerciceFiscal: 2025,
  });

  const composant: ComposantNouveau = {
    id: "travaux-1",
    label: "Cuisine",
    montant: 12000,
    dureeAnnees: 10,
    dotationAnnuelle: 1200,
    nature: "amélioration",
    dateDebut: "2025-09-01",
    origin: "f012_travaux",
  };

  const composed = composePlanAmortissement({
    exerciceFiscal: 2025,
    dateMiseEnService: "2025-07-01",
    planLogement: f010.plan,
    prorataRatio: f010.prorataRatio,
    composantsNouveaux: [composant],
  });

  const draftBase: DeclarationDraft = {
    completedSteps: [],
    inpiConfirmedAt: NOW,
    logementConfirmedAt: NOW,
    creditDeclaredNoneAt: NOW,
    revenusConfirmedAt: NOW,
    chargesConfirmedAt: NOW,
    amortissementConfirmedAt: NOW,
    siret: "12345678901234",
    siren: "123456789",
    exploitantFirstName: "Marie",
    exploitantLastName: "Dupont",
    exploitantEmail: "marie.dupont@example.com",
    exploitantTelephone: "0601020304",
    personalAddress: "10 rue des Lilas",
    personalCity: "Lyon",
    personalPostalCode: "69001",
    dateMiseEnService: "2025-07-01",
    logementAssistantState: {
      step: "complete",
      nature: "achat",
      acquisitionSource: "manuel",
      prixAcquisition: 250000,
      typeBien: "appartement",
      surface: 50,
      adresse: "1 rue Test",
      dateAcquisition: "2025-01-01",
      fraisNotaire: 10000,
      choixTraitementFrais: "deduction",
      montantMobilier: 5000,
      ratioTerrain: 0.2,
      fieldSources: {},
      updatedAt: NOW,
    },
    logementAmortissement: {
      computedAt: NOW,
      prixRevient: f010.prixRevient,
      valeurTerrain: f010.valeurTerrain,
      valeurBati: f010.valeurBati,
      baseAmortissableBati: f010.baseAmortissableBati,
      montantMobilier: f010.montantMobilierIsole,
      dotationAnnuelle: f010.plan.totalAnnuelExercice,
      dureeMoyenneAnnees: 25,
      prorataRatio: f010.prorataRatio,
      plan: f010.plan,
      fraisEnCharges: f010.fraisEnCharges,
      fieldSources: {},
    },
    revenusAssistant: { exerciceFiscal: 2025, totalRecettes: 12000 },
    chargesAssistant: {
      exerciceFiscal: 2025,
      totalDeductible: 2000,
      totalPreExploitation: 0,
      composantsNouveaux: [composant],
    },
    amortissementAssistant: {
      exerciceFiscal: 2025,
      totalDotations: composed.plan.total_dotations_exercice,
      status: "validated",
    },
  };

  const generation = runDeclarationGeneration(draftBase, 2025, undefined, undefined, undefined, {
    composantsF012Merged: [composant],
    propertyId: "prop-1",
  });
  assert.equal(generation.status, "generated", JSON.stringify(generation));
  if (generation.status !== "generated") throw new Error("unreachable");

  const immo = generation.rfs.immobilisations!;
  const snap = snapshotImmobilisationsComptables({
    immobilisations: immo,
    exerciceFiscal: 2025,
    propertyId: "prop-1",
  });
  assert.ok(snap, "snapshot N must be buildable from generated RFS");

  const workspace: PersistedWorkspace = {
    fiscalYear: {
      id: "fy-2025",
      year: 2025,
      status: "ready_to_close",
      regime: "reel",
      propertyIds: ["prop-1"],
      dossierId: "dossier-1",
      declarationGeneratedAt: NOW,
      priorHistoryDeclaration: { status: "FIRST_REAL_YEAR", declaredAt: NOW },
      closures: [],
      createdAt: NOW,
      updatedAt: NOW,
    },
    properties: [
      {
        id: "prop-1",
        label: "Mon bien",
        address: "1 rue X",
        city: "Lyon",
        postalCode: "69000",
      },
    ],
    documents: [],
    extractions: [],
    validationItems: [],
    ledgerEntries: [],
    declarationDraft: {
      ...draftBase,
      fiscalResult: generation.fiscalResult,
      rfs: generation.rfs,
      liasseRfs: generation.liasseRfs,
    },
    aiActivityFeed: [],
  };

  return {
    workspace,
    snapBrut: snap!.brutCloture,
    snapCumul: snap!.amortissementsCumulesCloture,
  };
}

describe("Lot 5 B1 — vrai parcours produit produit le snapshot", () => {
  it("runCloseAndCreateNextFiscalYear → closure.immobilisationsComptables + N+1 ouverture + 490/570", async () => {
    __testResetCloseAndCreateNextFiscalYearGuard();
    const { workspace, snapBrut, snapCumul } = buildValidNWorkspace();

    let capturedClosedPayload: unknown;
    let dispatched: PersistedWorkspace | null = null;
    let error: string | null = "untouched";

    await runCloseAndCreateNextFiscalYear({
      dossierId: "dossier-1",
      userId: "user-1",
      workspace,
      now: NOW,
      flushForTransition: async () => ({ status: "ok", revision: 3 }),
      getAuthToken: async () => "tok",
      mirrorLocalAfterCommit: async () => {},
      commitOnServer: async (input): Promise<TransitionCommitResult> => {
        capturedClosedPayload = input.closedNPayload;
        return {
          status: "committed",
          fromYear: input.fromYear,
          nextYear: input.nextYear,
          closedRevision: 4,
          nextRevision: 1,
          closedAt: NOW,
          activeFiscalYear: input.nextYear,
          nextPayload: input.nextPayload,
          nextSchemaVersion: input.nextSchemaVersion,
        };
      },
      dispatchCloseAndCreateNext: (ws) => {
        dispatched = ws;
      },
      onError: (message) => {
        error = message;
      },
    });

    assert.equal(error, null, error ?? "");
    assert.ok(dispatched, "N+1 must be dispatched");

    // Closure N figée dans le payload serveur (pas d'injection manuelle).
    const closedEnvelope = capturedClosedPayload as {
      workspace: PersistedWorkspace;
    };
    const closureN = latestClosure(closedEnvelope.workspace.fiscalYear);
    assert.ok(closureN?.immobilisationsComptables, "closure N must carry immobilisationsComptables");
    assert.equal(closureN!.immobilisationsComptables!.brutCloture, snapBrut);
    assert.equal(closureN!.immobilisationsComptables!.amortissementsCumulesCloture, snapCumul);

    assert.ok(
      dispatched!.fiscalYear.immobilisationsOuverture,
      "N+1 must carry immobilisationsOuverture",
    );
    assert.equal(dispatched!.fiscalYear.immobilisationsOuverture!.brut, snapBrut);
    assert.equal(
      dispatched!.fiscalYear.immobilisationsOuverture!.amortissementsCumules,
      snapCumul,
    );

    // Génération N+1 : 490 / 570 = clôture N.
    const f010N1 = computeAmortizationPlan({
      prixAcquisition: 250000,
      mobilierInclus: true,
      montantMobilier: 5000,
      fraisNotaire: 0,
      choixTraitementFrais: "deduction",
      typeBien: "appartement",
      ratioTerrain: 0.2,
      dateMiseEnService: "2025-07-01",
      exerciceFiscal: 2026,
    });
    const merged = mergeComposantsF012(undefined, {
      composants: [
        {
          id: "travaux-1",
          label: "Cuisine",
          montant: 12000,
          dureeAnnees: 10,
          origin: "f012_travaux",
          nature: "amélioration",
          dateDebut: "2025-09-01",
        },
      ],
    });
    const composedN1 = composePlanAmortissement({
      exerciceFiscal: 2026,
      dateMiseEnService: "2025-07-01",
      planLogement: f010N1.plan,
      prorataRatio: f010N1.prorataRatio,
      composantsNouveaux: merged,
    });

    const draftN1: DeclarationDraft = {
      completedSteps: [],
      dateMiseEnService: "2025-07-01",
      ...identityFields(),
      logementAmortissement: {
        computedAt: NOW,
        prixRevient: f010N1.prixRevient,
        valeurTerrain: f010N1.valeurTerrain,
        valeurBati: f010N1.valeurBati,
        baseAmortissableBati: f010N1.baseAmortissableBati,
        montantMobilier: f010N1.montantMobilierIsole,
        dotationAnnuelle: f010N1.plan.totalAnnuelExercice,
        dureeMoyenneAnnees: 25,
        prorataRatio: f010N1.prorataRatio,
        plan: f010N1.plan,
        fraisEnCharges: 0,
        fieldSources: {},
      },
      revenusAssistant: { exerciceFiscal: 2026, totalRecettes: 14000 },
      chargesAssistant: {
        exerciceFiscal: 2026,
        totalDeductible: 2500,
        totalPreExploitation: 0,
      },
      amortissementAssistant: {
        exerciceFiscal: 2026,
        totalDotations: composedN1.plan.total_dotations_exercice,
        status: "validated",
      },
    };

    const genN1 = runDeclarationGeneration(
      draftN1,
      2026,
      undefined,
      undefined,
      undefined,
      {
        composantsF012Merged: merged,
        immobilisationsOuverture: dispatched!.fiscalYear.immobilisationsOuverture,
        propertyId: "prop-1",
      },
    );
    assert.equal(genN1.status, "generated", JSON.stringify(genN1));
    if (genN1.status !== "generated") throw new Error("unreachable");

    const formC = map2033CFromRfs(genN1.rfs);
    assert.equal(caseValue(formC, "490"), snapBrut, "490 = gross closing N");
    assert.equal(caseValue(formC, "570"), snapCumul, "570 = accumulated depreciation closing N");
  });

  it("prepareFiscalYearTransitionCandidate (boundary exact) porte le snapshot", () => {
    const { workspace, snapBrut } = buildValidNWorkspace();
    const prepared = prepareFiscalYearTransitionCandidate({
      workspace,
      dossierId: "dossier-1",
      now: NOW,
      nextFiscalYearId: "fy-2026",
    });
    assert.equal(prepared.ok, true);
    if (!prepared.ok) throw new Error("unreachable");
    const closure = latestClosure(prepared.closedFiscalYear);
    assert.ok(closure?.immobilisationsComptables);
    assert.equal(closure!.immobilisationsComptables!.brutCloture, snapBrut);
    assert.ok(prepared.nextWorkspace.fiscalYear.immobilisationsOuverture);
    assert.equal(prepared.nextWorkspace.fiscalYear.immobilisationsOuverture!.brut, snapBrut);
  });
});

describe("Lot 5 B2 — réconciliation ouverture/clôture fail-closed", () => {
  it("Cas 1 — opening=262k, aucune acquisition, closing=262k → acquisition=0 PASS", () => {
    // Construire via totals contrôlés : terrain inclus dans openingGross.
    const immo = enrichImmobilisationsRfs({
      immobilisations: {
        lignes: [
          {
            label: "Bâti",
            montant: 200000,
            dureeAnnees: 25,
            dotationAnnuelle: 8000,
            dotationExercice: 8000,
            amortissementsCumules: 28000,
            vnc: 172000,
          },
        ],
        totalBrut: 200000,
        totalAnnuelExercice: 8000,
        valeurTerrain: 62000,
        dateMiseEnService: "2024-01-01",
        mouvements: {
          valeurBruteOuverture: 262000,
          amortissementsCumulesOuverture: 20000,
          sourceClosureId: "c-n",
        },
      },
      exerciceFiscal: 2025,
    });
    const rec = reconcileImmobilisationsContinuity({
      immobilisations: immo,
      exercice: 2025,
      amortCalcule: 8000,
    });
    assert.equal(rec.status, "ok");
    if (rec.status !== "ok") throw new Error("unreachable");
    assert.equal(rec.acquisitionsExercice, 0);

    const draft: DeclarationDraft = {
      completedSteps: [],
      dateMiseEnService: "2024-01-01",
      ...identityFields(),
      logementAmortissement: {
        computedAt: NOW,
        plan: {
          lignes: immo.lignes,
          totalBrut: immo.totalBrut,
          totalAnnuelExercice: immo.totalAnnuelExercice,
        },
        valeurTerrain: 62000,
        fraisEnCharges: 0,
        fieldSources: {},
      },
      revenusAssistant: { exerciceFiscal: 2025, totalRecettes: 10000 },
      chargesAssistant: { exerciceFiscal: 2025, totalDeductible: 1000, totalPreExploitation: 0 },
      amortissementAssistant: {
        exerciceFiscal: 2025,
        totalDotations: 8000,
        status: "validated",
      },
    };
    const gen = runDeclarationGeneration(draft, 2025, undefined, undefined, undefined, {
      immobilisationsOuverture: {
        sourceClosureId: "c-n",
        brut: 262000,
        amortissementsCumules: 20000,
        vnc: 242000,
      },
      propertyId: "prop-1",
    });
    assert.equal(gen.status, "generated", JSON.stringify(gen));
    if (gen.status !== "generated") throw new Error("unreachable");
    const form = map2033CFromRfs(gen.rfs);
    assert.equal(caseValue(form, "492"), 0);
    assert.equal(caseValue(form, "490"), 262000);
  });

  it("Cas 2 — acquisition explicite I2=8000, closing=270000 → 492=8000 PASS", () => {
    const acquisition: ComposantNouveau = {
      id: "i2-2025",
      label: "Travaux I2",
      montant: 8000,
      dureeAnnees: 10,
      dotationAnnuelle: 800,
      nature: "amélioration",
      dateDebut: "2025-03-01",
      origin: "f012_travaux",
    };
    const draft: DeclarationDraft = {
      completedSteps: [],
      dateMiseEnService: "2024-01-01",
      ...identityFields(),
      logementAmortissement: {
        computedAt: NOW,
        plan: {
          lignes: [
            {
              label: "Bâti",
              montant: 200000,
              dureeAnnees: 25,
              dotationAnnuelle: 8000,
              dotationExercice: 8000,
              amortissementsCumules: 28000,
              vnc: 172000,
            },
          ],
          totalBrut: 200000,
          totalAnnuelExercice: 8000,
        },
        valeurTerrain: 62000,
        fraisEnCharges: 0,
        fieldSources: {},
      },
      revenusAssistant: { exerciceFiscal: 2025, totalRecettes: 10000 },
      chargesAssistant: {
        exerciceFiscal: 2025,
        totalDeductible: 1000,
        totalPreExploitation: 0,
        composantsNouveaux: [acquisition],
      },
      amortissementAssistant: {
        exerciceFiscal: 2025,
        totalDotations: 8000,
        status: "validated",
      },
    };

    // Préparer amortCalcule cohérent via compose
    const composed = composePlanAmortissement({
      exerciceFiscal: 2025,
      dateMiseEnService: "2024-01-01",
      planLogement: draft.logementAmortissement!.plan,
      prorataRatio: 1,
      composantsNouveaux: [acquisition],
    });
    draft.amortissementAssistant = {
      exerciceFiscal: 2025,
      totalDotations: composed.plan.total_dotations_exercice,
      status: "validated",
    };
    // Cumul bâti = opening amort + dotation bâti (approx) ; le détail F012 porte son cumul.
    // Opening brut 262k ; closing = 262k + 8k = 270k.
    // Opening amort 20000 ; 576 = 20000 + amortCalcule.

    const gen = runDeclarationGeneration(draft, 2025, undefined, undefined, undefined, {
      composantsF012Merged: [acquisition],
      immobilisationsOuverture: {
        sourceClosureId: "c-n",
        brut: 262000,
        amortissementsCumules: 20000,
        vnc: 242000,
      },
      propertyId: "prop-1",
    });
    assert.equal(gen.status, "generated", JSON.stringify(gen));
    if (gen.status !== "generated") throw new Error("unreachable");
    const form = map2033CFromRfs(gen.rfs);
    assert.equal(caseValue(form, "492"), 8000);
    assert.equal(caseValue(form, "496"), 270000);
    assert.equal(
      round2((caseValue(form, "570") ?? 0) + (caseValue(form, "572") ?? 0)),
      caseValue(form, "576"),
    );
  });

  it("Cas 3 — historique +10k sans acquisition → FAIL CLOSED, pas 492=10000", () => {
    const draft: DeclarationDraft = {
      completedSteps: [],
      dateMiseEnService: "2024-01-01",
      ...identityFields(),
      logementAmortissement: {
        computedAt: NOW,
        plan: {
          lignes: [
            {
              label: "Bâti",
              montant: 210000,
              dureeAnnees: 25,
              dotationAnnuelle: 8000,
              dotationExercice: 8000,
              amortissementsCumules: 28000,
              vnc: 182000,
            },
          ],
          totalBrut: 210000,
          totalAnnuelExercice: 8000,
        },
        valeurTerrain: 62000, // closing gross = 272000
        fraisEnCharges: 0,
        fieldSources: {},
      },
      revenusAssistant: { exerciceFiscal: 2025, totalRecettes: 10000 },
      chargesAssistant: { exerciceFiscal: 2025, totalDeductible: 1000, totalPreExploitation: 0 },
      amortissementAssistant: {
        exerciceFiscal: 2025,
        totalDotations: 8000,
        status: "validated",
      },
    };
    const gen = runDeclarationGeneration(draft, 2025, undefined, undefined, undefined, {
      immobilisationsOuverture: {
        sourceClosureId: "c-n",
        brut: 262000,
        amortissementsCumules: 20000,
        vnc: 242000,
      },
      propertyId: "prop-1",
    });
    assert.equal(gen.status, "blocked");
    if (gen.status !== "blocked") throw new Error("unreachable");
    assert.ok(
      gen.anomalies.some((a) =>
        a.message.includes(IMMOBILISATIONS_CONTINUITY_RECONCILIATION_FAILED),
      ),
    );
    // Même si on force le mapper avec une RFS divergent, 492 ≠ +10000.
    const immo = enrichImmobilisationsRfs({
      immobilisations: {
        ...draft.logementAmortissement!.plan,
        valeurTerrain: 62000,
        dateMiseEnService: "2024-01-01",
        mouvements: {
          valeurBruteOuverture: 262000,
          amortissementsCumulesOuverture: 20000,
        },
      },
      exerciceFiscal: 2025,
      ouverture: {
        valeurBruteOuverture: 262000,
        amortissementsCumulesOuverture: 20000,
      },
    });
    const fiscal = produceFiscalResult({
      exerciceFiscal: 2025,
      activite: { dateMiseEnService: "2024-01-01" },
      revenusAssistant: draft.revenusAssistant,
      chargesAssistant: draft.chargesAssistant,
      amortissementAssistant: draft.amortissementAssistant,
    });
    assert.ok(fiscal.result);
    const form = map2033CFromRfs({
      exercice: 2025,
      identite: { siret: "12345678901234" } as never,
      fiscalResult: fiscal.result!,
      immobilisations: immo,
      trace: {
        ksArtifacts: [],
        assembledAt: NOW,
        sourceFiscalResultAt: NOW,
        sources: { identite: "t", fiscalResult: "t" },
      },
    });
    assert.equal(caseValue(form, "492"), undefined);
    assert.notEqual(caseValue(form, "492"), 10000);
  });

  it("Cas 4 — historique −10k sans cession → FAIL CLOSED, pas 492=-10000", () => {
    const draft: DeclarationDraft = {
      completedSteps: [],
      dateMiseEnService: "2024-01-01",
      ...identityFields(),
      logementAmortissement: {
        computedAt: NOW,
        plan: {
          lignes: [
            {
              label: "Bâti",
              montant: 190000,
              dureeAnnees: 25,
              dotationAnnuelle: 8000,
              dotationExercice: 8000,
              amortissementsCumules: 28000,
              vnc: 162000,
            },
          ],
          totalBrut: 190000,
          totalAnnuelExercice: 8000,
        },
        valeurTerrain: 62000, // closing = 252000
        fraisEnCharges: 0,
        fieldSources: {},
      },
      revenusAssistant: { exerciceFiscal: 2025, totalRecettes: 10000 },
      chargesAssistant: { exerciceFiscal: 2025, totalDeductible: 1000, totalPreExploitation: 0 },
      amortissementAssistant: {
        exerciceFiscal: 2025,
        totalDotations: 8000,
        status: "validated",
      },
    };
    const gen = runDeclarationGeneration(draft, 2025, undefined, undefined, undefined, {
      immobilisationsOuverture: {
        sourceClosureId: "c-n",
        brut: 262000,
        amortissementsCumules: 20000,
        vnc: 242000,
      },
    });
    assert.equal(gen.status, "blocked");
    if (gen.status !== "blocked") throw new Error("unreachable");
    assert.ok(
      gen.anomalies.some((a) =>
        a.message.includes(IMMOBILISATIONS_CONTINUITY_RECONCILIATION_FAILED),
      ),
    );
  });

  it("Cas 5 — 570 + 572 ≠ 576 → FAIL CLOSED", () => {
    const draft: DeclarationDraft = {
      completedSteps: [],
      dateMiseEnService: "2024-01-01",
      ...identityFields(),
      logementAmortissement: {
        computedAt: NOW,
        plan: {
          lignes: [
            {
              label: "Bâti",
              montant: 200000,
              dureeAnnees: 25,
              dotationAnnuelle: 8000,
              dotationExercice: 8000,
              // Cumul volontairement incohérent vs opening+dotation
              amortissementsCumules: 50000,
              vnc: 150000,
            },
          ],
          totalBrut: 200000,
          totalAnnuelExercice: 8000,
        },
        valeurTerrain: 62000,
        fraisEnCharges: 0,
        fieldSources: {},
      },
      revenusAssistant: { exerciceFiscal: 2025, totalRecettes: 10000 },
      chargesAssistant: { exerciceFiscal: 2025, totalDeductible: 1000, totalPreExploitation: 0 },
      amortissementAssistant: {
        exerciceFiscal: 2025,
        totalDotations: 8000,
        status: "validated",
      },
    };
    const gen = runDeclarationGeneration(draft, 2025, undefined, undefined, undefined, {
      immobilisationsOuverture: {
        sourceClosureId: "c-n",
        brut: 262000,
        amortissementsCumules: 20000,
        vnc: 242000,
      },
    });
    assert.equal(gen.status, "blocked");
  });

  it("Cas 6 — opening cumul inconnu → UNKNOWN, jamais 0", () => {
    const immo = enrichImmobilisationsRfs({
      immobilisations: {
        lignes: [
          {
            label: "Bâti",
            montant: 200000,
            dureeAnnees: 25,
            dotationAnnuelle: 8000,
            dotationExercice: 8000,
            amortissementsCumules: 8000,
            vnc: 192000,
          },
        ],
        totalBrut: 200000,
        totalAnnuelExercice: 8000,
        valeurTerrain: 62000,
        dateMiseEnService: "2024-01-01",
        // pas de mouvements
      },
      exerciceFiscal: 2025,
    });
    const rec = reconcileImmobilisationsContinuity({
      immobilisations: immo,
      exercice: 2025,
      amortCalcule: 8000,
    });
    assert.equal(rec.status, "unknown");

    const fiscal = produceFiscalResult({
      exerciceFiscal: 2025,
      activite: { dateMiseEnService: "2024-01-01" },
      revenusAssistant: { exerciceFiscal: 2025, totalRecettes: 10000 },
      chargesAssistant: { exerciceFiscal: 2025, totalDeductible: 1000, totalPreExploitation: 0 },
      amortissementAssistant: {
        exerciceFiscal: 2025,
        totalDotations: 8000,
        status: "validated",
      },
    });
    assert.ok(fiscal.result);
    const form = map2033CFromRfs({
      exercice: 2025,
      identite: { siret: "12345678901234" } as never,
      fiscalResult: fiscal.result!,
      immobilisations: immo,
      trace: {
        ksArtifacts: [],
        assembledAt: NOW,
        sourceFiscalResultAt: NOW,
        sources: { identite: "t", fiscalResult: "t" },
      },
    });
    assert.equal(caseValue(form, "570"), undefined);
    assert.notEqual(caseValue(form, "570"), 0);
    assert.ok(form.casesNonAlimentees.some((c) => c.caseId === "570"));
  });
});

describe("Lot 5 B3 — frais d'acquisition historiques durables", () => {
  it("déduction N → seed N+1 ne redemande pas ; fraisEnCharges=0 ; F006=0", () => {
    const seeded = seedLogementAssistantForNextYear({
      completedSteps: [],
      logementAssistantState: {
        step: "complete",
        nature: "achat",
        acquisitionSource: "manuel",
        prixAcquisition: 250000,
        typeBien: "appartement",
        surface: 50,
        adresse: "1 rue Test",
        dateAcquisition: "2025-01-01",
        fraisNotaire: 10000,
        choixTraitementFrais: "deduction",
        montantMobilier: 5000,
        ratioTerrain: 0.2,
        fieldSources: {},
        updatedAt: NOW,
      },
    });
    assert.ok(seeded);
    assert.equal(seeded!.fraisNotaire, 0);
    assert.equal(seeded!.choixTraitementFrais, "deduction");
    assert.equal(seeded!.fraisAcquisitionHistoriques?.traitement, "deduction");
    assert.equal(seeded!.fraisAcquisitionHistoriques?.montant, 10000);
    // Pas de collect_frais : frais + choix déjà connus (irréversible).
    const missing = resolveNextMissingF010Field(seeded!);
    assert.notEqual(missing.field, "fraisNotaire");
    assert.notEqual(missing.field, "choixTraitementFrais");

    const plan = computeAmortizationPlan({
      prixAcquisition: 250000,
      mobilierInclus: true,
      montantMobilier: 5000,
      fraisNotaire: seeded!.fraisNotaire!,
      choixTraitementFrais: seeded!.choixTraitementFrais!,
      typeBien: "appartement",
      ratioTerrain: 0.2,
      dateMiseEnService: "2025-07-01",
      exerciceFiscal: 2026,
    });
    assert.equal(plan.fraisEnCharges, 0);

    const fiscal = produceFiscalResult({
      exerciceFiscal: 2026,
      activite: { dateMiseEnService: "2025-07-01" },
      revenusAssistant: { exerciceFiscal: 2026, totalRecettes: 12000 },
      chargesAssistant: { exerciceFiscal: 2026, totalDeductible: 2000, totalPreExploitation: 0 },
      amortissementAssistant: {
        exerciceFiscal: 2026,
        totalDotations: plan.plan.totalAnnuelExercice,
        status: "validated",
      },
      logementAmortissement: { computedAt: NOW, fraisEnCharges: plan.fraisEnCharges },
    });
    assert.ok(fiscal.result);
    assert.equal(fiscal.result!.charges.fraisAcquisitionEnCharges ?? 0, 0);
  });

  it("intégration N → base conservée ; fraisEnCharges=0 ; pas d'acquisition N+1", () => {
    const seeded = seedLogementAssistantForNextYear({
      completedSteps: [],
      logementAssistantState: {
        step: "complete",
        prixAcquisition: 250000,
        typeBien: "appartement",
        surface: 50,
        adresse: "1 rue Test",
        dateAcquisition: "2025-01-01",
        fraisNotaire: 10000,
        choixTraitementFrais: "integration",
        montantMobilier: 5000,
        ratioTerrain: 0.2,
        fieldSources: {},
        updatedAt: NOW,
      },
    });
    assert.ok(seeded);
    assert.equal(seeded!.fraisNotaire, 10000);
    assert.equal(seeded!.choixTraitementFrais, "integration");
    assert.equal(seeded!.fraisAcquisitionHistoriques?.traitement, "integration");

    const planN = computeAmortizationPlan({
      prixAcquisition: 250000,
      mobilierInclus: true,
      montantMobilier: 5000,
      fraisNotaire: 10000,
      choixTraitementFrais: "integration",
      typeBien: "appartement",
      ratioTerrain: 0.2,
      dateMiseEnService: "2025-07-01",
      exerciceFiscal: 2025,
    });
    const planN1 = computeAmortizationPlan({
      prixAcquisition: seeded!.prixAcquisition!,
      mobilierInclus: true,
      montantMobilier: seeded!.montantMobilier,
      fraisNotaire: seeded!.fraisNotaire!,
      choixTraitementFrais: seeded!.choixTraitementFrais!,
      typeBien: "appartement",
      ratioTerrain: 0.2,
      dateMiseEnService: "2025-07-01",
      exerciceFiscal: 2026,
    });
    assert.equal(planN1.prixRevient, planN.prixRevient, "base historique conservée");
    assert.equal(planN1.fraisEnCharges, 0);
  });

  it("vrai builder N→N+1 transporte le seed frais déduits", () => {
    const closedFy: FiscalYear = {
      id: "fy-2025",
      year: 2025,
      status: "closed",
      regime: "reel",
      propertyIds: ["prop-1"],
      dossierId: "d1",
      closures: [
        {
          id: "c1",
          fiscalYearId: "fy-2025",
          stocks: { deficits: [], amortissementsReportes: 0 },
          computedAt: NOW,
          closedAt: NOW,
        },
      ],
      createdAt: NOW,
      updatedAt: NOW,
    };
    const built = buildNextExerciseFromClosedYear({
      closedFiscalYear: closedFy,
      previousDraft: {
        completedSteps: [],
        logementAssistantState: {
          step: "complete",
          prixAcquisition: 250000,
          typeBien: "appartement",
          surface: 50,
          adresse: "x",
          dateAcquisition: "2025-01-01",
          fraisNotaire: 10000,
          choixTraitementFrais: "deduction",
          fieldSources: {},
          updatedAt: NOW,
        },
      },
      dossierId: "d1",
      nextFiscalYearId: "fy-2026",
      now: NOW,
    });
    const seed = built.declarationDraft.logementAssistantState;
    assert.equal(seed?.fraisNotaire, 0);
    assert.equal(seed?.choixTraitementFrais, "deduction");
    assert.equal(seed?.fraisAcquisitionHistoriques?.montant, 10000);
  });
});
