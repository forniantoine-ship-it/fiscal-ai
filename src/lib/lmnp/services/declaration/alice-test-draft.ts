/**
 * Fixture de TEST uniquement (jamais importé par du code applicatif) — dossier fictif « Alice TESTEUR » (bien
 * mis en service le 01/02/2025 : janvier = pré-exploitation), construit avec le VRAI calcul F-012 puis la VRAIE
 * construction de la sortie persistée (`buildChargesAssistantOutput`) : aucun montant de charges n'est codé en dur
 * dans les assertions des tests qui l'utilisent, ils lisent ce que F-012 produit.
 *
 * Lot 5 B2 — `logementAmortissement.plan` est un VRAI plan F-010 (lignes non
 * vides) aligné sur `amortissementAssistant.totalDotations`. L'ancienne
 * fixture `plan: { lignes: [], totalBrut: 0 }` + `totalDotations: 2979.54`
 * était impossible dans le parcours produit (F-010 `assemblePlan` produit
 * toujours des lignes ; F-014 dérive `total_dotations_exercice` de ce plan).
 */
import { computeChargesExercice, type ComputeChargesExerciceInput } from "@/runtime/capabilities/f012/compute-charges-exercice";
import { computeAmortizationPlan } from "@/runtime/capabilities/f010/compute-amortization-plan";
import type { PretFinancementExercice } from "@/runtime";
import type { DeclarationDraft } from "../../types";
import { buildChargesAssistantOutput } from "../f012/charges-assistant-output";

export const ALICE_YEAR = 2025;

function aliceLogementAmortissement(dateMiseEnService: string) {
  // Montants historiques Alice (~93k prix de revient, ~4k mobilier, terrain ~18%).
  const computed = computeAmortizationPlan({
    prixAcquisition: 89000,
    mobilierInclus: true,
    montantMobilier: 4000,
    fraisNotaire: 0,
    choixTraitementFrais: "deduction",
    typeBien: "appartement",
    ratioTerrain: 0.18,
    dateMiseEnService,
    exerciceFiscal: ALICE_YEAR,
  });
  return {
    computedAt: "2026-01-01T00:00:00.000Z",
    prixRevient: computed.prixRevient,
    valeurTerrain: computed.valeurTerrain,
    valeurBati: computed.valeurBati,
    baseAmortissableBati: computed.baseAmortissableBati,
    montantMobilier: computed.montantMobilierIsole,
    dotationAnnuelle: computed.plan.totalAnnuelExercice,
    dureeMoyenneAnnees: 25,
    prorataRatio: computed.prorataRatio,
    plan: computed.plan,
    fraisEnCharges: computed.fraisEnCharges,
    fieldSources: {},
  } satisfies NonNullable<DeclarationDraft["logementAmortissement"]>;
}

export function f012Output(input: Partial<ComputeChargesExerciceInput> & { dateMiseEnService?: string }) {
  const { charges } = computeChargesExercice({
    exerciceFiscal: ALICE_YEAR,
    dateMiseEnService: input.dateMiseEnService ?? "2025-02-01",
    ...input,
  } as ComputeChargesExerciceInput);
  return { charges, persisted: buildChargesAssistantOutput(charges, {}, "2026-01-01T00:00:00.000Z") };
}

export function aliceDraft(
  charges: Partial<ComputeChargesExerciceInput> = { taxeFonciere: 600, assurancePno: 120 },
  overrides: Partial<DeclarationDraft> = {},
  dateMiseEnService = "2025-02-01",
): DeclarationDraft {
  const { persisted } = f012Output({ ...charges, dateMiseEnService });
  const logementAmortissement = aliceLogementAmortissement(dateMiseEnService);
  return {
    completedSteps: [],
    siren: "123456789",
    exploitantFirstName: "Alice",
    exploitantLastName: "TESTEUR",
    dateMiseEnService,
    inpiConfirmedAt: "2026-01-01T00:00:00.000Z",
    logementConfirmedAt: "2026-01-01T00:00:00.000Z",
    logementAmortissement,
    revenusConfirmedAt: "2026-01-01T00:00:00.000Z",
    chargesConfirmedAt: "2026-01-01T00:00:00.000Z",
    amortissementConfirmedAt: "2026-01-01T00:00:00.000Z",
    revenusAssistant: { exerciceFiscal: ALICE_YEAR, totalRecettes: 7150 },
    chargesAssistant: persisted,
    // Dotation = plan F-010 réel (prorata MES) — jamais un scalaire décorrélé.
    amortissementAssistant: {
      exerciceFiscal: ALICE_YEAR,
      totalDotations: logementAmortissement.plan.totalAnnuelExercice,
      status: "validated",
    },
    ...overrides,
  } as DeclarationDraft;
}

export const LOAN_SAISI_AT = "2026-03-01T10:00:00.000Z";
export const LOAN_RETIRE_AT = "2026-04-01T10:00:00.000Z";

export function pretTest(overrides: Partial<PretFinancementExercice> = {}): PretFinancementExercice {
  return {
    pretId: "pret-1",
    typePret: "amortissable",
    interetsEmpruntExercice: 1000,
    interetsPreExploitation: 100,
    assuranceEmpruntExercice: 200,
    assurancePreExploitation: 20,
    capitalRembourseExercice: 3000,
    capitalRestantDu31_12: 50000,
    fraisDossierDeductibles: 100,
    garantieDeductible: 50,
    iraDeductible: 0,
    ...overrides,
  };
}

/** Sortie F-011 cohérente avec `pretTest()` : 1 350 € de financement de l'exercice, 120 € de pré-exploitation financière. */
export function financementLoan(computedAt = LOAN_SAISI_AT): NonNullable<DeclarationDraft["financementCharges"]> {
  return {
    exerciceFiscal: ALICE_YEAR,
    totalInteretsEmprunt: 1000,
    totalInteretsPreExploitation: 100,
    totalAssurance: 200,
    totalAssurancePreExploitation: 20,
    totalCapitalRembourse: 3000,
    totalChargesFinancementExercice: 1350,
    prets: [pretTest()],
    fieldSources: {},
    computedAt,
  };
}

/** Dossier « prêt saisi » : financement calculé, prêt confirmé, aucune déclaration « aucun crédit ». */
export function aliceWithLoan(overrides: Partial<DeclarationDraft> = {}): DeclarationDraft {
  return aliceDraft(undefined, {
    financementCharges: financementLoan(),
    creditConfirmedAt: LOAN_SAISI_AT,
    creditFinancing: {
      loans: [{ id: "pret-1", firstPaymentDate: "2025-03-01", startDate: "2025-03-01", fees: 0 }],
      summary: { fiscalYearLabel: "2025", annualInterest: 1000, annualInsurance: 200, remainingCapital: 50000 },
      installments: [],
    } as unknown as DeclarationDraft["creditFinancing"],
    ...overrides,
  });
}

/**
 * État FINAL du scénario de latence : le prêt a été saisi (financementCharges calculées), puis le client a
 * explicitement déclaré n'avoir aucun crédit ; aucune donnée de prêt confirmée ou en attente ne subsiste.
 * Les anciennes `financementCharges` (antérieures à la déclaration) sont restées, périmées.
 */
export function aliceLoanThenNone(overrides: Partial<DeclarationDraft> = {}): DeclarationDraft {
  return aliceDraft(undefined, {
    financementCharges: financementLoan(LOAN_SAISI_AT),
    creditDeclaredNoneAt: LOAN_RETIRE_AT,
    ...overrides,
  });
}
