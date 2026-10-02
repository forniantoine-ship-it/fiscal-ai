/**
 * R2C.3a — projection RFS multi-bien DORMANTE : une RFS déjà alimentée en blocs par bien (`immobilisationsParBien`,
 * emprunts avec `propertyId`) produit 2033-A/B/C, registre patrimonial, annexe et extras corrects. Aucune génération
 * multi (R2C.3b) ; mono strictement identique (empreintes capturées à HEAD bc30923, horloge figée).
 *
 * Run: npx tsx --test src/lib/lmnp/dossier/r2c3a-multi-rfs-projection.test.ts
 */
import "@/lab/v2-dossier/test-public-env";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it, mock } from "node:test";

import { loanKey } from "@/lib/lmnp/dossier/fiscal-consolidation";
import { buildLiasseDossierDocument } from "@/lib/lmnp/services/declaration/build-liasse-dossier-document";
import { collectLiasseDossierExtras } from "@/lib/lmnp/services/declaration/collect-liasse-dossier-extras";
import { buildFiscalEngineInputs, draftAmortissementForGeneration } from "@/lib/lmnp/services/declaration/generation-inputs";
import { runDeclarationGeneration } from "@/lib/lmnp/services/declaration/run-declaration-generation";
import type { DeclarationDraft } from "@/lib/lmnp/types";
import { assembleRegistreImmobilisationsPatrimoniales } from "@/runtime/capabilities/bilan/assemble-immobilisations-patrimoniales";
import { assemblePatrimoine } from "@/runtime/capabilities/bilan/assemble-patrimoine";
import type { BilanInputs } from "@/runtime/capabilities/bilan/types";
import { validateFiscalInputs } from "@/runtime/capabilities/f006/validate-fiscal-inputs";
import type { FiscalEngineInputs } from "@/runtime/capabilities/f006/types";
import type { PretFinancementExercice } from "@/runtime/capabilities/f011/types";
import { assembleLiasseFromRfs } from "@/runtime/capabilities/rfs/projection/assemble-liasse-from-rfs";
import { map2033AFromRfs } from "@/runtime/capabilities/rfs/projection/map-2033a";
import { map2033BFromRfs } from "@/runtime/capabilities/rfs/projection/map-2033b";
import { map2033CFromRfs } from "@/runtime/capabilities/rfs/projection/map-2033c";
import type { FiscalRepresentation, ImmobilisationsRfs } from "@/runtime/capabilities/rfs/types";

const ROOT = process.cwd();
const source = (relative: string) => readFileSync(path.join(ROOT, relative), "utf8");
const Y = 2026;
const T = "2026-01-01T00:00:00.000Z";
const FIXED = Date.parse("2026-06-01T12:00:00.000Z");
const A = "home-1";
const B = "bien-b";
const sha = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const clone = <V>(value: V): V => JSON.parse(JSON.stringify(value));

function withFixedClock<V>(run: () => V): V {
  mock.timers.enable({ apis: ["Date"], now: FIXED });
  try {
    return run();
  } finally {
    mock.timers.reset();
  }
}

// ---------------------------------------------------------------------------
// RFS mono réelle (base) et RFS multi synthétique (blocs par bien)
// ---------------------------------------------------------------------------

