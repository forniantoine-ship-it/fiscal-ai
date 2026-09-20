/**
 * Fixture de TEST uniquement (jamais importé par du code applicatif) — dossier fictif « Alice TESTEUR » (bien
 * mis en service le 01/02/2025 : janvier = pré-exploitation), construit avec le VRAI calcul F-012 puis la VRAIE
 * construction de la sortie persistée (`buildChargesAssistantOutput`) : aucun montant de charges n'est codé en dur
 * dans les assertions des tests qui l'utilisent, ils lisent ce que F-012 produit.
 */
import { computeChargesExercice, type ComputeChargesExerciceInput } from "@/runtime/capabilities/f012/compute-charges-exercice";
import type { PretFinancementExercice } from "@/runtime";
import type { DeclarationDraft } from "../../types";
import { buildChargesAssistantOutput } from "../f012/charges-assistant-output";

export const ALICE_YEAR = 2025;

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
  return {
    completedSteps: [],
    siren: "123456789",
    exploitantFirstName: "Alice",
    exploitantLastName: "TESTEUR",
    dateMiseEnService,
    inpiConfirmedAt: "2026-01-01T00:00:00.000Z",
    logementConfirmedAt: "2026-01-01T00:00:00.000Z",
    logementAmortissement: {
      computedAt: "2026-01-01T00:00:00.000Z",
      prixRevient: 93000,
      valeurTerrain: 16740,
      valeurBati: 76260,
      baseAmortissableBati: 76260,
      montantMobilier: 4000,
      dotationAnnuelle: 3265.95,
      dureeMoyenneAnnees: 25,
      plan: { lignes: [], totalAnnuelExercice: 0, totalBrut: 0 },
    } as unknown as DeclarationDraft["logementAmortissement"],
    revenusConfirmedAt: "2026-01-01T00:00:00.000Z",
    chargesConfirmedAt: "2026-01-01T00:00:00.000Z",
    amortissementConfirmedAt: "2026-01-01T00:00:00.000Z",
    revenusAssistant: { exerciceFiscal: ALICE_YEAR, totalRecettes: 7150 },
    chargesAssistant: persisted,
    amortissementAssistant: { exerciceFiscal: ALICE_YEAR, totalDotations: 2979.54, status: "validated" },
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
