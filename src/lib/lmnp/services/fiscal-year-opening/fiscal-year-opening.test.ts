/**
 * Run: npx tsx --test src/lib/lmnp/services/fiscal-year-opening/fiscal-year-opening.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  resolveOuvertureCompteExploitantNPlusUn,
  reporterRanNPlusUn,
} from "@/runtime/capabilities/bilan/resolve-ouverture-n-plus-1";
import { latestClosure } from "@/lib/lmnp/services/dossier/fiscal-year-cycle";

import { adaptInternalOpening } from "./adapt-internal-opening";
import {
  computeOpeningContentHash,
  isOpeningValidationIntact,
} from "./content-hash";
import {
  fixture1Simple,
  fixture2WithCarryforwardAndAssets,
  fixture3UnavailableFacts,
  fixture4HistoricalAsset,
  fixture5ExistingLoan,
  fixture5LoansUnknown,
  fixture6Patrimoine,
  fixtureClosedFiscalYear,
  fixtureClosure,
  fixtureExternalTakeoverShape,
} from "./fixtures";
import { available, isAvailable, isUnavailable, unavailable } from "./opening-fact";
import { validateFiscalYearOpening } from "./validate-opening";
import type { FiscalYearOpening } from "./types";

const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url));

describe("OpeningFact — absence ≠ zéro", () => {
  it("available([]) = aucun déficit confirmé ; unavailable = déficits inconnus", () => {
    const none = available([] as { millesime: number; montant: number }[]);
    const unknown = unavailable("déficits inconnus");
    assert.equal(isAvailable(none), true);
    assert.deepEqual(none.value, []);
    assert.equal(isUnavailable(unknown), true);
    assert.notDeepEqual(unknown, available([]));
  });

  it("available(0) = stock amort confirmé nul ; unavailable = stock inconnu", () => {
    assert.equal(available(0).value, 0);
    assert.equal(isUnavailable(unavailable()), true);
    assert.notEqual(unavailable().status, available(0).status);
  });

  it("aucune normalisation silencieuse UNAVAILABLE → 0 / [] / false", () => {
    const u = unavailable("x");
    assert.equal("value" in u, false);
  });

  it("adaptateur — stocks copiés sans fallback ?? [] / ?? 0 (UNKNOWN ≠ ZERO)", () => {
    const adapterSource = readFileSync(path.join(MODULE_DIR, "adapt-internal-opening.ts"), "utf8");
    assert.doesNotMatch(adapterSource, /stocks\.deficits\s*\?\?/);
    assert.doesNotMatch(adapterSource, /stocks\.amortissementsReportes\s*\?\?/);
    assert.match(adapterSource, /closure\.stocks\.deficits\.map/);
    assert.match(adapterSource, /available\(closure\.stocks\.amortissementsReportes\)/);
  });
});

describe("Lot 1 — Fixture 1 simple (parité stocks)", () => {
  it("déficits available([]) et amortissements available(0) ; patrimoine via résolveurs", () => {
    const { closed, archived, expectedStocks } = fixture1Simple();
    const result = adaptInternalOpening({
      targetFiscalYear: 2026,
      openingId: "opening-1",
      revision: 1,
      closedFiscalYear: closed,
      archivedWorkspace: archived,
    });
    assert.ok(result.opening);
    const opening = result.opening!;
    assert.deepEqual(opening.stocks.deficits, expectedStocks.deficits);
    assert.deepEqual(opening.stocks.amortissementsReportes, expectedStocks.amortissementsReportes);

    const closure = latestClosure(closed)!;
    const expectedCompte = resolveOuvertureCompteExploitantNPlusUn({
      cloture120N: closure.patrimoine!.compteExploitantAvantAffectationResultat,
      resultatComptableN: closure.patrimoine!.resultatComptableExercice,
    });
    assert.equal(isAvailable(opening.patrimoine.ouvertureCompteExploitant), true);
    if (isAvailable(opening.patrimoine.ouvertureCompteExploitant)) {
      assert.equal(opening.patrimoine.ouvertureCompteExploitant.value, expectedCompte);
      assert.equal(expectedCompte, 1500, "1000 + 500 — pas de double comptage");
    }

    const expectedRan = reporterRanNPlusUn({
      situationN: closure.patrimoine!.ranSituation,
      valeurN: closure.patrimoine!.ranValeur,
    });
    assert.equal(isAvailable(opening.patrimoine.ran), true);
    if (isAvailable(opening.patrimoine.ran)) {
      assert.equal(opening.patrimoine.ran.value.situation, expectedRan.situationNPlusUn);
    }

    assert.equal(isUnavailable(opening.patrimoine.tresorerieOuverture), true);
    assert.equal(opening.source.kind, "internal_closure");
    if (opening.source.kind === "internal_closure") {
      assert.equal(opening.source.previousFiscalYearId, closed.id);
      assert.equal(opening.source.sourceClosureId, closure.id);
    }
    assert.equal(isAvailable(opening.loans), true);
    if (isAvailable(opening.loans)) {
      assert.deepEqual(opening.loans.value, [], "loans [] confirmés ≠ unavailable");
    }
  });
});

describe("Lot 1 — Fixture 2 stocks + actifs + prêt", () => {
  it("copie les stocks sans addition ; détecte ambiguïté f010-N ; transporte le prêt", () => {
    const { closed, archived } = fixture2WithCarryforwardAndAssets();
    const result = adaptInternalOpening({
      targetFiscalYear: 2026,
      openingId: "opening-2",
      revision: 1,
      closedFiscalYear: closed,
      archivedWorkspace: archived,
    });
    assert.ok(result.opening);
    const opening = result.opening!;
    assert.equal(isAvailable(opening.stocks.deficits), true);
    if (isAvailable(opening.stocks.deficits)) {
      assert.deepEqual(opening.stocks.deficits.value, [{ millesime: 2023, montant: 2000 }]);
    }
    assert.equal(isAvailable(opening.stocks.amortissementsReportes), true);
    if (isAvailable(opening.stocks.amortissementsReportes)) {
      assert.equal(opening.stocks.amortissementsReportes.value, 4000);
    }

    assert.ok(result.issues.some((i) => i.code === "ASSET_IDENTITY_AMBIGUOUS"));
    assert.equal(isAvailable(opening.assets), true);
    if (isAvailable(opening.assets)) {
      const terrain = opening.assets.value.find((a) => a.id === "terrain");
      assert.ok(terrain);
      assert.equal(isAvailable(terrain!.plan), true);
      if (isAvailable(terrain!.plan)) {
        assert.equal(terrain!.plan.value.kind, "non_amortizable");
      }
    }

    assert.equal(isAvailable(opening.loans), true);
    if (isAvailable(opening.loans)) {
      assert.equal(opening.loans.value.length, 1);
      assert.equal(opening.loans.value[0].pretId, "pret-1");
      assert.ok(opening.provenance[`loans.pret-1`]);
    }

    const closure = latestClosure(closed)!;
    const expectedCompte = resolveOuvertureCompteExploitantNPlusUn({
      cloture120N: 10000,
      resultatComptableN: -2000,
    });
    if (isAvailable(opening.patrimoine.ouvertureCompteExploitant)) {
      assert.equal(opening.patrimoine.ouvertureCompteExploitant.value, expectedCompte);
    }
    void closure;
  });
});

describe("Lot 1 — Fixture 3 UNAVAILABLE", () => {
  it("ne transforme jamais unavailable en 0 / []", () => {
    const opening = fixture3UnavailableFacts();
    assert.equal(isUnavailable(opening.stocks.deficits), true);
    assert.equal(isUnavailable(opening.stocks.amortissementsReportes), true);
    assert.equal(isUnavailable(opening.assets), true);
    assert.equal(isUnavailable(opening.loans), true);
    const issues = validateFiscalYearOpening(opening);
    assert.equal(
      issues.some((i) => i.code === "NEGATIVE_AMOUNT" || i.code === "NON_FINITE_NUMBER"),
      false,
    );
  });
});

describe("Lot 1 — gardes adaptateur", () => {
  it("refuse année non adjacente / dossier manquant / non clos", () => {
    const { closed, archived } = fixture1Simple();
    assert.equal(
      adaptInternalOpening({
        targetFiscalYear: 2027,
        openingId: "x",
        revision: 1,
        closedFiscalYear: closed,
        archivedWorkspace: archived,
      }).opening,
      undefined,
    );

    const noDossier = fixtureClosedFiscalYear({
      dossierId: undefined,
      closures: [fixtureClosure()],
    });
    assert.equal(
      adaptInternalOpening({
        targetFiscalYear: 2026,
        openingId: "x",
        revision: 1,
        closedFiscalYear: noDossier,
        archivedWorkspace: { ...archived, fiscalYear: noDossier },
      }).opening,
      undefined,
    );

    const openYear = fixtureClosedFiscalYear({
      status: "ready_to_close",
      closures: [fixtureClosure()],
    });
    assert.equal(
      adaptInternalOpening({
        targetFiscalYear: 2026,
        openingId: "x",
        revision: 1,
        closedFiscalYear: openYear,
        archivedWorkspace: { ...archived, fiscalYear: openYear },
      }).opening,
      undefined,
    );
  });

  it("prêts absents → unavailable, jamais [] automatique", () => {
    const { closed, archived } = fixture1Simple();
    const withoutLoans = {
      ...archived,
      declarationDraft: {
        ...archived.declarationDraft!,
        financementAssistantState: undefined,
      },
    };
    const result = adaptInternalOpening({
      targetFiscalYear: 2026,
      openingId: "opening-no-loans",
      revision: 1,
      closedFiscalYear: closed,
      archivedWorkspace: withoutLoans,
    });
    assert.ok(result.opening);
    assert.equal(isUnavailable(result.opening!.loans), true);
  });
});

describe("Lot 1 — validation / hash / source externe", () => {
  it("détecte une divergence VNC attestée et un hash de validation périmé", () => {
    const { closed, archived } = fixture2WithCarryforwardAndAssets();
    const result = adaptInternalOpening({
      targetFiscalYear: 2026,
      openingId: "opening-val",
      revision: 1,
      closedFiscalYear: closed,
      archivedWorkspace: archived,
    });
    assert.ok(result.opening);
    let opening = result.opening!;
    if (isAvailable(opening.assets)) {
      const gros = opening.assets.value.find((a) => a.id === "f010-0");
      if (gros) {
        gros.vncAttestee = 1;
      }
    }
    const issues = validateFiscalYearOpening(opening);
    assert.ok(issues.some((i) => i.code === "VNC_ATTESTEE_DIVERGENCE"));

    const hash = computeOpeningContentHash(opening);
    opening = {
      ...opening,
      validation: {
        status: "validated",
        openingRevision: 1,
        contentHash: hash,
        validatedAt: "2026-01-03T00:00:00.000Z",
        validator: "test",
      },
    };
    assert.equal(isOpeningValidationIntact(opening), true);
    opening = { ...opening, revision: 2 };
    assert.equal(isOpeningValidationIntact(opening), false);
  });

  it("source externe ne porte pas previousFiscalYearId / sourceClosureId", () => {
    const source = fixtureExternalTakeoverShape();
    assert.equal(source.kind, "external_takeover");
    assert.equal("previousFiscalYearId" in source, false);
    assert.equal("sourceClosureId" in source, false);

    const opening: FiscalYearOpening = {
      ...fixture3UnavailableFacts(),
      source,
      stocks: {
        deficits: available([]),
        amortissementsReportes: available(0),
      },
    };
    const issues = validateFiscalYearOpening(opening);
    assert.equal(issues.some((i) => i.code === "EXTERNAL_SOURCE_LEAK"), false);
  });

  it("G10 — amortissementsReportes = stock, jamais un mouvement 318", () => {
    const { closed, archived } = fixture2WithCarryforwardAndAssets();
    const result = adaptInternalOpening({
      targetFiscalYear: 2026,
      openingId: "opening-g10",
      revision: 1,
      closedFiscalYear: closed,
      archivedWorkspace: archived,
    });
    assert.ok(result.opening);
    const note = result.opening!.provenance["stocks.amortissementsReportes"]?.note ?? "";
    assert.match(note, /STOCK FINAL/);
    assert.match(note, /jamais case 318/);
    if (isAvailable(result.opening!.stocks.amortissementsReportes)) {
      assert.equal(result.opening!.stocks.amortissementsReportes.value, 4000);
    }
  });
});

describe("Lot 1 — Fixture 4 actif historique", () => {
  it("conserve cumul 4500, brut, terrain non amortissable, plan — sans recalcul ni F010/F014", () => {
    const { closed, archived } = fixture4HistoricalAsset();
    const result = adaptInternalOpening({
      targetFiscalYear: 2026,
      openingId: "opening-f4",
      revision: 1,
      closedFiscalYear: closed,
      archivedWorkspace: archived,
    });
    assert.ok(result.opening);
    assert.equal(isAvailable(result.opening!.assets), true);
    if (!isAvailable(result.opening!.assets)) return;

    const amorti = result.opening!.assets.value.find((a) => a.id === "actif-hist-1");
    const terrain = result.opening!.assets.value.find((a) => a.id === "terrain");
    assert.ok(amorti);
    assert.ok(terrain);

    assert.equal(isAvailable(amorti!.coutBrut), true);
    assert.equal(isAvailable(amorti!.cumulOuverture), true);
    if (isAvailable(amorti!.coutBrut)) assert.equal(amorti!.coutBrut.value, 12000);
    if (isAvailable(amorti!.cumulOuverture)) {
      assert.equal(amorti!.cumulOuverture.value, 4500);
      assert.notEqual(amorti!.cumulOuverture.value, 7000);
      assert.notEqual(amorti!.cumulOuverture.value, 6000);
    }

    assert.equal(isAvailable(terrain!.plan), true);
    if (isAvailable(terrain!.plan)) {
      assert.equal(terrain!.plan.value.kind, "non_amortizable");
    }

    assert.equal(isAvailable(amorti!.plan), true);
    if (isAvailable(amorti!.plan) && amorti!.plan.value.kind === "amortizable") {
      assert.equal(amorti!.plan.value.startDate.slice(0, 4), "2020");
      assert.equal(amorti!.plan.value.durationYears, 12);
    }

    // VNC dérivée / attestée : 12 000 − 4 500 = 7 500
    if (isAvailable(amorti!.coutBrut) && isAvailable(amorti!.cumulOuverture)) {
      const vncDerivee = Math.round((amorti!.coutBrut.value - amorti!.cumulOuverture.value) * 100) / 100;
      assert.equal(vncDerivee, 7500);
      assert.equal(amorti!.vncAttestee, 7500);
    }

    assert.equal(
      result.issues.some((i) => i.code === "ASSET_IDENTITY_AMBIGUOUS"),
      false,
      "ID stable actif-hist-1 — pas d'ambiguïté index",
    );

    // Architecture : l'adaptateur n'importe pas F010/F014 (garde source).
    const adapterSource = readFileSync(path.join(MODULE_DIR, "adapt-internal-opening.ts"), "utf8");
    assert.doesNotMatch(adapterSource, /capabilities\/f010|capabilities\/f014|produceFiscalResult|composePlanAmortissement/);
  });
});

describe("Lot 1 — Fixture 5 prêt existant", () => {
  it("transporte pretId, propertyId, termes, assurance connue, CRD attesté", () => {
    const { closed, archived, attestedLoanControls } = fixture5ExistingLoan();
    const result = adaptInternalOpening({
      targetFiscalYear: 2026,
      openingId: "opening-f5",
      revision: 1,
      closedFiscalYear: closed,
      archivedWorkspace: archived,
      attestedLoanControls,
    });
    assert.ok(result.opening);
    assert.equal(isAvailable(result.opening!.loans), true);
    if (!isAvailable(result.opening!.loans)) return;
    assert.equal(result.opening!.loans.value.length, 1);
    const loan = result.opening!.loans.value[0];
    assert.equal(loan.pretId, "pret-hist-1");
    assert.equal(loan.propertyId, "prop-1");
    assert.equal(isAvailable(loan.terms), true);
    if (isAvailable(loan.terms)) {
      assert.equal(loan.terms.value.capitalInitial, 150000);
      assert.equal(loan.terms.value.tauxNominal, 0.029);
      assert.equal(loan.terms.value.dureeMois, 300);
      assert.equal(loan.terms.value.datePremiereMensualite, "2018-03-01");
      assert.equal(loan.terms.value.assuranceAnnuelle, 320);
    }
    assert.equal(isAvailable(loan.assuranceAnnuelle), true);
    if (isAvailable(loan.assuranceAnnuelle)) {
      assert.equal(loan.assuranceAnnuelle.value, 320);
    }
    assert.equal(isAvailable(loan.crdOuverture), true);
    if (isAvailable(loan.crdOuverture)) {
      assert.equal(loan.crdOuverture.value, 112500);
    }
    assert.equal(isUnavailable(loan.schedule), true);
  });

  it("absence de preuve de prêt → unavailable, jamais available([])", () => {
    const { closed, archived } = fixture5LoansUnknown();
    const result = adaptInternalOpening({
      targetFiscalYear: 2026,
      openingId: "opening-f5-unknown",
      revision: 1,
      closedFiscalYear: closed,
      archivedWorkspace: archived,
    });
    assert.ok(result.opening);
    assert.equal(isUnavailable(result.opening!.loans), true);
    assert.notEqual(result.opening!.loans.status, "available");
  });
});

describe("Lot 1 — Fixture 6 patrimoine", () => {
  it("ouverture = 11 200 via résolveur existant ; RAN = 700 ; pas de double affectation", () => {
    const { closed, archived } = fixture6Patrimoine();
    const expected = resolveOuvertureCompteExploitantNPlusUn({
      cloture120N: 10000,
      resultatComptableN: 1200,
    });
    assert.equal(expected, 11200);

    const result = adaptInternalOpening({
      targetFiscalYear: 2026,
      openingId: "opening-f6",
      revision: 1,
      closedFiscalYear: closed,
      archivedWorkspace: archived,
    });
    assert.ok(result.opening);
    assert.equal(isAvailable(result.opening!.patrimoine.ouvertureCompteExploitant), true);
    if (isAvailable(result.opening!.patrimoine.ouvertureCompteExploitant)) {
      assert.equal(result.opening!.patrimoine.ouvertureCompteExploitant.value, 11200);
      assert.notEqual(result.opening!.patrimoine.ouvertureCompteExploitant.value, 10000);
      assert.notEqual(result.opening!.patrimoine.ouvertureCompteExploitant.value, 12400);
    }
    assert.equal(isAvailable(result.opening!.patrimoine.ran), true);
    if (isAvailable(result.opening!.patrimoine.ran)) {
      assert.equal(result.opening!.patrimoine.ran.value.valeur, 700);
    }

    const adapterSource = readFileSync(path.join(MODULE_DIR, "adapt-internal-opening.ts"), "utf8");
    assert.match(adapterSource, /from "@\/runtime\/capabilities\/bilan\/resolve-ouverture-n-plus-1"/);
    assert.match(adapterSource, /resolveOuvertureCompteExploitantNPlusUn\(\{/);
    assert.match(adapterSource, /reporterRanNPlusUn\(\{/);
    assert.doesNotMatch(
      adapterSource,
      /compteExploitantAvantAffectationResultat\s*\+\s*/,
      "pas d'addition locale parallèle du résultat",
    );
  });
});

