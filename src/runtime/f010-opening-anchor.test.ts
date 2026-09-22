/**
 * Lot 2A — Primitive d'ancrage historique F010.
 * Run: npx tsx --test src/runtime/f010-opening-anchor.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { assemblePlan } from "./capabilities/f010/assemble-plan";
import { computePlanDotationForYear } from "./capabilities/f010/compute-plan-dotation-for-year";
import { continuePlanLine } from "./capabilities/f010/continue-plan-line";
import type { DepreciationOpeningAnchor } from "./capabilities/f010/types";
import { round2 } from "./capabilities/f010/types";

const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url));
const F010_DIR = path.join(MODULE_DIR, "capabilities/f010");

/** Oracle Lot 2A — première annuité entière (AUTO), sans prorata journalier ambigu. */
const ORACLE = {
  base: 12_000,
  terrainSepare: 2_000,
  dateDebut: "2020-01-01",
  dureeAnnees: 12,
  premiereAnnee: 2020,
  exerciceFiscal: 2026,
  cumulOuverture: 4_500,
  dotationNormale: 1_000,
  id: "actif-hist-oracle-1",
  propertyId: "prop-1",
  label: "Bâti amortissable",
} as const;

function oracleComposant() {
  return {
    label: ORACLE.label,
    montant: ORACLE.base,
    dureeAnnees: ORACLE.dureeAnnees,
    dotationAnnuelle: ORACLE.dotationNormale,
  };
}

function oracleAnchor(
  overrides: Partial<DepreciationOpeningAnchor> & { id?: string } = {},
): DepreciationOpeningAnchor & { label: string; id: string; propertyId?: string } {
  return {
    label: ORACLE.label,
    id: overrides.id ?? ORACLE.id,
    propertyId: ORACLE.propertyId,
    exerciceFiscal: overrides.exerciceFiscal ?? ORACLE.exerciceFiscal,
    cumulComptableOuverture:
      overrides.cumulComptableOuverture ?? ORACLE.cumulOuverture,
  };
}

describe("Lot 2A — H1 oracle 4500 → 5500 / VNC 6500", () => {
  it("préserve le cumul d'ouverture 4500 ; dotation 1000 ; clôture 5500 ; VNC 6500", () => {
    const DN = computePlanDotationForYear({
      montant: ORACLE.base,
      dureeAnnees: ORACLE.dureeAnnees,
      dotationAnnuelle: ORACLE.dotationNormale,
      dotationAnnee1: ORACLE.dotationNormale, // annuel_plein
      premiereAnnee: ORACLE.premiereAnnee,
      exerciceFiscal: ORACLE.exerciceFiscal,
    });
    assert.equal(DN, 1000);

    const result = continuePlanLine({
      label: ORACLE.label,
      baseAmortissable: ORACLE.base,
      dureeAnnees: ORACLE.dureeAnnees,
      normalDotation: DN,
      openingAnchor: {
        exerciceFiscal: ORACLE.exerciceFiscal,
        cumulComptableOuverture: ORACLE.cumulOuverture,
      },
      exerciceFiscal: ORACLE.exerciceFiscal,
      id: ORACLE.id,
      propertyId: ORACLE.propertyId,
    });
    assert.equal(result.ok, true);
    if (!result.ok) return;

    assert.equal(result.ligne.amortissementsCumules - result.ligne.dotationExercice, 4500);
    assert.equal(result.ligne.dotationExercice, 1000);
    assert.equal(result.ligne.amortissementsCumules, 5500);
    assert.equal(result.ligne.vnc, 6500);
    assert.equal(result.ligne.id, ORACLE.id);
    assert.equal(result.ligne.propertyId, ORACLE.propertyId);
    // Terrain séparé hors base — non amorti ici.
    assert.equal(ORACLE.terrainSepare, 2000);
  });
});

