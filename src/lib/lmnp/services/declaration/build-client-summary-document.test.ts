/**
 * Cycle 27 — Document client 149 € (synthèse fiscale + aide 2042-C-PRO).
 * Run: npx tsx --test src/lib/lmnp/services/declaration/build-client-summary-document.test.ts
 *
 * Aucun de ces tests ne recalcule quoi que ce soit : chaque assertion compare
 * une valeur du document construit à la valeur déjà présente dans le
 * FiscalResult injecté — c'est la restitution qui est testée, jamais un calcul.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { buildClientSummaryDocument } from "./build-client-summary-document";
import type { FiscalResult } from "@/runtime/capabilities/f006/types";
import type { IdentiteDeclarante } from "@/runtime/capabilities/f007/types";
import type { FiscalRepresentation } from "@/runtime/capabilities/rfs/types";

function fiscalResult(overrides: Partial<FiscalResult> = {}): FiscalResult {
  return {
    exercice: 2025,
    recettes: { total: 9000 },
    charges: { totalDeductible: 2000, chargesExploitation: 2000, chargesFinancement: 0, chargesPreExploitation: 0 },
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

const IDENTITE: IdentiteDeclarante = {
  siren: "104545108",
  siret: "10454510800011",
  denomination: "Elsa Bouvard",
  adresseEntreprise: "15 Rue Saint-Germain, 29600 Saint-Martin-Des-Champs",
};

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

describe("Cycle 27 — TEST 1 : source unique — le document ne fait que restituer rfs.fiscalResult", () => {
  it("document.syntheseFiscale.resultatFiscal === rfs.fiscalResult.resultatFiscal (cas bénéfice)", () => {
    const representation = rfs(fiscalResult({ resultatFiscal: 5500 }));
    const document = buildClientSummaryDocument(representation);
    assert.equal(document.syntheseFiscale.resultatFiscal, representation.fiscalResult.resultatFiscal);
  });

  it("document.syntheseFiscale.deficitFiscal === rfs.fiscalResult.deficitNouveau (cas déficit)", () => {
    const representation = rfs(fiscalResult({ resultatFiscal: 0, deficitNouveau: 9862 }));
    const document = buildClientSummaryDocument(representation);
    assert.equal(document.syntheseFiscale.deficitFiscal, representation.fiscalResult.deficitNouveau);
  });

  it("recettes/charges/amortissements du document sont des restitutions exactes du FiscalResult, aucune valeur recalculée", () => {
    const fr = fiscalResult({
      recettes: { total: 12345.67 },
      charges: { totalDeductible: 4321.09, chargesExploitation: 4321.09, chargesFinancement: 0, chargesPreExploitation: 0 },
      amortCalcule: 999.5,
      amortDeduct: 888.5,
      amortReporte: 111,
    });
    const document = buildClientSummaryDocument(rfs(fr));
    assert.equal(document.syntheseFiscale.recettes, 12345.67);
    assert.equal(document.syntheseFiscale.chargesDeductibles, 4321.09);
    assert.equal(document.syntheseFiscale.amortissementCalcule, 999.5);
    assert.equal(document.syntheseFiscale.amortissementDeductible, 888.5);
    assert.equal(document.syntheseFiscale.amortissementReporte, 111);
  });
});

describe("Cycle 27 — TEST 2 : bénéfice", () => {
  it("résultat positif → resultatPrincipal.nature === 'benefice', case 5NA présente avec le bon montant, pas de 5NY", () => {
    const document = buildClientSummaryDocument(rfs(fiscalResult({ resultatFiscal: 5500, deficitNouveau: 0 })));
    assert.deepEqual(document.syntheseFiscale.resultatPrincipal, { nature: "benefice", montant: 5500 });
    const case5NA = document.aide2042.cases.find((c) => c.case === "5NA");
    assert.ok(case5NA, "la case 5NA doit être présente en cas de bénéfice");
    assert.equal(case5NA?.montant, 5500);
    assert.equal(document.aide2042.cases.some((c) => c.case === "5NY"), false, "pas de case 5NY en cas de bénéfice");
  });
});

describe("Cycle 27 — TEST 3 : déficit", () => {
  it("ne jamais afficher 0 € comme résultat principal — le déficit est affiché explicitement, case 5NY alimentée", () => {
    const document = buildClientSummaryDocument(rfs(fiscalResult({ resultatFiscal: 0, deficitNouveau: 9862 })));
    assert.deepEqual(document.syntheseFiscale.resultatPrincipal, { nature: "deficit", montant: 9862 });
    assert.notEqual(document.syntheseFiscale.resultatPrincipal.montant, 0, "le déficit ne doit jamais apparaître comme 0 €");
    const case5NY = document.aide2042.cases.find((c) => c.case === "5NY");
    assert.ok(case5NY, "la case 5NY doit être présente en cas de déficit");
    assert.equal(case5NY?.montant, 9862);
    assert.equal(document.aide2042.cases.some((c) => c.case === "5NA"), false, "pas de case 5NA en cas de déficit");
  });

  it("le résumé pédagogique affiche explicitement '= Déficit fiscal', jamais '= Résultat fiscal : 0 €'", () => {
    const document = buildClientSummaryDocument(rfs(fiscalResult({ resultatFiscal: 0, deficitNouveau: 9862 })));
    const derniereLigne = document.formationDuResultat[document.formationDuResultat.length - 1];
    assert.match(derniereLigne, /Déficit fiscal/);
    assert.doesNotMatch(derniereLigne, /Résultat fiscal/);
  });
});

describe("Cycle 27 — TEST 4 : déficits antérieurs → cases 5GA à 5GJ", () => {
  it("chaque déficit antérieur du FiscalResult produit une ligne de case, avec le montant exact et une note d'ambiguïté", () => {
    const document = buildClientSummaryDocument(
      rfs(
        fiscalResult({
          stocks: {
            deficits: [
              { millesime: 2023, montant: 1200 },
              { millesime: 2024, montant: 800 },
            ],
            amortissementsReportes: 0,
            deficitsExpires: [],
          },
        }),
      ),
    );
    const lignesDeficitsAnterieurs = document.aide2042.cases.filter((c) => c.case === "5GA à 5GJ");
    assert.equal(lignesDeficitsAnterieurs.length, 2, "une ligne par déficit antérieur restant");
    assert.equal(lignesDeficitsAnterieurs[0].montant, 1200);
    assert.equal(lignesDeficitsAnterieurs[1].montant, 800);
    assert.ok(
      lignesDeficitsAnterieurs.every((c) => Boolean(c.note)),
      "la correspondance exacte case/millésime n'est jamais affirmée sans réserve",
    );
    assert.ok(
      document.aide2042.ambiguites.length >= 2,
      "les notes des déficits antérieurs remontent dans la liste des ambiguïtés du document (au moins une par déficit, plus la note 5CD toujours présente)",
    );
    for (const note of lignesDeficitsAnterieurs.map((c) => c.note)) {
      assert.ok(document.aide2042.ambiguites.includes(note as string));
    }
  });

  it("aucun déficit antérieur → aucune ligne 5GA à 5GJ, aucune ambiguïté inventée", () => {
    const document = buildClientSummaryDocument(rfs(fiscalResult()));
    assert.equal(document.aide2042.cases.some((c) => c.case === "5GA à 5GJ"), false);
  });
});

/**
 * Cycle 28 — correction P0 : `FiscalResult.stocks.deficits` (F-006) inclut le
 * déficit de l'exercice courant lui-même lorsque l'exercice est déficitaire
 * (cf. apply-amortissement-stocks.ts). Ce n'est pas un bug de F-006 — c'est le
 * stock à reporter aux exercices SUIVANTS. Mais le document client ne doit
 * jamais le présenter une seconde fois comme un « déficit antérieur » : il
 * est déjà la case 5NY de cet exercice.
 */