function monoDraft(): DeclarationDraft {
  return {
    completedSteps: [], siret: "12345678900012", siren: "123456789", exploitantFirstName: "Mono", exploitantLastName: "Parite",
    activityStartDate: "2026-03-01", dateMiseEnService: "2026-04-15", activityType: "LMNP",
    logementAssistantState: { step: "complete", adresse: "1 rue Mono, Lyon", typeBien: "appartement", dateAcquisition: "2026-02-01", prixAcquisition: 200000, fraisNotaire: 15000.37, choixTraitementFrais: "deduction", fieldSources: {}, updatedAt: T },
    financementAssistantState: { step: "complete", currentLoanIndex: 0, loans: [{ pretId: "loan-1", capitalInitial: 150000, tauxNominal: 3.1, dureeMois: 240, datePremiereMensualite: "2026-05-05", typePret: "amortissable" }], fieldSources: {}, updatedAt: T },
    chargesAssistantState: { step: "complete", collected: { coproLignes: [{ type: "provisions", montant: 2256.67, description: "Provisions" }], familyLines: [], travaux: [], divers: [] } },
    logementAmortissement: {
      exerciceFiscal: Y, prixRevient: 215000, fraisEnCharges: 15000.37, valeurTerrain: 30000, valeurBati: 170000, baseAmortissableBati: 170000,
      montantMobilier: 8000, dotationAnnuelle: 4544.21, dureeMoyenneAnnees: 30, prorataRatio: 0.71,
      plan: {
        lignes: [
          { id: "gros-oeuvre", label: "Gros œuvre", montant: 100000, dureeAnnees: 50, dotationExercice: 1420.01, amortissementsCumules: 1420.01 },
          { id: "facades", label: "Façades", montant: 70000, dureeAnnees: 25, dotationExercice: 1988.2, amortissementsCumules: 1988.2 },
          { id: "mobilier", label: "Mobilier", montant: 8000, dureeAnnees: 5, dotationExercice: 1136.0, amortissementsCumules: 1136.0 },
        ],
        totalAnnuelExercice: 4544.21, totalBrut: 178000,
      },
      fieldSources: {}, computedAt: T,
    },
    financementCharges: {
      exerciceFiscal: Y, totalInteretsEmprunt: 2100.13, totalInteretsPreExploitation: 0, totalAssurance: 0, totalCapitalRembourse: 3000, totalChargesFinancementExercice: 2100.13,
      prets: [{ pretId: "loan-1", typePret: "amortissable", interetsEmpruntExercice: 2100.13, interetsPreExploitation: 0, assuranceEmpruntExercice: 0, assurancePreExploitation: 0, capitalRembourseExercice: 3000, capitalRestantDu31_12: 147000, fraisDossierDeductibles: 0, garantieDeductible: 0, iraDeductible: 0 }],
      fieldSources: {}, computedAt: T,
    },
    chargesAssistant: { exerciceFiscal: Y, totalDeductible: 3456.78, totalNonDeductible: 0, totalAmortissable: 0, totalPreExploitation: 0, parCategorie: { taxe_fonciere: 1200.11, copropriete: 2256.67 }, composantsNouveaux: [], fieldSources: {}, computedAt: T },
    revenusAssistant: { exerciceFiscal: Y, totalRecettes: 14321.09, loyersEncaisses: 14321.09, fieldSources: {}, computedAt: T },
    amortissementAssistant: { exerciceFiscal: Y, totalDotations: 4544.21, status: "validated" },
    dispense2033A: { caReferenceN1Declaree: 0 },
  } as unknown as DeclarationDraft;
}

const MONO_STOCKS = { sourceClosureId: "c", stocks: { deficits: [{ millesime: 2023, montant: 2000 }], amortissementsReportes: 4000, deficitsExpires: [] } };

function monoRfs(): FiscalRepresentation {
  return withFixedClock(() => {
    const generated = runDeclarationGeneration(monoDraft(), Y);
    assert.equal(generated.status, "generated", JSON.stringify(generated));
    return clone(generated.status === "generated" ? generated.rfs : (undefined as never));
  });
}

function immoA(): ImmobilisationsRfs {
  return {
    lignes: [{ label: "Bâti A", montant: 170000, dureeAnnees: 34, dotationExercice: 5000, amortissementsCumules: 25000, vnc: 145000 }],
    totalAnnuelExercice: 5000, totalBrut: 170000, valeurTerrain: 30000, montantMobilier: 0, dateMiseEnService: "2023-05-01",
    composantsNouveaux: [], composantsDetail: [],
    mouvements: { valeurBruteOuverture: 200000, amortissementsCumulesOuverture: 20000, sourceClosureId: "closure-a" },
  };
}

function immoB(): ImmobilisationsRfs {
  return {
    lignes: [{ label: "Bâti B", montant: 125000, dureeAnnees: 40, dotationExercice: 3000, amortissementsCumules: 3000, vnc: 122000 }],
    totalAnnuelExercice: 3000, totalBrut: 125000, valeurTerrain: 25000, montantMobilier: 0, dateMiseEnService: "2026-04-01",
    composantsNouveaux: [], composantsDetail: [],
  };
}