describe("Lot 2A — H2 pas de reconstruction théorique 7000", () => {
  it("le résultat n'est PAS le cumul théorique 7000 ni un rattrapage de 1500", () => {
    const theoreticalWithoutAnchor = assemblePlan({
      composantsBati: [oracleComposant()],
      composantsMobilier: [],
      dotationsAnnee1: [{ label: ORACLE.label, dotationProratisee: 1000 }],
      premiereAnnee: ORACLE.premiereAnnee,
      exerciceFiscal: ORACLE.exerciceFiscal,
    });
    assert.equal(theoreticalWithoutAnchor.plan.lignes[0].amortissementsCumules, 7000);

    const anchored = assemblePlan({
      composantsBati: [oracleComposant()],
      composantsMobilier: [],
      dotationsAnnee1: [{ label: ORACLE.label, dotationProratisee: 1000 }],
      premiereAnnee: ORACLE.premiereAnnee,
      exerciceFiscal: ORACLE.exerciceFiscal,
      openingAnchors: [oracleAnchor()],
    });
    assert.equal(anchored.anomalies.length, 0);
    assert.equal(anchored.plan.lignes.length, 1);
    const ligne = anchored.plan.lignes[0];
    assert.equal(ligne.amortissementsCumules, 5500);
    assert.notEqual(ligne.amortissementsCumules, 7000);
    assert.notEqual(ligne.dotationExercice, 2500); // pas de rattrapage 1000+1500
    assert.equal(ligne.vnc, 6500);
  });
});

describe("Lot 2A — H3 plafond VNC (cumul 11800)", () => {
  it("dotation plafonnée à 200 ; cumul 12000 ; VNC 0", () => {
    const result = continuePlanLine({
      label: ORACLE.label,
      baseAmortissable: ORACLE.base,
      dureeAnnees: ORACLE.dureeAnnees,
      normalDotation: 1000,
      openingAnchor: {
        exerciceFiscal: 2026,
        cumulComptableOuverture: 11_800,
      },
      exerciceFiscal: 2026,
      id: ORACLE.id,
    });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.ligne.dotationExercice, 200);
    assert.equal(result.ligne.amortissementsCumules, 12_000);
    assert.equal(result.ligne.vnc, 0);
  });
});

describe("Lot 2A — H4 pleinement amorti", () => {
  it("cumul ouverture = base → dotation 0", () => {
    const result = continuePlanLine({
      label: ORACLE.label,
      baseAmortissable: ORACLE.base,
      dureeAnnees: ORACLE.dureeAnnees,
      normalDotation: 1000,
      openingAnchor: {
        exerciceFiscal: 2026,
        cumulComptableOuverture: 12_000,
      },
      exerciceFiscal: 2026,
      id: ORACLE.id,
    });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.ligne.dotationExercice, 0);
    assert.equal(result.ligne.amortissementsCumules, 12_000);
    assert.equal(result.ligne.vnc, 0);
  });
});

describe("Lot 2A — H5 cumul > base bloqué", () => {
  it("rejette explicitement sans masquer via plafonnement", () => {
    const result = continuePlanLine({
      label: ORACLE.label,
      baseAmortissable: ORACLE.base,
      dureeAnnees: ORACLE.dureeAnnees,
      normalDotation: 1000,
      openingAnchor: {
        exerciceFiscal: 2026,
        cumulComptableOuverture: 12_001,
      },
      exerciceFiscal: 2026,
      id: ORACLE.id,
    });
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.ok(result.anomalies.some((a) => a.severity === "fatal"));
    assert.ok(
      result.anomalies.some((a) =>
        /supérieur à la base amortissable/i.test(a.message),
      ),
    );
    // Pas de ligne « plafonnée » inventée.
    assert.equal("ligne" in result, false);
  });
});

describe("Lot 2A — H6 valeurs invalides", () => {
  it("cumul négatif → rejet", () => {
    const result = continuePlanLine({
      label: ORACLE.label,
      baseAmortissable: ORACLE.base,
      dureeAnnees: ORACLE.dureeAnnees,
      normalDotation: 1000,
      openingAnchor: { exerciceFiscal: 2026, cumulComptableOuverture: -1 },
      exerciceFiscal: 2026,
      id: ORACLE.id,
    });
    assert.equal(result.ok, false);
  });

  it("NaN / Infinity → rejet", () => {
    for (const bad of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      const result = continuePlanLine({
        label: ORACLE.label,
        baseAmortissable: ORACLE.base,
        dureeAnnees: ORACLE.dureeAnnees,
        normalDotation: 1000,
        openingAnchor: { exerciceFiscal: 2026, cumulComptableOuverture: bad },
        exerciceFiscal: 2026,
        id: ORACLE.id,
      });
      assert.equal(result.ok, false, `doit rejeter ${String(bad)}`);
    }
  });
});