describe("Cycle 28 — le déficit de l'exercice courant n'est jamais dupliqué en 'déficit antérieur'", () => {
  it("cas déficitaire : 5NY porte le déficit de l'exercice, aucune ligne 5GA-5GJ pour ce même millésime, les vrais déficits antérieurs restent présents", () => {
    const document = buildClientSummaryDocument(
      rfs(
        fiscalResult({
          exercice: 2025,
          resultatFiscal: 0,
          deficitNouveau: 9862,
          stocks: {
            // Reproduction exacte du bug : le stock mis à jour par F-006 contient
            // à la fois le déficit de 2025 (l'exercice courant) et un vrai déficit
            // antérieur de 2023.
            deficits: [
              { millesime: 2023, montant: 1200 },
              { millesime: 2025, montant: 9862 },
            ],
            amortissementsReportes: 0,
            deficitsExpires: [],
          },
        }),
      ),
    );

    const case5NY = document.aide2042.cases.find((c) => c.case === "5NY");
    assert.equal(case5NY?.montant, 9862, "5NY porte bien le déficit de l'exercice");

    const lignesDeficitsAnterieurs = document.aide2042.cases.filter((c) => c.case === "5GA à 5GJ");
    assert.equal(lignesDeficitsAnterieurs.length, 1, "une seule ligne 5GA-5GJ : uniquement le vrai déficit antérieur (2023)");
    assert.equal(
      lignesDeficitsAnterieurs.some((c) => c.label.includes("2025")),
      false,
      "le déficit de l'exercice 2025 ne doit jamais apparaître comme 'antérieur'",
    );
    assert.equal(lignesDeficitsAnterieurs[0].label.includes("2023"), true);
    assert.equal(lignesDeficitsAnterieurs[0].montant, 1200, "le montant du vrai déficit antérieur n'est pas perdu");

    // syntheseFiscale.deficitsAnterieursRestants doit refléter la même exclusion.
    assert.deepEqual(
      document.syntheseFiscale.deficitsAnterieursRestants,
      [{ millesime: 2023, montant: 1200 }],
      "le déficit de l'exercice courant est exclu, aucun montant recalculé ou transformé",
    );
  });

  it("cas déficitaire sans aucun vrai déficit antérieur : le stock ne contient que l'exercice courant → aucune ligne 5GA-5GJ du tout", () => {
    const document = buildClientSummaryDocument(
      rfs(
        fiscalResult({
          exercice: 2025,
          resultatFiscal: 0,
          deficitNouveau: 9862,
          stocks: { deficits: [{ millesime: 2025, montant: 9862 }], amortissementsReportes: 0, deficitsExpires: [] },
        }),
      ),
    );
    assert.equal(document.aide2042.cases.some((c) => c.case === "5GA à 5GJ"), false);
    assert.equal(document.syntheseFiscale.deficitsAnterieursRestants.length, 0);
  });

  it("cas bénéficiaire avec un vrai déficit antérieur : comportement existant préservé (aucune régression)", () => {
    const document = buildClientSummaryDocument(
      rfs(
        fiscalResult({
          exercice: 2025,
          resultatFiscal: 3000,
          deficitNouveau: 0,
          stocks: { deficits: [{ millesime: 2023, montant: 1200 }], amortissementsReportes: 0, deficitsExpires: [] },
        }),
      ),
    );
    const case5NA = document.aide2042.cases.find((c) => c.case === "5NA");
    assert.equal(case5NA?.montant, 3000);
    const lignesDeficitsAnterieurs = document.aide2042.cases.filter((c) => c.case === "5GA à 5GJ");
    assert.equal(lignesDeficitsAnterieurs.length, 1);
    assert.equal(lignesDeficitsAnterieurs[0].montant, 1200);
    assert.deepEqual(document.syntheseFiscale.deficitsAnterieursRestants, [{ millesime: 2023, montant: 1200 }]);
  });
});