function pret(pretId: string, interets: number, crd: number): PretFinancementExercice {
  return {
    pretId, typePret: "amortissable", interetsEmpruntExercice: interets, interetsPreExploitation: 0, assuranceEmpruntExercice: 0,
    assurancePreExploitation: 0, capitalRembourseExercice: 0, capitalRestantDu31_12: crd, fraisDossierDeductibles: 0, garantieDeductible: 0, iraDeductible: 0,
  };
}

type MultiRfs = FiscalRepresentation & Record<string, unknown>;

function multiRfs(options: { reversed?: boolean; immoA?: ImmobilisationsRfs; keepMonoBlock?: boolean; duplicate?: boolean; amortCalcule?: number } = {}): MultiRfs {
  const rfs = clone(BASE) as MultiRfs;
  if (!options.keepMonoBlock) delete (rfs as Partial<FiscalRepresentation>).immobilisations;
  rfs.fiscalResult.amortCalcule = options.amortCalcule ?? 8000;
  const blocs = [
    { propertyId: A, immobilisations: options.immoA ?? immoA(), dotationsExercice: 5000 },
    { propertyId: options.duplicate ? A : B, immobilisations: immoB(), dotationsExercice: 3000 },
  ];
  const emprunts = [{ ...pret("loan-1", 2000, 100000), propertyId: A }, { ...pret("loan-1", 300, 50000), propertyId: B }];
  rfs.immobilisationsParBien = options.reversed ? [...blocs].reverse() : blocs;
  rfs.emprunts = (options.reversed ? [...emprunts].reverse() : emprunts) as never;
  return rfs;
}

const BASE = monoRfs();

const caseValue = (form: { cases: Array<{ caseId: string; value: unknown }> }, caseId: string) => form.cases.find((item) => item.caseId === caseId)?.value;
const nonAlimentee = (form: { casesNonAlimentees: Array<{ caseId: string; raison: string }> }, caseId: string) =>
  form.casesNonAlimentees.find((item) => item.caseId === caseId);

// ---------------------------------------------------------------------------
// ARB-5 — validation F-006 des dates
// ---------------------------------------------------------------------------

describe("R2C.3a — ARB-5 : validation F-006 des dates de mise en service", () => {
  const engine = (): FiscalEngineInputs => {
    const draft = monoDraft();
    return buildFiscalEngineInputs({ draft, fiscalYear: Y, amortissementAssistant: draftAmortissementForGeneration(draft), usesTakeoverHistory: false });
  };
  const dateAnomaly = (inputs: FiscalEngineInputs) => validateFiscalInputs(inputs).anomalies.find((item) => item.field === "dateMiseEnService");

  it("multi : une liste non vide de dates valides par bien suffit, sans date globale", () => {
    const inputs = engine();
    inputs.activite = { siret: inputs.activite.siret, activityType: inputs.activite.activityType, datesMiseEnService: [{ propertyId: A, date: "2023-05-01" }, { propertyId: B, date: "2026-04-01" }] } as never;
    assert.equal(dateAnomaly(inputs), undefined);
    assert.equal("dateMiseEnService" in inputs.activite, false);
    assert.equal(validateFiscalInputs(inputs).ready, true);
  });

  it("multi : liste vide, propertyId vide, date invalide ou bien en double → fatal", () => {
    for (const dates of [[], [{ propertyId: "", date: "2026-01-01" }], [{ propertyId: A, date: "2026-02-30" }], [{ propertyId: A, date: "2026-01-01" }, { propertyId: A, date: "2026-02-01" }]]) {
      const inputs = engine();
      inputs.activite = { siret: inputs.activite.siret, datesMiseEnService: dates } as never;
      assert.equal(dateAnomaly(inputs)?.severity, "fatal", JSON.stringify(dates));
    }
  });

  it("mono : sans date ni liste, anomalie historique strictement identique", () => {
    const inputs = engine();
    inputs.activite = { ...inputs.activite, dateMiseEnService: undefined };
    assert.deepEqual(dateAnomaly(inputs), { severity: "fatal", message: "Date de mise en service manquante (F-009 Activité).", field: "dateMiseEnService" });
  });
});

