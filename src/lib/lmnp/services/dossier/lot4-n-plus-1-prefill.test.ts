/**
 * Lot 4 — suite N→N+1 : préremplissage durable, reset annuel, year-safety,
 * invalidations déterministes.
 *
 * Run: npx tsx --test src/lib/lmnp/services/dossier/lot4-n-plus-1-prefill.test.ts
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { DeclarationDraft, FiscalYear, Property } from "../../types/domain";
import {
  buildNextExerciseFromClosedYear,
  createNextDeclarationDraft,
  extractFinancementBases,
} from "./fiscal-year-cycle";
import {
  isAnnualOutputForActiveYear,
  isAnnualOutputProvenForActiveYear,
} from "./annual-output-year-safety";
import { buildDownstreamInvalidationPatch } from "./declaration-draft-invalidation";
import { durableLoanFromPrevious } from "./n-plus-1-durable-prefill";
import { restoreF009, nextMissingQuestion } from "@/runtime/assistants/f009-activite/assistant";
import { validateFiscalInputs } from "@/runtime/capabilities/f006/validate-fiscal-inputs";
import { buildDossierSteps } from "../validation-profile";
import type { F011LoanDraft } from "@/runtime/assistants/f011-financement/types";

const NOW = "2026-09-21T12:00:00.000Z";
const STOCKS = {
  deficits: [] as { millesime: number; montant: number }[],
  amortissementsReportes: 0,
};

function closedN(): FiscalYear {
  return {
    id: "fy-N",
    year: 2025,
    status: "closed",
    regime: "reel",
    propertyIds: ["prop-stable-1"],
    dossierId: "dossier-1",
    createdAt: NOW,
    updatedAt: NOW,
    closures: [
      {
        id: "closure-N",
        fiscalYearId: "fy-N",
        dossierId: "dossier-1",
        stocks: STOCKS,
        computedAt: NOW,
        closedAt: NOW,
      },
    ],
  };
}

function richNDraft(): DeclarationDraft {
  const loan: F011LoanDraft = {
    pretId: "pret-stable-1",
    typePret: "amortissable",
    capitalInitial: 200000,
    tauxNominal: 0.03,
    dureeMois: 240,
    datePremiereMensualite: "2022-01-15",
    assuranceAnnuelle: 480,
    assuranceType: "bancaire",
    typeGarantie: "caution",
    commissionCaution: 2500,
    fraisDossier: 900,
    iraMontant: 0,
    souscritCetExercice: false,
  };

  return {
    completedSteps: ["siren", "logement", "credit", "charges", "revenus", "amortissement"],
    siren: "123456789",
    siret: "12345678901234",
    exploitantFirstName: "Marie",
    exploitantLastName: "Dupont",
    exploitantEmail: "marie@example.com",
    personalAddress: "1 rue Test",
    personalCity: "Lyon",
    personalPostalCode: "69001",
    establishmentAddress: "1 rue Test",
    establishmentCity: "Lyon",
    establishmentPostalCode: "69001",
    activityStartDate: "2019-06-01",
    dateMiseEnService: "2020-01-01",
    inpiConfirmedAt: NOW,
    logementConfirmedAt: NOW,
    creditConfirmedAt: NOW,
    chargesConfirmedAt: NOW,
    revenusConfirmedAt: NOW,
    amortissementConfirmedAt: NOW,
    paidAt: NOW,
    declarationGeneratedAt: NOW,
    logementAssistantState: {
      step: "complete",
      nature: "achat",
      acquisitionSource: "manuel",
      prixAcquisition: 250000,
      typeBien: "appartement",
      surface: 55,
      adresse: "12 rue des Lilas, 75011 Paris",
      dateAcquisition: "2019-03-15",
      fraisNotaire: 15000,
      choixTraitementFrais: "deduction",
      montantMobilier: 5000,
      fieldSources: {},
      confirmed: { prixAcquisition: true },
      updatedAt: NOW,
    },
    logementAmortissement: {
      exerciceFiscal: 2025,
      prixRevient: 250000,
      valeurTerrain: 50000,
      valeurBati: 200000,
      baseAmortissableBati: 200000,
      montantMobilier: 5000,
      dotationAnnuelle: 8000,
      dureeMoyenneAnnees: 25,
      prorataRatio: 1,
      plan: { lignes: [], totalAnnuelExercice: 8000, totalBrut: 200000 },
      fieldSources: {},
      computedAt: NOW,
    },
    financementAssistantState: {
      step: "complete",
      presenceEmprunt: true,
      nombrePrets: 1,
      currentLoanIndex: 0,
      loans: [loan],
      fieldSources: {},
      updatedAt: NOW,
    },
    financementCharges: {
      exerciceFiscal: 2025,
      totalInteretsEmprunt: 5000,
      totalInteretsPreExploitation: 0,
      totalAssurance: 480,
      totalCapitalRembourse: 8000,
      totalChargesFinancementExercice: 5480,
      prets: [],
      fieldSources: {},
      computedAt: NOW,
    },
    chargesAssistant: {
      exerciceFiscal: 2025,
      totalDeductible: 2000,
      totalNonDeductible: 0,
      totalAmortissable: 0,
      totalPreExploitation: 0,
      parCategorie: { taxe_fonciere: 1200 },
      composantsNouveaux: [],
      fieldSources: {},
      computedAt: NOW,
    },
    revenusAssistant: {
      exerciceFiscal: 2025,
      totalRecettes: 12000,
      loyersEncaisses: 12000,
      indemnitesAssurance: 0,
      recettesPlateforme: 0,
      ajustementsJanDec: 0,
      moisLocationEffectifs: 12,
      fieldSources: {},
      computedAt: NOW,
    },
    amortissementAssistant: {
      exerciceFiscal: 2025,
      totalDotations: 8000,
      status: "validated",
      planVersion: "v1",
      profil: "PROF-001",
      validatedAt: NOW,
    },
    fiscalResult: {
      exercice: 2025,
      resultatFiscal: 1000,
      resultatAvantAmort: 9000,
      totalRecettes: 12000,
      totalCharges: 3000,
      amortDeduct: 8000,
      amortReporte: 0,
      deficitNouveau: 0,
      stocks: STOCKS,
      trace: { ksArtifacts: [], computedAt: NOW, journal: [] },
      computedAt: NOW,
    },
    rfs: { identite: { siren: "123456789" } } as DeclarationDraft["rfs"],
    liasseResult: { form2031: {} } as DeclarationDraft["liasseResult"],
  } as DeclarationDraft;
}

describe("Lot 4 — transition N→N+1 via builder réel", () => {
  it("scénario principal : prefills durables + resets annuels", () => {
    const previous = richNDraft();
    const property: Property = {
      id: "prop-stable-1",
      label: "Bien",
      address: "12 rue des Lilas",
      city: "Paris",
      postalCode: "75011",
      amortissementBase: {
        composants: [{ label: "Gros œuvre", montant: 100000, dureeAnnees: 50 }],
        dateMiseEnService: "2020-01-01",
      },
    };

    const built = buildNextExerciseFromClosedYear({
      closedFiscalYear: closedN(),
      previousDraft: previous,
      dossierId: "dossier-1",
      nextFiscalYearId: "fy-N1",
      now: "2027-01-01T00:00:00.000Z",
    });

    const draft = built.declarationDraft;

    // F009
    assert.equal(draft.siren, "123456789");
    assert.equal(draft.activityStartDate, "2019-06-01");
    assert.equal(draft.dateMiseEnService, "2020-01-01");
    assert.equal(draft.inpiConfirmedAt, undefined);
    const f009 = restoreF009(draft);
    assert.notEqual(f009.step, "complete");
    assert.equal(nextMissingQuestion(f009), undefined, "faits présents → review, pas questions manquantes");
    assert.ok(f009.step === "situation" || f009.step === "review" || f009.step === "document");

    // F010
    assert.equal(property.id, "prop-stable-1");
    assert.ok(draft.logementAssistantState);
    assert.equal(draft.logementAssistantState?.prixAcquisition, 250000);
    assert.equal(draft.logementAssistantState?.adresse, "12 rue des Lilas, 75011 Paris");
    assert.notEqual(draft.logementAssistantState?.step, "complete");
    assert.equal(draft.logementAssistantState?.fraisNotaire, 0, "frais historiques déduits → montant courant 0 (pas de re-déduction)");
    assert.equal(draft.logementAssistantState?.choixTraitementFrais, "deduction", "choix fiscal historique durable");
    assert.equal(draft.logementAmortissement, undefined);
    assert.equal(draft.logementConfirmedAt, undefined);
    assert.equal(
      isAnnualOutputForActiveYear(previous.logementAmortissement, 2026),
      false,
      "output N ne satisfait pas N+1",
    );

    // F011
    assert.ok(draft.financementAssistantState);
    assert.equal(draft.financementAssistantState?.loans[0]?.pretId, "pret-stable-1");
    assert.equal(draft.financementAssistantState?.loans[0]?.typePret, "amortissable");
    assert.equal(draft.financementAssistantState?.loans[0]?.assuranceType, "bancaire");
    assert.equal(draft.financementAssistantState?.loans[0]?.typeGarantie, "caution");
    assert.equal(draft.financementAssistantState?.loans[0]?.fraisDossier, undefined);
    assert.equal(draft.financementAssistantState?.loans[0]?.commissionCaution, undefined);
    assert.equal(draft.financementAssistantState?.loans[0]?.iraMontant, undefined);
    assert.equal(draft.financementCharges, undefined);
    assert.equal(draft.creditConfirmedAt, undefined);
    assert.notEqual(draft.financementAssistantState?.step, "complete");

    // F012 / F013 / F014
    assert.equal(draft.chargesAssistant, undefined);
    assert.equal(draft.revenusAssistant, undefined);
    assert.equal(draft.amortissementAssistant, undefined);
    assert.equal(draft.chargesConfirmedAt, undefined);
    assert.equal(draft.revenusConfirmedAt, undefined);
    assert.equal(draft.amortissementConfirmedAt, undefined);

    // Global
    assert.equal(draft.fiscalResult, undefined);
    assert.equal(draft.rfs, undefined);
    assert.equal(draft.liasseResult, undefined);
    assert.equal(draft.paidAt, undefined);
    assert.equal(draft.declarationGeneratedAt, undefined);
    assert.deepEqual(draft.completedSteps, []);
    assert.equal(built.fiscalYear.year, 2026);
  });

  it("extractFinancementBases conserve typePret / assurance / garantie ; one-offs sans millésime inventé", () => {
    const loans: F011LoanDraft[] = [
      {
        pretId: "p1",
        typePret: "in_fine",
        capitalInitial: 100000,
        tauxNominal: 0.02,
        dureeMois: 120,
        datePremiereMensualite: "2021-06-01",
        assuranceAnnuelle: 200,
        assuranceType: "externe",
        typeGarantie: "hypotheque_ippd",
        fraisDossier: 500,
        commissionCaution: 1000,
      },
    ];
    const bases = extractFinancementBases(loans);
    assert.equal(bases[0]?.typePret, "in_fine");
    assert.equal(bases[0]?.assuranceType, "externe");
    assert.equal(bases[0]?.typeGarantie, "hypotheque_ippd");
    assert.equal(bases[0]?.anneeSouscription, undefined);
    assert.equal(bases[0]?.fraisDossier, 500);
  });

  it("durableLoanFromPrevious strippe les one-offs", () => {
    const durable = durableLoanFromPrevious({
      pretId: "p1",
      typePret: "amortissable",
      capitalInitial: 1,
      tauxNominal: 0.01,
      dureeMois: 12,
      datePremiereMensualite: "2020-01-01",
      fraisDossier: 999,
      commissionCaution: 888,
      iraMontant: 777,
      souscritCetExercice: true,
    });
    assert.equal(durable.fraisDossier, undefined);
    assert.equal(durable.commissionCaution, undefined);
    assert.equal(durable.iraMontant, undefined);
    assert.equal(durable.souscritCetExercice, undefined);
  });
});

describe("Lot 4 — year mismatch", () => {
  const activeYear = 2026;

  it("F010/F011/F012/F013/F014 : exerciceFiscal N → refuse completion / validateFiscalInputs", () => {
    const staleDraft: DeclarationDraft = {
      completedSteps: [],
      inpiConfirmedAt: NOW,
      logementConfirmedAt: NOW,
      creditConfirmedAt: NOW,
      chargesConfirmedAt: NOW,
      revenusConfirmedAt: NOW,
      amortissementConfirmedAt: NOW,
      logementAmortissement: {
        exerciceFiscal: 2025,
        prixRevient: 1,
        valeurTerrain: 0,
        valeurBati: 1,
        baseAmortissableBati: 1,
        montantMobilier: 0,
        dotationAnnuelle: 1,
        dureeMoyenneAnnees: 1,
        prorataRatio: 1,
        plan: { lignes: [], totalAnnuelExercice: 1, totalBrut: 1 },
        fieldSources: {},
        computedAt: NOW,
      },
      financementCharges: {
        exerciceFiscal: 2025,
        totalInteretsEmprunt: 0,
        totalInteretsPreExploitation: 0,
        totalAssurance: 0,
        totalCapitalRembourse: 0,
        totalChargesFinancementExercice: 0,
        prets: [],
        fieldSources: {},
        computedAt: NOW,
      },
      chargesAssistant: {
        exerciceFiscal: 2025,
        totalDeductible: 0,
        totalNonDeductible: 0,
        totalAmortissable: 0,
        totalPreExploitation: 0,
        parCategorie: {},
        composantsNouveaux: [],
        fieldSources: {},
        computedAt: NOW,
      },
      revenusAssistant: {
        exerciceFiscal: 2025,
        totalRecettes: 100,
        loyersEncaisses: 100,
        indemnitesAssurance: 0,
        recettesPlateforme: 0,
        ajustementsJanDec: 0,
        moisLocationEffectifs: 12,
        fieldSources: {},
        computedAt: NOW,
      },
      amortissementAssistant: {
        exerciceFiscal: 2025,
        totalDotations: 1,
        status: "validated",
        planVersion: "v1",
        profil: "PROF-001",
        validatedAt: NOW,
      },
    };

    const steps = buildDossierSteps(staleDraft, activeYear);
    assert.equal(steps.find((s) => s.id === "logement")?.status, "incomplete");
    assert.equal(steps.find((s) => s.id === "credit")?.status, "incomplete");
    assert.equal(steps.find((s) => s.id === "charges")?.status, "incomplete");
    assert.equal(steps.find((s) => s.id === "revenus")?.status, "incomplete");
    assert.equal(steps.find((s) => s.id === "amortissement")?.status, "incomplete");

    assert.equal(isAnnualOutputProvenForActiveYear(staleDraft.logementAmortissement, activeYear), false);
    assert.equal(isAnnualOutputForActiveYear(staleDraft.revenusAssistant, activeYear), false);

    const validated = validateFiscalInputs({
      exerciceFiscal: activeYear,
      activite: { dateMiseEnService: "2020-01-01" },
      revenusAssistant: staleDraft.revenusAssistant!,
      chargesAssistant: staleDraft.chargesAssistant!,
      amortissementAssistant: staleDraft.amortissementAssistant!,
      financementCharges: staleDraft.financementCharges,
      logementAmortissement: staleDraft.logementAmortissement,
    });
    assert.equal(validated.ready, false);
    assert.ok(validated.anomalies.some((a) => a.field?.includes("exerciceFiscal")));
  });

  it("exerciceFiscal = N+1 → nominal", () => {
    const ok = {
      exerciceFiscal: 2026,
      totalRecettes: 1,
      loyersEncaisses: 1,
      indemnitesAssurance: 0,
      recettesPlateforme: 0,
      ajustementsJanDec: 0,
      moisLocationEffectifs: 12,
      fieldSources: {},
      computedAt: NOW,
    };
    assert.equal(isAnnualOutputForActiveYear(ok, 2026), true);
    assert.equal(isAnnualOutputProvenForActiveYear(ok, 2026), true);
  });
});

describe("Lot 4 — invalidations déterministes", () => {
  it("dateMiseEnService change → descendants invalidés, identité préservée", () => {
    const current = richNDraft();
    const patch = buildDownstreamInvalidationPatch(current, { dateMiseEnService: "2021-01-01" });
    assert.equal(patch.logementAmortissement, undefined);
    assert.equal(patch.financementCharges, undefined);
    assert.equal(patch.chargesAssistant, undefined);
    assert.equal(patch.revenusAssistant, undefined);
    assert.equal(patch.amortissementAssistant, undefined);
    assert.equal(patch.logementConfirmedAt, undefined);
    assert.equal(patch.creditConfirmedAt, undefined);
    assert.equal(patch.chargesConfirmedAt, undefined);
    assert.equal(patch.revenusConfirmedAt, undefined);
    assert.equal(patch.amortissementConfirmedAt, undefined);
    assert.equal(patch.fiscalResult, undefined);
    assert.equal(patch.rfs, undefined);
    // Inputs source préservés (pas dans le patch d'invalidation)
    assert.equal("logementAssistantState" in patch, false);
    assert.equal("financementAssistantState" in patch, false);
    assert.equal("chargesAssistantState" in patch, false);
    // declarationGeneratedAt vit sur FiscalYear — invalidé par le reducer
    assert.equal("declarationGeneratedAt" in patch, false);
  });

  it("même dateMiseEnService → aucune invalidation", () => {
    const current = richNDraft();
    const patch = buildDownstreamInvalidationPatch(current, {
      dateMiseEnService: current.dateMiseEnService,
    });
    assert.deepEqual(patch, {});
  });

  it("financementAssistantState change → output/confirm invalidés", () => {
    const current = richNDraft();
    const nextState = {
      ...current.financementAssistantState!,
      loans: [
        {
          ...current.financementAssistantState!.loans[0]!,
          tauxNominal: 0.04,
        },
      ],
    };
    const patch = buildDownstreamInvalidationPatch(current, {
      financementAssistantState: nextState,
    });
    assert.equal(patch.financementCharges, undefined);
    assert.equal(patch.creditConfirmedAt, undefined);
  });

  it("chargesAssistant change → chargesConfirmedAt invalidé", () => {
    const current = richNDraft();
    const patch = buildDownstreamInvalidationPatch(current, {
      chargesAssistant: { ...current.chargesAssistant!, totalDeductible: 9999 },
    });
    assert.equal(patch.chargesConfirmedAt, undefined);
  });

  it("revenusAssistant change → revenusConfirmedAt invalidé", () => {
    const current = richNDraft();
    const patch = buildDownstreamInvalidationPatch(current, {
      revenusAssistant: { ...current.revenusAssistant!, totalRecettes: 1 },
    });
    assert.equal(patch.revenusConfirmedAt, undefined);
  });

  it("SIREN seul ≠ activité complete (Lot 4 completeness)", () => {
    const steps = buildDossierSteps({ completedSteps: [], siren: "123456789" }, 2026);
    assert.equal(steps.find((s) => s.id === "activite")?.status, "incomplete");
  });

  it("createNextDeclarationDraft ne reseed pas depuis N après modification N+1 locale", () => {
    const n1 = createNextDeclarationDraft(richNDraft());
    const modified: DeclarationDraft = {
      ...n1,
      exploitantFirstName: "Alice",
    };
    // Rejouer createNextDeclarationDraft sur N+1 déjà modifié (pas N) conserve Alice
    // uniquement si on passe modified — le builder ne lit jamais N après création.
    const again = createNextDeclarationDraft(modified);
    assert.equal(again.exploitantFirstName, "Alice");
    assert.equal(again.financementCharges, undefined);
  });
});
