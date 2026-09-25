/**
 * P0-2C — EXTERNAL_HISTORY : le closing ne réintroduit pas le draft F-010
 * dans `Property.amortissementBase` (Opening → génération → closing → N+1).
 *
 * Run: npx tsx --test src/lib/lmnp/services/fiscal-year-transition/p0-2c-takeover-closing-base.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { runDeclarationGeneration } from "@/lib/lmnp/services/declaration/run-declaration-generation";
import { adaptInternalOpening } from "@/lib/lmnp/services/fiscal-year-opening/adapt-internal-opening";
import {
  extractDossierLevelDataFromWorkspace,
  mergeComposantsF012,
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

function takeoverWorkspace(): { ws: PersistedWorkspace; op: FiscalYearOpening } {
  const op = opening([asset("asset-a", 100_000, 20_000, "2010-01-01", 20), asset("asset-b", 10_000, 4_000, "2021-01-01", 5)]);
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