describe("Lot 2A — H7 ancre mauvais exercice", () => {
  it("rejette si ancre.exerciceFiscal ≠ exercice calculé", () => {
    const result = continuePlanLine({
      label: ORACLE.label,
      baseAmortissable: ORACLE.base,
      dureeAnnees: ORACLE.dureeAnnees,
      normalDotation: 1000,
      openingAnchor: {
        exerciceFiscal: 2025,
        cumulComptableOuverture: 4500,
      },
      exerciceFiscal: 2026,
      id: ORACLE.id,
    });
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.ok(result.anomalies.some((a) => /incompatible/i.test(a.message)));
  });
});

describe("Lot 2A — H8 sans ancre : comportement historique inchangé", () => {
  it("fixture assemblePlan baseline strictement identique", () => {
    const baselineInput = {
      composantsBati: [
        { label: "Gros œuvre", montant: 100_000, dureeAnnees: 50, dotationAnnuelle: 2000 },
        { label: "Façade", montant: 40_000, dureeAnnees: 25, dotationAnnuelle: 1600 },
      ],
      composantsMobilier: [
        { label: "Mobilier (lot)", montant: 8_000, dureeAnnees: 8, dotationAnnuelle: 1000 },
      ],
      dotationsAnnee1: [
        { label: "Gros œuvre", dotationProratisee: 1420.5 },
        { label: "Façade", dotationProratisee: 1136.4 },
        { label: "Mobilier (lot)", dotationProratisee: 710.25 },
      ],
      premiereAnnee: 2024,
      exerciceFiscal: 2026,
    };

    const a = assemblePlan(baselineInput);
    const b = assemblePlan({ ...baselineInput }); // sans openingAnchors
    assert.deepEqual(a.plan, b.plan);
    assert.deepEqual(a.anomalies, b.anomalies);

    // Cumuls théoriques historiques (reconstruction interne du chemin sans ancre).
    const gros = a.plan.lignes.find((l) => l.label === "Gros œuvre")!;
    assert.equal(gros.dotationExercice, 2000);
    assert.equal(gros.amortissementsCumules, round2(1420.5 + 2000 * 2));
    assert.equal(gros.id, undefined);

    // Oracle sans ancre → 7000 (preuve que le chemin historique reste actif).
    const theo = assemblePlan({
      composantsBati: [oracleComposant()],
      composantsMobilier: [],
      dotationsAnnee1: [{ label: ORACLE.label, dotationProratisee: 1000 }],
      premiereAnnee: ORACLE.premiereAnnee,
      exerciceFiscal: ORACLE.exerciceFiscal,
    });
    assert.equal(theo.plan.lignes[0].amortissementsCumules, 7000);
    assert.equal(theo.plan.lignes[0].dotationExercice, 1000);
    assert.equal(theo.plan.lignes[0].vnc, 5000);
  });
});

describe("Lot 2A — H9 aucune interaction stock fiscal", () => {
  it("sources 2A ne mentionnent pas stocks.amortissementsReportes", () => {
    const files = [
      "continue-plan-line.ts",
      "compute-plan-dotation-for-year.ts",
      "assemble-plan.ts",
      "types.ts",
    ];
    for (const file of files) {
      const src = readFileSync(path.join(F010_DIR, file), "utf8");
      assert.doesNotMatch(src, /amortissementsReportes|stocks\.amort/);
    }
  });
});