describe("Cycle 27 — TEST 5 : amortissement calculé / déductible / reporté distingués", () => {
  it("les trois montants restent distincts dans le document, exactement ceux du FiscalResult (limitation art. 39 C)", () => {
    // Cas Elsa Bouvard (référence PDF) : amortissement calculé 3720, intégralement reporté.
    const document = buildClientSummaryDocument(
      rfs(fiscalResult({ amortCalcule: 3720, amortDeduct: 0, amortReporte: 3720, resultatFiscal: 0, deficitNouveau: 9862 })),
    );
    assert.equal(document.syntheseFiscale.amortissementCalcule, 3720);
    assert.equal(document.syntheseFiscale.amortissementDeductible, 0);
    assert.equal(document.syntheseFiscale.amortissementReporte, 3720);
    assert.ok(
      document.formationDuResultat.some((ligne) => /reporté/.test(ligne) && /3.?720/.test(ligne)),
      "la ligne d'amortissement reporté doit apparaître avec le bon montant",
    );
  });

  it("amortissement partiellement limité → la ligne 'déductible' mentionne l'article 39 C", () => {
    const document = buildClientSummaryDocument(
      rfs(fiscalResult({ amortCalcule: 8000, amortDeduct: 7000, amortReporte: 1000, resultatFiscal: 0 })),
    );
    assert.equal(document.syntheseFiscale.amortissementDeductible, 7000);
    assert.equal(document.syntheseFiscale.amortissementReporte, 1000);
    assert.ok(
      document.formationDuResultat.some((ligne) => ligne.includes("39 C") && ligne.includes("déductible")),
      "la limitation art. 39 C doit être mentionnée quand amortDeduct < amortCalcule",
    );
  });

  it("amortissement intégralement déductible → pas de ligne 'reporté' (rien à signaler)", () => {
    const document = buildClientSummaryDocument(
      rfs(fiscalResult({ amortCalcule: 1500, amortDeduct: 1500, amortReporte: 0 })),
    );
    assert.equal(
      document.formationDuResultat.some((ligne) => ligne.includes("reporté")),
      false,
    );
  });
});

