/**
 * P0-2C — EXTERNAL_HISTORY : le closing ne réintroduit pas le draft F-010
 * dans `Property.amortissementBase` (Opening → génération → closing → N+1).
 *
 * Run: npx tsx --test src/lib/lmnp/services/fiscal-year-transition/p0-2c-takeover-closing-base.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { runDeclarationGeneration } from "@/lib/lmnp/services/declaration/run-declaration-generation";
import { resolveDeclarationGenerationGate } from "@/lib/lmnp/services/declaration/declaration-generation-gate";
import { resolvePriorHistoryEligibility } from "@/lib/lmnp/services/declaration/prior-history-eligibility";
import { adaptInternalOpening } from "@/lib/lmnp/services/fiscal-year-opening/adapt-internal-opening";
import {
  extractDossierLevelDataFromWorkspace,
  mergeComposantsF012,
  resolveImmobilisationsContinuityForGeneration,
} from "@/lib/lmnp/services/dossier/fiscal-year-cycle";
import { computeOpeningContentHash } from "@/lib/lmnp/services/fiscal-year-opening/content-hash";
import { available, unavailable } from "@/lib/lmnp/services/fiscal-year-opening/opening-fact";
import type { FiscalYearOpening, OpeningAsset } from "@/lib/lmnp/services/fiscal-year-opening";
import { prepareFiscalYearTransitionCandidate } from "@/lib/lmnp/services/fiscal-year-transition/prepare-transition";
import type { PersistedWorkspace } from "@/lib/lmnp/store/persistence";
import type { DeclarationDraft, FiscalYear } from "@/lib/lmnp/types";
import type { ComposantNouveau } from "@/runtime/capabilities/f012/types";

const FY = 2025;
const NOW = "2026-01-15T00:00:00.000Z";
const PROP = "prop-1";
const DOSSIER = "dossier-p0-2c";

function asset(id: string, brut: number, cumul: number, startDate: string, years: number): OpeningAsset {
  return {
    id,
    propertyId: PROP,
    label: `Actif ${id}`,
    categorie: "composant",
    origin: "historique",
    coutBrut: available(brut),
    cumulOuverture: available(cumul),
    plan: available({
      kind: "amortizable",
      startDate,
      durationYears: years,
      prorataConvention: "annuel_plein",
    }),
  };
}

function opening(assets: OpeningAsset[]): FiscalYearOpening {
  const o: FiscalYearOpening = {
    openingId: "opening-p0-2c",
    revision: 1,
    targetFiscalYear: FY,
    dossierId: DOSSIER,
    source: { kind: "external_takeover", takeoverId: "tk-p0-2c", sourceFiscalYear: FY - 1 },
    stocks: { deficits: available([]), amortissementsReportes: available(0) },
    assets: available(assets),
    loans: unavailable("hors scope"),
    patrimoine: {
      ouvertureCompteExploitant: unavailable("hors scope"),
      ran: unavailable("hors scope"),
      tresorerieOuverture: unavailable("hors scope"),
    },
    properties: available([{ propertyId: PROP, label: "Bien P0-2C" }]),
    identity: unavailable("hors scope"),
    provenance: {
      source: { fieldPath: "source", sourceKind: "external", sourceRef: "tk-p0-2c" },
      "stocks.deficits": { fieldPath: "stocks.deficits", sourceKind: "external" },
      "stocks.amortissementsReportes": { fieldPath: "stocks.amortissementsReportes", sourceKind: "external" },
    },
    validation: { status: "pending" },
  };
  o.validation = {
    status: "validated",
    openingRevision: o.revision,
    contentHash: computeOpeningContentHash(o),
    validatedAt: NOW,
    validator: "p0-2c-test",
  };
  return o;
}

const ACQ_C: ComposantNouveau = {
  id: "asset-c",
  label: "Acquisition C",
  montant: 12_000,
  dureeAnnees: 12,
  dotationAnnuelle: 1_000,
  nature: "amélioration",
  dateDebut: `${FY}-01-01`,
  origin: "f012_travaux",
};

/** F-010 volontairement divergent : 200 000 € dont terrain 40 000 et mobilier 5 000. */
function divergentDraft(): DeclarationDraft {
  return {
    completedSteps: [],
    inpiConfirmedAt: NOW,
    logementConfirmedAt: NOW,
    logementAmortissement: {
      computedAt: NOW,
      prixRevient: 200_000,
      valeurTerrain: 40_000,
      valeurBati: 160_000,
      baseAmortissableBati: 160_000,
      montantMobilier: 5_000,
      dotationAnnuelle: 7_000,
      dureeMoyenneAnnees: 30,
      plan: {
        lignes: [
          {
            label: "Logement F-010 divergent",
            montant: 200_000,
            dureeAnnees: 30,
            dotationExercice: 7_000,
            amortissementsCumules: 7_000,
            vnc: 193_000,
            id: "f010-0",
          },
        ],
        totalAnnuelExercice: 7_000,
        totalBrut: 200_000,
      },
    } as DeclarationDraft["logementAmortissement"],
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
    dateMiseEnService: "1999-09-09",
    declaration: { currentVersionId: "ver-p0-2c", versions: [] },
    revenusAssistant: { exerciceFiscal: FY, totalRecettes: 18_000 },
    chargesAssistant: {
      exerciceFiscal: FY,
      totalDeductible: 4_000,
      totalPreExploitation: 0,
      composantsNouveaux: [ACQ_C],
    },
    amortissementAssistant: { exerciceFiscal: FY, totalDotations: 9_999, status: "validated" },
  } as DeclarationDraft;
}

