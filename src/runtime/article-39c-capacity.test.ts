/**
 * 39C-FIX-1 — oracles de la capacité d'amortissement article 39 C : C = max(0, L − B).
 * Run: npx tsx --test src/runtime/article-39c-capacity.test.ts
 *
 * Les montants attendus sont les assertions (SAV-030, SAV-031) : aucune valeur d'oracle n'est codée dans le moteur.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  applyArticle39cSequence,
  computeArticle39c,
  type Article39cInput,
  type Article39cQualifiedAmount,
  type Article39cResult,
} from "./capabilities/f006/article-39c-capacity";
import { qualifyArticle39cCharge } from "./capabilities/f006/qualify-article-39c";
import { applyAmortissementStocks } from "./capabilities/f006/apply-amortissement-stocks";
import type { StockDeficit } from "./capabilities/f006/types";

function amount(
  id: string,
  klass: "L" | "B" | "ACTIVITY" | "OTHER_PRODUCT" | "EXCLUDED",
  value: number,
  propertyId?: string,
): Article39cQualifiedAmount {
  return {
    id,
    ...(propertyId ? { propertyId } : {}),
    category: id,
    amount: value,
    class: klass,
    qualificationLevel: "DIRECT",
    provenance: "oracle",
    reason: `oracle ${klass}`,
  };
}

function unresolved(id: string, value: number, plausible: Array<"B" | "ACTIVITY" | "OTHER_PRODUCT" | "EXCLUDED">): Article39cQualifiedAmount {
  return {
    id,
    category: id,
    amount: value,
    class: "NEEDS_QUALIFICATION",
    plausibleClasses: plausible,
    qualificationLevel: "UNRESOLVED",
    provenance: "oracle",
    reason: "non résolu",
  };
}

function input(amounts: Article39cQualifiedAmount[], extra: Partial<Article39cInput> = {}): Article39cInput {
  return { exercice: 2026, amounts, currentDepreciation: 0, ...extra };
}

function computed(result: Article39cResult) {
  assert.ok(result.status === "COMPUTED" || result.status === "COMPUTED_UNRESOLVED_IMMATERIAL", `statut ${result.status}`);
  return result.figures!;
}

describe("39C — oracles du moteur pur", () => {
  it("39C-01 — dotation 2 500 admissible, déficit LMNP 500", () => {
    const f = computed(
      computeArticle39c(
        input([amount("loyers", "L", 10_000), amount("b", "B", 7_000), amount("compta", "ACTIVITY", 1_000)], {
          currentDepreciation: 2_500,
        }),
      ),
    );
    assert.equal(f.capacite, 3_000);
    assert.equal(f.amortDeduit, 2_500);
    assert.equal(f.ardNouvelle, 0);
    assert.equal(f.stockArdFinal, 0);
    assert.equal(f.resultatAvantAmort, 2_000);
    assert.equal(f.resultatApresAmortissements, -500);
    assert.equal(f.deficitNouveau, 500);
    assert.equal(f.resultatFiscal, 0);
  });

  it("39C-02 — dotation 1 500, résultat après +500", () => {
    const f = computed(
      computeArticle39c(
        input([amount("loyers", "L", 10_000), amount("b", "B", 7_000), amount("compta", "ACTIVITY", 1_000)], {
          currentDepreciation: 1_500,
        }),
      ),
    );
    assert.equal(f.capacite, 3_000);
    assert.equal(f.amortDeduit, 1_500);
    assert.equal(f.ardNouvelle, 0);
    assert.equal(f.resultatApresAmortissements, 500);
    assert.equal(f.resultatFiscal, 500);
    assert.equal(f.deficitNouveau, 0);
  });

  it("39C-03 — déficit global avant amortissement : l'amortissement admissible reste déductible", () => {
    const f = computed(
      computeArticle39c(
        input([amount("loyers", "L", 10_000), amount("b", "B", 7_000), amount("compta", "ACTIVITY", 4_000)], {
          currentDepreciation: 2_500,
        }),
      ),
    );
    assert.equal(f.capacite, 3_000);
    assert.equal(f.amortDeduit, 2_500);
    assert.equal(f.ardNouvelle, 0);
    assert.equal(f.resultatAvantAmort, -1_000);
    assert.equal(f.resultatApresAmortissements, -3_500);
    assert.equal(f.deficitNouveau, 3_500);
  });

  it("39C-04 — dotation courante puis ARD historique dans la capacité restante", () => {
    const f = computed(
      computeArticle39c(
        input([amount("loyers", "L", 10_000), amount("b", "B", 7_000), amount("compta", "ACTIVITY", 1_000)], {
          currentDepreciation: 1_500,
          historicalArdStock: 1_500,
        }),
      ),
    );
    assert.equal(f.capacite, 3_000);
    assert.equal(f.amortDeduit, 1_500);
    assert.equal(f.ardConsomme, 1_500);
    assert.equal(f.stockArdFinal, 0);
    assert.equal(f.resultatAvantAmort, 2_000);
    assert.equal(f.resultatApresAmortissements, -1_000);
    assert.equal(f.deficitNouveau, 1_000);
  });

  it("39C-05 — OTHER_PRODUCT augmente le résultat sans gonfler C", () => {
    const f = computed(
      computeArticle39c(
        input([amount("loyers", "L", 10_000), amount("b", "B", 7_000), amount("autre", "OTHER_PRODUCT", 2_000)], {
          currentDepreciation: 4_000,
        }),
      ),
    );
    assert.equal(f.resultatAvantAmort, 5_000);
    assert.equal(f.capacite, 3_000);
    assert.notEqual(f.capacite, 5_000);
    assert.equal(f.amortDeduit, 3_000);
    assert.equal(f.ardNouvelle, 1_000);
    assert.equal(f.stockArdFinal, 1_000);
    assert.equal(f.resultatApresAmortissements, 2_000);
  });

  it("39C-06 — multi : capacité globale, pas de plafond autonome par bien", () => {
    const f = computed(
      computeArticle39c(
        input(
          [
            amount("a-loyers", "L", 10_000, "A"),
            amount("a-b", "B", 0, "A"),
            amount("b-loyers", "L", 5_000, "B"),
            amount("b-b", "B", 8_000, "B"),
          ],
          { currentDepreciation: 4_000 },
        ),
      ),
    );
    assert.equal(f.capacite, 7_000);
    assert.equal(f.amortDeduit, 4_000);
    assert.equal(f.ardNouvelle, 0);
    // Un plafond « par bien » aurait donné 10 000 (A) + 0 (B, L − B < 0) : le total reste 4 000 admissible ici,
    // mais le bien B seul (C = 0) aurait écarté toute dotation de B. Le calcul global ne le fait pas.
    const onlyB = computed(
      computeArticle39c(input([amount("b-loyers", "L", 5_000, "B"), amount("b-b", "B", 8_000, "B")], { currentDepreciation: 4_000 })),
    );
    assert.equal(onlyB.capacite, 0);
    assert.equal(onlyB.amortDeduit, 0);
  });

  it("39C-07 — CFE matérielle : branches B / ACTIVITY divergent → NEEDS_QUALIFICATION, aucun résultat définitif", () => {
    const result = computeArticle39c(
      input([amount("loyers", "L", 10_000), amount("b", "B", 6_500), unresolved("cfe", 500, ["B", "ACTIVITY"])], {
        currentDepreciation: 3_500,
      }),
    );
    assert.equal(result.status, "NEEDS_QUALIFICATION");
    assert.equal(result.figures, undefined);
    assert.deepEqual(result.reasons, ["unresolved_material"]);
    const byAssumption = new Map(result.branches.map((b) => [b.assumptions.cfe, b.figures]));
    const cfeB = byAssumption.get("B")!;
    const cfeActivity = byAssumption.get("ACTIVITY")!;
    assert.equal(cfeB.capacite, 3_000);
    assert.equal(cfeB.amortDeduit, 3_000);
    assert.equal(cfeB.ardNouvelle, 500);
    assert.equal(cfeActivity.capacite, 3_500);
    assert.equal(cfeActivity.amortDeduit, 3_500);
    assert.equal(cfeActivity.ardNouvelle, 0);
  });

  it("39C-07B — CFE non matérielle : même D, H, ARD et résultat → calcul autorisé avec UNRESOLVED_BUT_IMMATERIAL", () => {
    const result = computeArticle39c(
      input([amount("loyers", "L", 10_000), amount("b", "B", 6_500), unresolved("cfe", 500, ["B", "ACTIVITY"])], {
        currentDepreciation: 1_000,
      }),
    );
    assert.equal(result.status, "COMPUTED_UNRESOLVED_IMMATERIAL");
    assert.deepEqual(result.warnings, ["UNRESOLVED_BUT_IMMATERIAL"]);
    assert.deepEqual(result.unresolvedIds, ["cfe"]);
    const f = result.figures!;
    assert.equal(f.amortDeduit, 1_000);
    assert.equal(f.ardConsomme, 0);
    assert.equal(f.stockArdFinal, 0);
    assert.equal(f.resultatApresAmortissements, 2_000);
    // Les capacités diffèrent selon la branche (3 000 / 3 500) : jamais présentées comme une valeur unique.
    assert.equal(f.capacite, undefined);
    assert.equal(result.capaciteMin, 3_000);
    assert.equal(result.capaciteMax, 3_500);
    // L'incertitude reste dans la trace.
    assert.equal(result.trace.find((t) => t.id === "cfe")?.class, "NEEDS_QUALIFICATION");
  });

  it("39C-08 — frais bancaires : financement démontré → B ; frais généraux démontrés → ACTIVITY ; inconnu matériel → bloqué", () => {
    const financing = qualifyArticle39cCharge({
      id: "fb-1",
      category: "frais_bancaires",
      amount: 300,
      provenance: "tableau d'amortissement du prêt du bien A",
      evidence: { demonstratedClass: "B", level: "DIRECT", reason: "Frais de dossier du prêt finançant le bien A." },
    });
    assert.equal(financing.class, "B");
    const general = qualifyArticle39cCharge({
      id: "fb-2",
      category: "frais_bancaires",
      amount: 120,
      provenance: "relevé compte",
      evidence: { demonstratedClass: "ACTIVITY", level: "INFERENCE", reason: "Tenue de compte, activité générale." },
    });
    assert.equal(general.class, "ACTIVITY");
    assert.equal(general.qualificationLevel, "INFERENCE");
    const unknown = qualifyArticle39cCharge({ id: "fb-3", category: "frais_bancaires", amount: 400, provenance: "relevé" });
    assert.equal(unknown.class, "NEEDS_QUALIFICATION");
    assert.deepEqual([...(unknown.plausibleClasses ?? [])].sort(), ["ACTIVITY", "B"]);

    const result = computeArticle39c(
      input([amount("loyers", "L", 10_000), amount("b", "B", 6_600), unknown], { currentDepreciation: 3_400 }),
    );
    assert.equal(result.status, "NEEDS_QUALIFICATION");
  });

  it("39C-09 — GLI : prime → B ; indemnité jamais ajoutée à L → OUT_OF_DOMAIN", () => {
    const prime = qualifyArticle39cCharge({ id: "gli-prime", category: "assurance_gli", amount: 200, provenance: "avis GLI" });
    assert.equal(prime.class, "B");
    const indemnite = qualifyArticle39cCharge({ id: "gli-indemnite", category: "indemnite_gli", amount: 900, provenance: "virement assureur" });
    assert.equal(indemnite.class, "OUT_OF_DOMAIN");
    assert.notEqual(indemnite.class, "L");

    const result = computeArticle39c(input([amount("loyers", "L", 10_000), prime, indemnite], { currentDepreciation: 1_000 }));
    assert.equal(result.status, "OUT_OF_DOMAIN");
    assert.equal(result.figures, undefined);
    assert.deepEqual(result.detail, ["gli-indemnite"]);
  });

  it("39C-10 — capitalisation : les 20 000 ne sont jamais soustraits de B", () => {
    const capitalised = qualifyArticle39cCharge({
      id: "travaux-capitalises",
      category: "travaux",
      amount: 20_000,
      provenance: "facture",
      deductibilite: "amortissement",
    });
    assert.equal(capitalised.class, "EXCLUDED");
    const f = computed(
      computeArticle39c(input([amount("loyers", "L", 10_000), amount("b", "B", 6_000), capitalised], { currentDepreciation: 1_000 })),
    );
    assert.equal(f.capacite, 4_000);
    assert.equal(f.amortDeduit, 1_000);
    assert.equal(f.resultatAvantAmort, 4_000);
  });
});

describe("39C — contrat, ordre et invariants", () => {
  it("la capacité n'est pas le résultat avant amortissement en général", () => {
    const f = computed(
      computeArticle39c(input([amount("l", "L", 10_000), amount("b", "B", 7_000), amount("c", "ACTIVITY", 1_000)])),
    );
    assert.notEqual(f.capacite, f.resultatAvantAmort);
  });

  it("déficits antérieurs : imputés après C, ne réduisent jamais C", () => {
    const prior: StockDeficit[] = [{ millesime: 2024, montant: 4_000 }];
    const f = computed(
      computeArticle39c(
        input([amount("l", "L", 10_000), amount("b", "B", 5_000), amount("c", "ACTIVITY", 1_000)], {
          currentDepreciation: 3_000,
          priorDeficits: prior,
        }),
      ),
    );
    assert.equal(f.capacite, 5_000);
    assert.equal(f.amortDeduit, 3_000);
    assert.equal(f.resultatApresAmortissements, 1_000);
    assert.equal(f.deficitsImputes, 1_000);
    assert.equal(f.resultatFiscal, 0);
    assert.deepEqual(f.stockDeficits, [{ millesime: 2024, montant: 3_000 }]);
    const withoutPrior = computed(
      computeArticle39c(
        input([amount("l", "L", 10_000), amount("b", "B", 5_000), amount("c", "ACTIVITY", 1_000)], { currentDepreciation: 3_000 }),
      ),
    );
    assert.equal(withoutPrior.capacite, f.capacite);
  });

  it("résultat après amortissement négatif : nouveau déficit ajouté au stock, les anciens sont conservés", () => {
    const f = computed(
      computeArticle39c(
        input([amount("l", "L", 10_000), amount("b", "B", 7_000), amount("c", "ACTIVITY", 4_000)], {
          currentDepreciation: 2_500,
          priorDeficits: [{ millesime: 2025, montant: 800 }],
        }),
      ),
    );
    assert.equal(f.deficitsImputes, 0);
    assert.deepEqual(f.stockDeficits, [
      { millesime: 2025, montant: 800 },
      { millesime: 2026, montant: 3_500 },
    ]);
  });

  it("zéro : aucun montant, aucune dotation", () => {
    const f = computed(computeArticle39c(input([])));
    assert.equal(f.capacite, 0);
    assert.equal(f.amortDeduit, 0);
    assert.equal(f.resultatApresAmortissements, 0);
    assert.equal(f.resultatFiscal, 0);
  });

  it("capacité nulle quand B > L : toute la dotation devient ARD", () => {
    const f = computed(computeArticle39c(input([amount("l", "L", 3_000), amount("b", "B", 5_000)], { currentDepreciation: 800 })));
    assert.equal(f.capacite, 0);
    assert.equal(f.amortDeduit, 0);
    assert.equal(f.ardNouvelle, 800);
    assert.equal(f.stockArdFinal, 800);
    assert.equal(f.resultatApresAmortissements, -2_000);
  });

  it("arrondis : somme en centimes entiers (1000.1 + 2000.2 = 3000.3)", () => {
    const f = computed(
      computeArticle39c(input([amount("l1", "L", 1_000.1), amount("l2", "L", 2_000.2), amount("b", "B", 0.1)], { currentDepreciation: 0.05 })),
    );
    assert.equal(f.capacite, 3_000.2);
    assert.equal(f.amortDeduit, 0.05);
  });

  it("absence de double déduction : D + H ≤ C et ARD final = historique − H + dotation − D", () => {
    const f = computed(
      computeArticle39c(
        input([amount("l", "L", 9_000), amount("b", "B", 6_000), amount("x", "EXCLUDED", 15_000)], {
          currentDepreciation: 2_000,
          historicalArdStock: 3_000,
        }),
      ),
    );
    assert.equal(f.capacite, 3_000);
    assert.equal(f.amortDeduit + f.ardConsomme, 3_000);
    assert.equal(f.stockArdFinal, 3_000 - f.ardConsomme + 2_000 - f.amortDeduit);
  });

  it("qualification inconnue immatérielle : montant nul ignoré, aucune alerte", () => {
    const result = computeArticle39c(
      input([amount("l", "L", 10_000), amount("b", "B", 5_000), unresolved("divers", 0, ["B", "ACTIVITY"])], { currentDepreciation: 100 }),
    );
    assert.equal(result.status, "COMPUTED");
    assert.deepEqual(result.warnings, []);
  });

  it("divers n'est jamais classé automatiquement ; CFE reste non résolue même avec une preuve", () => {
    const divers = qualifyArticle39cCharge({ id: "d", category: "divers", amount: 50, provenance: "x" });
    assert.equal(divers.class, "NEEDS_QUALIFICATION");
    const cfe = qualifyArticle39cCharge({
      id: "cfe",
      category: "cfe",
      amount: 500,
      provenance: "avis CFE",
      evidence: { demonstratedClass: "B", level: "DIRECT", reason: "tentative de classement" },
    });
    assert.equal(cfe.class, "NEEDS_QUALIFICATION");
    assert.equal(cfe.qualificationLevel, "UNRESOLVED");
  });

  it("copropriété sans qualification → NEEDS_QUALIFICATION (B ou hors B)", () => {
    const copro = qualifyArticle39cCharge({ id: "copro", category: "copropriete", amount: 1_200, provenance: "appel de fonds" });
    assert.equal(copro.class, "NEEDS_QUALIFICATION");
    assert.deepEqual([...(copro.plausibleClasses ?? [])].sort(), ["B", "EXCLUDED"]);
  });

  it("entrée invalide : montant négatif, identifiant dupliqué, forme non résolue incohérente", () => {
    assert.equal(computeArticle39c(input([amount("l", "L", -1)])).status, "INVALID_INPUT");
    assert.equal(computeArticle39c(input([amount("l", "L", 1), amount("l", "B", 1)])).status, "INVALID_INPUT");
    const bad = { ...unresolved("x", 10, ["B"]) };
    assert.equal(computeArticle39c(input([bad])).status, "INVALID_INPUT");
    assert.equal(computeArticle39c({ exercice: 2026, amounts: [], currentDepreciation: Number.NaN }).status, "INVALID_INPUT");
  });

  it("la trace conserve bien, catégorie, classe, montant, provenance, niveau et raison", () => {
    const result = computeArticle39c(input([amount("l", "L", 10, "A")]));
    assert.equal(result.trace[0]?.propertyId, "A");
    assert.deepEqual(Object.keys(result.trace[0]!).sort(), [
      "amount",
      "category",
      "class",
      "id",
      "propertyId",
      "provenance",
      "qualificationLevel",
      "reason",
    ]);
  });

  it("les branches non résolues sont bornées (fail-closed)", () => {
    const many = Array.from({ length: 13 }, (_, i) => unresolved(`u${i}`, 1, ["B", "ACTIVITY"]));
    const result = computeArticle39c(input(many));
    assert.equal(result.status, "NEEDS_QUALIFICATION");
    assert.deepEqual(result.reasons, ["too_many_branches"]);
  });
});

describe("39C — le proxy historique diverge du contrat (preuve que l'ancienne règle est fausse)", () => {
  it("applyAmortissementStocks(résultat avant amortissement) ≠ moteur 39 C sur 39C-01 et 39C-03", () => {
    const legacy01 = applyAmortissementStocks({ exercice: 2026, resultatAvantAmort: 2_000, amortCalcule: 2_500 });
    assert.equal(legacy01.amortDeduct, 2_000); // faux au sens 39 C : C = 3 000
    const legacy03 = applyAmortissementStocks({ exercice: 2026, resultatAvantAmort: -1_000, amortCalcule: 2_500 });
    assert.equal(legacy03.amortDeduct, 0); // faux au sens 39 C : D = 2 500
  });
});

describe("39C — le séquenceur partagé reproduit exactement le proxy historique (capacité = max(0, résultat))", () => {
  /** Copie figée de l'algorithme historique pour l'équivalence. */
  function legacy(
    exercice: number,
    result: number,
    amort: number,
    stockArd: number,
    deficits: StockDeficit[],
  ) {
    const r2 = (v: number) => Math.round((v + Number.EPSILON) * 100) / 100;
    const actifs = deficits.filter((d) => exercice - d.millesime <= 10 && d.montant > 0);
    const expires = deficits.filter((d) => exercice - d.millesime > 10);
    if (result < 0) {
      return {
        amortDeduct: 0,
        stockArd: r2(amort + stockArd),
        deficitNouveau: r2(Math.abs(result)),
        imputes: 0,
        resultatFiscal: 0,
        avantDeficits: r2(result),
        expires,
        stock: [...actifs, { millesime: exercice, montant: r2(Math.abs(result)) }].sort((a, b) => a.millesime - b.millesime),
      };
    }
    const plafond = r2(result);
    const deduct = r2(Math.min(amort, plafond));
    let reste = r2(plafond - deduct);
    const used = r2(Math.min(stockArd, reste));
    reste = r2(reste - used);
    const avant = reste;
    let imputes = 0;
    const stock: StockDeficit[] = [];
    for (const row of [...actifs].sort((a, b) => a.millesime - b.millesime)) {
      if (reste <= 0) {
        stock.push(row);
        continue;
      }
      const imp = r2(Math.min(row.montant, reste));
      imputes = r2(imputes + imp);
      reste = r2(reste - imp);
      const rel = r2(row.montant - imp);
      if (rel > 0) stock.push({ millesime: row.millesime, montant: rel });
    }
    return {
      amortDeduct: deduct,
      stockArd: r2(amort - deduct + stockArd - used),
      deficitNouveau: 0,
      imputes,
      resultatFiscal: reste,
      avantDeficits: avant,
      expires,
      stock,
    };
  }

  it("500 cas pseudo-aléatoires déterministes (montants à 2 décimales)", () => {
    let seed = 39_000_1;
    const rand = () => {
      seed = (seed * 1_103_515_245 + 12_345) & 0x7fffffff;
      return seed / 0x7fffffff;
    };
    const money = (max: number) => Math.round(rand() * max * 100) / 100;
    for (let i = 0; i < 500; i += 1) {
      const result = Math.round((rand() - 0.3) * 2_000_000) / 100;
      const amort = money(15_000);
      const ard = rand() < 0.5 ? 0 : money(8_000);
      const deficits: StockDeficit[] =
        rand() < 0.5 ? [] : [{ millesime: 2012 + Math.floor(rand() * 14), montant: money(6_000) }, { millesime: 2025, montant: money(3_000) }];
      const expected = legacy(2026, result, amort, ard, deficits);
      const actual = applyAmortissementStocks({
        exercice: 2026,
        resultatAvantAmort: result,
        amortCalcule: amort,
        stockAmortissementsReportes: ard,
        stockDeficitsAnterieurs: deficits,
      });
      assert.equal(actual.amortDeduct, expected.amortDeduct, `amortDeduct #${i}`);
      assert.equal(actual.amortReporte, expected.stockArd, `stockArd #${i}`);
      assert.equal(actual.deficitNouveau, expected.deficitNouveau, `deficitNouveau #${i}`);
      assert.equal(actual.deficitsImputes, expected.imputes, `imputes #${i}`);
      assert.equal(actual.resultatFiscal, expected.resultatFiscal, `resultatFiscal #${i}`);
      assert.equal(actual.resultatFiscalAvantDeficits, expected.avantDeficits, `avantDeficits #${i}`);
      assert.deepEqual(actual.stockDeficitsMisAJour, expected.stock, `stock #${i}`);
      assert.deepEqual(actual.deficitsExpires, expected.expires, `expires #${i}`);
    }
  });

  it("applyArticle39cSequence accepte un résultat global négatif avec dotation déduite (D + H ≤ C)", () => {
    const f = applyArticle39cSequence({
      exercice: 2026,
      capacite: 3_000,
      resultatAvantAmort: -1_000,
      currentDepreciation: 2_500,
    });
    assert.equal(f.amortDeduit, 2_500);
    assert.equal(f.resultatApresAmortissements, -3_500);
    assert.equal(f.deficitNouveau, 3_500);
  });
});
