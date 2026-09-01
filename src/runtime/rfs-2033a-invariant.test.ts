/**
 * Cycle 37 — audit et sécurisation de la fondation F-010/F-014 → RFS → 2033-A.
 * Run: npx tsx --test src/runtime/rfs-2033a-invariant.test.ts
 *
 * Prouve, par des appels réels aux capabilities (pas seulement des fixtures
 * synthétiques), que `rfs.immobilisations` (F-010 seul) peut diverger de
 * `fiscalResult.amortCalcule` (F-014, source fiscale autoritaire) dès qu'un
 * dossier a des `composantsNouveaux` (travaux F-012 réintégrés en
 * immobilisation), et que le mapper 2033-A bloque désormais 028/030 dans ce
 * cas plutôt que de produire un bilan silencieusement sous-évalué.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { map2033AFromRfs } from "./capabilities/rfs/projection/map-2033a";
import { assembleLiasseFromRfs } from "./capabilities/rfs/projection/assemble-liasse-from-rfs";
import { buildFiscalRepresentation } from "./capabilities/rfs/build-fiscal-representation";
import { computeAmortizationPlan } from "./capabilities/f010/compute-amortization-plan";
import { composePlanAmortissement } from "./capabilities/f014/compose-plan-amortissement";
import type { ComposantNouveau } from "./capabilities/f012/types";
import type { FiscalResult } from "./capabilities/f006/types";
import type { IdentiteDeclarante } from "./capabilities/f007/types";
import type { ImmobilisationsRfs, FiscalRepresentation } from "./capabilities/rfs/types";

function fiscalResult(overrides: Partial<FiscalResult> = {}): FiscalResult {
  return {
    exercice: 2025,
    recettes: { total: 9000 },
    charges: {
      totalDeductible: 2000,
      chargesExploitation: 2000,
      chargesFinancement: 0,
      chargesPreExploitation: 0,
      totalNonDeductible: 0,
    },
    resultatAvantAmort: 7000,
    amortCalcule: 1500,
    amortDeduct: 1500,
    amortReporte: 0,
    amortReportesUtilises: 0,
    resultatFiscal: 5500,
    deficitNouveau: 0,
    deficitsImputes: 0,
    perteExceptionnelle: 0,
    stocks: { deficits: [], amortissementsReportes: 0, deficitsExpires: [] },
    trace: { ksArtifacts: ["TRF-0032"], computedAt: "2026-08-31T00:00:00.000Z", journal: [] },
    status: "computed",
    anomalies: [],
    ...overrides,
  };
}

const IDENTITE: IdentiteDeclarante = { siren: "104545108", siret: "10454510800011", denomination: "Elsa Bouvard" };

function rfs(fr: FiscalResult, immobilisations?: ImmobilisationsRfs): FiscalRepresentation {
  return {
    exercice: fr.exercice,
    identite: IDENTITE,
    fiscalResult: fr,
    immobilisations,
    trace: {
      ksArtifacts: fr.trace.ksArtifacts,
      assembledAt: "2026-08-31T00:00:00.000Z",
      sourceFiscalResultAt: fr.trace.computedAt,
      sources: { identite: "IdentiteDeclarante (ENT-013)", fiscalResult: "FiscalResult (F-006)" },
    },
  };
}

function findCase(form: ReturnType<typeof map2033AFromRfs>, caseId: string) {
  return form.cases.find((c) => c.caseId === caseId);
}
function findBlocked(form: ReturnType<typeof map2033AFromRfs>, caseId: string) {
  return form.casesNonAlimentees.find((c) => c.caseId === caseId);
}

// =====================================================================
// Cas A/B — F-010 seul et F-014 sans composantsNouveaux : cohérents
// =====================================================================
describe("Cycle 37 — Cas A/B : sans composantsNouveaux, F-010 et F-014 restent cohérents", () => {
  it("Cas A (1ère année) : composePlanAmortissement() sans composantsNouveaux → total_dotations_exercice === planLogement.totalAnnuelExercice, exactement", () => {
    const computed = computeAmortizationPlan({
      prixAcquisition: 280000,
      mobilierInclus: false,
      fraisNotaire: 19500,
      choixTraitementFrais: "integration",
      typeBien: "appartement",
      ratioTerrain: 0.15,
      dateMiseEnService: "2024-04-15",
      exerciceFiscal: 2024,
    });
    const { plan } = composePlanAmortissement({
      exerciceFiscal: 2024,
      dateMiseEnService: "2024-04-15",
      planLogement: computed.plan,
      prorataRatio: computed.prorataRatio,
    });
    assert.equal(plan.total_dotations_exercice, computed.plan.totalAnnuelExercice, "aucun écart en l'absence de composantsNouveaux");
    assert.equal(plan.nouveaux_elements.length, 0);

    // Le chemin réel (aggregate-inputs.ts) : amortCalcule = totalDotations F-014.
    const representation = rfs(
      fiscalResult({ exercice: 2024, amortCalcule: plan.total_dotations_exercice }),
      { ...computed.plan, valeurTerrain: computed.valeurTerrain },
    );
    const form = map2033AFromRfs(representation);
    assert.ok(findCase(form, "028"), "028 doit être alimentée — F-010 et F-014 concordent");
    assert.ok(findCase(form, "030"), "030 doit être alimentée");
  });

  it("Cas B (année ultérieure, sans travaux) : même invariant, à une année différente", () => {
    const computed = computeAmortizationPlan({
      prixAcquisition: 280000,
      mobilierInclus: false,
      fraisNotaire: 19500,
      choixTraitementFrais: "integration",
      typeBien: "appartement",
      ratioTerrain: 0.15,
      dateMiseEnService: "2024-04-15",
      exerciceFiscal: 2026, // 3e exercice, en rythme de croisière
    });
    const { plan } = composePlanAmortissement({
      exerciceFiscal: 2026,
      dateMiseEnService: "2024-04-15",
      planLogement: computed.plan,
      prorataRatio: computed.prorataRatio,
    });
    assert.equal(plan.total_dotations_exercice, computed.plan.totalAnnuelExercice);
    assert.equal(plan.premiere_annee, false, "vérification intermédiaire — bien en année ultérieure");

    const representation = rfs(
      fiscalResult({ exercice: 2026, amortCalcule: plan.total_dotations_exercice }),
      { ...computed.plan, valeurTerrain: computed.valeurTerrain },
    );
    const form = map2033AFromRfs(representation);
    assert.ok(findCase(form, "028"));
    assert.ok(findCase(form, "030"));
  });
});

// =====================================================================
// Cas C — le cas critique : composantsNouveaux issus de F-012
// =====================================================================
describe("Cycle 37 — Cas C : composantsNouveaux → divergence réelle prouvée, 028/030 bloquées", () => {
  const composantNouveau: ComposantNouveau = {
    label: "Rénovation cuisine",
    montant: 8000,
    dureeAnnees: 10,
    dotationAnnuelle: 800,
    nature: "amélioration",
    dateDebut: "2025-06-01",
  };

  it("ce qui entre dans F-014 : total_dotations_exercice > planLogement.totalAnnuelExercice dès qu'un composant nouveau existe", () => {
    const computed = computeAmortizationPlan({
      prixAcquisition: 280000,
      mobilierInclus: false,
      fraisNotaire: 19500,
      choixTraitementFrais: "integration",
      typeBien: "appartement",
      ratioTerrain: 0.15,
      dateMiseEnService: "2024-04-15",
      exerciceFiscal: 2025,
    });
    const { plan } = composePlanAmortissement({
      exerciceFiscal: 2025,
      dateMiseEnService: "2024-04-15",
      planLogement: computed.plan,
      prorataRatio: computed.prorataRatio,
      composantsNouveaux: [composantNouveau],
    });

    assert.ok(
      plan.total_dotations_exercice > computed.plan.totalAnnuelExercice,
      "F-014 inclut la dotation du composant nouveau, F-010 seul ne peut pas la connaître",
    );
    assert.equal(plan.nouveaux_elements.length, 1);
    assert.equal(plan.nouveaux_elements[0]?.base_amortissable, 8000, "le brut du composant nouveau (8000€) n'existe QUE dans F-014");
  });

  it("ce qui reste absent de F-010 / ce qui arrive dans RFS : rfs.immobilisations ne contient jamais le composant nouveau", () => {
    const computed = computeAmortizationPlan({
      prixAcquisition: 280000,
      mobilierInclus: false,
      fraisNotaire: 19500,
      choixTraitementFrais: "integration",
      typeBien: "appartement",
      ratioTerrain: 0.15,
      dateMiseEnService: "2024-04-15",
      exerciceFiscal: 2025,
    });
    // Reproduit exactement le pattern de run-declaration-generation.ts.
    const immobilisationsRfs: ImmobilisationsRfs = { ...computed.plan, valeurTerrain: computed.valeurTerrain };
    assert.equal(
      immobilisationsRfs.lignes.some((l) => l.label === composantNouveau.label),
      false,
      "le plan F-010 (et donc rfs.immobilisations) ne contient jamais un composant nouveau F-012",
    );
    assert.equal(immobilisationsRfs.totalBrut, computed.plan.totalBrut, "totalBrut reste celui de F-010 seul, jamais enrichi");
  });

  it("ce que 2033-A 028/030 utilise réellement : la divergence F-010/F-014 bloque 028/030 plutôt que de sous-évaluer le bilan", () => {
    const computed = computeAmortizationPlan({
      prixAcquisition: 280000,
      mobilierInclus: false,
      fraisNotaire: 19500,
      choixTraitementFrais: "integration",
      typeBien: "appartement",
      ratioTerrain: 0.15,
      dateMiseEnService: "2024-04-15",
      exerciceFiscal: 2025,
    });
    const { plan } = composePlanAmortissement({
      exerciceFiscal: 2025,
      dateMiseEnService: "2024-04-15",
      planLogement: computed.plan,
      prorataRatio: computed.prorataRatio,
      composantsNouveaux: [composantNouveau],
    });

    // Chemin réel : fiscalResult.amortCalcule = totalDotations F-014 (avec le
    // composant nouveau) ; rfs.immobilisations = plan F-010 seul (sans lui).
    const representation = rfs(
      fiscalResult({ exercice: 2025, amortCalcule: plan.total_dotations_exercice }),
      { ...computed.plan, valeurTerrain: computed.valeurTerrain },
    );

    const form = map2033AFromRfs(representation);
    assert.equal(findCase(form, "028"), undefined, "028 ne doit PAS être alimentée avec une valeur sous-évaluée");
    assert.equal(findCase(form, "030"), undefined, "030 ne doit PAS être alimentée");

    const blocked028 = findBlocked(form, "028");
    const blocked030 = findBlocked(form, "030");
    assert.ok(blocked028);
    assert.ok(blocked030);
    assert.equal(blocked028?.categorie, "incoherence_modele");
    assert.equal(blocked030?.categorie, "incoherence_modele");
    assert.ok(blocked028!.raison.length > 40, "raison précise et autoportante, pas générique");
    assert.match(blocked028!.raison, /amortCalcule/, "la raison doit citer explicitement la source de la divergence");
  });

  it("démonstration explicite : sans composant nouveau, la même méthode reste alimentée (contrôle négatif)", () => {
    const computed = computeAmortizationPlan({
      prixAcquisition: 280000,
      mobilierInclus: false,
      fraisNotaire: 19500,
      choixTraitementFrais: "integration",
      typeBien: "appartement",
      ratioTerrain: 0.15,
      dateMiseEnService: "2024-04-15",
      exerciceFiscal: 2025,
    });
    const { plan } = composePlanAmortissement({
      exerciceFiscal: 2025,
      dateMiseEnService: "2024-04-15",
      planLogement: computed.plan,
      prorataRatio: computed.prorataRatio,
      // Pas de composantsNouveaux ici — divergence attendue : aucune.
    });
    const representation = rfs(
      fiscalResult({ exercice: 2025, amortCalcule: plan.total_dotations_exercice }),
      { ...computed.plan, valeurTerrain: computed.valeurTerrain },
    );
    const form = map2033AFromRfs(representation);
    assert.ok(findCase(form, "028"), "sans divergence, 028 doit rester alimentée — la garde ne doit pas sur-bloquer");
    assert.ok(findCase(form, "030"));
  });
});

// =====================================================================
// Cas D — ancien dossier sans valeurTerrain : comportement Cycle 35 préservé
// =====================================================================
describe("Cycle 37 — Cas D : l'ordre des gardes ne dégrade pas le comportement Cycle 35 (valeurTerrain absent)", () => {
  it("immobilisations sans valeurTerrain, même si amortCalcule concorde avec totalAnnuelExercice → 028/030 restent bloquées (raison Cycle 35, pas Cycle 37)", () => {
    const immoSansTerrain: ImmobilisationsRfs = {
      lignes: [{ label: "Gros œuvre", montant: 37186, dureeAnnees: 75, dotationExercice: 372, amortissementsCumules: 372, vnc: 36814 }],
      totalAnnuelExercice: 372,
      totalBrut: 37186,
      // valeurTerrain volontairement absent
    };
    const representation = rfs(fiscalResult({ amortCalcule: 372 }), immoSansTerrain);
    const form = map2033AFromRfs(representation);
    assert.equal(findCase(form, "028"), undefined);
    const blocked = findBlocked(form, "028");
    assert.ok(blocked);
    assert.equal(blocked?.categorie, "donnee_absente", "raison Cycle 35 (terrain absent), pas Cycle 37 (divergence)");
    assert.doesNotMatch(blocked!.raison, /amortCalcule/, "ne doit pas mélanger les deux raisons de blocage");
  });
});

// =====================================================================
// Non-régression
// =====================================================================
describe("Cycle 37 — non-régression assembleLiasseFromRfs()", () => {
  it("form2033A assemblé reste structurellement identique à un appel direct de map2033AFromRfs(), y compris en cas de divergence", () => {
    const immo: ImmobilisationsRfs = {
      lignes: [{ label: "Gros œuvre", montant: 37186, dureeAnnees: 75, dotationExercice: 372, amortissementsCumules: 372, vnc: 36814 }],
      totalAnnuelExercice: 372,
      totalBrut: 37186,
      valeurTerrain: 5000,
    };
    // amortCalcule volontairement divergent (1000 au lieu de 372).
    const representation = rfs(fiscalResult({ amortCalcule: 1000 }), immo);
    const direct = map2033AFromRfs(representation);
    const viaAssembleur = assembleLiasseFromRfs(representation).form2033A;
    assert.deepEqual(viaAssembleur, direct);
    assert.equal(direct.cases.some((c) => c.caseId === "028"), false, "la divergence doit rester bloquée même via l'assembleur");
  });
});

describe("Cycle 37 — non-régression : chemin complet F-010 → RFS → 2033-A avec buildFiscalRepresentation()", () => {
  it("buildFiscalRepresentation() reste un pass-through pur — la garde d'invariant vit dans le mapper, pas dans l'assemblage RFS", () => {
    const computed = computeAmortizationPlan({
      prixAcquisition: 280000,
      mobilierInclus: false,
      fraisNotaire: 19500,
      choixTraitementFrais: "integration",
      typeBien: "appartement",
      ratioTerrain: 0.15,
      dateMiseEnService: "2024-04-15",
      exerciceFiscal: 2024,
    });
    const immobilisations: ImmobilisationsRfs = { ...computed.plan, valeurTerrain: computed.valeurTerrain };
    const representation = buildFiscalRepresentation({
      fiscalResult: fiscalResult({ exercice: 2024, amortCalcule: 999999 }), // divergence volontaire
      identite: IDENTITE,
      immobilisations,
    });
    assert.equal(representation.immobilisations, immobilisations, "aucune transformation à l'assemblage — la RFS reste un pur pass-through");
    const form = map2033AFromRfs(representation);
    assert.equal(form.cases.some((c) => c.caseId === "028"), false, "la garde s'applique bien au moment de la projection, pas de l'assemblage");
  });
});
