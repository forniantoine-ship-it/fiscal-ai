/**
 * Un nouvel espace fiscal démarre sur le DERNIER EXERCICE CIVIL CLOS (N-1), jamais sur
 * l'année en cours. L'exercice courant reste préparatoire mais n'est ni payable ni
 * finalisable (verrou fiscal_year_not_closed). Horloge injectée : indépendant de la date réelle.
 * Run: npx tsx --test src/lib/lmnp/store/default-workspace-year.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { createDefaultWorkspace } from "./persistence";
import { isFiscalYearClosed, lastClosedFiscalYear } from "../services/payment/fiscal-year-closure";

const SEPT_2026 = new Date("2026-09-19T10:00:00Z");

describe("createDefaultWorkspace — année par défaut = dernier exercice clos", () => {
  it("le 19/09/2026 : exercice 2025 (revenus/charges 2025, déclaré en 2026), jamais 2026", () => {
    assert.equal(createDefaultWorkspace(SEPT_2026).fiscalYear.year, 2025);
  });

  it("31/12/2026 23h59 Paris : toujours 2025 (2026 n'est pas terminé)", () => {
    assert.equal(createDefaultWorkspace(new Date("2026-12-31T22:59:59Z")).fiscalYear.year, 2025);
  });

  it("01/01/2027 00h00 Paris : 2026 devient le dernier exercice clos", () => {
    assert.equal(createDefaultWorkspace(new Date("2026-12-31T23:00:00Z")).fiscalYear.year, 2026);
  });

  it("l'exercice par défaut est toujours finalisable ; l'exercice courant ne l'est jamais", () => {
    for (const now of [SEPT_2026, new Date("2027-01-15T12:00:00Z"), new Date("2030-06-30T08:00:00Z")]) {
      const year = createDefaultWorkspace(now).fiscalYear.year;
      assert.equal(isFiscalYearClosed(year, now), true, `exercice par défaut ${year} clos au ${now.toISOString()}`);
      assert.equal(isFiscalYearClosed(year + 1, now), false, `exercice suivant ${year + 1} non clos au ${now.toISOString()}`);
      assert.equal(year, lastClosedFiscalYear(now));
    }
  });

  it("le reste de l'espace par défaut est inchangé (brouillon, régime réel, un bien)", () => {
    const ws = createDefaultWorkspace(SEPT_2026);
    assert.equal(ws.fiscalYear.status, "draft");
    assert.equal(ws.fiscalYear.regime, "reel");
    assert.equal(ws.fiscalYear.propertyIds.length, 1);
    assert.equal(ws.fiscalYear.createdAt, SEPT_2026.toISOString());
  });
});
