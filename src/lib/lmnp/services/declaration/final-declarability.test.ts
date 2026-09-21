/**
 * NEXT-5 — FINAL LIASSE DECLARABILITY GATE.
 *
 * Les fixtures "réelles" (draftReel / draftAvecImmobilisationsEtEmprunts)
 * sont copiées à l'identique de liasse-coverage-state.test.ts (mêmes
 * dossiers déjà utilisés en production pour prouver le comportement du
 * mécanisme de coverage) — jamais un liasseRfs fabriqué à la main pour les
 * scénarios bout-en-bout : on vérifie le prédicat sur de vraies sorties de
 * runDeclarationGeneration(), pas sur un objet inventé pour faire passer
 * le test.
 *
 * Run: npx tsx --test src/lib/lmnp/services/declaration/final-declarability.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  resolveFinalDeclarabilityState,
  FINAL_DECLARABILITY_BLOCKED_MESSAGE,
} from "./final-declarability";
import { runDeclarationGeneration } from "./run-declaration-generation";
import type { DeclarationDraft } from "@/lib/lmnp/types/domain";
import type { Dispense2033AState } from "@/runtime/capabilities/rfs/dispense-2033a";
import type { LiasseFromRfs } from "@/runtime/capabilities/rfs/projection/assemble-liasse-from-rfs";
import type { CerfaCaseNonAlimentee, Form2033A } from "@/runtime/capabilities/rfs/projection/map-2033a";
import { map2033AFromRfs } from "@/runtime/capabilities/rfs/projection/map-2033a";
import { assemblePatrimoine } from "@/runtime/capabilities/bilan/assemble-patrimoine";
import type { BilanInputs } from "@/runtime/capabilities/bilan/types";
import type { FiscalResult } from "@/runtime/capabilities/f006/types";
import type { IdentiteDeclarante } from "@/runtime/capabilities/f007/types";
import type { FiscalRepresentation, ImmobilisationsRfs } from "@/runtime/capabilities/rfs/types";
import type { PretFinancementExercice } from "@/runtime/capabilities/f011/types";

function draftReel(): DeclarationDraft {
  return {
    completedSteps: [],
    siret: "12345678901234",
    siren: "123456789",
    exploitantFirstName: "Marie",
    exploitantLastName: "Dupont",
    dateMiseEnService: "2020-01-01",
    revenusAssistant: { exerciceFiscal: 2025, totalRecettes: 9000 },
    chargesAssistant: { exerciceFiscal: 2025, totalDeductible: 2000, totalPreExploitation: 0 },
    amortissementAssistant: { exerciceFiscal: 2025, totalDotations: 1500, status: "validated" },
  } as unknown as DeclarationDraft;
}

/**
 * Cette fixture déclenche RÉELLEMENT (vérifié par lecture directe de la
 * sortie de runDeclarationGeneration()) la garde de divergence F-010/F-014
 * de map-2033a.ts/map-2033c.ts : `logementAmortissement.plan.totalAnnuelExercice`
 * (372) diverge de `fiscalResult.amortCalcule` (dérivé de
 * `amortissementAssistant.totalDotations`, 1500 dans `draftReel()`).
 * Cases 028/030 (2033-A) et 490/492/496/570/576 (2033-C) ressortent alors
 * `categorie: "incoherence_modele"` — la scénario production-reachable
 * exact que ce module doit traiter comme non-déclarable.
 */
function draftAvecImmobilisationsEtEmprunts(): DeclarationDraft {
  return {
    ...draftReel(),
    logementAmortissement: {
      prixRevient: 125136,
      valeurTerrain: 17960,
      valeurBati: 107176,
      baseAmortissableBati: 107176,
      montantMobilier: 5400,
      dotationAnnuelle: 1500,
      dureeMoyenneAnnees: 30,
      prorataRatio: 1,
      plan: {
        lignes: [
          { label: "Gros œuvre", montant: 37186, dureeAnnees: 75, dotationExercice: 372, amortissementsCumules: 372, vnc: 36814 },
        ],
        totalAnnuelExercice: 372,
        totalBrut: 37186,
      },
      fieldSources: {},
      computedAt: "2026-08-31T00:00:00.000Z",
    },
    financementCharges: {
      exerciceFiscal: 2025,
      totalInteretsEmprunt: 4602,
      totalInteretsPreExploitation: 0,
      totalAssurance: 601,
      totalCapitalRembourse: 496,
      totalChargesFinancementExercice: 5203,
      prets: [
        {
          pretId: "pret-1",
          typePret: "amortissable",
          interetsEmpruntExercice: 4602,
          interetsPreExploitation: 0,
          assuranceEmpruntExercice: 601,
          capitalRembourseExercice: 496,
          capitalRestantDu31_12: 130256,
          fraisDossierDeductibles: 0,
          garantieDeductible: 1763,
          iraDeductible: 0,
        },
      ],
      fieldSources: {},
      computedAt: "2026-08-31T00:00:00.000Z",
    },
  } as unknown as DeclarationDraft;
}