// ---------------------------------------------------------------------------
// 2033-C (P1 → P6)
// ---------------------------------------------------------------------------

describe("R2C.3a — P1 → P6 : 2033-C depuis les blocs par bien", () => {
  it("P1 / P2 / P3 — A continuation + B première année : 490/492/496 et 570/576 corrects", () => {
    const form = map2033CFromRfs(multiRfs());
    assert.deepEqual(
      ["426", "490", "492", "496", "570", "576"].map((caseId) => [caseId, caseValue(form, caseId)]),
      [["426", 55000], ["490", 200000], ["492", 150000], ["496", 350000], ["570", 20000], ["576", 28000]],
    );
  });

  it("P4 — 572 = amortissement F-006 global ; Σ dotations par bien ≠ global → mouvements non publiés", () => {
    assert.equal(caseValue(map2033CFromRfs(multiRfs()), "572"), 8000);
    const divergent = map2033CFromRfs(multiRfs({ amortCalcule: 8100 }));
    assert.equal(caseValue(divergent, "572"), 8100);
    for (const caseId of ["490", "492", "496", "570", "576"]) assert.ok(nonAlimentee(divergent, caseId), caseId);
  });

  it("P5 — réconciliation de A invalide : cases multi non publiées, raison portant le bien A", () => {
    const broken = immoA();
    broken.mouvements!.valeurBruteOuverture = 200500;
    const form = map2033CFromRfs(multiRfs({ immoA: broken }));
    for (const caseId of ["490", "492", "496", "570", "576"]) {
      assert.equal(caseValue(form, caseId), undefined, caseId);
      assert.match(nonAlimentee(form, caseId)!.raison, new RegExp(A));
    }
  });

  it("P6 — 494 / 574 : non alimentées avec la raison historique, à l'identique du mono", () => {
    const mono = map2033CFromRfs(BASE);
    const multi = map2033CFromRfs(multiRfs());
    for (const caseId of ["494", "574"]) assert.deepEqual(nonAlimentee(multi, caseId), nonAlimentee(mono, caseId));
  });

  it("P26 — bloc unique ET blocs par bien : ambigu, cases d'immobilisations non publiées", () => {
    const form = map2033CFromRfs(multiRfs({ keepMonoBlock: true }));
    for (const caseId of ["426", "490", "496", "576"]) assert.equal(caseValue(form, caseId), undefined, caseId);
  });

  it("P27 — bien en double dans les blocs : non publié", () => {
    const form = map2033CFromRfs(multiRfs({ duplicate: true }));
    for (const caseId of ["426", "490", "496"]) assert.equal(caseValue(form, caseId), undefined, caseId);
  });
});

// ---------------------------------------------------------------------------
// 2033-A, registre, emprunts (P7 → P10)
// ---------------------------------------------------------------------------

function bilanInputs(): BilanInputs {
  return {
    tresorerie: { bankMode: "DEDIE", closingCash: 1000, provisionsAmortissements: { status: "NUL_CONFIRME" } },
    compteExploitant: { ouverture: 0, apports: 0, prelevements: 0 },
    ran: { situation: "NATIF" },
    tiers: { creances: { status: "NUL_CONFIRME" }, dettes: { status: "NUL_CONFIRME" } },
    subventionsInvestissement: { status: "NUL_CONFIRME" },
    lignesSimples: {
      autresImmobilisationsIncorporellesBrut: { status: "NUL_CONFIRME" }, autresImmobilisationsIncorporellesNet: { status: "NUL_CONFIRME" },
      immobilisationsFinancieresBrut: { status: "NUL_CONFIRME" }, immobilisationsFinancieresNet: { status: "NUL_CONFIRME" },
      avancesAcomptesVerses: { status: "NUL_CONFIRME" }, avancesAcomptesVersesAmort: { status: "NUL_CONFIRME" },
      clientsAmortissementsProvisions: { status: "NUL_CONFIRME" }, autresCreancesAmortissementsProvisions: { status: "NUL_CONFIRME" },
      valeursMobilieresPlacementBrut: { status: "NUL_CONFIRME" }, valeursMobilieresPlacementNet: { status: "NUL_CONFIRME" },
      chargesConstateesAvance: { status: "NUL_CONFIRME" }, chargesConstateesAvanceAmort: { status: "NUL_CONFIRME" },
      produitsConstatesAvance: { status: "NUL_CONFIRME" }, autresDettes: { status: "NUL_CONFIRME" },
    },
  } as unknown as BilanInputs;
}

