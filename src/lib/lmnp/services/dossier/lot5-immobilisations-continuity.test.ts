/**
 * Lot 5 — continuité immobilisations N → N+1 → N+2 jusqu'à la liasse.
 *
 * Chaîne exercée : F010 plan → enrich RFS → 2033-C → snapshot clôture →
 * ouverture N+1 → génération → 2033-C mouvements → N+2.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { computeAmortizationPlan } from "@/runtime/capabilities/f010/compute-amortization-plan";
import { composePlanAmortissement } from "@/runtime/capabilities/f014/compose-plan-amortissement";
import { map2033CFromRfs } from "@/runtime/capabilities/rfs/projection/map-2033c";
import { assembleRegistreImmobilisationsPatrimoniales } from "@/runtime/capabilities/bilan/assemble-immobilisations-patrimoniales";
import { produceFiscalResult } from "@/runtime/capabilities/f006/produce-fiscal-result";
import { buildFiscalRepresentation } from "@/runtime/capabilities/rfs/build-fiscal-representation";
import type { ComposantNouveau } from "@/runtime/capabilities/f012/types";
import type { FiscalYear } from "@/lib/lmnp/types/domain";
import {
  buildFiscalYearClosure,
  buildNextExerciseFromClosedYear,
  mergeComposantsF012,
} from "@/lib/lmnp/services/dossier/fiscal-year-cycle";
import {
  enrichImmobilisationsRfs,
  snapshotImmobilisationsComptables,
  totalAcquisitionsExercice,
} from "@/lib/lmnp/services/dossier/immobilisations-comptables";
import { seedLogementAssistantForNextYear } from "@/lib/lmnp/services/dossier/n-plus-1-durable-prefill";
import { runDeclarationGeneration } from "@/lib/lmnp/services/declaration/run-declaration-generation";
import { round2 } from "@/runtime/capabilities/f010/types";

const NOW = "2026-09-01T00:00:00.000Z";

function baseFiscalYear(year: number, overrides: Partial<FiscalYear> = {}): FiscalYear {
  return {
    id: `fy-${year}`,
    year,
    status: "draft",
    regime: "reel",
    propertyIds: ["prop-1"],
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

function caseValue(form: ReturnType<typeof map2033CFromRfs>, caseId: string): number | undefined {
  return form.cases.find((c) => c.caseId === caseId)?.value as number | undefined;
}

describe("Lot 5 — immobilisations historiques jusqu'à la liasse", () => {
  const f010N = computeAmortizationPlan({
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

  const composantF012N: ComposantNouveau = {
    id: "travaux-cuisine-1",
    label: "Cuisine équipée",
    montant: 12000,
    dureeAnnees: 10,
    dotationAnnuelle: 1200,
    nature: "amélioration",
    dateDebut: "2025-09-01",
    origin: "f012_travaux",
  };

  it("E2E N : brut / cumul / VNC / 490=0 / 492=brut / 570=0 ; snapshot clôture fiable", () => {
    const composed = composePlanAmortissement({
      exerciceFiscal: 2025,
      dateMiseEnService: "2025-07-01",
      planLogement: f010N.plan,
      prorataRatio: f010N.prorataRatio,
      composantsNouveaux: [composantF012N],
    });

    const immo = enrichImmobilisationsRfs({
      immobilisations: {
        ...f010N.plan,
        valeurTerrain: f010N.valeurTerrain,
        montantMobilier: f010N.montantMobilierIsole,
        dateMiseEnService: "2025-07-01",
        composantsNouveaux: [composantF012N],
      },
      exerciceFiscal: 2025,
      composantsMerged: [composantF012N],
      propertyId: "prop-1",
    });

    assert.equal(immo.composantsDetail?.length, 1);
    assert.equal(immo.composantsDetail![0]!.provenance, "acquisition_exercice");
    assert.equal(immo.composantsDetail![0]!.propertyId, "prop-1");

    const fiscal = produceFiscalResult({
      exerciceFiscal: 2025,
      activite: { dateMiseEnService: "2025-07-01" },
      revenusAssistant: {
        exerciceFiscal: 2025,
        totalRecettes: 12000,
      },
      chargesAssistant: {
        exerciceFiscal: 2025,
        totalDeductible: 2000,
        totalPreExploitation: 0,
      },
      amortissementAssistant: {
        exerciceFiscal: 2025,
        totalDotations: composed.plan.total_dotations_exercice,
        status: "validated",
      },
      logementAmortissement: {
        computedAt: NOW,
        fraisEnCharges: f010N.fraisEnCharges,
      },
    });
    assert.ok(fiscal.result, JSON.stringify(fiscal.anomalies));

    const rfs = buildFiscalRepresentation({
      fiscalResult: fiscal.result,
      identite: { siret: "12345678900011" } as never,
      immobilisations: immo,
    });
    const formC = map2033CFromRfs(rfs);
    const brutFin = caseValue(formC, "496")!;
    const cumulFin = caseValue(formC, "576")!;
    assert.equal(caseValue(formC, "490"), 0);
    assert.equal(caseValue(formC, "570"), 0);
    assert.equal(caseValue(formC, "492"), brutFin);
    assert.ok(brutFin > 0);
    assert.ok(cumulFin > 0);

    const registre = assembleRegistreImmobilisationsPatrimoniales({
      immobilisations: immo,
      amortCalcule: fiscal.result.amortCalcule,
    });
    assert.equal(registre.brutFiable, true);
    assert.equal(registre.netFiable, true);
    assert.equal(registre.brutTotal, brutFin);
    assert.equal(registre.cumuleTotal, cumulFin);

    const snap = snapshotImmobilisationsComptables({
      immobilisations: immo,
      exerciceFiscal: 2025,
      propertyId: "prop-1",
    });
    assert.ok(snap);
    assert.equal(snap!.brutCloture, brutFin);
    assert.equal(snap!.amortissementsCumulesCloture, cumulFin);
    assert.equal(snap!.vncCloture, round2(brutFin - cumulFin));
    assert.ok(snap!.actifs.every((a) => a.propertyId === "prop-1" || a.id === "terrain"));
  });

  it("E2E N→N+1 : pas de fausse acquisition ; ouverture = clôture N ; cumul monotone", () => {
    const immoN = enrichImmobilisationsRfs({
      immobilisations: {
        ...f010N.plan,
        valeurTerrain: f010N.valeurTerrain,
        montantMobilier: f010N.montantMobilierIsole,
        dateMiseEnService: "2025-07-01",
        composantsNouveaux: [composantF012N],
      },
      exerciceFiscal: 2025,
      composantsMerged: [composantF012N],
      propertyId: "prop-1",
    });
    const snapN = snapshotImmobilisationsComptables({
      immobilisations: immoN,
      exerciceFiscal: 2025,
      propertyId: "prop-1",
    })!;

    const closedN = buildFiscalYearClosure({
      fiscalYearId: "fy-2025",
      dossierId: "d1",
      stocks: { deficits: [], amortissementsReportes: 0 },
      computedAt: NOW,
      now: NOW,
      immobilisationsComptables: snapN,
    });
    const fyClosed: FiscalYear = {
      ...baseFiscalYear(2025, { status: "closed", closures: [closedN] }),
    };

    const next = buildNextExerciseFromClosedYear({
      closedFiscalYear: fyClosed,
      previousDraft: {
        completedSteps: [],
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
          fieldSources: {},
          updatedAt: NOW,
        } as never,
      },
      dossierId: "d1",
      nextFiscalYearId: "fy-2026",
      now: NOW,
    });

    assert.ok(next.fiscalYear.immobilisationsOuverture);
    assert.equal(next.fiscalYear.immobilisationsOuverture!.brut, snapN.brutCloture);
    assert.equal(
      next.fiscalYear.immobilisationsOuverture!.amortissementsCumules,
      snapN.amortissementsCumulesCloture,
    );

    // F010 rejoué en N+1 (même base, exercice 2026)
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
          id: composantF012N.id,
          label: composantF012N.label,
          montant: composantF012N.montant,
          dureeAnnees: composantF012N.dureeAnnees,
          origin: composantF012N.origin,
          nature: composantF012N.nature,
          dateDebut: composantF012N.dateDebut,
        },
      ],
      valeurTerrain: f010N.valeurTerrain,
      montantMobilier: f010N.montantMobilierIsole,
      dateMiseEnService: "2025-07-01",
    });
    assert.equal(merged.length, 1);
    assert.equal(merged[0]!.id, composantF012N.id);

    const immoN1 = enrichImmobilisationsRfs({
      immobilisations: {
        ...f010N1.plan,
        valeurTerrain: f010N1.valeurTerrain,
        montantMobilier: f010N1.montantMobilierIsole,
        dateMiseEnService: "2025-07-01",
      },
      exerciceFiscal: 2026,
      composantsMerged: merged,
      propertyId: "prop-1",
      ouverture: {
        valeurBruteOuverture: next.fiscalYear.immobilisationsOuverture!.brut,
        amortissementsCumulesOuverture:
          next.fiscalYear.immobilisationsOuverture!.amortissementsCumules,
        sourceClosureId: next.fiscalYear.immobilisationsOuverture!.sourceClosureId,
      },
    });

    assert.equal(immoN1.composantsDetail![0]!.provenance, "historique");
    assert.equal(totalAcquisitionsExercice(immoN1.composantsDetail!), 0);

    const composedN1 = composePlanAmortissement({
      exerciceFiscal: 2026,
      dateMiseEnService: "2025-07-01",
      planLogement: f010N1.plan,
      prorataRatio: f010N1.prorataRatio,
      composantsNouveaux: merged,
    });

    const fiscalN1 = produceFiscalResult({
      exerciceFiscal: 2026,
      activite: { dateMiseEnService: "2025-07-01" },
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
      logementAmortissement: { computedAt: NOW, fraisEnCharges: 0 },
    });
    assert.ok(fiscalN1.result, JSON.stringify(fiscalN1.anomalies));

    const rfsN1 = buildFiscalRepresentation({
      fiscalResult: fiscalN1.result,
      identite: { siret: "12345678900011" } as never,
      immobilisations: immoN1,
    });
    const formN1 = map2033CFromRfs(rfsN1);

    assert.equal(caseValue(formN1, "490"), snapN.brutCloture, "opening gross = closing N");
    assert.equal(caseValue(formN1, "492"), 0, "aucune fausse acquisition N+1");
    assert.equal(
      caseValue(formN1, "570"),
      snapN.amortissementsCumulesCloture,
      "opening amort = closing N",
    );
    const cumulN1 = caseValue(formN1, "576")!;
    assert.ok(
      cumulN1 > snapN.amortissementsCumulesCloture,
      "cumul clôture N+1 > ouverture (dotation N+1)",
    );
    assert.equal(
      round2(cumulN1 - snapN.amortissementsCumulesCloture),
      round2(fiscalN1.result.amortCalcule),
      "Δ cumul = dotation comptable annuelle (≠ stock fiscal)",
    );
  });

  it("NO DOUBLE COUNT : même id F012 via base + exercice → une seule ligne", () => {
    const fromExercice = [composantF012N];
    const fromBase = {
      composants: [
        {
          id: composantF012N.id,
          label: composantF012N.label,
          montant: composantF012N.montant,
          dureeAnnees: composantF012N.dureeAnnees,
          origin: composantF012N.origin,
          nature: composantF012N.nature,
          dateDebut: composantF012N.dateDebut,
        },
      ],
    };
    const merged = mergeComposantsF012(fromExercice, fromBase);
    assert.equal(merged.length, 1);

    const details = enrichImmobilisationsRfs({
      immobilisations: {
        ...f010N.plan,
        valeurTerrain: f010N.valeurTerrain,
        dateMiseEnService: "2025-07-01",
        composantsNouveaux: fromExercice,
      },
      exerciceFiscal: 2025,
      composantsMerged: merged,
    }).composantsDetail!;

    assert.equal(details.length, 1);
    assert.equal(details[0]!.montant, 12000);
  });

  it("FRAIS : deduction N → frais courants=0 + choix durable ; integration → conservés", () => {
    const deducted = seedLogementAssistantForNextYear({
      completedSteps: [],
      logementAssistantState: {
        step: "complete",
        prixAcquisition: 200000,
        adresse: "x",
        typeBien: "appartement",
        surface: 40,
        dateAcquisition: "2020-01-01",
        fraisNotaire: 8000,
        choixTraitementFrais: "deduction",
        fieldSources: {},
        updatedAt: NOW,
      } as never,
    });
    assert.equal(deducted?.fraisNotaire, 0);
    assert.equal(deducted?.choixTraitementFrais, "deduction");
    assert.equal(deducted?.fraisAcquisitionHistoriques?.montant, 8000);
    assert.equal(deducted?.fraisAcquisitionHistoriques?.traitement, "deduction");

    const integrated = seedLogementAssistantForNextYear({
      completedSteps: [],
      logementAssistantState: {
        step: "complete",
        prixAcquisition: 200000,
        adresse: "x",
        typeBien: "appartement",
        surface: 40,
        dateAcquisition: "2020-01-01",
        fraisNotaire: 8000,
        choixTraitementFrais: "integration",
        fieldSources: {},
        updatedAt: NOW,
      } as never,
    });
    assert.equal(integrated?.fraisNotaire, 8000);
    assert.equal(integrated?.choixTraitementFrais, "integration");
  });

  it("STOCK FISCAL ≠ CUMUL COMPTABLE : amortReporte n'entre pas dans 570/576", () => {
    const immo = enrichImmobilisationsRfs({
      immobilisations: {
        ...f010N.plan,
        valeurTerrain: f010N.valeurTerrain,
        dateMiseEnService: "2025-07-01",
      },
      exerciceFiscal: 2025,
    });
    const snap = snapshotImmobilisationsComptables({
      immobilisations: immo,
      exerciceFiscal: 2025,
    })!;

    // Forcer un report fiscal artificiel élevé ≠ cumul comptable
    const fiscalStock = 99999;
    assert.notEqual(snap.amortissementsCumulesCloture, fiscalStock);

    const closed = buildFiscalYearClosure({
      fiscalYearId: "fy-2025",
      stocks: { deficits: [], amortissementsReportes: fiscalStock },
      computedAt: NOW,
      now: NOW,
      immobilisationsComptables: snap,
    });
    assert.equal(closed.stocks.amortissementsReportes, fiscalStock);
    assert.equal(closed.immobilisationsComptables!.amortissementsCumulesCloture, snap.amortissementsCumulesCloture);
  });

  it("N→N+1→N+2 : IDs stables, brut stable, cumul monotone, pas de reseed acquisition", () => {
    const immoN = enrichImmobilisationsRfs({
      immobilisations: {
        ...f010N.plan,
        valeurTerrain: f010N.valeurTerrain,
        dateMiseEnService: "2025-07-01",
        composantsNouveaux: [composantF012N],
      },
      exerciceFiscal: 2025,
      composantsMerged: [composantF012N],
      propertyId: "prop-1",
    });
    const snapN = snapshotImmobilisationsComptables({
      immobilisations: immoN,
      exerciceFiscal: 2025,
      propertyId: "prop-1",
    })!;

    const fyN = baseFiscalYear(2025, {
      status: "closed",
      closures: [
        buildFiscalYearClosure({
          fiscalYearId: "fy-2025",
          stocks: { deficits: [], amortissementsReportes: 100 },
          computedAt: NOW,
          now: NOW,
          immobilisationsComptables: snapN,
        }),
      ],
    });

    const n1 = buildNextExerciseFromClosedYear({
      closedFiscalYear: fyN,
      previousDraft: { completedSteps: [], dateMiseEnService: "2025-07-01" },
      dossierId: "d1",
      nextFiscalYearId: "fy-2026",
      now: NOW,
    });

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
    const mergedHist = mergeComposantsF012(undefined, {
      composants: [
        {
          id: composantF012N.id,
          label: composantF012N.label,
          montant: composantF012N.montant,
          dureeAnnees: composantF012N.dureeAnnees,
          origin: composantF012N.origin,
          nature: composantF012N.nature,
          dateDebut: composantF012N.dateDebut,
        },
      ],
    });

    // Nouveau composant réellement acquis en N+1
    const composantN1: ComposantNouveau = {
      id: "travaux-sdb-2",
      label: "Salle de bain",
      montant: 8000,
      dureeAnnees: 15,
      dotationAnnuelle: round2(8000 / 15),
      nature: "amélioration",
      dateDebut: "2026-03-01",
      origin: "f012_travaux",
    };
    const mergedN1 = mergeComposantsF012([composantN1], {
      composants: mergedHist.map((c) => ({
        id: c.id,
        label: c.label,
        montant: c.montant,
        dureeAnnees: c.dureeAnnees,
        origin: c.origin,
        nature: c.nature,
        dateDebut: c.dateDebut,
      })),
    });
    assert.equal(mergedN1.length, 2);

    const immoN1 = enrichImmobilisationsRfs({
      immobilisations: {
        ...f010N1.plan,
        valeurTerrain: f010N1.valeurTerrain,
        dateMiseEnService: "2025-07-01",
      },
      exerciceFiscal: 2026,
      composantsMerged: mergedN1,
      propertyId: "prop-1",
      ouverture: {
        valeurBruteOuverture: n1.fiscalYear.immobilisationsOuverture!.brut,
        amortissementsCumulesOuverture: n1.fiscalYear.immobilisationsOuverture!.amortissementsCumules,
        sourceClosureId: n1.fiscalYear.immobilisationsOuverture!.sourceClosureId,
      },
    });
    assert.equal(totalAcquisitionsExercice(immoN1.composantsDetail!), 8000);

    const snapN1 = snapshotImmobilisationsComptables({
      immobilisations: immoN1,
      exerciceFiscal: 2026,
      propertyId: "prop-1",
    })!;
    assert.ok(snapN1.amortissementsCumulesCloture > snapN.amortissementsCumulesCloture);
    assert.equal(
      round2(snapN1.brutCloture - snapN.brutCloture),
      8000,
      "Δ brut = seule acquisition N+1",
    );

    const fyN1 = baseFiscalYear(2026, {
      status: "closed",
      previousFiscalYearId: "fy-2025",
      closures: [
        buildFiscalYearClosure({
          fiscalYearId: "fy-2026",
          stocks: { deficits: [], amortissementsReportes: 250 },
          computedAt: NOW,
          now: NOW,
          immobilisationsComptables: snapN1,
        }),
      ],
    });

    const n2 = buildNextExerciseFromClosedYear({
      closedFiscalYear: fyN1,
      previousDraft: { completedSteps: [], dateMiseEnService: "2025-07-01" },
      dossierId: "d1",
      nextFiscalYearId: "fy-2027",
      now: NOW,
    });
    assert.equal(n2.fiscalYear.immobilisationsOuverture!.brut, snapN1.brutCloture);
    assert.equal(
      n2.fiscalYear.immobilisationsOuverture!.amortissementsCumules,
      snapN1.amortissementsCumulesCloture,
    );
    // Stock fiscal suit son propre chemin
    assert.notEqual(
      n2.fiscalYear.immobilisationsOuverture!.amortissementsCumules,
      fyN1.closures![0]!.stocks.amortissementsReportes,
    );
  });

  it("runDeclarationGeneration transporte composantsDetail + mouvements", () => {
    const planN1 = computeAmortizationPlan({
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
    const composed = composePlanAmortissement({
      exerciceFiscal: 2026,
      dateMiseEnService: "2025-07-01",
      planLogement: planN1.plan,
      prorataRatio: planN1.prorataRatio,
      composantsNouveaux: [composantF012N],
    });

    // Ouverture = clôture N cohérente (pas une valeur fictive) :
    // brut stable, cumul = cumul N+1 − dotation N+1.
    const immoPreview = enrichImmobilisationsRfs({
      immobilisations: {
        ...planN1.plan,
        valeurTerrain: planN1.valeurTerrain,
        montantMobilier: planN1.montantMobilierIsole,
        dateMiseEnService: "2025-07-01",
      },
      exerciceFiscal: 2026,
      composantsMerged: [composantF012N],
      propertyId: "prop-1",
    });
    const brutCloture =
      planN1.plan.totalBrut +
      planN1.valeurTerrain +
      (immoPreview.composantsDetail?.[0]?.montant ?? 0);
    const cumulCloture =
      planN1.plan.lignes.reduce((a, l) => a + l.amortissementsCumules, 0) +
      (immoPreview.composantsDetail?.[0]?.amortissementsCumules ?? 0);
    const openingBrut = round2(brutCloture);
    const openingCumul = round2(cumulCloture - composed.plan.total_dotations_exercice);

    const draft = {
      completedSteps: ["siren", "logement", "charges", "revenus", "amortissement"],
      siret: "12345678901234",
      siren: "123456789",
      exploitantFirstName: "Marie",
      exploitantLastName: "Dupont",
      dateMiseEnService: "2025-07-01",
      inpiConfirmedAt: NOW,
      logementConfirmedAt: NOW,
      chargesConfirmedAt: NOW,
      revenusConfirmedAt: NOW,
      amortissementConfirmedAt: NOW,
      logementAmortissement: {
        exerciceFiscal: 2026,
        prixRevient: planN1.prixRevient,
        valeurTerrain: planN1.valeurTerrain,
        valeurBati: planN1.valeurBati,
        baseAmortissableBati: planN1.baseAmortissableBati,
        montantMobilier: planN1.montantMobilierIsole,
        dotationAnnuelle: planN1.plan.totalAnnuelExercice,
        dureeMoyenneAnnees: 25,
        prorataRatio: planN1.prorataRatio,
        plan: planN1.plan,
        fieldSources: {},
        computedAt: NOW,
        fraisEnCharges: 0,
      },
      chargesAssistant: {
        exerciceFiscal: 2026,
        totalDeductible: 1000,
        totalNonDeductible: 0,
        totalAmortissable: 0,
        totalPreExploitation: 0,
        parCategorie: {},
        composantsNouveaux: [],
        fieldSources: {},
        computedAt: NOW,
      },
      revenusAssistant: {
        exerciceFiscal: 2026,
        totalRecettes: 10000,
        loyersEncaisses: 10000,
        indemnitesAssurance: 0,
        recettesPlateforme: 0,
        ajustementsJanDec: 0,
        moisLocationEffectifs: 12,
        fieldSources: {},
        computedAt: NOW,
      },
      amortissementAssistant: {
        exerciceFiscal: 2026,
        totalDotations: composed.plan.total_dotations_exercice,
        status: "validated" as const,
        planVersion: "v1",
        profil: "PROF-001",
        validatedAt: NOW,
      },
    };

    const gen = runDeclarationGeneration(draft as never, 2026, undefined, undefined, undefined, {
      composantsF012Merged: [composantF012N],
      immobilisationsOuverture: {
        sourceClosureId: "closure-n",
        brut: openingBrut,
        amortissementsCumules: openingCumul,
        vnc: round2(openingBrut - openingCumul),
      },
      propertyId: "prop-1",
    });
    assert.equal(gen.status, "generated", JSON.stringify(gen.status === "blocked" ? gen.anomalies : ""));
    if (gen.status !== "generated") return;
    assert.ok(gen.rfs.immobilisations?.composantsDetail?.length);
    assert.equal(gen.rfs.immobilisations?.mouvements?.valeurBruteOuverture, openingBrut);
    assert.equal(gen.rfs.immobilisations?.mouvements?.amortissementsCumulesOuverture, openingCumul);

    const form = map2033CFromRfs(gen.rfs);
    assert.equal(caseValue(form, "490"), openingBrut);
    assert.equal(caseValue(form, "570"), openingCumul);
  });
});