/**
 * Même fixture que draftAvecImmobilisationsEtEmprunts(), mais avec
 * amortissementAssistant.totalDotations aligné sur totalAnnuelExercice
 * (372) — simule la correction de la divergence (Case F).
 */
function draftAvecImmobilisationsCorrigees(): DeclarationDraft {
  const base = draftAvecImmobilisationsEtEmprunts();
  return {
    ...base,
    amortissementAssistant: { exerciceFiscal: 2025, totalDotations: 372, status: "validated" },
  } as unknown as DeclarationDraft;
}

function generatedLiasseRfs(draft: DeclarationDraft): LiasseFromRfs {
  const generation = runDeclarationGeneration(draft, 2025);
  assert.equal(generation.status, "generated", "précondition — dossier générable");
  if (generation.status !== "generated") throw new Error("unreachable");
  return generation.liasseRfs;
}

describe("NEXT-5 — resolveFinalDeclarabilityState() : scénarios bout-en-bout (vraies sorties runDeclarationGeneration)", () => {
  it("Case A — LMNP simple sans immobilisations (F-010 non exécuté) : cases 028/030 'donnee_absente', jamais 'incoherence_modele' → DELIVERABLE", () => {
    const liasseRfs = generatedLiasseRfs(draftReel());
    const state = resolveFinalDeclarabilityState(liasseRfs);
    assert.equal(state.deliverable, true);
    assert.deepEqual(state.internalProjectionIssues, []);

    // Précondition du test : ce dossier a bien des cases non alimentées
    // (sinon le test ne prouverait rien sur la distinction donnee_absente
    // vs incoherence_modele), mais aucune sur les cases surveillées.
    const case028 = liasseRfs.form2033A.casesNonAlimentees.find((c) => c.caseId === "028");
    assert.equal(case028?.categorie, "donnee_absente");
  });

  it("Case E — divergence F-010/F-014 réelle (composantsNouveaux non reflétés) : cases 028/030/490/492/496/570/576 'incoherence_modele' → NOT DELIVERABLE", () => {
    const liasseRfs = generatedLiasseRfs(draftAvecImmobilisationsEtEmprunts());
    const state = resolveFinalDeclarabilityState(liasseRfs);

    assert.equal(state.deliverable, false);
    const caseIds = state.internalProjectionIssues.map((i) => i.caseId).sort();
    assert.deepEqual(caseIds, ["028", "030", "490", "492", "496", "570", "576"]);
    assert.ok(state.internalProjectionIssues.every((i) => i.raison.length > 0), "chaque issue porte sa raison tracée");

    // Précondition du test : la divergence est bien présente dans les deux
    // formulaires (2033-A ET 2033-C), sinon le test ne couvrirait qu'un mapper.
    assert.ok(state.internalProjectionIssues.some((i) => i.formId === "2033-A-SD"));
    assert.ok(state.internalProjectionIssues.some((i) => i.formId === "2033-C-SD"));
  });

  it("Case F — divergence corrigée (totalDotations aligné sur totalAnnuelExercice) → DELIVERABLE à nouveau, transition déterministe", () => {
    const divergent = resolveFinalDeclarabilityState(generatedLiasseRfs(draftAvecImmobilisationsEtEmprunts()));
    const corrige = resolveFinalDeclarabilityState(generatedLiasseRfs(draftAvecImmobilisationsCorrigees()));

    assert.equal(divergent.deliverable, false, "étape 1 : divergent → non déclarable");
    assert.equal(corrige.deliverable, true, "étape 2 : corrigé → déclarable, transition déterministe");
    assert.deepEqual(corrige.internalProjectionIssues, []);
  });

  it("Case permanent scope gap (bilan patrimonial, cases hors périmètre de ce gate) : présent dans le même dossier divergent mais jamais compté dans internalProjectionIssues", () => {
    const liasseRfs = generatedLiasseRfs(draftAvecImmobilisationsEtEmprunts());
    const state = resolveFinalDeclarabilityState(liasseRfs);

    // Précondition : ce dossier a bien des cases bilan permanentes non
    // alimentées (044/096/110/112/142/176/180, jamais renseignées ici faute
    // de saisie patrimoniale) — sinon ce test ne prouverait rien sur la
    // distinction visée.
    const totauxBilanNonAlimentes = liasseRfs.form2033A.casesNonAlimentees.filter((c) =>
      ["044", "096", "110", "112", "142", "176", "180"].includes(c.caseId),
    );
    assert.ok(
      totauxBilanNonAlimentes.length > 0,
      "précondition — ce dossier doit avoir des totaux de bilan non alimentés pour prouver la distinction",
    );
    assert.ok(
      totauxBilanNonAlimentes.every((c) => c.categorie === "incoherence_modele"),
      "précondition — ces totaux doivent être catégorisés incoherence_modele (limite de périmètre permanente), pas donnee_absente",
    );

    // Le gate NE DOIT PAS les compter : bloquer dessus rendrait la majorité
    // des dossiers actuels (sans saisie patrimoniale) non livrables.
    const caseIdsSignales = state.internalProjectionIssues.map((i) => i.caseId);
    for (const totalBilan of totauxBilanNonAlimentes) {
      assert.ok(
        !caseIdsSignales.includes(totalBilan.caseId),
        `la case ${totalBilan.caseId} (limite de périmètre permanente) ne doit jamais être traitée comme une perte de projection`,
      );
    }
  });

  it("Case H — warning F-006 seul (logementAmortissement warning) : n'affecte jamais la déclarabilité, couche indépendante", () => {
    // draftReel() n'a pas de logementAmortissement → F-006 produit un warning
    // (non bloquant, cf. validate-fiscal-inputs.ts) sur ce champ, indépendant
    // du prédicat de déclarabilité testé ici (Case A ci-dessus le confirme
    // déjà déclarable malgré ce warning).
    const generation = runDeclarationGeneration(draftReel(), 2025);
    assert.equal(generation.status, "generated", "un warning F-006 ne bloque jamais la génération");
  });

  it("Case G — message client : jamais de jargon technique, jamais une invitation à ressaisir une donnée", () => {
    assert.doesNotMatch(FINAL_DECLARABILITY_BLOCKED_MESSAGE, /case|mapper|categorie|incoherence/i);
    assert.doesNotMatch(FINAL_DECLARABILITY_BLOCKED_MESSAGE, /ressaisi|corrigez|modifiez vos|renseignez/i);
  });
});