describe("R2C.3a — P7 → P10 : 2033-A, terrain, CRD, registre", () => {
  it("P7 / P8 — 2033-A sans patrimoine : actifs A+B (terrains compris) comptés une seule fois", () => {
    const form = map2033AFromRfs(multiRfs());
    assert.equal(caseValue(form, "028"), 350000);
    assert.equal(caseValue(form, "030"), 28000);
  });

  it("P7 — 2033-A avec patrimoine : registre multi, brut 350 000 / cumul 28 000", () => {
    const rfs = multiRfs();
    const patrimoine = assemblePatrimoine(rfs, bilanInputs());
    assert.equal(patrimoine.immobilisations.brutTotal, 350000);
    assert.equal(patrimoine.immobilisations.cumuleTotal, 28000);
    const form = map2033AFromRfs({ ...rfs, patrimoine });
    assert.equal(caseValue(form, "028"), 350000);
  });

  it("P9 — CRD des prêts A + B compté une seule fois (156)", () => {
    assert.equal(caseValue(map2033AFromRfs(multiRfs()), "156"), 150000);
  });

  it("P10 — registre : chaque actif porte son propertyId, ids persistés intacts, A non fiable jamais compensé par B", async () => {
    const { assembleRegistreImmobilisationsPatrimonialesParBien } = await import("@/runtime/capabilities/bilan/assemble-immobilisations-patrimoniales");
    const rfs = multiRfs();
    const registre = assembleRegistreImmobilisationsPatrimonialesParBien({ blocs: rfs.immobilisationsParBien as never, amortCalcule: 8000 });
    const terrains = registre.actifs.filter((actif) => actif.id === "terrain");
    assert.deepEqual(terrains.map((actif) => [actif.propertyId, actif.coutBrut]), [[A, 30000], [B, 25000]]);
    assert.ok(registre.actifs.every((actif) => actif.propertyId === A || actif.propertyId === B));
    const sansTerrain = immoA();
    delete sansTerrain.valeurTerrain;
    const broken = assembleRegistreImmobilisationsPatrimonialesParBien({ blocs: multiRfs({ immoA: sansTerrain }).immobilisationsParBien as never, amortCalcule: 8000 });
    assert.equal(broken.brutFiable, false);
    assert.equal(broken.brutTotal, undefined);
    assert.ok(broken.raisons.some((raison) => raison.includes(A)));
  });
});

// ---------------------------------------------------------------------------
// 2033-B, prêts et annexe (P11, P12, 2033-B)
// ---------------------------------------------------------------------------

