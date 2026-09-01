import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { hadDateSeparators, normalizeDateValue } from "./revenus-column-semantics";

/**
 * Cycle 17 — P5, régression introduite plus tôt dans le Cycle 17 lui-même
 * (correctif du signe négatif en tête de nombre, Cycle 15A) : exiger un seul
 * séparateur pour reconnaître une date confondait le point décimal d'un
 * montant non entier ("1000.5", forme que prend TOUT nombre décimal une fois
 * passé par String() en JavaScript) avec un vrai séparateur de date. Une vraie
 * date a TOUJOURS deux séparateurs entre trois groupes de chiffres.
 */
describe("Cycle 17 — P5 : hadDateSeparators ne confond plus un montant décimal avec une date", () => {
  it("un montant décimal (\"1000.5\") n'est jamais pris pour une date", () => {
    assert.equal(hadDateSeparators("1000.5"), false);
  });

  it("un entier négatif (\"-1200\") n'est jamais pris pour une date (Cycle 15A, non-régression)", () => {
    assert.equal(hadDateSeparators("-1200"), false);
  });

  it("une vraie date (\"05/01/2025\") est toujours reconnue", () => {
    assert.equal(hadDateSeparators("05/01/2025"), true);
  });

  it("une vraie date ISO (\"2025-01-05\") est toujours reconnue", () => {
    assert.equal(hadDateSeparators("2025-01-05"), true);
  });
});

/**
 * Cycle 17 — P5 : une cellule date native ODS relue par SheetJS peut restituer
 * une chaîne ISO 8601 complète ("2025-04-04T22:00:00.000Z") au lieu d'un
 * format reconnu — l'aller-retour d'écriture/lecture ODS ne préserve pas le
 * format personnalisé de la cellule. Avant correctif, cette chaîne traversait
 * tout le pipeline inchangée (jamais reformatée en JJ/MM/AAAA).
 */
describe("Cycle 17 — P5 : normalizeDateValue reconnaît une chaîne ISO 8601 complète (ODS)", () => {
  it("une chaîne ISO datetime est reformatée en JJ/MM/AAAA plutôt que laissée telle quelle", () => {
    const result = normalizeDateValue("2025-04-04T22:00:00.000Z");
    assert.notEqual(result, "2025-04-04T22:00:00.000Z", "ne doit jamais rester une chaîne ISO brute");
    assert.match(result ?? "", /^\d{2}\/\d{2}\/\d{4}$/, "doit être au format JJ/MM/AAAA");
  });

  it("une date JJ/MM/AAAA classique reste inchangée (non-régression)", () => {
    assert.equal(normalizeDateValue("05/01/2025"), "05/01/2025");
  });

  it("un suffixe heure (cellule datetime native, ex. LibreOffice \"dd/mm/yyyy hh:mm\") est ignoré", () => {
    assert.equal(normalizeDateValue("15/06/2025 08:30"), "15/06/2025");
  });
});

/**
 * Cycle 18 — audit adversarial : le correctif P5 (Cycle 17) relisait toute
 * chaîne ISO datetime avec les composantes LOCALES de `Date`, y compris une
 * chaîne portant un désignateur UTC explicite ("Z"). Pour une frontière
 * décembre/janvier, cela faisait dépendre le jour calendaire — et donc
 * potentiellement l'exercice fiscal — du fuseau horaire du PROCESSUS SERVEUR,
 * en violation directe de la règle métier : une date d'encaissement reste
 * attachée au jour indiqué par le document, jamais au fuseau du serveur.
 * Un vrai fichier .ods (LibreOffice, vérifié Cycle 18) n'encode JAMAIS de "Z"
 * (timestamp local nu) — mais le pipeline ne doit pas en dépendre pour rester
 * correct : ce test verrouille l'invariance au fuseau pour les DEUX formes.
 */
describe("Cycle 18 — normalizeDateValue est invariant au fuseau horaire du serveur", () => {
  const CASES: Array<[string, string]> = [
    ["2025-12-31T23:00:00Z", "31/12/2025"],
    ["2026-01-01T00:00:00Z", "01/01/2026"],
    ["2026-01-01T01:00:00Z", "01/01/2026"],
  ];

  for (const [input, expected] of CASES) {
    it(`"${input}" -> "${expected}", identique sous TZ=UTC/Europe-Paris/America-New_York`, () => {
      for (const tz of ["UTC", "Europe/Paris", "America/New_York", "Pacific/Auckland"]) {
        const previousTz = process.env.TZ;
        process.env.TZ = tz;
        try {
          assert.equal(normalizeDateValue(input), expected, `divergence sous TZ=${tz}`);
        } finally {
          process.env.TZ = previousTz;
        }
      }
    });
  }

  it("un timestamp local NU (sans \"Z\", format réel LibreOffice) reste également invariant au fuseau", () => {
    for (const tz of ["UTC", "Europe/Paris", "America/New_York", "Pacific/Auckland"]) {
      const previousTz = process.env.TZ;
      process.env.TZ = tz;
      try {
        assert.equal(normalizeDateValue("2026-01-01T00:00:21"), "01/01/2026", `divergence sous TZ=${tz}`);
      } finally {
        process.env.TZ = previousTz;
      }
    }
  });
});