describe("NEXT-5 — resolveFinalDeclarabilityState() : unité sur casesNonAlimentees construites", () => {
  function nonAlimentee(caseId: string, categorie: CerfaCaseNonAlimentee["categorie"]): CerfaCaseNonAlimentee {
    return { caseId, label: `Case ${caseId}`, raison: `raison ${caseId}`, categorie };
  }

  function liasseRfsAvec(
    form2033ANonAlimentees: CerfaCaseNonAlimentee[],
    form2033CNonAlimentees: CerfaCaseNonAlimentee[],
    equilibreStatus?: Form2033A["equilibreStatus"],
    dispense2033A?: Dispense2033AState,
  ): LiasseFromRfs {
    return {
      form2033A: { formId: "2033-A-SD", cases: [], casesNonAlimentees: form2033ANonAlimentees, equilibreStatus },
      form2033C: { formId: "2033-C-SD", cases: [], casesNonAlimentees: form2033CNonAlimentees },
      dispense2033A,
    } as unknown as LiasseFromRfs;
  }

  it("liasseRfs absent (dossier legacy/archive sans ce champ) → DELIVERABLE, fail-open, aucune migration rétroactive", () => {
    const state = resolveFinalDeclarabilityState(undefined);
    assert.equal(state.deliverable, true);
    assert.deepEqual(state.internalProjectionIssues, []);
  });

  it("Case C — section hors périmètre / non applicable (154, 010, etc.) → n'affecte jamais la déclarabilité", () => {
    const liasseRfs = liasseRfsAvec(
      [nonAlimentee("010", "non_applicable"), nonAlimentee("356", "hors_perimetre")],
      [],
    );
    assert.equal(resolveFinalDeclarabilityState(liasseRfs).deliverable, true);
  });

  it("caseId surveillé mais catégorie 'donnee_absente' (donnée pas encore fournie, pas une perte prouvée) → DELIVERABLE", () => {
    const liasseRfs = liasseRfsAvec([nonAlimentee("028", "donnee_absente"), nonAlimentee("030", "donnee_absente")], []);
    assert.equal(resolveFinalDeclarabilityState(liasseRfs).deliverable, true);
  });

  it("caseId non surveillé avec catégorie 'incoherence_modele' (limite de périmètre permanente hors scope de ce gate) → DELIVERABLE", () => {
    const liasseRfs = liasseRfsAvec([nonAlimentee("044", "incoherence_modele")], []);
    assert.equal(resolveFinalDeclarabilityState(liasseRfs).deliverable, true);
  });

  it("caseId 156 (emprunts F-011/patrimoine DIVERGENT) surveillé sur 2033-A → NOT DELIVERABLE", () => {
    const liasseRfs = liasseRfsAvec([nonAlimentee("156", "incoherence_modele")], []);
    const state = resolveFinalDeclarabilityState(liasseRfs);
    assert.equal(state.deliverable, false);
    assert.deepEqual(state.internalProjectionIssues.map((i) => i.caseId), ["156"]);
  });

  it("aucune case non alimentée du tout → DELIVERABLE", () => {
    const state = resolveFinalDeclarabilityState(liasseRfsAvec([], []));
    assert.equal(state.deliverable, true);
    assert.deepEqual(state.internalProjectionIssues, []);
  });

  it("Case B — form2033A.equilibreStatus = 'STOCK_OUVERTURE_ABSENT' (dossier N+1 sans clôture N reprise) → DELIVERABLE", () => {
    const liasseRfs = liasseRfsAvec(
      [nonAlimentee("142", "incoherence_modele"), nonAlimentee("180", "incoherence_modele")],
      [],
      "STOCK_OUVERTURE_ABSENT",
    );
    const state = resolveFinalDeclarabilityState(liasseRfs);
    assert.equal(state.deliverable, true);
    assert.deepEqual(state.internalProjectionIssues, []);
  });
});