describe("R2C.3a — 2033-B et prêts multi", () => {
  it("2033-B : prêts A.loan-1 et B.loan-1 sommés une fois (294) ; détail consolidé fourni → 242/244 publiées", () => {
    const rfs = multiRfs();
    rfs.fiscalResult.charges = { ...rfs.fiscalResult.charges, chargesExploitation: 3000, totalDeductible: 3000 + 2300, chargesFinancement: 2300, chargesExploitationPreExploitation: 0, totalNonDeductible: 0, detailParCategorie: { taxe_fonciere: 1000, copropriete: 2000 }, detailPreExploitationParCategorie: {}, detailNonDeductibleParCategorie: {}, fraisAcquisitionEnCharges: 0 };
    const form = map2033BFromRfs(rfs);
    assert.equal(caseValue(form, "294"), 2300);
    assert.equal(caseValue(form, "244"), 1000);
    assert.equal(caseValue(form, "242"), 2000);
  });

  it("P11 / P12 / P25 — annexe : A.loan-1 et B.loan-1 distincts, descriptif de A jamais remplacé par celui de B, pretId inchangés", () => {
    const extras = {
      biens: [
        { propertyId: A, label: "Appartement Lyon", pretsDescriptifs: [{ pretId: "loan-1", propertyId: A, capitalInitial: 120000 }] },
        { propertyId: B, label: "Studio Nantes", pretsDescriptifs: [{ pretId: "loan-1", propertyId: B, capitalInitial: 60000 }] },
      ],
    };
    const document = withFixedClock(() => buildLiasseDossierDocument(multiRfs(), extras as never));
    const prets = document.financement!.prets as Array<{ pretId: string; propertyId?: string; capitalInitial?: number; capitalRestantDu31_12?: number }>;
    assert.deepEqual(prets.map((row) => [row.propertyId, row.pretId, row.capitalInitial, row.capitalRestantDu31_12]), [[A, "loan-1", 120000, 100000], [B, "loan-1", 60000, 50000]]);
    const financement = document.chargesParCategorie.filter((ligne) => ligne.source === "financement").map((ligne) => ligne.categorie);
    assert.equal(new Set(financement).size, financement.length, "catégories de prêt distinctes par bien");
    assert.ok(financement.includes(`interets_emprunt:${loanKey(A, "loan-1")}`));
  });

  it("annexe sans descriptifs : chaque prêt garde son bien, aucun croisement", () => {
    const document = withFixedClock(() => buildLiasseDossierDocument(multiRfs()));
    const prets = document.financement!.prets as Array<{ propertyId?: string; pretId: string }>;
    assert.deepEqual(prets.map((row) => [row.propertyId, row.pretId]), [[A, "loan-1"], [B, "loan-1"]]);
  });

  it("annexe : immobilisations présentées par bien (terrain de chaque bien), libellé réel seulement", () => {
    const extras = { biens: [{ propertyId: A, label: "Appartement Lyon" }, { propertyId: B }] };
    const document = withFixedClock(() => buildLiasseDossierDocument(multiRfs(), extras as never)) as unknown as {
      immobilisations?: unknown;
      immobilisationsParBien?: Array<{ propertyId: string; label?: string; lignes: Array<{ source: string; valeurBrute: number }> }>;
    };
    assert.equal(document.immobilisations, undefined);
    assert.deepEqual(document.immobilisationsParBien!.map((bloc) => [bloc.propertyId, bloc.label, bloc.lignes.find((ligne) => ligne.source === "terrain")?.valeurBrute]), [[A, "Appartement Lyon", 30000], [B, undefined, 25000]]);
  });
});

// ---------------------------------------------------------------------------
// Extras (P13 → P15)
// ---------------------------------------------------------------------------

function scopedDraft(): DeclarationDraft {
  const bien = (adresse: string, capital: number, copro: number) => ({
    logementAssistantState: { step: "complete", adresse, typeBien: "appartement", prixAcquisition: capital + 10000, fieldSources: {}, updatedAt: T },
    financementAssistantState: { step: "complete", currentLoanIndex: 0, loans: [{ pretId: "loan-1", capitalInitial: capital, tauxNominal: 3, dureeMois: 240 }], fieldSources: {}, updatedAt: T },
    chargesAssistantState: { step: "complete", collected: { coproLignes: [{ type: "provisions", montant: copro }], familyLines: [], travaux: [], divers: [] } },
  });
  return {
    completedSteps: [], activityStartDate: "2026-01-01", activityType: "LMNP",
    biens: {
      [A]: { propertyId: A, completedSteps: [], ...bien("1 rue A, Lyon", 120000, 1500) },
      [B]: { propertyId: B, completedSteps: [], ...bien("3 rue B, Nantes", 60000, 800) },
    },
  } as unknown as DeclarationDraft;
}

