/**
 * Cycle 33 — validation/audit dédié de la projection 2033-B enrichie
 * (264/270/310/312/314) avant extension à un nouveau formulaire.
 * Run: npx tsx --test src/runtime/rfs-2033b-validation.test.ts
 *
 * Ce fichier ne modifie aucune logique de production — il vérifie
 * exhaustivement ce qui existe déjà (map-2033b.ts, Cycles 30/32).
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

import { map2033BFromRfs } from "./capabilities/rfs/projection/map-2033b";
import { assembleLiasseFromRfs } from "./capabilities/rfs/projection/assemble-liasse-from-rfs";
import { buildFiscalRepresentation } from "./capabilities/rfs/build-fiscal-representation";
import { produceFiscalResult } from "./capabilities/f006/produce-fiscal-result";
import type { FiscalResult } from "./capabilities/f006/types";
import type { IdentiteDeclarante } from "./capabilities/f007/types";
import type { FiscalRepresentation } from "./capabilities/rfs/types";

function fiscalResult(overrides: Partial<FiscalResult> = {}): FiscalResult {
  return {
    exercice: 2025,
    recettes: { total: 9000 },
    charges: {
      totalDeductible: 2000,
      chargesExploitation: 2000,
      chargesFinancement: 0,
      chargesPreExploitation: 0,
      totalNonDeductible: 0,
    },
    resultatAvantAmort: 7000,
    amortCalcule: 1500,
    amortDeduct: 1500,
    amortReporte: 0,
    amortReportesUtilises: 0,
    resultatFiscal: 5500,
    deficitNouveau: 0,
    deficitsImputes: 0,
    perteExceptionnelle: 0,
    stocks: { deficits: [], amortissementsReportes: 0, deficitsExpires: [] },
    trace: { ksArtifacts: ["TRF-0032"], computedAt: "2026-08-31T00:00:00.000Z", journal: [] },
    status: "computed",
    anomalies: [],
    ...overrides,
  };
}

const IDENTITE: IdentiteDeclarante = { siren: "104545108", siret: "10454510800011", denomination: "Elsa Bouvard" };

function rfs(fr: FiscalResult): FiscalRepresentation {
  return {
    exercice: fr.exercice,
    identite: IDENTITE,
    fiscalResult: fr,
    trace: {
      ksArtifacts: fr.trace.ksArtifacts,
      assembledAt: "2026-08-31T00:00:00.000Z",
      sourceFiscalResultAt: fr.trace.computedAt,
      sources: { identite: "IdentiteDeclarante (ENT-013)", fiscalResult: "FiscalResult (F-006)" },
    },
  };
}

function findCase(form: ReturnType<typeof map2033BFromRfs>, caseId: string) {
  return form.cases.find((c) => c.caseId === caseId);
}
function findBlocked(form: ReturnType<typeof map2033BFromRfs>, caseId: string) {
  return form.casesNonAlimentees.find((c) => c.caseId === caseId);
}

// =====================================================================
// STEP 2 — Conventions de signe
// =====================================================================
describe("Cycle 33 — STEP 2 : conventions de signe", () => {
  it("résultat comptable positif → 310 (signé positif) et 312 (même valeur) ; jamais 314", () => {
    const fr = fiscalResult({ resultatAvantAmort: 5000, amortCalcule: 1000, charges: { ...fiscalResult().charges, totalNonDeductible: 0 } });
    const form = map2033BFromRfs(rfs(fr));
    assert.equal(findCase(form, "310")?.value, 4000);
    assert.equal(findCase(form, "312")?.value, 4000);
    assert.equal(findCase(form, "314"), undefined);
  });

  it("résultat comptable négatif → 310 (signé négatif) et 314 (valeur absolue positive) ; jamais 312", () => {
    const fr = fiscalResult({ resultatAvantAmort: -5000, amortCalcule: 1000, charges: { ...fiscalResult().charges, totalNonDeductible: 0 } });
    const form = map2033BFromRfs(rfs(fr));
    assert.equal(findCase(form, "310")?.value, -6000, "310 reste signé, conforme au spécimen (13681) affiché entre parenthèses");
    assert.equal(findCase(form, "314")?.value, 6000, "314 est toujours une valeur positive (montant du déficit)");
    assert.equal(findCase(form, "312"), undefined);
  });

  it("résultat fiscal positif → 370 exclusivement, jamais 372", () => {
    const fr = fiscalResult({ resultatFiscal: 4200, deficitNouveau: 0 });
    const form = map2033BFromRfs(rfs(fr));
    assert.equal(findCase(form, "370")?.value, 4200);
    assert.equal(findCase(form, "372"), undefined);
  });

  it("résultat fiscal négatif (déficit) → 372 exclusivement, jamais 370", () => {
    const fr = fiscalResult({ resultatFiscal: 0, deficitNouveau: 4200 });
    const form = map2033BFromRfs(rfs(fr));
    assert.equal(findCase(form, "372")?.value, 4200);
    assert.equal(findCase(form, "370"), undefined);
  });

  it("312 et 314 ne sont jamais simultanément présentes, sur un échantillon de résultats variés", () => {
    const echantillon = [5000, -5000, 1, -1, 999999, -999999, 0.01, -0.01];
    for (const resultatAvantAmort of echantillon) {
      const fr = fiscalResult({ resultatAvantAmort, amortCalcule: 0, charges: { ...fiscalResult().charges, totalNonDeductible: 0 } });
      const form = map2033BFromRfs(rfs(fr));
      const has312 = Boolean(findCase(form, "312"));
      const has314 = Boolean(findCase(form, "314"));
      assert.equal(has312 && has314, false, `312 et 314 simultanées pour resultatAvantAmort=${resultatAvantAmort}`);
    }
  });

  it("370 et 372 ne sont jamais simultanément présentes, sur un échantillon de résultats variés", () => {
    const echantillon: [number, number][] = [[5000, 0], [0, 5000], [1, 0], [0, 1], [0, 0]];
    for (const [resultatFiscal, deficitNouveau] of echantillon) {
      const fr = fiscalResult({ resultatFiscal, deficitNouveau });
      const form = map2033BFromRfs(rfs(fr));
      const has370 = Boolean(findCase(form, "370"));
      const has372 = Boolean(findCase(form, "372"));
      assert.equal(has370 && has372, false, `370 et 372 simultanées pour (${resultatFiscal}, ${deficitNouveau})`);
    }
  });

  it("résultat comptable exactement 0 → ni 312 ni 314, mais 310 reste présente à 0 (convention identique à 370/372)", () => {
    const fr = fiscalResult({ resultatAvantAmort: 1500, amortCalcule: 1500, charges: { ...fiscalResult().charges, totalNonDeductible: 0 } });
    const form = map2033BFromRfs(rfs(fr));
    assert.equal(findCase(form, "310")?.value, 0);
    assert.equal(findCase(form, "312"), undefined, "convention: > 0 strict, comme 370/372 — zéro exact n'est ni bénéfice ni déficit affiché");
    assert.equal(findCase(form, "314"), undefined);
  });

  it("résultat fiscal exactement 0 (équilibre parfait) → ni 370 ni 372", () => {
    const fr = fiscalResult({ resultatFiscal: 0, deficitNouveau: 0 });
    const form = map2033BFromRfs(rfs(fr));
    assert.equal(findCase(form, "370"), undefined);
    assert.equal(findCase(form, "372"), undefined);
  });
});

// =====================================================================
// STEP 3 — Réconciliation du dossier de référence (Elsa Bouvard, FEC audité)
// =====================================================================
describe("Cycle 33 — STEP 3 : réconciliation complète du dossier de référence", () => {
  it("264 ≈ 14 180 €, 270 ≈ -9 080 €, 310 ≈ -13 681 € — les trois valeurs publiées, à l'arrondi FEC près", () => {
    const fr = fiscalResult({
      recettes: { total: 5100 },
      resultatAvantAmort: -9861.76,
      amortCalcule: 3720.19,
      charges: {
        totalDeductible: 14961.76,
        chargesExploitation: 10360.15,
        chargesFinancement: 4601.61,
        chargesPreExploitation: 0,
        totalNonDeductible: 99.4,
      },
    });
    const form = map2033BFromRfs(rfs(fr));
    const case264 = findCase(form, "264")?.value as number;
    const case270 = findCase(form, "270")?.value as number;
    const case310 = findCase(form, "310")?.value as number;

    assert.ok(Math.abs(case264 - 14180) < 1, `264 attendu ≈ 14180, obtenu ${case264}`);
    assert.ok(Math.abs(case270 - -9080) < 1, `270 attendu ≈ -9080, obtenu ${case270}`);
    assert.ok(Math.abs(case310 - -13681) < 1, `310 attendu ≈ -13681, obtenu ${case310}`);

    // Origine exacte de l'écart résiduel (< 1 €) : arrondis intermédiaires du
    // FEC réel (centimes) vs les valeurs affichées arrondies à l'euro sur le
    // spécimen — pas une erreur de formule. Documenté ici plutôt que corrigé
    // par un facteur correctif.
    assert.ok(Math.abs(case264 - 14180) < 0.5, "écart résiduel exclusivement dû à l'arrondi euro du spécimen, pas à la formule");
  });

  it("314 (déficit comptable, valeur positive) reprend exactement |310| sur le dossier de référence", () => {
    const fr = fiscalResult({
      recettes: { total: 5100 },
      resultatAvantAmort: -9861.76,
      amortCalcule: 3720.19,
      charges: {
        totalDeductible: 14961.76,
        chargesExploitation: 10360.15,
        chargesFinancement: 4601.61,
        chargesPreExploitation: 0,
        totalNonDeductible: 99.4,
      },
    });
    const form = map2033BFromRfs(rfs(fr));
    const case310 = findCase(form, "310")?.value as number;
    const case314 = findCase(form, "314")?.value as number;
    assert.equal(case314, Math.abs(case310));
  });
});

// =====================================================================
// STEP 4 — Provenance de totalNonDeductible : chemin unique, bout en bout
// =====================================================================
describe("Cycle 33 — STEP 4 : totalNonDeductible — F-012 → F-006 → RFS → mapper, chemin unique", () => {
  it("bout en bout réel : produceFiscalResult() → buildFiscalRepresentation() → map2033BFromRfs() propage totalNonDeductible sans altération", () => {
    const { result } = produceFiscalResult({
      exerciceFiscal: 2025,
      activite: { dateMiseEnService: "2025-01-01" },
      revenusAssistant: { exerciceFiscal: 2025, totalRecettes: 9000 },
      chargesAssistant: { exerciceFiscal: 2025, totalDeductible: 2000, totalPreExploitation: 0, totalNonDeductible: 250 },
      amortissementAssistant: { exerciceFiscal: 2025, totalDotations: 1500, status: "validated" },
    });
    assert.ok(result, "le calcul F-006 doit réussir");
    assert.equal(result!.charges.totalNonDeductible, 250, "F-006 transporte la valeur F-012 sans la modifier");

    const representation = buildFiscalRepresentation({ fiscalResult: result!, identite: IDENTITE });
    assert.equal(representation.fiscalResult.charges.totalNonDeductible, 250, "la RFS référence le même FiscalResult");

    const form = map2033BFromRfs(representation);
    const case264 = findCase(form, "264")?.value as number;
    // 264 = chargesExploitation(2000) + amortCalcule(1500) + totalNonDeductible(250) = 3750
    assert.equal(case264, 3750, "le chemin complet F-012 → F-006 → RFS → mapper produit la valeur attendue sans divergence");
  });

  it("changer UNIQUEMENT chargesAssistant.totalNonDeductible fait varier 264 d'exactement le même montant, rien d'autre", () => {
    const build = (totalNonDeductible: number) =>
      produceFiscalResult({
        exerciceFiscal: 2025,
        activite: { dateMiseEnService: "2025-01-01" },
        revenusAssistant: { exerciceFiscal: 2025, totalRecettes: 9000 },
        chargesAssistant: { exerciceFiscal: 2025, totalDeductible: 2000, totalPreExploitation: 0, totalNonDeductible },
        amortissementAssistant: { exerciceFiscal: 2025, totalDotations: 1500, status: "validated" },
      }).result!;

    const sansNonDeductible = build(0);
    const avecNonDeductible = build(400);

    const form264 = (fr: FiscalResult) =>
      findCase(map2033BFromRfs(buildFiscalRepresentation({ fiscalResult: fr, identite: IDENTITE })), "264")?.value as number;

    const delta = form264(avecNonDeductible) - form264(sansNonDeductible);
    assert.equal(delta, 400, "264 varie exactement du delta de totalNonDeductible");
    // Rien d'autre ne doit diverger.
    assert.equal(sansNonDeductible.resultatFiscal, avecNonDeductible.resultatFiscal, "totalNonDeductible n'affecte jamais le résultat fiscal");
  });
});

describe("Cycle 33 — STEP 4 : garde d'architecture étendue (map-2033b.ts)", () => {
  it("aucun import de F-012, F-006 (valeur), F-010/F-011/F-013/F-014, draft-to-liasse-inputs, ou lecteur FEC", () => {
    const source = readFileSync(path.join(__dirname, "capabilities/rfs/projection/map-2033b.ts"), "utf-8");
    const importLines = source
      .split("\n")
      .filter((line) => /^\s*import\b/.test(line))
      .join("\n");

    const forbidden = [
      "produceFiscalResult",
      "applyAmortissementStocks",
      "fiscalResultFromDraft",
      "draft-to-liasse-inputs",
      "FEC",
      "fec-reader",
      "fec-parser",
      "readFileSync",
      "f010-logement",
      "f011-financement",
      "f012-charges",
      "f013-revenus",
      "f014-amortissements",
      "capabilities/f010",
      "capabilities/f011",
      "capabilities/f012",
      "capabilities/f013",
      "capabilities/f014",
    ];
    for (const token of forbidden) {
      assert.equal(importLines.includes(token), false, `map-2033b.ts ne doit pas importer ${token}`);
    }
    const valueImportOfEngine = /^import\s+(?!type)\{[^}]*\}\s+from\s+["'].*\/f006\//m;
    assert.equal(valueImportOfEngine.test(importLines), false, "aucun import de valeur depuis f006 — import type uniquement");
  });
});

// =====================================================================
// STEP 5 — 264/310 documentées comme présentation, jamais comme "calcul fiscal"
// =====================================================================
describe("Cycle 33 — STEP 5 : 264/310 documentées comme présentation/réconciliation comptable", () => {
  it("les commentaires de map-2033b.ts qualifient 264/310 de projection/présentation, jamais de 'calcul fiscal'", () => {
    const source = readFileSync(path.join(__dirname, "capabilities/rfs/projection/map-2033b.ts"), "utf-8");
    assert.match(source, /présentation/i, "au moins une mention explicite de 'présentation'");
    assert.doesNotMatch(source, /calcul fiscal (nouveau|)/i, "jamais qualifié de nouveau calcul fiscal");
  });
});

// =====================================================================
// STEP 6 — Matrice de combinaisons A–K
// =====================================================================
describe("Cycle 33 — STEP 6 : matrice de combinaisons", () => {
  it("A. pas d'amortissement, pas de charge non déductible → 264 = chargesExploitation seule", () => {
    const fr = fiscalResult({
      resultatAvantAmort: 7000,
      amortCalcule: 0,
      charges: { totalDeductible: 2000, chargesExploitation: 2000, chargesFinancement: 0, chargesPreExploitation: 0, totalNonDeductible: 0 },
    });
    const form = map2033BFromRfs(rfs(fr));
    assert.equal(findCase(form, "264")?.value, 2000);
    assert.equal(findCase(form, "310")?.value, 7000);
  });

  it("B. amortissement présent, pas de charge non déductible", () => {
    const fr = fiscalResult({
      resultatAvantAmort: 7000,
      amortCalcule: 1500,
      charges: { totalDeductible: 2000, chargesExploitation: 2000, chargesFinancement: 0, chargesPreExploitation: 0, totalNonDeductible: 0 },
    });
    const form = map2033BFromRfs(rfs(fr));
    assert.equal(findCase(form, "264")?.value, 3500, "2000 + 1500 + 0");
    assert.equal(findCase(form, "310")?.value, 5500, "7000 - 1500 - 0");
  });

  it("C. pas d'amortissement, charge non déductible présente", () => {
    const fr = fiscalResult({
      resultatAvantAmort: 7000,
      amortCalcule: 0,
      charges: { totalDeductible: 2000, chargesExploitation: 2000, chargesFinancement: 0, chargesPreExploitation: 0, totalNonDeductible: 300 },
    });
    const form = map2033BFromRfs(rfs(fr));
    assert.equal(findCase(form, "264")?.value, 2300, "2000 + 0 + 300");
    assert.equal(findCase(form, "310")?.value, 6700, "7000 - 0 - 300");
  });

  it("D. amortissement et charge non déductible présents ensemble", () => {
    const fr = fiscalResult({
      resultatAvantAmort: 7000,
      amortCalcule: 1500,
      charges: { totalDeductible: 2000, chargesExploitation: 2000, chargesFinancement: 0, chargesPreExploitation: 0, totalNonDeductible: 300 },
    });
    const form = map2033BFromRfs(rfs(fr));
    assert.equal(findCase(form, "264")?.value, 3800, "2000 + 1500 + 300");
    assert.equal(findCase(form, "310")?.value, 5200, "7000 - 1500 - 300");
  });

  it("E/F/G. résultat comptable positif, négatif, puis exactement nul", () => {
    const positif = map2033BFromRfs(rfs(fiscalResult({ resultatAvantAmort: 5000, amortCalcule: 0, charges: { ...fiscalResult().charges, totalNonDeductible: 0 } })));
    assert.ok(findCase(positif, "312"));
    assert.equal(findCase(positif, "314"), undefined);

    const negatif = map2033BFromRfs(rfs(fiscalResult({ resultatAvantAmort: -5000, amortCalcule: 0, charges: { ...fiscalResult().charges, totalNonDeductible: 0 } })));
    assert.equal(findCase(negatif, "312"), undefined);
    assert.ok(findCase(negatif, "314"));

    const nul = map2033BFromRfs(rfs(fiscalResult({ resultatAvantAmort: 0, amortCalcule: 0, charges: { ...fiscalResult().charges, totalNonDeductible: 0 } })));
    assert.equal(findCase(nul, "312"), undefined);
    assert.equal(findCase(nul, "314"), undefined);
    assert.equal(findCase(nul, "310")?.value, 0);
  });

  it("H/I. résultat fiscal positif puis négatif", () => {
    const benefice = map2033BFromRfs(rfs(fiscalResult({ resultatFiscal: 3000, deficitNouveau: 0 })));
    assert.ok(findCase(benefice, "370"));
    assert.equal(findCase(benefice, "372"), undefined);

    const deficit = map2033BFromRfs(rfs(fiscalResult({ resultatFiscal: 0, deficitNouveau: 3000 })));
    assert.equal(findCase(deficit, "370"), undefined);
    assert.ok(findCase(deficit, "372"));
  });

  it("J. déficits antérieurs imputés SANS limitation d'amortissement la même année → 360 reste non alimentée (audit fiscal ciblé, IS uniquement), aucun blocage supplémentaire", () => {
    const fr = fiscalResult({
      resultatAvantAmort: 5000,
      amortCalcule: 1000,
      amortDeduct: 1000,
      amortReporte: 0, // pas de limitation cette année
      deficitsImputes: 2000, // mais un déficit antérieur a bien été imputé
      resultatFiscal: 2000,
    });
    const form = map2033BFromRfs(rfs(fr));
    assert.equal(findCase(form, "360"), undefined, "360 réservée à l'IS — jamais alimentée pour un LMNP à l'IR");
    assert.equal(findCase(form, "318")?.value, 0, "pas de limitation, rien à reporter");
    // 352/354 restent bloquées par construction (toujours, indépendamment du cas) —
    // mais ici il n'y a même pas de conflit réel : la limitation citée dans le
    // Cycle 32 ne se manifeste que si amortReporte > 0 en même temps.
    assert.equal(findCase(form, "352"), undefined);
    assert.equal(findCase(form, "354"), undefined);
  });

  it("K. déficits antérieurs imputés ET limitation d'amortissement la même année → 352/354 restent non alimentées, aucune valeur inventée", () => {
    const fr = fiscalResult({
      resultatAvantAmort: 5000,
      amortCalcule: 3000,
      amortDeduct: 1000,
      amortReporte: 2000, // limitation réelle cette année
      deficitsImputes: 4000, // ET un déficit antérieur imputé la même année — le cas à risque
      resultatFiscal: 0,
    });
    const form = map2033BFromRfs(rfs(fr));
    assert.equal(findCase(form, "352"), undefined, "aucune valeur inventée malgré la coexistence déficit+limitation");
    assert.equal(findCase(form, "354"), undefined);
    assert.ok(findBlocked(form, "352"), "352 doit rester tracée comme non alimentée");
    assert.ok(findBlocked(form, "354"), "354 doit rester tracée comme non alimentée");
    // 318 reste projetée telle quelle (pass-through), avec sa limitation déjà
    // documentée au Cycle 32 — le mapper ne la bloque pas, il transporte
    // fidèlement ce que F-006 a produit. 360 reste non alimentée (audit
    // fiscal ciblé, IS uniquement) indépendamment de la valeur de deficitsImputes.
    assert.equal(findCase(form, "318")?.value, 2000);
    assert.equal(findCase(form, "360"), undefined);
    assert.ok(findBlocked(form, "360"), "360 doit rester tracée comme non alimentée");
  });
});

// =====================================================================
// STEP 7 — Ne pas "corriger" la limitation 318 ; distinguer résultat final vs présentation
// =====================================================================
describe("Cycle 33 — STEP 7 : résultat final correct malgré une présentation intermédiaire non garantie", () => {
  it("dans le cas K, le résultat fiscal final (370/372) reste correct et cohérent, même si 352/354 sont bloquées", () => {
    const fr = fiscalResult({
      resultatAvantAmort: 5000,
      amortCalcule: 3000,
      amortDeduct: 1000,
      amortReporte: 2000,
      deficitsImputes: 4000,
      resultatFiscal: 0,
      deficitNouveau: 0,
    });
    const form = map2033BFromRfs(rfs(fr));
    // Résultat final : ni bénéfice ni déficit (0), correctement absent des deux cases —
    // ce n'est pas un "bug", c'est le résultat fiscal réel de cet exemple.
    assert.equal(findCase(form, "370"), undefined);
    assert.equal(findCase(form, "372"), undefined);
    // La présentation intermédiaire (352/354), elle, reste non garantie — les deux
    // affirmations ne doivent jamais être confondues.
    assert.equal(findCase(form, "352"), undefined);
    assert.equal(findCase(form, "354"), undefined);
  });
});

// =====================================================================
// STEP 8 — Traçabilité exhaustive
// =====================================================================
describe("Cycle 33 — STEP 8 : traçabilité de toutes les cases, alimentées et bloquées", () => {
  it("chaque case alimentée a une trace exploitable ; chaque case bloquée a une catégorie et une raison non générique", () => {
    const form = map2033BFromRfs(
      rfs(
        fiscalResult({
          recettes: { total: 5100 },
          resultatAvantAmort: -9861.76,
          amortCalcule: 3720.19,
          resultatFiscal: 0,
          deficitNouveau: 9862,
          charges: {
            totalDeductible: 14961.76,
            chargesExploitation: 10360.15,
            chargesFinancement: 4601.61,
            chargesPreExploitation: 0,
            totalNonDeductible: 99.4,
          },
        }),
      ),
    );

    for (const c of form.cases) {
      assert.ok(c.trace.source, `case ${c.caseId} sans source de trace`);
      assert.ok(c.trace.path.length > 0, `case ${c.caseId} sans path de trace`);
    }

    const genericWords = ["inconnu", "unknown", "n/a", "todo", "tbd"];
    for (const b of form.casesNonAlimentees) {
      assert.ok(b.categorie, `${b.caseId} sans catégorie`);
      assert.ok(b.raison.length > 20, `${b.caseId} : raison trop courte pour être exploitable`);
      for (const word of genericWords) {
        assert.equal(b.raison.toLowerCase().includes(word), false, `${b.caseId} : raison générique détectée ("${word}")`);
      }
    }
  });
});

// =====================================================================
// STEP 9 — Intégration avec l'assembleur
// =====================================================================
describe("Cycle 33 — STEP 9 : assembleLiasseFromRfs() reflète exactement map2033BFromRfs()", () => {
  it("sur un dossier riche (264/310/312/314/318/360 tous non triviaux), l'assembleur ne transforme rien", () => {
    const fr = fiscalResult({
      recettes: { total: 12000 },
      resultatAvantAmort: 8000,
      amortCalcule: 2500,
      amortDeduct: 2500,
      amortReporte: 0,
      deficitsImputes: 1000,
      resultatFiscal: 4500,
      charges: { totalDeductible: 4000, chargesExploitation: 4000, chargesFinancement: 800, chargesPreExploitation: 0, totalNonDeductible: 150 },
    });
    const representation = rfs(fr);
    const direct = map2033BFromRfs(representation);
    const viaAssembleur = assembleLiasseFromRfs(representation).form2033B;
    assert.deepEqual(viaAssembleur, direct, "l'assembleur doit produire un objet structurellement identique, aucune transformation");
  });
});