/**
 * NEXT-5B — le prédicat consomme `Form2033A.equilibreStatus`, un champ
 * additif qui expose tel quel le statut déjà calculé par
 * `checkBilanEquilibre()` (bilan/check-bilan-equilibre.ts, seule source de
 * vérité pour la notion d'équilibre/divergence de bilan) : ces fixtures
 * sont copiées à l'identique de src/runtime/bilan-map-2033a-integration.test.ts
 * (mêmes dossiers déjà utilisés en production pour prouver le comportement
 * du gate d'équilibre), pas un liasseRfs fabriqué à la main — on vérifie le
 * prédicat sur de vraies sorties de map2033AFromRfs()/assemblePatrimoine().
 */
describe("NEXT-5B — resolveFinalDeclarabilityState() : équilibre bilan (cases 142/180), scénarios réels via map2033AFromRfs()", () => {
  const FISCAL_RESULT: FiscalResult = {
    exercice: 2025,
    recettes: { total: 12000 },
    charges: { totalDeductible: 4000, chargesExploitation: 4000, chargesFinancement: 0, chargesPreExploitation: 0, totalNonDeductible: 100 },
    resultatAvantAmort: 7000,
    amortCalcule: 1500,
    amortDeduct: 1500,
    amortReporte: 0,
    amortNonDeduitExercice: 0,
    amortReportesUtilises: 0,
    resultatFiscal: 5500,
    deficitNouveau: 0,
    deficitsImputes: 0,
    perteExceptionnelle: 0,
    stocks: { deficits: [], amortissementsReportes: 0, deficitsExpires: [] },
    trace: { ksArtifacts: ["TRF-0032"], computedAt: "2026-08-31T00:00:00.000Z", journal: [] },
    status: "computed",
    anomalies: [],
  };

  const IMMOBILISATIONS: ImmobilisationsRfs = {
    lignes: [{ label: "Composant", montant: 45000, dureeAnnees: 30, dotationExercice: 1500, amortissementsCumules: 1500, vnc: 43500 }],
    totalAnnuelExercice: 1500,
    totalBrut: 45000,
    valeurTerrain: 15000,
  };

  const EMPRUNT: PretFinancementExercice = {
    pretId: "pret-1",
    typePret: "amortissable",
    interetsEmpruntExercice: 800,
    interetsPreExploitation: 0,
    assuranceEmpruntExercice: 100,
    assurancePreExploitation: 0,
    capitalRembourseExercice: 2000,
    capitalRestantDu31_12: 20000,
    fraisDossierDeductibles: 0,
    garantieDeductible: 0,
    iraDeductible: 0,
  };

  const IDENTITE: IdentiteDeclarante = { siren: "104545108", siret: "10454510800011", denomination: "Test NEXT-5B" };

  const BILAN_INPUTS: BilanInputs = {
    tresorerie: { bankMode: "DEDIE", closingCash: 3000 },
    compteExploitant: { ouverture: 37100, apports: 0, prelevements: 1000 },
    ran: { situation: "NATIF" },
    tiers: { creances: { status: "NUL_CONFIRME" }, dettes: { status: "NUL_CONFIRME" } },
    subventionsInvestissement: { status: "NUL_CONFIRME" },
  };

  function buildRfs(): FiscalRepresentation {
    return {
      exercice: FISCAL_RESULT.exercice,
      identite: IDENTITE,
      fiscalResult: FISCAL_RESULT,
      immobilisations: IMMOBILISATIONS,
      emprunts: [EMPRUNT],
      trace: {
        ksArtifacts: FISCAL_RESULT.trace.ksArtifacts,
        assembledAt: "2026-08-31T00:00:00.000Z",
        sourceFiscalResultAt: FISCAL_RESULT.trace.computedAt,
        sources: { identite: "IdentiteDeclarante (ENT-013)", fiscalResult: "FiscalResult (F-006)" },
      },
    };
  }

  function form2033AWith(inputs: BilanInputs): Form2033A {
    const rfsSansPatrimoine = buildRfs();
    const patrimoine = assemblePatrimoine(rfsSansPatrimoine, inputs);
    return map2033AFromRfs({ ...rfsSansPatrimoine, patrimoine });
  }

  function stateForForm2033A(form2033A: Form2033A): ReturnType<typeof resolveFinalDeclarabilityState> {
    const liasseRfs = {
      form2033A,
      form2033C: { formId: "2033-C-SD", cases: [], casesNonAlimentees: [] },
    } as unknown as LiasseFromRfs;
    return resolveFinalDeclarabilityState(liasseRfs);
  }

  it("Case A — bilan intégralement équilibré (EQUILIBRE) → DELIVERABLE", () => {
    const form = form2033AWith(BILAN_INPUTS);
    assert.equal(form.equilibreStatus, "EQUILIBRE", "précondition — ce dossier doit réellement s'équilibrer");
    assert.equal(form.cases.find((c) => c.caseId === "142")?.value, 41500, "précondition — 142 est bien publiée sur ce dossier");
    const state = stateForForm2033A(form);
    assert.equal(state.deliverable, true);
    assert.deepEqual(state.internalProjectionIssues, []);
  });

  it("Case C / F — tiers non renseignés (DONNEE_MANQUANTE) : 142 non alimentée (incoherence_modele) MAIS DELIVERABLE quand même", () => {
    const inputsSansTiers: BilanInputs = {
      tresorerie: { bankMode: "DEDIE", closingCash: 3000 },
      compteExploitant: { ouverture: 37100, apports: 0, prelevements: 1000 },
      ran: { situation: "NATIF" },
    };
    const form = form2033AWith(inputsSansTiers);
    assert.equal(form.equilibreStatus, "DONNEE_MANQUANTE", "précondition");
    const case142 = form.casesNonAlimentees.find((c) => c.caseId === "142");
    assert.equal(case142?.categorie, "incoherence_modele", "précondition — 142 non alimentée porte bien categorie incoherence_modele ici");

    const state = stateForForm2033A(form);
    assert.equal(state.deliverable, true, "une simple donnée patrimoniale pas encore saisie ne doit jamais bloquer la livraison");
    assert.deepEqual(state.internalProjectionIssues, []);
  });

  it("Case D / G — CRD divergent F-011 vs BilanInputs.financements (DIVERGENCE_SOURCE) : 142/156 non alimentées → NOT DELIVERABLE", () => {
    const inputsCrdDivergent: BilanInputs = { ...BILAN_INPUTS, financements: { clotureCRD: 25000 } };
    const form = form2033AWith(inputsCrdDivergent);
    assert.equal(form.equilibreStatus, "DIVERGENCE_SOURCE", "précondition");
    assert.ok(form.casesNonAlimentees.some((c) => c.caseId === "142" && c.categorie === "incoherence_modele"));
    assert.ok(form.casesNonAlimentees.some((c) => c.caseId === "156" && c.categorie === "incoherence_modele"), "précondition — 156 (déjà allowlisté) est aussi affecté par cette même divergence");

    const state = stateForForm2033A(form);
    assert.equal(state.deliverable, false);
    const caseIds = state.internalProjectionIssues.map((i) => i.caseId).sort();
    assert.deepEqual(caseIds, ["142", "156"], "une seule issue 142 pour l'équilibre (jamais 180 en doublon), plus 156 déjà allowlisté séparément");
  });

  it("Case E / G — subvention 137 déclarée sans contrepartie actif (DESEQUILIBRE_REEL) : 142 non alimentée → NOT DELIVERABLE", () => {
    const inputsAvecSubvention: BilanInputs = { ...BILAN_INPUTS, subventionsInvestissement: { status: "DECLARE", montant: 2500 } };
    const form = form2033AWith(inputsAvecSubvention);
    assert.equal(form.equilibreStatus, "DESEQUILIBRE_REEL", "précondition");
    assert.equal(form.cases.find((c) => c.caseId === "142"), undefined);

    const state = stateForForm2033A(form);
    assert.equal(state.deliverable, false);
    assert.deepEqual(state.internalProjectionIssues.map((i) => i.caseId), ["142"]);
  });

  it("Case K — correction : DESEQUILIBRE_REEL (137 sans contrepartie) → EQUILIBRE (trésorerie corrigée) → DELIVERABLE à nouveau, transition déterministe", () => {
    const desequilibre = form2033AWith({ ...BILAN_INPUTS, subventionsInvestissement: { status: "DECLARE", montant: 2500 } });
    const corrige = form2033AWith({
      ...BILAN_INPUTS,
      tresorerie: { bankMode: "DEDIE", closingCash: 5500 },
      subventionsInvestissement: { status: "DECLARE", montant: 2500 },
    });

    assert.equal(desequilibre.equilibreStatus, "DESEQUILIBRE_REEL", "précondition — étape 1");
    assert.equal(corrige.equilibreStatus, "EQUILIBRE", "précondition — étape 2");

    assert.equal(stateForForm2033A(desequilibre).deliverable, false, "étape 1 : déséquilibre réel → non déclarable");
    assert.equal(stateForForm2033A(corrige).deliverable, true, "étape 2 : corrigé → déclarable, transition déterministe");
  });

  it("Case H — divergence amortissement F-010/F-014 (028/030) reste bloquée, indépendamment de l'équilibre bilan", () => {
    const form = form2033AWith(BILAN_INPUTS);
    // Ce dossier EQUILIBRE ne diverge PAS sur l'amortissement (immobilisations
    // cohérentes avec fiscalResult.amortCalcule) — non-régression : l'ajout
    // de l'équilibre bilan ne doit jamais masquer une divergence 028/030
    // préexistante sur un autre dossier (déjà couvert par les tests NEXT-5
    // "Case E" ci-dessus, qui continuent de passer sans modification).
    assert.equal(form.cases.find((c) => c.caseId === "028")?.value, 60000);
    assert.equal(stateForForm2033A(form).deliverable, true);
  });
});