describe("Lot 2A — H10 immutabilité input/ancre", () => {
  it("ne mute ni l'ancre ni l'input", () => {
    const anchor: DepreciationOpeningAnchor = {
      exerciceFiscal: 2026,
      cumulComptableOuverture: 4500,
    };
    const frozen = Object.freeze({ ...anchor });
    const input = Object.freeze({
      label: ORACLE.label,
      baseAmortissable: ORACLE.base,
      dureeAnnees: ORACLE.dureeAnnees,
      normalDotation: 1000,
      openingAnchor: frozen,
      exerciceFiscal: 2026 as number,
      id: ORACLE.id,
    });
    const before = structuredClone(anchor);
    const result = continuePlanLine(input);
    assert.equal(result.ok, true);
    assert.deepEqual(anchor, before);
    assert.equal(frozen.cumulComptableOuverture, 4500);
  });
});

describe("Lot 2A — H11 aucune ligne historique inventée", () => {
  it("une ancre produit une seule ligne d'exercice, pas un historique 2020–2025", () => {
    const anchored = assemblePlan({
      composantsBati: [oracleComposant()],
      composantsMobilier: [],
      dotationsAnnee1: [{ label: ORACLE.label, dotationProratisee: 1000 }],
      premiereAnnee: ORACLE.premiereAnnee,
      exerciceFiscal: ORACLE.exerciceFiscal,
      openingAnchors: [oracleAnchor()],
    });
    assert.equal(anchored.plan.lignes.length, 1);
    assert.equal(anchored.plan.lignes[0].amortissementsCumules, 5500);
    // Pas de lignes « année 2020 », « année 2021 », etc.
    assert.ok(anchored.plan.lignes.every((l) => !/202[0-5]/.test(l.label)));
  });
});

describe("Lot 2A — H12 primitive DN = assemblePlan historique", () => {
  it("computePlanDotationForYear = dotation historique assemblePlan (cas standards)", () => {
    const cases = [
      {
        name: "année pleine intermédiaire",
        montant: 12_000,
        dureeAnnees: 12,
        da: 1000,
        d1: 1000,
        premiereAnnee: 2020,
        exerciceFiscal: 2026,
        expected: 1000,
      },
      {
        name: "première année",
        montant: 12_000,
        dureeAnnees: 12,
        da: 1000,
        d1: 1000,
        premiereAnnee: 2020,
        exerciceFiscal: 2020,
        expected: 1000,
      },
      {
        name: "avant mise en service",
        montant: 12_000,
        dureeAnnees: 12,
        da: 1000,
        d1: 1000,
        premiereAnnee: 2020,
        exerciceFiscal: 2019,
        expected: 0,
      },
      {
        name: "prorata d1 partiel + année pleine N+1",
        montant: 100_000,
        dureeAnnees: 50,
        da: 2000,
        d1: 1420.5,
        premiereAnnee: 2024,
        exerciceFiscal: 2025,
        expected: 2000,
      },
      {
        name: "complément dernière année",
        montant: 8_000,
        dureeAnnees: 8,
        da: 1000,
        d1: 710.25,
        premiereAnnee: 2024,
        exerciceFiscal: 2032, // yearsElapsed = 8 = n → complément
        expected: round2(8000 - (710.25 + 1000 * 7)),
      },
    ] as const;

    for (const c of cases) {
      const dn = computePlanDotationForYear({
        montant: c.montant,
        dureeAnnees: c.dureeAnnees,
        dotationAnnuelle: c.da,
        dotationAnnee1: c.d1,
        premiereAnnee: c.premiereAnnee,
        exerciceFiscal: c.exerciceFiscal,
      });
      assert.equal(dn, c.expected, c.name);

      const assembled = assemblePlan({
        composantsBati: [
          {
            label: c.name,
            montant: c.montant,
            dureeAnnees: c.dureeAnnees,
            dotationAnnuelle: c.da,
          },
        ],
        composantsMobilier: [],
        dotationsAnnee1: [{ label: c.name, dotationProratisee: c.d1 }],
        premiereAnnee: c.premiereAnnee,
        exerciceFiscal: c.exerciceFiscal,
      });
      assert.equal(assembled.plan.lignes[0].dotationExercice, dn, `assemble=${c.name}`);
    }
  });
});
