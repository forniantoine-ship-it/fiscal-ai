/**
 * P0-2E.2 — fraîcheur RFS / immobilisations avant clôture.
 *
 * Contre-exemple : une déclaration générée reste « current » alors que
 * l'inventaire d'immobilisations (Opening takeover) utilisé par une nouvelle
 * génération a changé — résultat fiscal identique (terrain non amorti), RFS
 * et 2033-C différentes. La clôture reprenait alors l'ancienne RFS.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { runDeclarationGeneration } from "@/lib/lmnp/services/declaration/run-declaration-generation";
import { resolveDeclarationOutOfDate } from "@/lib/lmnp/services/declaration/declaration-freshness";
import { canCloseFiscalYear } from "@/lib/lmnp/services/dossier/fiscal-year-cycle";
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
const DOSSIER = "dossier-p0-2e2";
const PROPERTY = { id: PROP, label: "Bien", address: "1 rue X", city: "Lyon", postalCode: "69000" };

function composant(id: string, brut: number, cumul: number, startDate: string, years: number, label = `Actif ${id}`): OpeningAsset {
  return {
    id, propertyId: PROP, label, categorie: "composant", origin: "historique",
    coutBrut: available(brut), cumulOuverture: available(cumul),
    plan: available({ kind: "amortizable", startDate, durationYears: years, prorataConvention: "annuel_plein" }),
  };
}
function land(brut: number): OpeningAsset {
  return {
    id: "land-1", propertyId: PROP, label: "Terrain", categorie: "terrain", origin: "historique",
    coutBrut: available(brut), cumulOuverture: available(0), plan: available({ kind: "non_amortizable" }),
  };
}

function opening(assets: OpeningAsset[]): FiscalYearOpening {
  const o: FiscalYearOpening = {
    openingId: "opening-p0-2e2", revision: 1, targetFiscalYear: FY, dossierId: DOSSIER,
    source: { kind: "external_takeover", takeoverId: "tk-p0-2e2", sourceFiscalYear: FY - 1 },
    stocks: { deficits: available([]), amortissementsReportes: available(0) },
    assets: available(assets),
    loans: unavailable("hors scope"),
    patrimoine: {
      ouvertureCompteExploitant: unavailable("hors scope"),
      ran: unavailable("hors scope"),
      tresorerieOuverture: unavailable("hors scope"),
    },
    properties: available([{ propertyId: PROP, label: "Bien" }]),
    identity: unavailable("hors scope"),
    provenance: {
      source: { fieldPath: "source", sourceKind: "external", sourceRef: "tk-p0-2e2" },
      "stocks.deficits": { fieldPath: "stocks.deficits", sourceKind: "external" },
      "stocks.amortissementsReportes": { fieldPath: "stocks.amortissementsReportes", sourceKind: "external" },
    },
    validation: { status: "pending" },
  };
  o.validation = {
    status: "validated", openingRevision: o.revision,
    contentHash: computeOpeningContentHash(o), validatedAt: NOW, validator: "p0-2e2-test",
  };
  return o;
}

const ACQ_D: ComposantNouveau = {
  id: "asset-d", label: "Acquisition D", montant: 6_000, dureeAnnees: 12, dotationAnnuelle: 500,
  nature: "amélioration", dateDebut: `${FY}-01-01`, origin: "f012_travaux",
};

function draft(acq: ComposantNouveau[] = [ACQ_D]): DeclarationDraft {
  return {
    completedSteps: [], inpiConfirmedAt: NOW, logementConfirmedAt: NOW,
    logementAmortissement: {
      computedAt: NOW, prixRevient: 200_000, valeurTerrain: 40_000, valeurBati: 160_000,
      baseAmortissableBati: 160_000, montantMobilier: 5_000, dotationAnnuelle: 7_000, dureeMoyenneAnnees: 30,
      plan: {
        lignes: [{ label: "F-010", montant: 200_000, dureeAnnees: 30, dotationExercice: 7_000, amortissementsCumules: 7_000, vnc: 193_000, id: "f010-0" }],
        totalAnnuelExercice: 7_000, totalBrut: 200_000,
      },
    } as DeclarationDraft["logementAmortissement"],
    creditDeclaredNoneAt: NOW, revenusConfirmedAt: NOW, chargesConfirmedAt: NOW, amortissementConfirmedAt: NOW,
    siret: "12345678901234", siren: "123456789",
    exploitantFirstName: "Marie", exploitantLastName: "Dupont", exploitantEmail: "marie.dupont@example.com",
    exploitantTelephone: "0601020304", personalAddress: "10 rue des Lilas", personalCity: "Lyon", personalPostalCode: "69001",
    dateMiseEnService: "1999-09-09",
    declaration: { currentVersionId: "ver", versions: [] },
    revenusAssistant: { exerciceFiscal: FY, totalRecettes: 18_000 },
    chargesAssistant: { exerciceFiscal: FY, totalDeductible: 4_000, totalPreExploitation: 0, composantsNouveaux: acq },
    amortissementAssistant: { exerciceFiscal: FY, totalDotations: 9_999, status: "validated" },
  } as DeclarationDraft;
}

function fiscalYear(op?: FiscalYearOpening): FiscalYear {
  return {
    id: "fy-p0-2e2", year: FY, status: "ready_to_close", regime: "reel", propertyIds: [PROP], dossierId: DOSSIER,
    declarationGeneratedAt: NOW, closures: [], createdAt: "2025-01-01T00:00:00.000Z", updatedAt: NOW,
    ...(op
      ? {
          priorHistoryDeclaration: { status: "EXTERNAL_HISTORY", declaredAt: NOW },
          externalTakeoverOpening: { sourceRef: "tk-p0-2e2", opening: op },
        }
      : {}),
  } as FiscalYear;
}

const GEN_ARGS = (d: DeclarationDraft, op: FiscalYearOpening) =>
  [d, FY, undefined, undefined, undefined, { propertyId: PROP, composantsF012Merged: d.chargesAssistant?.composantsNouveaux }, op] as const;

function generate(d: DeclarationDraft, op: FiscalYearOpening) {
  const gen = runDeclarationGeneration(...GEN_ARGS(d, op));
  assert.equal(gen.status, "generated", JSON.stringify(gen));
  if (gen.status !== "generated") throw new Error("unreachable");
  return gen;
}

function workspaceFor(d: DeclarationDraft, op: FiscalYearOpening): PersistedWorkspace {
  const gen = generate(d, op);
  return {
    fiscalYear: fiscalYear(op), properties: [{ ...PROPERTY }], documents: [], extractions: [],
    validationItems: [], ledgerEntries: [],
    declarationDraft: { ...d, fiscalResult: gen.fiscalResult, rfs: gen.rfs, liasseResult: gen.liasseResult, liasseRfs: gen.liasseRfs } as DeclarationDraft,
    aiActivityFeed: [],
  };
}

const outOfDate = (ws: PersistedWorkspace) =>
  resolveDeclarationOutOfDate({ fiscalYear: ws.fiscalYear, declarationDraft: ws.declarationDraft, properties: ws.properties });
const canClose = (ws: PersistedWorkspace) =>
  canCloseFiscalYear({ fiscalYear: ws.fiscalYear, declarationDraft: ws.declarationDraft, properties: ws.properties });
const withOpening = (ws: PersistedWorkspace, op: FiscalYearOpening): PersistedWorkspace => ({
  ...ws,
  fiscalYear: { ...ws.fiscalYear, externalTakeoverOpening: { sourceRef: "tk-p0-2e2", opening: op } } as FiscalYear,
});
const caseC = (rfs: { liasseRfs?: { form2033C: { cases: { caseId: string; value?: unknown }[] } } } | undefined, id: string) =>
  rfs?.liasseRfs?.form2033C.cases.find((c) => c.caseId === id)?.value;

const A = () => composant("asset-a", 100_000, 20_000, "2010-01-01", 20);
const B = () => composant("asset-b", 10_000, 4_000, "2023-01-01", 5);

describe("P0-2E.2 — fraîcheur des immobilisations avant clôture", () => {
  it("ORACLE A — terrain +1 000 : RFS différente, résultat fiscal identique → out-of-date, clôture bloquée, régénération puis clôture", () => {
    const d = draft();
    const ws = workspaceFor(d, opening([A(), B(), land(30_000)]));
    assert.equal(outOfDate(ws), false, "état initial current");
    assert.equal(canClose(ws).ok, true);

    const op2 = opening([A(), B(), land(31_000)]);
    const regenerated = generate(d, op2);
    // Le contre-exemple : même résultat fiscal, RFS différente.
    assert.equal(regenerated.fiscalResult.resultatFiscal, ws.declarationDraft!.fiscalResult!.resultatFiscal);
    assert.notEqual(regenerated.rfs.immobilisations?.valeurTerrain, ws.declarationDraft!.rfs!.immobilisations?.valeurTerrain);
    assert.equal(caseC(regenerated, "490"), 141_000);
    assert.equal(caseC(ws.declarationDraft as never, "490"), 140_000);

    const modified = withOpening(ws, op2);
    assert.equal(outOfDate(modified), true, "déclaration obsolète");
    assert.equal(canClose(modified).ok, false, "clôture avec l'ancienne RFS refusée");
    const transition = prepareFiscalYearTransitionCandidate({ workspace: modified, dossierId: DOSSIER, now: NOW });
    assert.equal(transition.ok, false, "la transition ne fige pas une RFS obsolète");

    // ORACLE E — régénérer puis clôturer.
    const fresh = workspaceFor(d, op2);
    const freshWs = { ...modified, declarationDraft: fresh.declarationDraft };
    assert.equal(outOfDate(freshWs), false);
    assert.equal(canClose(freshWs).ok, true);
    const closed = prepareFiscalYearTransitionCandidate({ workspace: freshWs, dossierId: DOSSIER, now: NOW });
    assert.equal(closed.ok, true, JSON.stringify(closed));
    if (closed.ok) {
      const snap = closed.closedFiscalYear.closures.at(-1)?.immobilisationsComptables;
      assert.equal(snap?.brutCloture, 147_000, "snapshot de clôture = nouvelle RFS (terrain 31 000), pas l'ancienne (146 000)");
      assert.equal(closed.nextWorkspace.fiscalYear.immobilisationsOuverture?.brut, snap?.brutCloture);
    }
  });

  it("ORACLE B — donnée historique (cumul) modifiée à dotation constante → out-of-date", () => {
    const d = draft();
    const ws = workspaceFor(d, opening([A(), B(), land(30_000)]));
    // cumul +500 sur A : dotation N inchangée (brut/durée), 2033-C 570 différent.
    const op2 = opening([composant("asset-a", 100_000, 20_500, "2010-01-01", 20), B(), land(30_000)]);
    const alt = generate(d, op2);
    assert.equal(alt.fiscalResult.resultatFiscal, ws.declarationDraft!.fiscalResult!.resultatFiscal);
    assert.notEqual(caseC(alt, "570"), caseC(ws.declarationDraft as never, "570"));
    assert.equal(outOfDate(withOpening(ws, op2)), true);
  });

  it("ORACLE C — modification F-012 (chemin normal) reste invalidante", () => {
    const d = draft();
    const ws = workspaceFor(d, opening([A(), B(), land(30_000)]));
    const d2 = draft([{ ...ACQ_D, montant: 7_200, dotationAnnuelle: 600 }]);
    const modified: PersistedWorkspace = { ...ws, declarationDraft: { ...ws.declarationDraft!, chargesAssistant: d2.chargesAssistant } as DeclarationDraft };
    assert.equal(outOfDate(modified), true);
    assert.equal(canClose(modified).ok, false);
  });

  it("ORACLE D — libellé descriptif / ordre des actifs : pas d'invalidation", () => {
    const d = draft();
    const ws = workspaceFor(d, opening([A(), B(), land(30_000)]));
    const relabeled = opening([
      land(30_000),
      composant("asset-b", 10_000, 4_000, "2023-01-01", 5, "Libellé modifié B"),
      composant("asset-a", 100_000, 20_000, "2010-01-01", 20, "Libellé modifié A"),
    ]);
    const other = withOpening(ws, relabeled);
    assert.equal(outOfDate(other), false);
    assert.equal(canClose(other).ok, true);
  });

  it("ORACLE F — dossier natif sans takeover : current, clôturable", () => {
    const d = draft([]);
    const gen = runDeclarationGeneration(d, FY, undefined, undefined, undefined, { propertyId: PROP });
    assert.equal(gen.status, "generated", JSON.stringify(gen));
    if (gen.status !== "generated") return;
    const ws: PersistedWorkspace = {
      fiscalYear: {
        ...fiscalYear(), priorHistoryDeclaration: { status: "FIRST_REAL_YEAR", declaredAt: NOW },
      } as FiscalYear,
      properties: [{ ...PROPERTY }], documents: [], extractions: [], validationItems: [], ledgerEntries: [],
      declarationDraft: { ...d, fiscalResult: gen.fiscalResult, rfs: gen.rfs, liasseResult: gen.liasseResult, liasseRfs: gen.liasseRfs } as DeclarationDraft,
      aiActivityFeed: [],
    };
    assert.equal(outOfDate(ws), false);
  });
});