describe("R2C.3a — P13 → P15 : extras par bien", () => {
  const properties = [{ id: A, label: "Appartement Lyon" }, { id: B, label: "  " }];

  it("P15 — un bloc d'extras par bien, jamais un undefined silencieux ; libellé réel seulement", () => {
    const extras = collectLiasseDossierExtras({ declarationDraft: scopedDraft(), fiscalYear: null, properties } as never) as unknown as {
      bien?: unknown;
      biens?: Array<{ propertyId: string; label?: string; bien?: { adresse?: string } }>;
    };
    assert.equal(extras.bien, undefined, "aucune lecture à plat en multi");
    assert.deepEqual(extras.biens!.map((item) => [item.propertyId, item.label, item.bien?.adresse]), [[A, "Appartement Lyon", "1 rue A, Lyon"], [B, undefined, "3 rue B, Nantes"]]);
  });

  it("P13 — prêts descriptifs groupés par bien, propertyId porté, pretId inchangé", () => {
    const extras = collectLiasseDossierExtras({ declarationDraft: scopedDraft(), fiscalYear: null, properties } as never) as unknown as {
      pretsDescriptifs?: unknown;
      biens: Array<{ propertyId: string; pretsDescriptifs?: Array<{ pretId: string; propertyId?: string; capitalInitial?: number }> }>;
    };
    assert.equal(extras.pretsDescriptifs, undefined);
    assert.deepEqual(extras.biens.map((item) => item.pretsDescriptifs!.map((p) => [p.propertyId, p.pretId, p.capitalInitial])), [[[A, "loan-1", 120000]], [[B, "loan-1", 60000]]]);
  });

  it("P14 — charges descriptives groupées par bien, jamais sommées", () => {
    const extras = collectLiasseDossierExtras({ declarationDraft: scopedDraft(), fiscalYear: null, properties } as never) as unknown as {
      chargesDescriptives?: unknown;
      biens: Array<{ chargesDescriptives?: { coproLignes?: Array<{ montant: number }> } }>;
    };
    assert.equal(extras.chargesDescriptives, undefined);
    assert.deepEqual(extras.biens.map((item) => item.chargesDescriptives!.coproLignes!.map((ligne) => ligne.montant)), [[1500], [800]]);
  });
});

// ---------------------------------------------------------------------------
// P16, P17 : persistance / reprojection serveur, ordre
// ---------------------------------------------------------------------------

describe("R2C.3a — P16, P17 : RFS persistée puis re-projetée, ordre des biens", () => {
  it("P16 — RFS multi → JSON (persistance) → re-projection : 2033-A/B/C et liasse identiques, champs multi conservés", () => {
    const rfs = multiRfs();
    const reloaded = JSON.parse(JSON.stringify(rfs)) as MultiRfs;
    assert.deepEqual(reloaded.immobilisationsParBien, rfs.immobilisationsParBien);
    assert.deepEqual((reloaded.emprunts as Array<{ propertyId?: string }>).map((item) => item.propertyId), [A, B]);
    withFixedClock(() => {
      assert.deepEqual(map2033CFromRfs(reloaded), map2033CFromRfs(rfs));
      assert.deepEqual(map2033AFromRfs(reloaded), map2033AFromRfs(rfs));
      assert.deepEqual(map2033BFromRfs(reloaded), map2033BFromRfs(rfs));
      assert.deepEqual(assembleLiasseFromRfs(reloaded), assembleLiasseFromRfs(rfs));
    });
  });

  it("P17 — ordre A/B inversé : mêmes totaux fiscaux (2033-A/C)", () => {
    const direct = multiRfs();
    const reversed = multiRfs({ reversed: true });
    for (const caseId of ["426", "490", "492", "496", "570", "572", "576"]) {
      assert.notEqual(caseValue(map2033CFromRfs(direct), caseId), undefined, caseId);
      assert.equal(caseValue(map2033CFromRfs(reversed), caseId), caseValue(map2033CFromRfs(direct), caseId), caseId);
    }
    for (const caseId of ["028", "030", "156"]) {
      assert.notEqual(caseValue(map2033AFromRfs(direct), caseId), undefined, caseId);
      assert.equal(caseValue(map2033AFromRfs(reversed), caseId), caseValue(map2033AFromRfs(direct), caseId), caseId);
    }
  });
});

// ---------------------------------------------------------------------------
// P18 → P23 : parité mono (empreintes capturées à HEAD bc30923)
// ---------------------------------------------------------------------------