describe("Cycle 27 — TEST 6 : instructions si les informations ne sont pas préremplies", () => {
  it("le document explique quoi faire si le préremplissage n'est pas encore disponible, sans jamais le garantir", () => {
    const document = buildClientSummaryDocument(rfs(fiscalResult()));
    assert.ok(document.aide2042.instructionsSiAbsente.length > 0);
    assert.match(document.aide2042.instructionsSiAbsente, /renseigner/i);
    assert.ok(document.aide2042.instructionsSiPreremplie.length > 0);
    assert.ok(document.aide2042.instructionsSiDivergente.length > 0);
    // Le préremplissage ne doit jamais être présenté comme garanti ("normalement", pas "sera").
    assert.doesNotMatch(document.aide2042.explicationPreremplissage, /\bsera\b|garanti|automatiquement rempli/i);
    assert.match(document.aide2042.explicationPreremplissage, /normalement/i);
  });

  it("le document précise explicitement qu'il n'est ni la liasse officielle, ni un accusé EDI, ni une preuve d'acceptation", () => {
    const document = buildClientSummaryDocument(rfs(fiscalResult()));
    assert.match(document.avertissements.perimetreDocument, /liasse fiscale officielle/);
    assert.match(document.avertissements.perimetreDocument, /accusé de réception/);
    assert.match(document.avertissements.perimetreDocument, /acceptation/);
  });

  it("le statut EDI n'affirme jamais une transmission ou une acceptation qui n'a pas eu lieu", () => {
    const document = buildClientSummaryDocument(rfs(fiscalResult()));
    assert.doesNotMatch(document.avertissements.statutEdi, /transmise|acceptée|reçu EDI/i);
  });
});

/**
 * Cycle 29 — proposition de valeur 149 € : charges par catégorie, rappel du
 * travail effectué, distinction imputés/restants, différence résultat/trésorerie.
 * Aucun de ces tests n'introduit de calcul : chaque montant provient tel quel
 * de fiscalResult.charges.detailParCategorie ou de champs déjà vérifiés.
 */
describe("Cycle 29 — charges par catégorie (fiscalResult.charges.detailParCategorie)", () => {
  it("chaque catégorie présente dans detailParCategorie est restituée avec son montant exact, triée par montant décroissant", () => {
    const document = buildClientSummaryDocument(
      rfs(
        fiscalResult({
          charges: {
            totalDeductible: 3200,
            chargesExploitation: 3200,
            chargesFinancement: 0,
            chargesPreExploitation: 0,
            detailParCategorie: { taxe_fonciere: 800, copropriete: 1500, honoraires_comptable: 900 },
          },
        }),
      ),
    );
    assert.equal(document.chargesParCategorie.length, 3);
    assert.deepEqual(
      document.chargesParCategorie.map((c) => c.categorie),
      ["copropriete", "honoraires_comptable", "taxe_fonciere"],
      "tri par montant décroissant : 1500, 900, 800",
    );
    assert.equal(document.chargesParCategorie.find((c) => c.categorie === "taxe_fonciere")?.montant, 800);
    assert.equal(
      document.chargesParCategorie.find((c) => c.categorie === "taxe_fonciere")?.label,
      "Taxe foncière",
      "libellé français connu pour une catégorie F-012 standard",
    );
  });

  it("catégorie inconnue de la table de libellés : affichée humanisée, jamais masquée", () => {
    const document = buildClientSummaryDocument(
      rfs(
        fiscalResult({
          charges: {
            totalDeductible: 500,
            chargesExploitation: 500,
            chargesFinancement: 0,
            chargesPreExploitation: 0,
            detailParCategorie: { nouvelle_categorie_future: 500 },
          },
        }),
      ),
    );
    assert.equal(document.chargesParCategorie.length, 1);
    assert.equal(document.chargesParCategorie[0].label, "Nouvelle categorie future");
    assert.equal(document.chargesParCategorie[0].montant, 500, "le montant n'est jamais perdu même sans libellé connu");
  });

  it("detailParCategorie absent → tableau vide, aucune catégorie inventée", () => {
    const document = buildClientSummaryDocument(rfs(fiscalResult()));
    assert.deepEqual(document.chargesParCategorie, []);
  });

  it("une catégorie à 0 € n'est pas affichée (rien à montrer, mais pas une perte de donnée)", () => {
    const document = buildClientSummaryDocument(
      rfs(
        fiscalResult({
          charges: {
            totalDeductible: 800,
            chargesExploitation: 800,
            chargesFinancement: 0,
            chargesPreExploitation: 0,
            detailParCategorie: { taxe_fonciere: 800, divers: 0 },
          },
        }),
      ),
    );
    assert.equal(document.chargesParCategorie.length, 1);
    assert.equal(document.chargesParCategorie[0].categorie, "taxe_fonciere");
  });
});