function fiscalYear(op?: FiscalYearOpening): FiscalYear {
  return {
    id: "fy-p0-2c",
    year: FY,
    status: "ready_to_close",
    regime: "reel",
    propertyIds: [PROP],
    dossierId: DOSSIER,
    declarationGeneratedAt: NOW,
    closures: [],
    createdAt: "2025-01-01T00:00:00.000Z",
    updatedAt: NOW,
    ...(op
      ? {
          priorHistoryDeclaration: { status: "EXTERNAL_HISTORY", declaredAt: NOW },
          externalTakeoverOpening: { sourceRef: "tk-p0-2c", opening: op },
        }
      : {}),
  } as FiscalYear;
}

const PROPERTY = { id: PROP, label: "Bien", address: "1 rue X", city: "Lyon", postalCode: "69000" };

function takeoverWorkspace(extraAssets: OpeningAsset[] = []): { ws: PersistedWorkspace; op: FiscalYearOpening } {
  const op = opening([asset("asset-a", 100_000, 20_000, "2010-01-01", 20), asset("asset-b", 10_000, 4_000, "2023-01-01", 5), ...extraAssets]);
  const draft = divergentDraft();
  const gen = runDeclarationGeneration(
    draft,
    FY,
    undefined,
    undefined,
    undefined,
    { propertyId: PROP, composantsF012Merged: [ACQ_C] },
    op,
  );
  assert.equal(gen.status, "generated", JSON.stringify(gen));
  if (gen.status !== "generated") throw new Error("unreachable");
  return {
    op,
    ws: {
      fiscalYear: fiscalYear(op),
      properties: [{ ...PROPERTY }],
      documents: [],
      extractions: [],
      validationItems: [],
      ledgerEntries: [],
      declarationDraft: {
        ...draft,
        fiscalResult: gen.fiscalResult,
        rfs: gen.rfs,
        liasseResult: gen.liasseResult,
        liasseRfs: gen.liasseRfs,
      } as DeclarationDraft,
      aiActivityFeed: [],
    },
  };
}