describe("Lot 1 — contrat sérialisation / source externe", () => {
  function roundTrip<T>(value: T): T {
    return JSON.parse(JSON.stringify(value)) as T;
  }

  it("available(0), available([]), unavailable survivent à sérialisation/désérialisation", () => {
    const zero = roundTrip(available(0));
    assert.equal(zero.status, "available");
    assert.equal(zero.value, 0);

    const empty = roundTrip(available([] as unknown[]));
    assert.equal(empty.status, "available");
    assert.deepEqual(empty.value, []);

    const unknown = roundTrip(unavailable("cumul inconnu"));
    assert.equal(unknown.status, "unavailable");
    assert.equal("value" in unknown, false);
    assert.equal(unknown.reason, "cumul inconnu");
  });

  it("cumul / actifs / prêts inconnus restent unavailable après round-trip", () => {
    const opening = roundTrip(fixture3UnavailableFacts());
    assert.equal(isUnavailable(opening.stocks.amortissementsReportes), true);
    assert.equal(isUnavailable(opening.assets), true);
    assert.equal(isUnavailable(opening.loans), true);
  });

  it("source externe ne reçoit jamais de faux sourceClosureId / previousFiscalYearId", () => {
    const source = roundTrip(fixtureExternalTakeoverShape());
    assert.equal(source.kind, "external_takeover");
    assert.equal("sourceClosureId" in source, false);
    assert.equal("previousFiscalYearId" in source, false);
    if (source.kind === "external_takeover") {
      assert.equal(source.takeoverId, "takeover-1");
      assert.equal(source.sourceFiscalYear, 2024);
    }
  });
});