describe("Cycle 29 — déficits antérieurs imputés vs restants : jamais confondus", () => {
  it("un exercice qui impute une partie d'un déficit antérieur et en laisse un autre intact : les deux restent distincts", () => {
    // Résultat avant amort 2000, deux déficits antérieurs (2022: 500, 2023: 3000) :
    // le plus ancien (2022) est intégralement imputé, le second (2023) ne l'est
    // que partiellement (1500 imputés, 1500 restants) — reproduit fidèlement
    // apply-amortissement-stocks.ts (imputation FIFO par millésime).
    const document = buildClientSummaryDocument(
      rfs(
        fiscalResult({
          resultatFiscal: 0,
          deficitNouveau: 0,
          deficitsImputes: 2000,
          stocks: {
            deficits: [{ millesime: 2023, montant: 1500 }],
            amortissementsReportes: 0,
            deficitsExpires: [],
          },
        }),
      ),
    );
    assert.equal(document.syntheseFiscale.deficitsAnterieursImputes, 2000, "montant imputé cette année");
    assert.equal(
      document.syntheseFiscale.totalDeficitsAnterieursRestants,
      1500,
      "montant restant à reporter — distinct du montant imputé, jamais additionné ni confondu",
    );
    assert.notEqual(
      document.syntheseFiscale.deficitsAnterieursImputes,
      document.syntheseFiscale.totalDeficitsAnterieursRestants,
    );
  });

  it("totalDeficitsAnterieursRestants est la somme exacte des montants de deficitsAnterieursRestants, aucun montant inventé", () => {
    const document = buildClientSummaryDocument(
      rfs(
        fiscalResult({
          stocks: {
            deficits: [
              { millesime: 2022, montant: 400 },
              { millesime: 2023, montant: 600 },
              { millesime: 2024, montant: 1000 },
            ],
            amortissementsReportes: 0,
            deficitsExpires: [],
          },
        }),
      ),
    );
    assert.equal(document.syntheseFiscale.totalDeficitsAnterieursRestants, 2000);
    assert.equal(
      document.syntheseFiscale.deficitsAnterieursRestants.reduce((sum, d) => sum + d.montant, 0),
      document.syntheseFiscale.totalDeficitsAnterieursRestants,
    );
  });
});

describe("Cycle 29 — 'Ce que nous avons calculé pour vous' : adapté au dossier, jamais générique", () => {
  it("aucune limitation d'amortissement → pas de phrase sur l'article 39 C dans le rappel de prestation", () => {
    const document = buildClientSummaryDocument(rfs(fiscalResult({ amortReporte: 0 })));
    assert.equal(
      document.travailEffectue.some((ligne) => ligne.includes("39 C")),
      false,
    );
  });

  it("amortissement reporté → la phrase sur la limitation article 39 C est bien présente", () => {
    const document = buildClientSummaryDocument(
      rfs(fiscalResult({ amortCalcule: 8000, amortDeduct: 7000, amortReporte: 1000 })),
    );
    assert.equal(
      document.travailEffectue.some((ligne) => ligne.includes("39 C")),
      true,
    );
  });

  it("aucun déficit antérieur, aucune imputation → pas de phrase sur les déficits précédents", () => {
    const document = buildClientSummaryDocument(rfs(fiscalResult()));
    assert.equal(
      document.travailEffectue.some((ligne) => /déficit/i.test(ligne)),
      false,
    );
  });

  it("cas déficitaire : la dernière phrase parle du déficit déterminé, jamais d'un 'résultat' positif", () => {
    const document = buildClientSummaryDocument(rfs(fiscalResult({ resultatFiscal: 0, deficitNouveau: 500 })));
    assert.ok(document.travailEffectue.some((ligne) => /déficit fiscal de l'exercice a été déterminé/.test(ligne)));
  });
});

describe("Cycle 29 — différence résultat fiscal / trésorerie : pédagogique, aucun montant affirmé", () => {
  it("le texte explique la différence sans avancer de chiffre, ni recalculer quoi que ce soit", () => {
    const document = buildClientSummaryDocument(rfs(fiscalResult()));
    assert.match(document.avertissements.differenceResultatTresorerie, /trésorerie/i);
    assert.doesNotMatch(document.avertissements.differenceResultatTresorerie, /[0-9]/, "texte générique, aucun montant chiffré");
  });
});
