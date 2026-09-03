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

import { buildClientSummaryDocument, get2042DeficitCase } from "./build-client-summary-document";
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

/**
 * P0-3b — la formation du résultat ne doit plus jamais afficher une équation
 * arithmétiquement fausse : "Charges déductibles de l'exercice" suivie de
 * "= Résultat avant amortissement" doit désormais afficher, entre les deux,
 * la ligne "Charges déductibles de pré-exploitation" dès que ce montant est
 * non nul (fiscalResult.charges.chargesPreExploitation, A+B+C, restitution
 * directe, jamais recalculée).
 */
describe("P0-3b — formation du résultat : ligne pré-exploitation, jamais une équation fausse", () => {
  it("1. pré-exploitation = 1000 : la ligne est présente et vaut exactement 1000 €", () => {
    const fr = fiscalResult({
      recettes: { total: 10000 },
      charges: { totalDeductible: 2000, chargesExploitation: 2000, chargesFinancement: 0, chargesPreExploitation: 1000 },
      resultatAvantAmort: 7000,
    });
    const document = buildClientSummaryDocument(rfs(fr));

    assert.equal(document.syntheseFiscale.chargesPreExploitation, 1000, "restitution directe, jamais recalculée");
    const ligne = document.formationDuResultat.find((l) => l.startsWith("Charges déductibles de pré-exploitation"));
    assert.ok(ligne, "la ligne doit être présente dès que le montant est non nul");
    assert.match(ligne!, /1\s?000\s?€/, "la ligne doit afficher exactement 1 000 €");
  });

  it("2. formation complète : 10 000 − 2 000 (exercice) − 1 000 (pré-exploitation) = 7 000 (avant amortissement)", () => {
    const fr = fiscalResult({
      recettes: { total: 10000 },
      charges: { totalDeductible: 2000, chargesExploitation: 2000, chargesFinancement: 0, chargesPreExploitation: 1000 },
      resultatAvantAmort: 7000,
    });
    const document = buildClientSummaryDocument(rfs(fr));
    const lignes = document.formationDuResultat;

    const iRecettes = lignes.findIndex((l) => l.startsWith("Recettes"));
    const iExercice = lignes.findIndex((l) => l.startsWith("Charges déductibles de l'exercice"));
    const iPreExploitation = lignes.findIndex((l) => l.startsWith("Charges déductibles de pré-exploitation"));
    const iAvantAmort = lignes.findIndex((l) => l.startsWith("= Résultat avant amortissement"));

    assert.ok(iRecettes < iExercice, "ordre : recettes avant charges exercice");
    assert.ok(iExercice < iPreExploitation, "ordre : charges exercice avant pré-exploitation");
    assert.ok(iPreExploitation < iAvantAmort, "ordre : pré-exploitation avant le résultat avant amortissement");

    assert.match(lignes[iRecettes]!, /10\s?000\s?€/);
    assert.match(lignes[iExercice]!, /2\s?000\s?€/);
    assert.match(lignes[iPreExploitation]!, /1\s?000\s?€/);
    assert.match(lignes[iAvantAmort]!, /7\s?000\s?€/, "10 000 − 2 000 − 1 000 = 7 000, exactement ce que restitue resultatAvantAmort");
  });

  it("3. zéro pré-exploitation : la ligne est absente, aucun comportement incohérent", () => {
    const fr = fiscalResult({
      recettes: { total: 9000 },
      charges: { totalDeductible: 2000, chargesExploitation: 2000, chargesFinancement: 0, chargesPreExploitation: 0 },
      resultatAvantAmort: 7000,
    });
    const document = buildClientSummaryDocument(rfs(fr));

    assert.equal(document.syntheseFiscale.chargesPreExploitation, 0);
    assert.equal(
      document.formationDuResultat.some((l) => l.startsWith("Charges déductibles de pré-exploitation")),
      false,
      "aucune ligne inventée quand le montant est nul — comportement identique à avant P0-3b",
    );
  });

  it("5. aucune modification du résultat fiscal source : resultatAvantAmort/resultatFiscal restent des restitutions directes", () => {
    const fr = fiscalResult({
      recettes: { total: 10000 },
      charges: { totalDeductible: 2000, chargesExploitation: 2000, chargesFinancement: 0, chargesPreExploitation: 1000 },
      resultatAvantAmort: 7000,
      resultatFiscal: 4000,
    });
    const document = buildClientSummaryDocument(rfs(fr));

    assert.equal(document.syntheseFiscale.resultatAvantAmortissement, fr.resultatAvantAmort, "jamais recalculé, transport pur");
    assert.equal(document.syntheseFiscale.resultatFiscal, fr.resultatFiscal, "jamais recalculé, transport pur");
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
  it("chaque déficit antérieur du FiscalResult produit une ligne de case, avec le montant exact et la case individuelle", () => {
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
    const lignesDeficitsAnterieurs = document.aide2042.cases.filter((c) => /^5G[A-J]$/.test(c.case));
    assert.equal(lignesDeficitsAnterieurs.length, 2, "une ligne par déficit antérieur restant");
    assert.equal(lignesDeficitsAnterieurs[0].case, "5GI", "exercice 2025, millésime 2023 → 5GI");
    assert.equal(lignesDeficitsAnterieurs[0].montant, 1200);
    assert.equal(lignesDeficitsAnterieurs[1].case, "5GJ", "exercice 2025, millésime 2024 → 5GJ");
    assert.equal(lignesDeficitsAnterieurs[1].montant, 800);
    assert.equal(
      lignesDeficitsAnterieurs.every((c) => c.note === undefined),
      true,
      "la correspondance Cerfa millésime → case est déterminée, plus d'ambiguïté affichée",
    );
  });

  it("aucun déficit antérieur → aucune ligne 5GA à 5GJ, aucune ambiguïté inventée", () => {
    const document = buildClientSummaryDocument(rfs(fiscalResult()));
    assert.equal(document.aide2042.cases.some((c) => /^5G[A-J]$/.test(c.case)), false);
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

    const lignesDeficitsAnterieurs = document.aide2042.cases.filter((c) => /^5G[A-J]$/.test(c.case));
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
    assert.equal(document.aide2042.cases.some((c) => /^5G[A-J]$/.test(c.case)), false);
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
    const lignesDeficitsAnterieurs = document.aide2042.cases.filter((c) => /^5G[A-J]$/.test(c.case));
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

/**
 * P0-4.1 — audit P0-4 (anomalie P1) : `chargesDeductibles` inclut
 * `chargesExploitation + chargesFinancement`, mais `chargesParCategorie` ne
 * couvrait jamais `chargesFinancement` (F-011 — intérêts/assurance d'emprunt),
 * qui n'a pas de catégorie F-012 possible. Un client sommant le détail
 * obtenait donc un total inférieur à celui annoncé. Restitution directe de
 * fr.charges.chargesFinancement, jamais recalculée, jamais ventilée en
 * intérêts/assurance séparés (cette ventilation reste réservée à la liasse
 * technique 2033-B, cases 242/294 — P0-3a.2).
 */
describe("P0-4.1 — chargesParCategorie inclut le financement (réconciliation avec chargesDeductibles)", () => {
  function chargesFixture(chargesExploitation: number, chargesFinancement: number, detailParCategorie: Record<string, number>) {
    return {
      totalDeductible: chargesExploitation + chargesFinancement,
      chargesExploitation,
      chargesFinancement,
      chargesPreExploitation: 0,
      detailParCategorie,
    };
  }

  it("1. chargesFinancement > 0 : la ligne 'Intérêts et assurance d'emprunt' est présente avec exactement le montant canonique", () => {
    const document = buildClientSummaryDocument(
      rfs(fiscalResult({ charges: chargesFixture(6000, 2000, { taxe_fonciere: 6000 }) })),
    );
    const ligne = document.chargesParCategorie.find((c) => c.label === "Intérêts et assurance d'emprunt");
    assert.ok(ligne, "la ligne financement doit être présente");
    assert.equal(ligne!.montant, 2000, "restitution directe de fr.charges.chargesFinancement, jamais recalculée");
  });

  it("2. chargesFinancement = 0 : la ligne est absente", () => {
    const document = buildClientSummaryDocument(
      rfs(fiscalResult({ charges: chargesFixture(6000, 0, { taxe_fonciere: 6000 }) })),
    );
    assert.equal(
      document.chargesParCategorie.some((c) => c.label === "Intérêts et assurance d'emprunt"),
      false,
      "aucune ligne inventée quand chargesFinancement est nul — comportement identique à avant P0-4.1",
    );
  });

  it("3. F-012 + financement : la somme du détail affiché égale chargesDeductibles", () => {
    const fr = fiscalResult({ charges: chargesFixture(6000, 2000, { taxe_fonciere: 4000, assurance_pno: 2000 }) });
    const document = buildClientSummaryDocument(rfs(fr));
    const total = document.chargesParCategorie.reduce((sum, c) => sum + c.montant, 0);
    assert.equal(total, document.syntheseFiscale.chargesDeductibles, "6000 + 2000 = 8000, exactement chargesDeductibles");
    assert.equal(total, 8000);
  });

  it("4. financement seul (aucune catégorie F-012) : la somme du détail égale chargesDeductibles", () => {
    const fr = fiscalResult({ charges: { totalDeductible: 2000, chargesExploitation: 0, chargesFinancement: 2000, chargesPreExploitation: 0 } });
    const document = buildClientSummaryDocument(rfs(fr));
    const total = document.chargesParCategorie.reduce((sum, c) => sum + c.montant, 0);
    assert.equal(document.chargesParCategorie.length, 1, "seule la ligne financement, aucune catégorie F-012 inventée");
    assert.equal(total, document.syntheseFiscale.chargesDeductibles);
    assert.equal(total, 2000);
  });

  it("5. aucun financement : comportement strictement identique à avant P0-4.1 (non-régression)", () => {
    const document = buildClientSummaryDocument(
      rfs(fiscalResult({ charges: chargesFixture(3200, 0, { taxe_fonciere: 800, copropriete: 1500, honoraires_comptable: 900 }) })),
    );
    assert.equal(document.chargesParCategorie.length, 3);
    assert.deepEqual(
      document.chargesParCategorie.map((c) => c.categorie),
      ["copropriete", "honoraires_comptable", "taxe_fonciere"],
    );
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

/**
 * P1-3 (audit 2026-09-02) — restitution de fiscalResult.stocks.deficitsExpires
 * (déjà calculé par F-006, règle des 10 ans) sous forme d'avertissement
 * lisible. Aucun recalcul testé ici : chaque assertion compare le document au
 * FiscalResult injecté, comme le reste de ce fichier.
 */
describe("P1-3 — avertissement 'déficits arrivés à expiration'", () => {
  it("1. deficitsExpires = [] → aucune alerte d'expiration", () => {
    const document = buildClientSummaryDocument(rfs(fiscalResult({
      stocks: { deficits: [], amortissementsReportes: 0, deficitsExpires: [] },
    })));
    assert.equal(document.avertissements.deficitsExpires, undefined);
  });

  it("2. un déficit expiré → le millésime et le montant apparaissent dans l'avertissement", () => {
    const document = buildClientSummaryDocument(rfs(fiscalResult({
      stocks: {
        deficits: [],
        amortissementsReportes: 0,
        deficitsExpires: [{ millesime: 2015, montant: 1200 }],
      },
    })));
    assert.ok(document.avertissements.deficitsExpires, "l'avertissement doit être présent");
    assert.match(document.avertissements.deficitsExpires!, /2015/);
    assert.match(document.avertissements.deficitsExpires!, /1[\s ]?200/, "le montant (1 200 €) doit apparaître");
    assert.match(document.avertissements.deficitsExpires!, /10 ans/);
  });

  it("3. plusieurs déficits expirés → tous les millésimes et montants sont restitués", () => {
    const document = buildClientSummaryDocument(rfs(fiscalResult({
      stocks: {
        deficits: [],
        amortissementsReportes: 0,
        deficitsExpires: [
          { millesime: 2014, montant: 800 },
          { millesime: 2015, montant: 300 },
        ],
      },
    })));
    const texte = document.avertissements.deficitsExpires;
    assert.ok(texte, "l'avertissement doit être présent");
    assert.match(texte!, /2014/);
    assert.match(texte!, /800/);
    assert.match(texte!, /2015/);
    assert.match(texte!, /300/);
  });

  it("4. un déficit expiré n'apparaît jamais dans deficitsAnterieursRestants (les deux notions restent distinctes)", () => {
    const document = buildClientSummaryDocument(rfs(fiscalResult({
      stocks: {
        // Un vrai déficit antérieur encore actif (2023) coexiste avec un
        // déficit expiré (2015) — les deux structures ne doivent jamais se
        // mélanger : deficitsExpires n'est jamais un sous-ensemble de
        // deficits, et deficitsAnterieursRestants ne doit contenir que 2023.
        deficits: [{ millesime: 2023, montant: 400 }],
        amortissementsReportes: 0,
        deficitsExpires: [{ millesime: 2015, montant: 1200 }],
      },
    })));
    assert.deepEqual(document.syntheseFiscale.deficitsAnterieursRestants, [{ millesime: 2023, montant: 400 }]);
    assert.equal(
      document.syntheseFiscale.deficitsAnterieursRestants.some((d) => d.millesime === 2015),
      false,
      "le déficit expiré (2015) ne doit jamais apparaître dans les déficits restants",
    );
    assert.ok(document.avertissements.deficitsExpires?.includes("2015"));
  });
});

/**
 * P1-4A (audit 2026-09-02) — mapping dynamique Cerfa 2042-C-PRO :
 * N-10 → 5GA … N-1 → 5GJ. Projection d'affichage, aucun recalcul F-006.
 */
describe("P1-4A — mapping dynamique 5GA–5GJ", () => {
  it("get2042DeficitCase : fenêtre glissante, jamais une table d'années figée", () => {
    assert.equal(get2042DeficitCase(2025, 2015), "5GA");
    assert.equal(get2042DeficitCase(2025, 2023), "5GI");
    assert.equal(get2042DeficitCase(2025, 2024), "5GJ");
    assert.equal(get2042DeficitCase(2024, 2014), "5GA");
    assert.equal(get2042DeficitCase(2024, 2023), "5GJ");
    assert.equal(get2042DeficitCase(2025, 2025), undefined, "l'exercice courant n'a pas de case 5G*");
    assert.equal(get2042DeficitCase(2025, 2014), undefined, "hors fenêtre (expiré) → pas de case");
  });

  it("1. exercice 2025 + déficit 2023 → 5GI, montant et millésime conservés", () => {
    const document = buildClientSummaryDocument(
      rfs(
        fiscalResult({
          exercice: 2025,
          stocks: { deficits: [{ millesime: 2023, montant: 1200 }], amortissementsReportes: 0, deficitsExpires: [] },
        }),
      ),
    );
    const ligne = document.aide2042.cases.find((c) => c.case === "5GI");
    assert.ok(ligne, "la case 5GI doit être présente");
    assert.equal(ligne?.montant, 1200);
    assert.match(ligne?.label ?? "", /2023/);
  });

  it("2. exercice 2025 + déficit 2024 → 5GJ", () => {
    const document = buildClientSummaryDocument(
      rfs(
        fiscalResult({
          exercice: 2025,
          stocks: { deficits: [{ millesime: 2024, montant: 800 }], amortissementsReportes: 0, deficitsExpires: [] },
        }),
      ),
    );
    assert.equal(document.aide2042.cases.find((c) => c.case === "5GJ")?.montant, 800);
  });

  it("3. exercice 2025 + déficit 2015 → 5GA", () => {
    const document = buildClientSummaryDocument(
      rfs(
        fiscalResult({
          exercice: 2025,
          stocks: { deficits: [{ millesime: 2015, montant: 500 }], amortissementsReportes: 0, deficitsExpires: [] },
        }),
      ),
    );
    assert.equal(document.aide2042.cases.find((c) => c.case === "5GA")?.montant, 500);
  });

  it("4. exercice 2024 + déficit 2023 → 5GJ (le mapping glisse avec l'exercice)", () => {
    const document = buildClientSummaryDocument(
      rfs(
        fiscalResult({
          exercice: 2024,
          stocks: { deficits: [{ millesime: 2023, montant: 900 }], amortissementsReportes: 0, deficitsExpires: [] },
        }),
      ),
    );
    assert.equal(document.aide2042.cases.find((c) => c.case === "5GJ")?.montant, 900);
    assert.equal(document.aide2042.cases.some((c) => c.case === "5GI"), false, "2023 n'est plus 5GI quand N=2024");
  });

  it("5. exercice 2024 + déficit 2014 → 5GA", () => {
    const document = buildClientSummaryDocument(
      rfs(
        fiscalResult({
          exercice: 2024,
          stocks: { deficits: [{ millesime: 2014, montant: 300 }], amortissementsReportes: 0, deficitsExpires: [] },
        }),
      ),
    );
    assert.equal(document.aide2042.cases.find((c) => c.case === "5GA")?.montant, 300);
  });

  it("6. exercice courant 2025 + déficit 2025 → aucune ligne 5GA–5GJ", () => {
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
    assert.equal(document.aide2042.cases.some((c) => /^5G[A-J]$/.test(c.case)), false);
  });

  it("7. déficit hors fenêtre / expiré → aucune ligne 5GA–5GJ", () => {
    const document = buildClientSummaryDocument(
      rfs(
        fiscalResult({
          exercice: 2025,
          stocks: {
            deficits: [{ millesime: 2014, montant: 700 }],
            amortissementsReportes: 0,
            deficitsExpires: [{ millesime: 2014, montant: 700 }],
          },
        }),
      ),
    );
    assert.equal(document.aide2042.cases.some((c) => /^5G[A-J]$/.test(c.case)), false);
  });
});

/**
 * P1-4B (audit 2026-09-02) — 5CD ne s'invite que si l'exercice est < 12 mois.
 * Aucun nombre de mois calculé. Source : activityStartDate, jamais dateMiseEnService.
 */
describe("P1-4B — exposition 5CD selon la date de début d'activité", () => {
  it("1. activityStartDate antérieure au 01/01/2025 → 5CD n'invite pas à renseigner une durée", () => {
    const document = buildClientSummaryDocument(rfs(fiscalResult({ exercice: 2025 })), {
      activityStartDate: "2020-03-05",
    });
    const case5CD = document.aide2042.cases.find((c) => c.case === "5CD");
    assert.ok(case5CD, "la case 5CD reste visible pour documenter la décision");
    assert.match(String(case5CD?.montant), /Ne pas renseigner/i);
    assert.doesNotMatch(String(case5CD?.montant), /À vérifier|renseignez/i);
    assert.equal(case5CD?.note, undefined, "pas d'ambiguïté : l'exercice est complet");
  });

  it("2. première activité pendant 2025 → à vérifier, aucun nombre de mois calculé", () => {
    const document = buildClientSummaryDocument(rfs(fiscalResult({ exercice: 2025 })), {
      activityStartDate: "2025-04-15",
    });
    const case5CD = document.aide2042.cases.find((c) => c.case === "5CD");
    assert.equal(case5CD?.montant, "À vérifier");
    assert.match(case5CD?.note ?? "", /inférieure à 12 mois/i);
    assert.doesNotMatch(String(case5CD?.montant), /^\d+$/);
    assert.ok(document.aide2042.ambiguites.includes(case5CD?.note as string));
  });

  it("3. 5CD s'appuie sur activityStartDate, jamais sur une date de mise en service", () => {
    // Mise en service fictive en juin 2025 : si elle était lue, 5CD passerait
    // en « première année ». activityStartDate 2020 → exercice complet.
    const document = buildClientSummaryDocument(rfs(fiscalResult({ exercice: 2025 })), {
      activityStartDate: "2020-01-01",
      // @ts-expect-error — dateMiseEnService n'est pas une option du document client
      dateMiseEnService: "2025-06-15",
    });
    const case5CD = document.aide2042.cases.find((c) => c.case === "5CD");
    assert.match(String(case5CD?.montant), /Ne pas renseigner/i);
  });

  it("4. date manquante → à vérifier, aucun calcul inventé", () => {
    const document = buildClientSummaryDocument(rfs(fiscalResult({ exercice: 2025 })));
    const case5CD = document.aide2042.cases.find((c) => c.case === "5CD");
    assert.equal(case5CD?.montant, "À vérifier");
    assert.match(case5CD?.note ?? "", /n'est pas connue|moins de 12 mois/i);
    assert.doesNotMatch(String(case5CD?.montant), /^\d+$/);
  });

  it("départ au 1er janvier de l'exercice → exercice de 12 mois, ne pas renseigner", () => {
    const document = buildClientSummaryDocument(rfs(fiscalResult({ exercice: 2025 })), {
      activityStartDate: "2025-01-01",
    });
    const case5CD = document.aide2042.cases.find((c) => c.case === "5CD");
    assert.match(String(case5CD?.montant), /Ne pas renseigner/i);
  });
});
