/**
 * Dossier documentaire de la liasse — restitution RFS, aucun recalcul.
 * Run: npx tsx --test src/lib/lmnp/services/declaration/build-liasse-dossier-document.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

import { resultatComptable } from "@/runtime/capabilities/bilan/resultat-comptable";
import type { FiscalResult } from "@/runtime/capabilities/f006/types";
import type { IdentiteDeclarante } from "@/runtime/capabilities/f007/types";
import type { PretFinancementExercice } from "@/runtime/capabilities/f011/types";
import type { FiscalRepresentation, ImmobilisationsRfs } from "@/runtime/capabilities/rfs/types";
import { buildLiasseDossierDocument } from "./build-liasse-dossier-document";

function fiscalResult(overrides: Partial<FiscalResult> = {}): FiscalResult {
  return {
    exercice: 2025,
    recettes: { total: 5100 },
    charges: {
      totalDeductible: 2267,
      chargesExploitation: 738,
      chargesFinancement: 1529,
      chargesPreExploitation: 0,
      totalNonDeductible: 99,
    },
    resultatAvantAmort: 2734,
    amortCalcule: 3720,
    amortDeduct: 0,
    amortReporte: 3720,
    amortReportesUtilises: 0,
    resultatFiscal: 0,
    deficitNouveau: 9862,
    deficitsImputes: 0,
    perteExceptionnelle: 0,
    stocks: { deficits: [{ millesime: 2025, montant: 9862 }], amortissementsReportes: 3720, deficitsExpires: [] },
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
  exerciceDebut: "01/02/2025",
  exerciceFin: "31/12/2025",
};

const EMPRUNT: PretFinancementExercice = {
  pretId: "pret-1",
  typePret: "amortissable",
  interetsEmpruntExercice: 4602,
  interetsPreExploitation: 0,
  assuranceEmpruntExercice: 601,
  assurancePreExploitation: 0,
  capitalRembourseExercice: 496,
  capitalRestantDu31_12: 130256,
  fraisDossierDeductibles: 0,
  garantieDeductible: 1763,
  iraDeductible: 0,
};

const IMMO: ImmobilisationsRfs = {
  lignes: [
    {
      label: "Gros oeuvre",
      montant: 37186,
      dureeAnnees: 75,
      dotationExercice: 372,
      amortissementsCumules: 372,
      vnc: 36814,
    },
  ],
  totalAnnuelExercice: 3720,
  totalBrut: 107176,
  valeurTerrain: 17960,
  montantMobilier: 5400,
  dateMiseEnService: "2025-04-01",
};

function rfs(fr: FiscalResult, extra?: Partial<FiscalRepresentation>): FiscalRepresentation {
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
    ...extra,
  };
}

describe("buildLiasseDossierDocument — architecture : pas de moteur fiscal", () => {
  it("n'importe aucun moteur de calcul (F-006 / F-010 / F-011 / F-012 / F-014 / mappers Cerfa)", () => {
    const source = readFileSync(
      path.join(import.meta.dirname, "build-liasse-dossier-document.ts"),
      "utf8",
    );
    const code = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    const valueImports = code
      .split("\n")
      .filter((line) => /^\s*import\s/.test(line) && !/^\s*import\s+type\s/.test(line))
      .join("\n");
    assert.doesNotMatch(code, /produceFiscalResult/);
    assert.doesNotMatch(code, /applyAmortissementStocks/);
    assert.doesNotMatch(code, /computeAmortizationPlan/);
    assert.doesNotMatch(code, /computeFinancementExercice/);
    assert.doesNotMatch(code, /computeChargesExercice/);
    assert.doesNotMatch(code, /composePlanAmortissement/);
    assert.doesNotMatch(code, /map2033/);
    assert.doesNotMatch(code, /produceLiasse/);
    assert.doesNotMatch(valueImports, /capabilities\/f00[6-9]/);
    assert.doesNotMatch(valueImports, /capabilities\/f01[0-4]/);
    assert.doesNotMatch(valueImports, /map-2033/);
    assert.doesNotMatch(valueImports, /render-cerfa-liasse/);
  });
});

describe("buildLiasseDossierDocument — vérité fiscale = RFS", () => {
  it("restitue les totaux F-006 sans les modifier", () => {
    const fr = fiscalResult();
    const document = buildLiasseDossierDocument(rfs(fr));
    const f = document.formationDuResultat;
    assert.equal(f.recettes, fr.recettes.total);
    assert.equal(f.chargesDeductibles, fr.charges.totalDeductible);
    assert.equal(f.chargesExploitation, fr.charges.chargesExploitation);
    assert.equal(f.chargesFinancement, fr.charges.chargesFinancement);
    assert.equal(f.chargesPreExploitation, fr.charges.chargesPreExploitation);
    assert.equal(f.chargesNonDeductibles, fr.charges.totalNonDeductible);
    assert.equal(f.resultatAvantAmortissement, fr.resultatAvantAmort);
    assert.equal(f.amortissementCalcule, fr.amortCalcule);
    assert.equal(f.amortissementDeductible, fr.amortDeduct);
    assert.equal(f.amortissementReporte, fr.amortReporte);
    assert.equal(f.amortissementReportesUtilises, fr.amortReportesUtilises);
    assert.equal(f.resultatFiscal, fr.resultatFiscal);
    assert.equal(f.deficitFiscal, fr.deficitNouveau);
    assert.equal(f.deficitsAnterieursImputes, fr.deficitsImputes);
  });

  it("resultatComptable === resultatComptable(fr) (fonction déjà utilisée par 136/310)", () => {
    const fr = fiscalResult();
    const document = buildLiasseDossierDocument(rfs(fr));
    assert.equal(document.formationDuResultat.resultatComptable, resultatComptable(fr));
  });

  it("un déficit n'apparaît jamais comme un bénéfice 0 €", () => {
    const document = buildLiasseDossierDocument(rfs(fiscalResult({ resultatFiscal: 0, deficitNouveau: 9862 })));
    assert.deepEqual(document.formationDuResultat.resultatPrincipal, { nature: "deficit", montant: 9862 });
  });

  it("un bénéfice restitue resultatFiscal", () => {
    const document = buildLiasseDossierDocument(
      rfs(fiscalResult({ resultatFiscal: 5500, deficitNouveau: 0, stocks: { deficits: [], amortissementsReportes: 0, deficitsExpires: [] } })),
    );
    assert.deepEqual(document.formationDuResultat.resultatPrincipal, { nature: "benefice", montant: 5500 });
  });

  it("détail recettes : champs définis restitués, champs absents omis", () => {
    const withDetail = buildLiasseDossierDocument(
      rfs(fiscalResult({ recettes: { total: 5100, loyersEncaisses: 5000, indemnitesAssurance: 100 } })),
    );
    assert.deepEqual(withDetail.formationDuResultat.recettesDetail, {
      loyersEncaisses: 5000,
      indemnitesAssurance: 100,
    });
    assert.equal(withDetail.formationDuResultat.recettesDetail?.recettesPlateforme, undefined);

    const withoutDetail = buildLiasseDossierDocument(rfs(fiscalResult()));
    assert.equal(withoutDetail.formationDuResultat.recettesDetail, undefined);
  });
});

describe("buildLiasseDossierDocument — extras descriptifs, jamais un fallback", () => {
  it("sans extras : activityType, régime, bien, charges descriptives, stocks d'ouverture absents", () => {
    const document = buildLiasseDossierDocument(rfs(fiscalResult()));
    assert.equal(document.meta.activityType, undefined);
    assert.equal(document.meta.regimeFiscal, undefined);
    assert.equal(document.meta.activityStartDate, undefined);
    assert.equal(document.bien, undefined);
    assert.equal(document.chargesDescriptives, undefined);
    assert.equal(document.reports.stockDeficitsOuverture, undefined);
    assert.equal(document.reports.stockAmortissementsReportesOuverture, undefined);
  });

  it("extras présents : restitution telle quelle, totaux fiscaux inchangés", () => {
    const fr = fiscalResult();
    const document = buildLiasseDossierDocument(rfs(fr), {
      activityStartDate: "2025-02-01",
      activityType: "LMNP",
      regimeFiscal: "reel_simplifie",
      bien: {
        adresse: "Appartement 102, Saint Martin des Champs",
        typeBien: "appartement",
        dateAcquisition: "2025-02-01",
        prixAcquisition: 72500,
        fraisNotaire: 73,
        choixTraitementFrais: "deduction",
      },
    });
    assert.equal(document.meta.activityType, "LMNP");
    assert.equal(document.meta.regimeFiscal, "reel_simplifie");
    assert.equal(document.meta.activityStartDate, "2025-02-01");
    assert.deepEqual(document.bien, {
      adresse: "Appartement 102, Saint Martin des Champs",
      typeBien: "appartement",
      dateAcquisition: "2025-02-01",
      prixAcquisition: 72500,
      fraisNotaire: 73,
      choixTraitementFrais: "deduction",
    });
    assert.equal(document.formationDuResultat.recettes, fr.recettes.total);
    assert.equal(document.formationDuResultat.deficitFiscal, fr.deficitNouveau);
  });

  it("chaîne vide ou type hors union : omis, jamais un libellé inventé", () => {
    const document = buildLiasseDossierDocument(rfs(fiscalResult()), {
      activityStartDate: "   ",
      activityType: "PROFESSIONNEL" as unknown as "LMNP",
      regimeFiscal: "micro" as unknown as "reel_simplifie",
      bien: { adresse: "  ", typeBien: "", choixTraitementFrais: "autre" as unknown as "deduction" },
    });
    assert.equal(document.meta.activityStartDate, undefined);
    assert.equal(document.meta.activityType, undefined);
    assert.equal(document.meta.regimeFiscal, undefined);
    assert.equal(document.bien, undefined);
  });

  it("identité RFS : champs vides omis", () => {
    const representation = rfs(fiscalResult());
    representation.identite = { denomination: "Elsa Bouvard", siren: "" };
    const document = buildLiasseDossierDocument(representation);
    assert.equal(document.meta.identite.denomination, "Elsa Bouvard");
    assert.equal(document.meta.identite.siren, undefined);
    assert.equal(document.meta.identite.siret, undefined);
  });
});

describe("buildLiasseDossierDocument — charges", () => {
  it("catégories F-012 depuis detailParCategorie, jamais une catégorie inventée", () => {
    const fr = fiscalResult({
      charges: {
        totalDeductible: 2267,
        chargesExploitation: 738,
        chargesFinancement: 0,
        chargesPreExploitation: 0,
        totalNonDeductible: 99,
        detailParCategorie: { copropriete: 738, taxe_fonciere: 0 },
      },
    });
    const document = buildLiasseDossierDocument(rfs(fr));
    assert.deepEqual(
      document.chargesParCategorie.filter((c) => c.source === "exploitation"),
      [{ categorie: "copropriete", label: "Charges de copropriété", montant: 738, source: "exploitation" }],
    );
    assert.equal(
      document.chargesParCategorie.some((c) => c.categorie === "taxe_fonciere"),
      false,
      "montant 0 : ligne omise, pas une taxe foncière inventée",
    );
  });

  it("emprunts RFS : ventilation par prêt en pass-through, sans addition de postes", () => {
    const document = buildLiasseDossierDocument(rfs(fiscalResult(), { emprunts: [EMPRUNT] }));
    const financement = document.chargesParCategorie.filter((c) => c.source === "financement");
    assert.deepEqual(financement, [
      { categorie: "interets_emprunt:pret-1", label: "Intérêts d'emprunt", montant: 4602, source: "financement" },
      { categorie: "assurance_emprunteur:pret-1", label: "Assurance emprunteur", montant: 601, source: "financement" },
      {
        categorie: "garantie:pret-1",
        label: "Commission de garantie / caution",
        montant: 1763,
        source: "financement",
      },
    ]);
  });

  it("sans rfs.emprunts : repli sur chargesFinancement agrégé F-006, jamais une ventilation inventée", () => {
    const fr = fiscalResult();
    const document = buildLiasseDossierDocument(rfs(fr));
    const financement = document.chargesParCategorie.filter((c) => c.source === "financement");
    assert.deepEqual(financement, [
      {
        categorie: "financement_emprunt",
        label: "Intérêts et assurance d'emprunt",
        montant: fr.charges.chargesFinancement,
        source: "financement",
      },
    ]);
  });

  it("copro descriptives F012 : transportées à part, sans remplacer le total fiscal", () => {
    const fr = fiscalResult({
      charges: {
        totalDeductible: 738,
        chargesExploitation: 738,
        chargesFinancement: 0,
        chargesPreExploitation: 0,
        totalNonDeductible: 99,
        detailParCategorie: { copropriete: 738 },
      },
    });
    const document = buildLiasseDossierDocument(rfs(fr), {
      chargesDescriptives: {
        coproLignes: [
          { type: "provisions", montant: 837 },
          { type: "fonds_travaux", montant: 99, description: "Fond de roulement" },
        ],
      },
    });
    assert.equal(document.chargesParCategorie[0]?.montant, 738);
    assert.deepEqual(document.chargesDescriptives?.coproLignes, [
      { type: "provisions", montant: 837 },
      { type: "fonds_travaux", montant: 99, description: "Fond de roulement" },
    ]);
  });
});

describe("buildLiasseDossierDocument — immobilisations", () => {
  it("absent de la RFS → section omise", () => {
    const document = buildLiasseDossierDocument(rfs(fiscalResult()));
    assert.equal(document.immobilisations, undefined);
  });

  it("lignes du plan : brut / durée / mise en service / dotation / cumul / VNC — pas de déductible/reporté par ligne", () => {
    const document = buildLiasseDossierDocument(rfs(fiscalResult(), { immobilisations: IMMO }));
    const ligne = document.immobilisations?.lignes.find((l) => l.source === "plan");
    assert.deepEqual(ligne, {
      label: "Gros oeuvre",
      valeurBrute: 37186,
      dureeAnnees: 75,
      dateMiseEnService: "2025-04-01",
      dotationExercice: 372,
      amortissementsCumules: 372,
      vnc: 36814,
      source: "plan",
    });
    assert.equal("amortissementDeductible" in (ligne ?? {}), false);
    assert.equal("amortissementReporte" in (ligne ?? {}), false);
    assert.equal(document.formationDuResultat.amortissementDeductible, 0);
    assert.equal(document.formationDuResultat.amortissementReporte, 3720);
  });

  it("terrain : brut seulement, jamais un amortissement inventé", () => {
    const document = buildLiasseDossierDocument(rfs(fiscalResult(), { immobilisations: IMMO }));
    const terrain = document.immobilisations?.lignes.find((l) => l.source === "terrain");
    assert.deepEqual(terrain, { label: "Terrain", valeurBrute: 17960, source: "terrain" });
    assert.equal(terrain?.dotationExercice, undefined);
    assert.equal(terrain?.vnc, undefined);
  });

  it("valeurTerrain absente : pas de ligne terrain à 0", () => {
    const { valeurTerrain: _omit, ...sansTerrain } = IMMO;
    const document = buildLiasseDossierDocument(
      rfs(fiscalResult(), { immobilisations: sansTerrain as ImmobilisationsRfs }),
    );
    assert.equal(document.immobilisations?.lignes.some((l) => l.source === "terrain"), false);
  });

  it("travaux F012 : brut / durée / date / dotation annuelle — cumul et VNC omis", () => {
    const document = buildLiasseDossierDocument(
      rfs(fiscalResult(), {
        immobilisations: {
          ...IMMO,
          composantsNouveaux: [
            {
              label: "Travaux rénovation",
              montant: 47236,
              dureeAnnees: 15,
              dotationAnnuelle: 2362,
              nature: "amélioration",
              dateDebut: "2025-04-01",
            },
          ],
        },
      }),
    );
    const travaux = document.immobilisations?.lignes.find((l) => l.source === "travaux");
    assert.equal(travaux?.valeurBrute, 47236);
    assert.equal(travaux?.dureeAnnees, 15);
    assert.equal(travaux?.dateMiseEnService, "2025-04-01");
    assert.equal(travaux?.dotationExercice, 2362);
    assert.equal(travaux?.amortissementsCumules, undefined);
    assert.equal(travaux?.vnc, undefined);
  });
});

describe("buildLiasseDossierDocument — financement", () => {
  it("rfs.emprunts : montants F-011 fiscaux + descriptif apparié par pretId", () => {
    const document = buildLiasseDossierDocument(rfs(fiscalResult(), { emprunts: [EMPRUNT] }), {
      pretsDescriptifs: [
        {
          pretId: "pret-1",
          capitalInitial: 130751,
          tauxNominal: 0.032,
          dureeMois: 300,
          datePremiereMensualite: "2025-03-01",
        },
      ],
    });
    assert.equal(document.financement?.prets.length, 1);
    const pret = document.financement?.prets[0];
    assert.equal(pret?.capitalRestantDu31_12, 130256);
    assert.equal(pret?.interetsEmpruntExercice, 4602);
    assert.equal(pret?.capitalInitial, 130751);
    assert.equal(pret?.tauxNominal, 0.032);
    assert.equal(pret?.dureeMois, 300);
  });

  it("descriptif d'un autre pretId : non fusionné, pas de prêt fiscal inventé", () => {
    const document = buildLiasseDossierDocument(rfs(fiscalResult(), { emprunts: [EMPRUNT] }), {
      pretsDescriptifs: [{ pretId: "autre", capitalInitial: 1 }],
    });
    assert.equal(document.financement?.prets.length, 1);
    assert.equal(document.financement?.prets[0]?.capitalInitial, undefined);
    assert.equal(document.financement?.prets[0]?.pretId, "pret-1");
  });

  it("sans rfs.emprunts : caractéristiques descriptives seules, aucun montant fiscal inventé", () => {
    const document = buildLiasseDossierDocument(rfs(fiscalResult()), {
      pretsDescriptifs: [{ pretId: "pret-1", capitalInitial: 130751, tauxNominal: 0.032 }],
    });
    const pret = document.financement?.prets[0];
    assert.equal(pret?.capitalInitial, 130751);
    assert.equal(pret?.tauxNominal, 0.032);
    assert.equal(pret?.capitalRestantDu31_12, undefined);
    assert.equal(pret?.interetsEmpruntExercice, undefined);
  });

  it("rfs.emprunts tableau vide : section présente, aucun prêt", () => {
    const document = buildLiasseDossierDocument(rfs(fiscalResult(), { emprunts: [] }));
    assert.deepEqual(document.financement, { prets: [] });
  });
});

describe("buildLiasseDossierDocument — déficits et 39C", () => {
  it("stock de clôture = fr.stocks tel quel ; antérieurs = filtre d'affichage du millésime N", () => {
    const fr = fiscalResult({
      deficitNouveau: 9862,
      stocks: {
        deficits: [
          { millesime: 2023, montant: 400 },
          { millesime: 2025, montant: 9862 },
        ],
        amortissementsReportes: 3720,
        deficitsExpires: [{ millesime: 2014, montant: 50 }],
      },
    });
    const document = buildLiasseDossierDocument(rfs(fr));
    assert.deepEqual(document.reports.stockDeficitsCloture, fr.stocks.deficits);
    assert.deepEqual(document.reports.deficitsAnterieurs, [{ millesime: 2023, montant: 400 }]);
    assert.equal(document.reports.deficitExercice, 9862);
    assert.equal(document.reports.stockAmortissementsReportesCloture, 3720);
    assert.deepEqual(document.reports.deficitsExpires, [{ millesime: 2014, montant: 50 }]);
    assert.equal(document.reports.stockAmortissementsReportesOuverture, undefined);
  });

  it("ouverture 39C / déficits : uniquement si extra persisté, jamais dérivée", () => {
    const document = buildLiasseDossierDocument(rfs(fiscalResult()), {
      stocksOuverture: {
        deficits: [{ millesime: 2024, montant: 200 }],
        amortissementsReportes: 100,
      },
    });
    assert.deepEqual(document.reports.stockDeficitsOuverture, [{ millesime: 2024, montant: 200 }]);
    assert.equal(document.reports.stockAmortissementsReportesOuverture, 100);
  });
});