/**
 * Dispense 2033-A (CGI, art. 302 septies A bis, VI) — quand la dispense est
 * valablement en effet, une divergence interne PROPRE au 2033-A (028/030/156
 * ou un déséquilibre de bilan) ne doit plus bloquer la livraison du reste de
 * la liasse (2031/2033-B/C/D), puisque le 2033-A n'est de toute façon pas
 * livré (voir `download-cerfa-pdf.ts`). FILE_2033A/NOT_ELIGIBLE/UNKNOWN
 * conservent exactement le comportement historique (Case J/K/L).
 */
describe("Dispense 2033-A — resolveFinalDeclarabilityState() ignore les divergences propres au 2033-A quand la dispense est en effet", () => {
  function nonAlimentee(caseId: string, categorie: CerfaCaseNonAlimentee["categorie"]): CerfaCaseNonAlimentee {
    return { caseId, label: `Case ${caseId}`, raison: `raison ${caseId}`, categorie };
  }

  function liasseAvecDivergence156(dispense2033A?: Dispense2033AState): LiasseFromRfs {
    return {
      form2033A: { formId: "2033-A-SD", cases: [], casesNonAlimentees: [nonAlimentee("156", "incoherence_modele")] },
      form2033C: { formId: "2033-C-SD", cases: [], casesNonAlimentees: [] },
      dispense2033A,
    } as unknown as LiasseFromRfs;
  }

  const ELIGIBLE: Dispense2033AState["eligibilite"] = {
    etat: "ELIGIBLE",
    seuil: { triennium: "2026-2028", seuilAutresEntreprisesHT: 66_000, source: "test" },
    caReferenceN1: 0,
    raison: "test",
  };
  const NOT_ELIGIBLE: Dispense2033AState["eligibilite"] = {
    etat: "NOT_ELIGIBLE",
    seuil: { triennium: "2026-2028", seuilAutresEntreprisesHT: 66_000, source: "test" },
    caReferenceN1: 70_000,
    raison: "test",
  };

  it("Case E (rappel, sans dispense) — divergence 156 → NOT DELIVERABLE (non-régression)", () => {
    const state = resolveFinalDeclarabilityState(liasseAvecDivergence156(undefined));
    assert.equal(state.deliverable, false);
  });

  it("Case J — ÉLIGIBLE + USE_DISPENSE → divergence 156 ignorée → DELIVERABLE", () => {
    const state = resolveFinalDeclarabilityState(liasseAvecDivergence156({ eligibilite: ELIGIBLE, decision: "USE_DISPENSE" }));
    assert.equal(state.deliverable, true);
    assert.deepEqual(state.internalProjectionIssues, []);
  });

  it("Case K — ÉLIGIBLE + FILE_2033A → divergence 156 reste bloquante (comportement historique)", () => {
    const state = resolveFinalDeclarabilityState(liasseAvecDivergence156({ eligibilite: ELIGIBLE, decision: "FILE_2033A" }));
    assert.equal(state.deliverable, false);
  });

  it("Case L — NOT_ELIGIBLE (même avec decision USE_DISPENSE, état incohérent) → divergence 156 reste bloquante", () => {
    const state = resolveFinalDeclarabilityState(liasseAvecDivergence156({ eligibilite: NOT_ELIGIBLE, decision: "USE_DISPENSE" }));
    assert.equal(state.deliverable, false);
  });

  it("Case L (UNKNOWN) — jamais traité comme dispensé → divergence 156 reste bloquante", () => {
    const state = resolveFinalDeclarabilityState(liasseAvecDivergence156({ eligibilite: { etat: "UNKNOWN", raison: "test" } }));
    assert.equal(state.deliverable, false);
  });

  it("Case J (équilibre) — ÉLIGIBLE + USE_DISPENSE → DESEQUILIBRE_REEL du 2033-A ignoré → DELIVERABLE", () => {
    const liasseRfs = {
      form2033A: {
        formId: "2033-A-SD",
        cases: [],
        casesNonAlimentees: [nonAlimentee("142", "incoherence_modele")],
        equilibreStatus: "DESEQUILIBRE_REEL",
      },
      form2033C: { formId: "2033-C-SD", cases: [], casesNonAlimentees: [] },
      dispense2033A: { eligibilite: ELIGIBLE, decision: "USE_DISPENSE" },
    } as unknown as LiasseFromRfs;
    assert.equal(resolveFinalDeclarabilityState(liasseRfs).deliverable, true);
  });

  it("2033-C reste inconditionnel — une divergence 2033-C n'est jamais exemptée par la dispense 2033-A", () => {
    const liasseRfs = {
      form2033A: { formId: "2033-A-SD", cases: [], casesNonAlimentees: [] },
      form2033C: { formId: "2033-C-SD", cases: [], casesNonAlimentees: [nonAlimentee("490", "incoherence_modele")] },
      dispense2033A: { eligibilite: ELIGIBLE, decision: "USE_DISPENSE" },
    } as unknown as LiasseFromRfs;
    const state = resolveFinalDeclarabilityState(liasseRfs);
    assert.equal(state.deliverable, false);
    assert.deepEqual(state.internalProjectionIssues.map((i) => i.caseId), ["490"]);
  });
});
