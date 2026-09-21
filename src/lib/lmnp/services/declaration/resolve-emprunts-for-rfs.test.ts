/**
 * A5(1) — absence de crédit : `creditDeclaredNoneAt` → `emprunts = []` pour le bilan.
 *
 * Trois états DISTINCTS, jamais confondus :
 *   1. aucun crédit CONFIRMÉ (déclaration explicite du client)  → `[]`   (156 = 0 publiée, bilan DISPONIBLE)
 *   2. information crédit INCONNUE (aucune réponse)             → `undefined` (156 non publiée, bilan INCONNU)
 *   3. un ou plusieurs crédits présents                         → `prets` transportés (156 = Σ CRD)
 * Une absence de réponse n'est JAMAIS une absence de crédit.
 *
 * Run: npx tsx --test src/lib/lmnp/services/declaration/resolve-emprunts-for-rfs.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { resolveEmpruntsForRfs } from "./resolve-emprunts-for-rfs";
import { runDeclarationGeneration } from "./run-declaration-generation";
import { EMPTY_PATRIMONIAL_INTAKE_STATE, buildBilanPatrimonial } from "./patrimonial-intake";
import { computeAmortizationPlan } from "@/runtime/capabilities/f010/compute-amortization-plan";
import type { PretFinancementExercice } from "@/runtime";
import type { DeclarationDraft } from "../../types";

const YEAR = 2025;
const NONE_AT = "2026-09-19T20:17:45.833Z";

/**
 * Plan F-010 réel (lignes non vides) aligné sur le totalDotations historique
 * Alice 2 979,54 € — jamais `plan: { lignes: [] }` + dotation > 0 (impossible produit).
 */