describe("P0-2C — takeover closing → amortissementBase → N+1", () => {
  it("ORACLE A/B — F-010 divergent non persisté ; base = F-012 N cohérent avec le snapshot RFS", () => {
    const { ws } = takeoverWorkspace();
    const prepared = prepareFiscalYearTransitionCandidate({
      workspace: ws,
      dossierId: DOSSIER,
      now: NOW,
      nextFiscalYearId: "fy-next",
    });
    assert.equal(prepared.ok, true, JSON.stringify(prepared));
    if (!prepared.ok) return;

    const base = prepared.nextWorkspace.properties[0]?.amortissementBase;
    assert.ok(base, "les acquisitions F-012 de N doivent être reportées");
    // Aucune trace du draft F-010 divergent.
    const dump = JSON.stringify(base);
    assert.equal(dump.includes("F-010 divergent"), false);
    assert.equal(dump.includes("200000"), false);
    assert.equal(base.valeurTerrain, undefined);
    assert.equal(base.montantMobilier, undefined);
    assert.equal(base.dateMiseEnService, undefined);
    assert.deepEqual(base.composants.map((c) => c.id), ["asset-c"]);

    // B — cohérence avec la source canonique (snapshot de clôture issu de la RFS/Opening).
    const snap = prepared.closedFiscalYear.closures.at(-1)?.immobilisationsComptables;
    assert.ok(snap);
    assert.equal(snap.brutCloture, 122_000);
    assert.deepEqual(snap.actifs.map((a) => a.id).sort(), ["asset-a", "asset-b", "asset-c", "terrain"]);
    // Terrain = Opening (aucun), jamais les 40 000 € du draft F-010.
    assert.equal(snap.actifs.find((a) => a.id === "terrain")?.coutBrut, 0);
    const snapC = snap.actifs.find((a) => a.id === "asset-c")!;
    const baseC = base.composants[0];
    assert.equal(baseC.montant, snapC.coutBrut);
    assert.equal(baseC.dureeAnnees, snapC.dureeAnnees);
    assert.equal(baseC.dateDebut, snapC.dateDebut);
  });

  it("ORACLE C — N+1 : l'ouverture interne reprend le snapshot A+B+C, jamais le F-010", () => {
    const { ws } = takeoverWorkspace();
    const prepared = prepareFiscalYearTransitionCandidate({
      workspace: ws,
      dossierId: DOSSIER,
      now: NOW,
      nextFiscalYearId: "fy-next",
    });
    assert.equal(prepared.ok, true);
    if (!prepared.ok) return;

    // Le workspace N+1 ne porte que le F-012 de N (ID stable, jamais recréé).
    assert.deepEqual(
      mergeComposantsF012(undefined, prepared.nextWorkspace.properties[0]?.amortissementBase).map((c) => c.id),
      ["asset-c"],
    );

    const adapted = adaptInternalOpening({
      targetFiscalYear: FY + 1,
      openingId: "op-n1",
      revision: 1,
      closedFiscalYear: prepared.closedFiscalYear,
      archivedWorkspace: { ...ws, fiscalYear: prepared.closedFiscalYear, properties: prepared.nextWorkspace.properties },
    });
    const dump = JSON.stringify(adapted);
    assert.equal(dump.includes("F-010 divergent"), false);
    assert.equal(dump.includes("200000"), false);
    assert.equal(dump.includes("asset-a"), true);
    assert.equal(dump.includes("asset-c"), true);
  });

  it("ATTACK 5 — Opening non validée : parcours natif (F-010 conservé)", () => {
    const { ws, op } = takeoverWorkspace();
    const pending: FiscalYearOpening = { ...op, validation: { status: "pending" } } as FiscalYearOpening;
    const { properties } = extractDossierLevelDataFromWorkspace({
      ...ws,
      fiscalYear: fiscalYear(pending),
    });
    assert.equal(properties[0].amortissementBase?.valeurTerrain, 40_000);
  });

  it("ORACLE D — sans EXTERNAL_HISTORY : base F-010 inchangée (lignes, terrain, mobilier, MES)", () => {
    const { ws } = takeoverWorkspace();
    const { properties } = extractDossierLevelDataFromWorkspace({ ...ws, fiscalYear: fiscalYear() });
    const base = properties[0].amortissementBase;
    assert.ok(base);
    assert.equal(base.valeurTerrain, 40_000);
    assert.equal(base.montantMobilier, 5_000);
    assert.equal(base.dateMiseEnService, "1999-09-09");
    assert.deepEqual(base.composants.map((c) => c.label), ["Logement F-010 divergent", "Acquisition C"]);
  });

  it("ATTACK 4 — Opening d'un autre exercice : ignorée (parcours natif)", () => {
    const { ws, op } = takeoverWorkspace();
    const other = { ...op, targetFiscalYear: FY + 1 } as FiscalYearOpening;
    const { properties } = extractDossierLevelDataFromWorkspace({ ...ws, fiscalYear: fiscalYear(other) });
    assert.equal(properties[0].amortissementBase?.valeurTerrain, 40_000);
  });

  it("base existante reportée + takeover : conservée, jamais écrasée par le draft", () => {
    const { ws } = takeoverWorkspace();
    const existing = {
      composants: [{ label: "Reporté", montant: 1_000, dureeAnnees: 10 }],
      valeurTerrain: 7_000,
      dateMiseEnService: "2012-02-02",
    };
    const { properties } = extractDossierLevelDataFromWorkspace({
      ...ws,
      properties: [{ ...PROPERTY, amortissementBase: existing }],
    });
    const base = properties[0].amortissementBase!;
    assert.equal(base.valeurTerrain, 7_000);
    assert.equal(base.dateMiseEnService, "2012-02-02");
    assert.deepEqual(base.composants.map((c) => c.label), ["Reporté", "Acquisition C"]);
  });
});

