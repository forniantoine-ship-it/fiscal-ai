import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { parseEventDate, monthKeyFromDate, monthKeyForTransaction } from "./revenue-aggregation";

/**
 * Cycle 20 — bug le plus sévère de toute la chaîne d'audit (Cycles 15A-20) :
 * `parseEventDate` passait une chaîne "YYYY-MM-DD" nue (bare ISO, produite
 * par `date.split("/").reverse().join("-")` pour TOUT date Excel/CSV/ODS, ET
 * telle quelle par GPT) directement à `new Date(string)`. Une chaîne
 * "YYYY-MM-DD" SANS heure est interprétée par le constructeur-chaîne comme
 * minuit UTC — puis relue en aval via `getFullYear()`/`getMonth()` (accesseurs
 * LOCAUX, utilisés PARTOUT pour l'attribution d'exercice). Sous un fuseau
 * serveur à décalage négatif (ex. America/New_York), "01/01/2026" devenait
 * "31/12/2025" : la totalité des revenus de janvier N+1 basculait dans
 * l'exercice N, ET s'ajoutait aux revenus du 31/12 déjà présents — double
 * comptage sur un exercice, disparition totale de l'autre. Démontré Cycle 20
 * par un appel GPT réel, puis reproduit à l'identique sur Excel (le même bug
 * n'était pas propre au chemin GPT — la fonction est partagée par tous les
 * pipelines). Corrigé en construisant la date via `new Date(year, month-1, day)`
 * (toujours interprété en heure LOCALE — aller-retour invariant au fuseau),
 * et en dédoublonnant les 2 copies locales identiques (revenue-transaction-pipeline.ts,
 * revenue-transactions.ts) qui auraient sinon divergé du correctif.
 */
const TIMEZONES = ["UTC", "Europe/Paris", "America/New_York", "Pacific/Auckland"];

function withTz<T>(tz: string, fn: () => T): T {
  const previous = process.env.TZ;
  process.env.TZ = tz;
  try {
    return fn();
  } finally {
    process.env.TZ = previous;
  }
}

describe("Cycle 20 — parseEventDate/monthKeyFromDate sont invariants au fuseau horaire du serveur", () => {
  it("un ISO nu \"2026-01-01\" reste dans l'année 2026 sous les 4 fuseaux testés", () => {
    for (const tz of TIMEZONES) {
      withTz(tz, () => {
        const parsed = parseEventDate("2026-01-01");
        assert.equal(parsed?.getFullYear(), 2026, `année sous TZ=${tz}`);
        assert.equal(parsed?.getMonth(), 0, `mois (janvier) sous TZ=${tz}`);
        assert.equal(parsed?.getDate(), 1, `jour sous TZ=${tz}`);
      });
    }
  });

  it("un ISO nu \"2025-12-31\" reste dans l'année 2025 sous les 4 fuseaux testés", () => {
    for (const tz of TIMEZONES) {
      withTz(tz, () => {
        const parsed = parseEventDate("2025-12-31");
        assert.equal(parsed?.getFullYear(), 2025, `année sous TZ=${tz}`);
        assert.equal(parsed?.getDate(), 31, `jour sous TZ=${tz}`);
      });
    }
  });

  it("un DD/MM/YYYY \"01/01/2026\" (Excel/CSV/ODS) reste dans l'année 2026 sous les 4 fuseaux testés", () => {
    for (const tz of TIMEZONES) {
      withTz(tz, () => {
        const parsed = parseEventDate("01/01/2026");
        assert.equal(parsed?.getFullYear(), 2026, `année sous TZ=${tz}`);
      });
    }
  });

  it("monthKeyFromDate : \"2026-01-01\" appartient à l'exercice 2026, jamais 2025, sous les 4 fuseaux testés", () => {
    for (const tz of TIMEZONES) {
      withTz(tz, () => {
        assert.equal(monthKeyFromDate("2026-01-01", 2026), "2026-01", `sous TZ=${tz}`);
        assert.equal(monthKeyFromDate("2026-01-01", 2025), null, `exclu de 2025 sous TZ=${tz}`);
      });
    }
  });

  it("monthKeyForTransaction : deux transactions au 31/12 et 01/01 restent chacune dans leur exercice, sous les 4 fuseaux testés", () => {
    for (const tz of TIMEZONES) {
      withTz(tz, () => {
        const dec31 = { date: "2025-12-31", monthLabel: undefined, structuredMapping: true } as any;
        const jan1 = { date: "2026-01-01", monthLabel: undefined, structuredMapping: true } as any;
        assert.equal(monthKeyForTransaction(dec31, 2025), "2025-12", `31/12 dans 2025 sous TZ=${tz}`);
        assert.equal(monthKeyForTransaction(dec31, 2026), null, `31/12 exclu de 2026 sous TZ=${tz}`);
        assert.equal(monthKeyForTransaction(jan1, 2026), "2026-01", `01/01 dans 2026 sous TZ=${tz}`);
        assert.equal(monthKeyForTransaction(jan1, 2025), null, `01/01 exclu de 2025 sous TZ=${tz}`);
      });
    }
  });
});