function aliceLogementAmortissement(dateMiseEnService = "2025-02-01") {
  const computed = computeAmortizationPlan({
    prixAcquisition: 97000,
    mobilierInclus: true,
    montantMobilier: 4000,
    fraisNotaire: 0,
    choixTraitementFrais: "deduction",
    typeBien: "appartement",
    ratioTerrain: 0.18,
    dateMiseEnService,
    exerciceFiscal: YEAR,
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

const pret = (crd: number, pretId = "pret-1"): PretFinancementExercice => ({
  pretId,
  typePret: "amortissable",
  interetsEmpruntExercice: 0,
  interetsPreExploitation: 0,
  assuranceEmpruntExercice: 0,
  assurancePreExploitation: 0,
  capitalRembourseExercice: 0,
  capitalRestantDu31_12: crd,
  fraisDossierDeductibles: 0,
  garantieDeductible: 0,
  iraDeductible: 0,
});

const financementCharges = (prets: PretFinancementExercice[]): NonNullable<DeclarationDraft["financementCharges"]> => ({
  exerciceFiscal: YEAR,
  totalInteretsEmprunt: 0,
  totalInteretsPreExploitation: 0,
  totalAssurance: 0,
  totalCapitalRembourse: 0,
  totalChargesFinancementExercice: 0,
  prets,
  fieldSources: {},
  computedAt: "2026-01-01T00:00:00.000Z",
});

describe("A5(1) — resolveEmpruntsForRfs : les trois états crédit", () => {
  it("1. aucun crédit confirmé (creditDeclaredNoneAt explicite, rien de contradictoire) → emprunts = []", () => {
    const emprunts = resolveEmpruntsForRfs({ completedSteps: [], creditDeclaredNoneAt: NONE_AT });
    assert.ok(Array.isArray(emprunts), "un tableau, pas undefined");
    assert.equal(emprunts!.length, 0);
  });

  it("2. information crédit inconnue → undefined, jamais []", () => {
    assert.equal(resolveEmpruntsForRfs(undefined), undefined, "aucun dossier");
    assert.equal(resolveEmpruntsForRfs({ completedSteps: [] }), undefined, "aucune réponse sur le crédit");
    assert.equal(resolveEmpruntsForRfs({ completedSteps: [], creditDeclaredNoneAt: undefined }), undefined);
    assert.equal(
      resolveEmpruntsForRfs({ completedSteps: [], creditConfirmedAt: NONE_AT }),
      undefined,
      "crédit confirmé mais financementCharges pas (encore) calculé : inconnu, pas « aucun crédit »",
    );
  });

  it("3. un ou plusieurs crédits présents → les prêts F-011, transportés tels quels (même tableau)", () => {
    const prets = [pret(50000, "a"), pret(12000, "b")];
    const emprunts = resolveEmpruntsForRfs({ completedSteps: [], financementCharges: financementCharges(prets) });
    assert.equal(emprunts, prets, "transport par référence, comportement historique inchangé");
    assert.equal(emprunts!.length, 2);
  });

  it("3 bis. charges de financement POSTÉRIEURES à la déclaration « aucun crédit » : la donnée la plus récente l'emporte → les prêts", () => {
    const prets = [pret(50000)];
    const emprunts = resolveEmpruntsForRfs({
      completedSteps: [],
      creditDeclaredNoneAt: "2026-01-01T00:00:00.000Z",
      financementCharges: { ...financementCharges(prets), computedAt: "2026-06-01T00:00:00.000Z" },
    });
    assert.equal(emprunts, prets);
  });

  it("3 ter. latence « prêt saisi puis aucun crédit » : charges de financement ANTÉRIEURES à la déclaration explicite → périmées, emprunts = []", () => {
    const emprunts = resolveEmpruntsForRfs({
      completedSteps: [],
      creditDeclaredNoneAt: "2026-06-01T00:00:00.000Z",
      financementCharges: { ...financementCharges([pret(50000)]), computedAt: "2026-01-01T00:00:00.000Z" },
    });
    assert.deepEqual(emprunts, []);
  });

  it("déclaration « aucun crédit » CONTREDITE par le dossier → inconnu (undefined), jamais [] : le doute ne devient pas un 0 €", () => {
    const base = { completedSteps: [], creditDeclaredNoneAt: NONE_AT };
    assert.equal(resolveEmpruntsForRfs({ ...base, creditConfirmedAt: NONE_AT }), undefined, "prêt confirmé");
    assert.equal(resolveEmpruntsForRfs({ ...base, creditDocumentId: "doc-1" }), undefined, "document de prêt déposé");
    assert.equal(
      resolveEmpruntsForRfs({
        ...base,
        creditFinancing: { loans: [{ id: "l1" }], summary: {}, installments: [] } as unknown as DeclarationDraft["creditFinancing"],
      }),
      undefined,
      "prêt extrait en attente",
    );
  });
});

/** Dossier fictif de l'audit (2025, achat sans crédit, pré-exploitation janvier). */
function draft(overrides: Partial<DeclarationDraft> = {}): DeclarationDraft {
  const logementAmortissement = aliceLogementAmortissement();
  return {
    completedSteps: [],
    siren: "123456789",
    exploitantFirstName: "Alice",
    exploitantLastName: "TESTEUR",
    dateMiseEnService: "2025-02-01",
    inpiConfirmedAt: "2026-01-01T00:00:00.000Z",
    logementConfirmedAt: "2026-01-01T00:00:00.000Z",
    logementAmortissement,
    revenusConfirmedAt: "2026-01-01T00:00:00.000Z",
    chargesConfirmedAt: "2026-01-01T00:00:00.000Z",
    amortissementConfirmedAt: "2026-01-01T00:00:00.000Z",
    revenusAssistant: { exerciceFiscal: YEAR, totalRecettes: 7150 },
    chargesAssistant: { exerciceFiscal: YEAR, totalDeductible: 660, totalPreExploitation: 60 },
    // Dotation = plan F-010 réel (prorata MES) — cohérent avec totalAnnuelExercice.
    amortissementAssistant: {
      exerciceFiscal: YEAR,
      totalDotations: logementAmortissement.plan.totalAnnuelExercice,
      status: "validated",
    },
    ...overrides,
  } as DeclarationDraft;
}

function generate(d: DeclarationDraft) {
  const g = runDeclarationGeneration(d, YEAR, undefined, d.bilanPatrimonial, d.dispense2033A);
  assert.equal(g.status, "generated", "précondition : le dossier de test doit se générer");
  if (g.status !== "generated") throw new Error("unreachable");
  const form2033A = g.liasseRfs.form2033A;
  return {
    g,
    emprunts: g.rfs.emprunts,
    case156: form2033A.cases.find((c) => c.caseId === "156")?.value,
    nonAlimentee156: form2033A.casesNonAlimentees.find((c) => c.caseId === "156"),
    case242: g.liasseRfs.form2033B.cases.find((c) => c.caseId === "242")?.value,
  };
}

describe("A5(1) — de bout en bout : la génération transporte l'état crédit jusqu'au bilan 2033-A", () => {
  it("aucun crédit confirmé : rfs.emprunts = [] et la ligne 156 (emprunts) est publiée à 0 €, plus « donnée absente »", () => {
    const r = generate(draft({ creditDeclaredNoneAt: NONE_AT }));
    assert.deepEqual(r.emprunts, []);
    assert.equal(r.case156, 0);
    assert.equal(r.nonAlimentee156, undefined, "156 ne doit plus figurer parmi les cases non alimentées");
  });

  it("information crédit inconnue : rfs.emprunts reste undefined et 156 reste NON publiée (donnée absente) — jamais 0 par défaut", () => {
    const r = generate(draft());
    assert.equal(r.emprunts, undefined);
    assert.equal(r.case156, undefined, "aucune valeur inventée");
    assert.ok(r.nonAlimentee156, "156 reste explicitement non alimentée");
    assert.equal(r.nonAlimentee156!.categorie, "donnee_absente");
    assert.equal(r.case242, undefined, "242 (dépend du détail des prêts) reste absente sans information crédit");
  });

  it("un crédit présent : les prêts sont transportés et 156 = Σ capital restant dû au 31/12", () => {
    const r = generate(draft({ financementCharges: financementCharges([pret(50000)]) }));
    assert.equal(r.emprunts!.length, 1);
    assert.equal(r.case156, 50000);
  });

  it("le résultat fiscal est STRICTEMENT identique dans les trois états (transport pur, aucune valeur fiscale touchée)", () => {
    const strip = (d: DeclarationDraft) => {
      const rest = { ...(generate(d).g.fiscalResult as unknown as Record<string, unknown>) };
      delete rest.computedAt; // horodatage d'exécution
      delete rest.trace; // contient computedAt
      return JSON.stringify(rest);
    };
    const none = strip(draft({ creditDeclaredNoneAt: NONE_AT }));
    const unknown = strip(draft());
    const emptyF011 = strip(draft({ financementCharges: financementCharges([]) }));
    assert.equal(none, unknown, "aucun crédit ≡ inconnu pour le résultat fiscal");
    assert.equal(none, emptyF011, "aucun crédit ≡ financementCharges vide pour le résultat fiscal");
  });

  it("côté bilan patrimonial : aucun crédit → emprunts DISPONIBLE (0 €) ; inconnu → INCONNU ; crédit présent → DISPONIBLE (Σ CRD)", () => {
    const intake = {
      ...EMPTY_PATRIMONIAL_INTAKE_STATE,
      routage: "NATIF" as const,
      bankMode: "DEDIE" as const,
      closingCashRaw: "6430",
      apportsRaw: "97000",
      prelevementsRaw: "0",
      subvention: "NON" as const,
      autresElements: "NON" as const,
      avancesAcomptesVerses: "NON" as const,
      autresImmobilisationsIncorporellesBrut: "NON" as const,
      immobilisationsFinancieresBrut: "NON" as const,
      valeursMobilieresPlacementBrut: "NON" as const,
      chargesConstateesAvance: "NON" as const,
      produitsConstatesAvance: "NON" as const,
      autresDettes: "NON" as const,
    };
    const bilanPatrimonial = buildBilanPatrimonial(intake as never);
    const etat = (d: DeclarationDraft) => generate({ ...d, bilanPatrimonial }).g.rfs.patrimoine?.emprunts;

    assert.deepEqual(
      { etat: etat(draft({ creditDeclaredNoneAt: NONE_AT }))?.etat, crd: (etat(draft({ creditDeclaredNoneAt: NONE_AT })) as { totalCRD?: number })?.totalCRD },
      { etat: "DISPONIBLE", crd: 0 },
      "aucun crédit confirmé",
    );
    assert.equal(etat(draft())?.etat, "INCONNU", "information inconnue : le bilan ne peut pas affirmer l'absence de crédit");
    const present = etat(draft({ financementCharges: financementCharges([pret(50000)]) })) as { etat: string; totalCRD?: number };
    assert.equal(present.etat, "DISPONIBLE");
    assert.equal(present.totalCRD, 50000);
  });
});