describe("R2C.3a — P18 → P23 : mono strictement identique", () => {
  const extras = () => collectLiasseDossierExtras({ declarationDraft: monoDraft(), fiscalYear: { stocksOuverture: MONO_STOCKS } as never });
  const MONO: Array<[string, () => unknown, string]> = [
    ["P18 — RFS mono", () => BASE, "4f16f84508fc272b58b026064226da7321f9bd40351c56512cc251e23d8a92d8"],
    ["P19 — 2033-A mono", () => map2033AFromRfs(BASE), "87877371559f0731f8293ed87eac98bd311e9b73f473ddad5022d1afe75d33f2"],
    ["P20 — 2033-B mono", () => map2033BFromRfs(BASE), "6206cb2dc648cf16f46a57898518174730a4fecab263449f5832f965ae9e5a62"],
    ["P21 — 2033-C mono", () => map2033CFromRfs(BASE), "6abf4846bac742caba50c9f3ff77cbee750f5d153792a2793e5c3e2cc7926cc4"],
    ["liasse mono", () => assembleLiasseFromRfs(BASE), "8fa1245bdc6ad74866c9433a3997015bd6a69a25f20f2ef3caacf1ad7b349b4f"],
    ["registre mono", () => assembleRegistreImmobilisationsPatrimoniales({ immobilisations: BASE.immobilisations, amortCalcule: BASE.fiscalResult.amortCalcule }), "7bd1485141e30ed21cf97b760080117e04c806c958d3987bbb3d43cbdb65a711"],
    ["P22 — annexe mono", () => buildLiasseDossierDocument(BASE, extras()), "13237e14094d9c38661f4b5284194e5e47da08a1d80ea5214d008a4e9aefb8ad"],
    ["P23 — extras mono", () => extras(), "fc90a898aefc8f51b1084379c99c6d5258bdbc7145646fb72893c582dd6c8dff"],
    ["validation F-006 mono", () => {
      const draft = monoDraft();
      const inputs = buildFiscalEngineInputs({ draft, fiscalYear: Y, amortissementAssistant: draftAmortissementForGeneration(draft), usesTakeoverHistory: false });
      return [validateFiscalInputs(inputs), validateFiscalInputs({ ...inputs, activite: { ...inputs.activite, dateMiseEnService: undefined } })];
    }, "5508ce5865979de35f5ff7714ed9c53d86caec58ff422053b8787be72ecab8e5"],
  ];
  for (const [name, compute, expected] of MONO) {
    it(name, () => {
      assert.equal(withFixedClock(() => sha(compute())), expected);
    });
  }
});

// ---------------------------------------------------------------------------
// P24, P25 : périmètre
// ---------------------------------------------------------------------------

describe("R2C.3a — P24, P25 : périmètre", () => {
  const FILES = [
    "src/runtime/capabilities/rfs/projection/consolidate-immobilisations.ts",
    "src/runtime/capabilities/rfs/projection/map-2033c.ts",
    "src/runtime/capabilities/rfs/projection/map-2033a.ts",
    "src/runtime/capabilities/bilan/assemble-immobilisations-patrimoniales.ts",
    "src/lib/lmnp/services/declaration/build-liasse-dossier-document.ts",
    "src/lib/lmnp/services/declaration/collect-liasse-dossier-extras.ts",
  ];

  it("P24 — aucun properties[0] / propertyIds[0] / repli mono", () => {
    for (const file of FILES) assert.doesNotMatch(source(file), /properties\[0\]|propertyIds\[0\]|resolveMono/, file);
  });

  it("P25 — aucun id persisté réécrit (pretId / assetId conservés tels quels dans les sorties multi)", () => {
    const rfs = multiRfs();
    const document = withFixedClock(() => buildLiasseDossierDocument(rfs));
    assert.deepEqual(document.financement!.prets.map((row) => row.pretId), ["loan-1", "loan-1"]);
    assert.deepEqual((rfs.emprunts as Array<{ pretId: string }>).map((item) => item.pretId), ["loan-1", "loan-1"]);
  });

  it("dormant : gate inchangé, runDeclarationGeneration sans date par bien (R2C.3a, ajusté R2C.3b)", () => {
    // R2C.3b a extrait le shared core (qui transporte `immobilisationsParBien` vers la RFS) : le chemin mono, lui, ne manipule
    // toujours aucune date de mise en service par bien.
    assert.doesNotMatch(source("src/lib/lmnp/services/declaration/run-declaration-generation.ts"), /datesMiseEnService/);
    assert.doesNotMatch(source("src/lib/lmnp/services/declaration/declaration-generation-gate.ts"), /immobilisationsParBien/);
  });
});