describe("P0-2E — production N → clôture → N+1", () => {
  function nextDraft(
    ws: PersistedWorkspace,
    next: PersistedWorkspace,
    options?: { logementAmortissement?: DeclarationDraft["logementAmortissement"]; newAcquisitions?: ComposantNouveau[]; dateMiseEnService?: string },
  ): DeclarationDraft {
    return {
      ...ws.declarationDraft,
      ...next.declarationDraft,
      logementAmortissement: options?.logementAmortissement ?? divergentDraft().logementAmortissement,
      dateMiseEnService: options?.dateMiseEnService ?? ws.declarationDraft?.dateMiseEnService,
      revenusAssistant: { ...ws.declarationDraft?.revenusAssistant, exerciceFiscal: FY + 1 },
      chargesAssistant: { ...ws.declarationDraft?.chargesAssistant, exerciceFiscal: FY + 1, composantsNouveaux: options?.newAcquisitions ?? [] },
      amortissementAssistant: { exerciceFiscal: FY + 1, totalDotations: 7_000, status: "validated" },
    } as DeclarationDraft;
  }

  function generationN1(ws: PersistedWorkspace, next: PersistedWorkspace, draft: DeclarationDraft) {
    const continuity = resolveImmobilisationsContinuityForGeneration({
      draft,
      properties: next.properties,
      propertyIds: next.fiscalYear.propertyIds,
      immobilisationsOuverture: next.fiscalYear.immobilisationsOuverture,
      repriseHistoriqueEnContinuite: next.fiscalYear.repriseHistoriqueEnContinuite,
    });
    return runDeclarationGeneration(
      draft,
      FY + 1,
      next.fiscalYear.stocksOuverture?.stocks,
      undefined,
      undefined,
      continuity,
    );
  }

  it("reprend A+B+C depuis la clôture malgré F-010 N+1 divergent", () => {
    const { ws } = takeoverWorkspace();
    const prepared = prepareFiscalYearTransitionCandidate({
      workspace: ws,
      dossierId: DOSSIER,
      now: NOW,
      nextFiscalYearId: "fy-p0-2e-next",
    });
    assert.equal(prepared.ok, true, JSON.stringify(prepared));
    if (!prepared.ok) return;

    const next = prepared.nextWorkspace;
    const draft = nextDraft(ws, next);
    const gate = resolveDeclarationGenerationGate({
      draft,
      properties: next.properties,
      fiscalYear: FY + 1,
      paid: false,
      generated: false,
      stocksOuverture: next.fiscalYear.stocksOuverture?.stocks,
      priorHistory: resolvePriorHistoryEligibility(next.fiscalYear),
      continuity: resolveImmobilisationsContinuityForGeneration({
        draft,
        properties: next.properties,
        propertyIds: next.fiscalYear.propertyIds,
        immobilisationsOuverture: next.fiscalYear.immobilisationsOuverture,
        repriseHistoriqueEnContinuite: next.fiscalYear.repriseHistoriqueEnContinuite,
      }),
    });
    assert.equal(gate.canGenerate, true, JSON.stringify(gate.snapshot.missing));
    const result = generationN1(ws, next, draft);
    assert.equal(result.status, "generated", result.status === "blocked" ? JSON.stringify(result.anomalies) : undefined);
    if (result.status !== "generated") return;
    const immo = result.rfs.immobilisations;
    assert.ok(immo);
    assert.equal(next.fiscalYear.repriseHistoriqueEnContinuite, true);
    assert.equal(next.fiscalYear.immobilisationsOuverture?.brut, 122_000);
    assert.equal(next.fiscalYear.immobilisationsOuverture?.amortissementsCumules, 32_000);
    assert.deepEqual(immo.lignes.map((l) => l.id), ["asset-a", "asset-b"]);
    assert.deepEqual(immo.composantsDetail?.map((l) => l.id), ["asset-c"]);
    assert.equal(immo.composantsDetail?.[0]?.provenance, "historique");
    assert.equal(immo.composantsDetail?.[0]?.origin, "f012_travaux");
    assert.equal(immo.mouvements?.sourceClosureId, prepared.closedFiscalYear.closures.at(-1)?.id);
    assert.match(result.rfs.trace.sources.immobilisations ?? "", /Clôture comptable/);
    assert.match(result.rfs.trace.sources.immobilisations ?? "", new RegExp(prepared.closedFiscalYear.closures.at(-1)!.id));
    assert.equal(result.rfs.fiscalResult.amortCalcule, 8_000);
    const caseC = (id: string) => result.liasseRfs.form2033C.cases.find((c) => c.caseId === id)?.value;
    const caseA = (id: string) => result.liasseRfs.form2033A.cases.find((c) => c.caseId === id)?.value;
    assert.equal(caseC("490"), 122_000);
    assert.equal(caseC("570"), 32_000);
    assert.equal(caseC("492"), 0);
    assert.equal(caseC("496"), 122_000);
    assert.equal(caseC("576"), 40_000);
    assert.equal(caseA("028"), 122_000);
    assert.equal(caseA("030"), 40_000);
  });

  it("attaque 1/5 — totaux F-010 identiques mais lignes et dates divergentes", () => {
    const { ws } = takeoverWorkspace();
    const prepared = prepareFiscalYearTransitionCandidate({ workspace: ws, dossierId: DOSSIER, now: NOW });
    assert.equal(prepared.ok, true);
    if (!prepared.ok) return;
    const fake = structuredClone(divergentDraft().logementAmortissement)!;
    fake.plan = {
      lignes: [{ label: "Substitut F-010", id: "f010-0", montant: 122_000, dureeAnnees: 30, dotationExercice: 7_000, amortissementsCumules: 32_000, vnc: 90_000 }],
      totalBrut: 122_000,
      totalAnnuelExercice: 7_000,
    };
    fake.prixRevient = 122_000;
    fake.valeurTerrain = 0;
    fake.montantMobilier = 55_000;
    const draft = nextDraft(ws, prepared.nextWorkspace, { logementAmortissement: fake, dateMiseEnService: "2026-12-31" });
    draft.logementAssistantState = {
      ...draft.logementAssistantState,
      prixAcquisition: 500_000,
      ratioTerrain: 0.45,
      montantMobilier: 55_000,
    };
    const result = generationN1(ws, prepared.nextWorkspace, draft);
    assert.equal(result.status, "generated", result.status === "blocked" ? JSON.stringify(result.anomalies) : undefined);
    if (result.status !== "generated") return;
    assert.deepEqual(result.rfs.immobilisations?.lignes.map((l) => l.id), ["asset-a", "asset-b"]);
    assert.equal(result.rfs.immobilisations?.lignes.some((l) => l.label === "Substitut F-010"), false);
    assert.equal(result.rfs.immobilisations?.montantMobilier, undefined);
    assert.equal(result.rfs.immobilisations?.valeurTerrain, 0);
    assert.equal(result.rfs.fiscalResult.amortCalcule, 8_000);
  });

  it("attaque 2 — terrain distinct conservé et non amorti", () => {
    const land: OpeningAsset = {
      id: "land-1", propertyId: PROP, label: "Terrain historique", categorie: "terrain", origin: "historique",
      coutBrut: available(8_000), cumulOuverture: available(0), plan: available({ kind: "non_amortizable" }),
    };
    const { ws } = takeoverWorkspace([land]);
    const prepared = prepareFiscalYearTransitionCandidate({ workspace: ws, dossierId: DOSSIER, now: NOW });
    assert.equal(prepared.ok, true, JSON.stringify(prepared));
    if (!prepared.ok) return;
    const result = generationN1(ws, prepared.nextWorkspace, nextDraft(ws, prepared.nextWorkspace));
    assert.equal(result.status, "generated", result.status === "blocked" ? JSON.stringify(result.anomalies) : undefined);
    if (result.status !== "generated") return;
    assert.equal(result.rfs.immobilisations?.valeurTerrain, 8_000);
    assert.equal(result.rfs.immobilisations?.lignes.some((l) => l.id === "land-1"), false);
    assert.equal(result.liasseRfs.form2033C.cases.find((c) => c.caseId === "490")?.value, 130_000);
  });

  it("attaques 3/4 — C devient historique ; D est acquisition N+1 une seule fois", () => {
    const { ws } = takeoverWorkspace();
    const prepared = prepareFiscalYearTransitionCandidate({ workspace: ws, dossierId: DOSSIER, now: NOW });
    assert.equal(prepared.ok, true);
    if (!prepared.ok) return;
    const D: ComposantNouveau = {
      id: "asset-d", label: "Acquisition D", montant: 6_000, dureeAnnees: 6,
      dotationAnnuelle: 1_000, nature: "amélioration", dateDebut: "2026-01-01", origin: "f012_travaux",
    };
    const result = generationN1(ws, prepared.nextWorkspace, nextDraft(ws, prepared.nextWorkspace, { newAcquisitions: [D] }));
    assert.equal(result.status, "generated", result.status === "blocked" ? JSON.stringify(result.anomalies) : undefined);
    if (result.status !== "generated") return;
    const immo = result.rfs.immobilisations!;
    assert.deepEqual(immo.composantsDetail?.map((l) => [l.id, l.provenance]), [
      ["asset-c", "historique"], ["asset-d", "acquisition_exercice"],
    ]);
    assert.equal(result.rfs.fiscalResult.amortCalcule, 9_000);
    assert.equal(result.liasseRfs.form2033C.cases.find((c) => c.caseId === "490")?.value, 122_000);
    assert.equal(result.liasseRfs.form2033C.cases.find((c) => c.caseId === "492")?.value, 6_000);
    assert.equal(result.liasseRfs.form2033C.cases.find((c) => c.caseId === "496")?.value, 128_000);
  });

  it("attaque 6 / oracle D — dossier natif sans reprise garde le plan F-010", () => {
    const draft = divergentDraft();
    const result = runDeclarationGeneration(draft, FY);
    assert.equal(result.status, "generated", result.status === "blocked" ? JSON.stringify(result.anomalies) : undefined);
    if (result.status !== "generated") return;
    assert.equal(result.rfs.immobilisations?.lignes[0]?.id, "f010-0");
    assert.equal(result.rfs.immobilisations?.valeurTerrain, 40_000);
  });

  it("oracle E — snapshot absent ou plan incomplet bloque sans repli F-010", () => {
    const { ws } = takeoverWorkspace();
    const prepared = prepareFiscalYearTransitionCandidate({ workspace: ws, dossierId: DOSSIER, now: NOW });
    assert.equal(prepared.ok, true);
    if (!prepared.ok) return;
    const next = prepared.nextWorkspace;
    const draft = nextDraft(ws, next);
    const noSnapshot: PersistedWorkspace = { ...next, fiscalYear: { ...next.fiscalYear, immobilisationsOuverture: undefined } };
    const absent = generationN1(ws, noSnapshot, draft);
    assert.equal(absent.status, "blocked");
    if (absent.status === "blocked") assert.match(absent.anomalies[0]?.message ?? "", /TAKEOVER_SNAPSHOT_UNAVAILABLE/);
    const damaged: PersistedWorkspace = structuredClone(next);
    damaged.fiscalYear.immobilisationsOuverture!.actifsReprise![0].dureeAnnees = undefined;
    const incomplete = generationN1(ws, damaged, draft);
    assert.equal(incomplete.status, "blocked");
    if (incomplete.status === "blocked") assert.match(incomplete.anomalies[0]?.message ?? "", /TAKEOVER_SNAPSHOT_INCOHERENT/);
    damaged.fiscalYear.immobilisationsOuverture!.actifsReprise![0].dureeAnnees = 20;
    damaged.fiscalYear.immobilisationsOuverture!.actifsReprise![0].dateDebut = "2010-02-31";
    const invalidDate = generationN1(ws, damaged, draft);
    assert.equal(invalidDate.status, "blocked");
    if (invalidDate.status === "blocked") assert.match(invalidDate.anomalies[0]?.message ?? "", /TAKEOVER_SNAPSHOT_INCOHERENT/);
  });

  it("attaque 7 — la clôture N+1 transmet naturellement A+B+C à N+2", () => {
    const { ws } = takeoverWorkspace();
    const first = prepareFiscalYearTransitionCandidate({ workspace: ws, dossierId: DOSSIER, now: NOW });
    assert.equal(first.ok, true);
    if (!first.ok) return;
    const draftN1 = nextDraft(ws, first.nextWorkspace);
    const genN1 = generationN1(ws, first.nextWorkspace, draftN1);
    assert.equal(genN1.status, "generated", genN1.status === "blocked" ? JSON.stringify(genN1.anomalies) : undefined);
    if (genN1.status !== "generated") return;

    const wsN1: PersistedWorkspace = {
      ...first.nextWorkspace,
      fiscalYear: {
        ...first.nextWorkspace.fiscalYear,
        status: "ready_to_close",
        declarationGeneratedAt: NOW,
      },
      declarationDraft: {
        ...draftN1,
        fiscalResult: genN1.fiscalResult,
        liasseResult: genN1.liasseResult,
        rfs: genN1.rfs,
        liasseRfs: genN1.liasseRfs,
      },
    };
    const second = prepareFiscalYearTransitionCandidate({ workspace: wsN1, dossierId: DOSSIER, now: "2027-01-15T00:00:00.000Z" });
    assert.equal(second.ok, true, JSON.stringify(second));
    if (!second.ok) return;
    assert.equal(second.nextWorkspace.fiscalYear.repriseHistoriqueEnContinuite, true);
    assert.equal(second.nextWorkspace.fiscalYear.immobilisationsOuverture?.brut, 122_000);
    assert.equal(second.nextWorkspace.fiscalYear.immobilisationsOuverture?.amortissementsCumules, 40_000);
    assert.deepEqual(
      second.nextWorkspace.fiscalYear.immobilisationsOuverture?.actifsReprise?.map((a) => a.id),
      ["asset-a", "asset-b", "terrain", "asset-c"],
    );

    const draftN2 = {
      ...wsN1.declarationDraft,
      ...second.nextWorkspace.declarationDraft,
      revenusAssistant: { ...wsN1.declarationDraft?.revenusAssistant, exerciceFiscal: FY + 2 },
      chargesAssistant: { ...wsN1.declarationDraft?.chargesAssistant, exerciceFiscal: FY + 2, composantsNouveaux: [] },
      amortissementAssistant: { exerciceFiscal: FY + 2, totalDotations: 777, status: "validated" },
      logementAmortissement: divergentDraft().logementAmortissement,
    } as DeclarationDraft;
    const continuityN2 = resolveImmobilisationsContinuityForGeneration({
      draft: draftN2,
      properties: second.nextWorkspace.properties,
      propertyIds: second.nextWorkspace.fiscalYear.propertyIds,
      immobilisationsOuverture: second.nextWorkspace.fiscalYear.immobilisationsOuverture,
      repriseHistoriqueEnContinuite: second.nextWorkspace.fiscalYear.repriseHistoriqueEnContinuite,
    });
    const genN2 = runDeclarationGeneration(
      draftN2, FY + 2, second.nextWorkspace.fiscalYear.stocksOuverture?.stocks,
      undefined, undefined, continuityN2,
    );
    assert.equal(genN2.status, "generated", genN2.status === "blocked" ? JSON.stringify(genN2.anomalies) : undefined);
    if (genN2.status !== "generated") return;
    assert.deepEqual(genN2.rfs.immobilisations?.lignes.map((l) => l.id), ["asset-a", "asset-b"]);
    assert.deepEqual(genN2.rfs.immobilisations?.composantsDetail?.map((l) => l.id), ["asset-c"]);
    assert.equal(genN2.liasseRfs.form2033C.cases.find((c) => c.caseId === "490")?.value, 122_000);
    assert.equal(genN2.liasseRfs.form2033C.cases.find((c) => c.caseId === "570")?.value, 40_000);
  });
});
