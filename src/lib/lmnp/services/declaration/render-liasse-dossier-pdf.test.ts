/**
 * Rendu PDF des pages documentaires de la liasse — pas de recalcul fiscal.
 * Run: npx tsx --test src/lib/lmnp/services/declaration/render-liasse-dossier-pdf.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import type { FiscalResult } from "@/runtime/capabilities/f006/types";
import type { IdentiteDeclarante } from "@/runtime/capabilities/f007/types";
import type { PretFinancementExercice } from "@/runtime/capabilities/f011/types";
import type { FiscalRepresentation, ImmobilisationsRfs } from "@/runtime/capabilities/rfs/types";
import { buildLiasseDossierDocument } from "./build-liasse-dossier-document";
import {
  formatLiasseEur,
  LIASSE_DOSSIER_PDF_TITLE,
  LIASSE_DOSSIER_SECTION,
  renderLiasseDossierPdf,
} from "./render-liasse-dossier-pdf";

function fiscalResult(overrides: Partial<FiscalResult> = {}): FiscalResult {
  const merged: FiscalResult = {
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
    amortNonDeduitExercice: 3720,
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
  if (overrides.amortNonDeduitExercice === undefined) {
    merged.amortNonDeduitExercice = Math.round((merged.amortCalcule - merged.amortDeduct) * 100) / 100;
  }
  return merged;
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
  interetsPreExploitation: 180,
  assuranceEmpruntExercice: 601,
  assurancePreExploitation: 40,
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

function principalDocument() {
  return buildLiasseDossierDocument(
    rfs(fiscalResult(), { immobilisations: IMMO, emprunts: [EMPRUNT] }),
    {
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
      pretsDescriptifs: [
        {
          pretId: "pret-1",
          capitalInitial: 130751,
          tauxNominal: 0.032,
          dureeMois: 300,
          datePremiereMensualite: "2025-03-01",
        },
      ],
      chargesDescriptives: {
        coproLignes: [{ type: "provisions", montant: 837 }],
      },
      stocksOuverture: {
        deficits: [{ millesime: 2024, montant: 200 }],
        amortissementsReportes: 100,
      },
    },
  );
}

function compact(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function contains(haystack: string, needle: string): boolean {
  return compact(haystack).includes(compact(needle));
}

async function extractPdf(bytes: Uint8Array): Promise<{ pageCount: number; pages: string[]; all: string }> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  pdfjs.GlobalWorkerOptions.workerSrc = pathToFileURL(
    require.resolve("pdfjs-dist/legacy/build/pdf.worker.min.mjs"),
  ).href;
  const pdf = await pdfjs.getDocument({ data: bytes }).promise;
  const pages: string[] = [];
  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum += 1) {
    const page = await pdf.getPage(pageNum);
    const content = await page.getTextContent();
    const items = content.items
      .filter((item): item is { str: string } => "str" in item && Boolean(item.str?.trim()))
      .map((item) => item.str);
    pages.push(items.join(" "));
  }
  return { pageCount: pdf.numPages, pages, all: pages.join("\n") };
}

describe("renderLiasseDossierPdf — architecture : pas de moteur fiscal", () => {
  it("n'importe aucun moteur de calcul et ne reconstruit pas la RFS", () => {
    const source = readFileSync(path.join(import.meta.dirname, "render-liasse-dossier-pdf.ts"), "utf8");
    const code = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    const valueImports = code
      .split("\n")
      .filter((line) => /^\s*import\s/.test(line) && !/^\s*import\s+type\s/.test(line))
      .join("\n");
    assert.doesNotMatch(code, /produceFiscalResult/);
    assert.doesNotMatch(code, /resultatComptable\(/);
    assert.doesNotMatch(code, /buildLiasseDossierDocument\(/);
    assert.doesNotMatch(code, /applyAmortissementStocks/);
    assert.doesNotMatch(code, /computeFinancementExercice/);
    assert.doesNotMatch(code, /map-2033/);
    assert.doesNotMatch(code, /render-cerfa-liasse/);
    assert.doesNotMatch(valueImports, /capabilities\/f00[6-9]/);
    assert.doesNotMatch(valueImports, /capabilities\/f01[0-4]/);
  });
});

describe("renderLiasseDossierPdf — PDF valide et structure", () => {
  it("retourne un PDF A4 valide, titre et exercice présents, sections principales affichées", async () => {
    const bytes = renderLiasseDossierPdf(principalDocument());
    assert.equal(String.fromCharCode(bytes[0]!, bytes[1]!, bytes[2]!, bytes[3]!), "%PDF");
    const extracted = await extractPdf(bytes);
    assert.ok(extracted.pageCount >= 3, `pagination trop courte: ${extracted.pageCount}`);
    assert.ok(contains(extracted.all, LIASSE_DOSSIER_PDF_TITLE));
    assert.ok(contains(extracted.all, "Exercice 2025"));
    assert.ok(contains(extracted.all, LIASSE_DOSSIER_SECTION.identite));
    assert.ok(contains(extracted.all, LIASSE_DOSSIER_SECTION.formation));
    assert.ok(contains(extracted.all, LIASSE_DOSSIER_SECTION.charges));
    assert.ok(contains(extracted.all, LIASSE_DOSSIER_SECTION.immobilisations));
    assert.ok(contains(extracted.all, LIASSE_DOSSIER_SECTION.financement));
    assert.ok(contains(extracted.all, LIASSE_DOSSIER_SECTION.reports));
  });

  it("reste générable avec un modèle minimal (identité + totaux RFS, sans extras)", async () => {
    const document = buildLiasseDossierDocument(rfs(fiscalResult()));
    const bytes = renderLiasseDossierPdf(document);
    const extracted = await extractPdf(bytes);
    assert.ok(extracted.pageCount >= 1);
    assert.ok(contains(extracted.all, LIASSE_DOSSIER_PDF_TITLE));
    assert.ok(contains(extracted.all, "Exercice 2025"));
    assert.ok(contains(extracted.all, LIASSE_DOSSIER_SECTION.formation));
    assert.equal(contains(extracted.all, LIASSE_DOSSIER_SECTION.immobilisations), false);
    assert.equal(contains(extracted.all, LIASSE_DOSSIER_SECTION.financement), false);
    assert.equal(contains(extracted.all, "Stocks d'ouverture"), false);
    assert.equal(contains(extracted.all, "Non renseigné"), false);
    assert.equal(contains(extracted.all, "ce que nous avons calculé"), false);
  });
});

describe("renderLiasseDossierPdf — restitution des montants du builder", () => {
  it("affiche les totaux RFS du modèle, jamais une autre source", async () => {
    const document = principalDocument();
    const extracted = await extractPdf(renderLiasseDossierPdf(document));
    const f = document.formationDuResultat;
    assert.ok(contains(extracted.all, formatLiasseEur(f.recettes)));
    assert.ok(contains(extracted.all, formatLiasseEur(f.chargesDeductibles)));
    assert.ok(contains(extracted.all, formatLiasseEur(f.resultatComptable)));
    assert.ok(contains(extracted.all, formatLiasseEur(f.amortissementCalcule)));
    assert.ok(contains(extracted.all, formatLiasseEur(f.amortissementReporte)));
    assert.ok(contains(extracted.all, formatLiasseEur(f.deficitFiscal)));
    assert.ok(contains(extracted.all, "Résultat comptable"));
  });

  it("une donnée absente n'apparaît pas comme une donnée inventée", async () => {
    const document = buildLiasseDossierDocument(rfs(fiscalResult()));
    const extracted = await extractPdf(renderLiasseDossierPdf(document));
    assert.equal(contains(extracted.all, "Statut"), false);
    assert.equal(contains(extracted.all, "Régime fiscal"), false);
    assert.equal(contains(extracted.all, "Bien immobilier"), false);
    assert.equal(contains(extracted.all, "Stocks d'ouverture"), false);
    assert.equal(contains(extracted.all, "LMNP"), false);
    assert.equal(contains(extracted.all, "LMP"), false);
    assert.equal(contains(extracted.all, "Non renseigné"), false);
    assert.equal(contains(extracted.all, "n/a"), false);
  });
});

describe("renderLiasseDossierPdf — charges, immos, financement, 39C", () => {
  it("conserve les intérêts et assurances séparés par le builder", async () => {
    const extracted = await extractPdf(renderLiasseDossierPdf(principalDocument()));
    assert.ok(contains(extracted.all, "Intérêts d'emprunt"));
    assert.ok(contains(extracted.all, "Intérêts d'emprunt (pré-exploitation)"));
    assert.ok(contains(extracted.all, "Assurance emprunteur"));
    assert.ok(contains(extracted.all, "Assurance emprunteur (pré-exploitation)"));
    assert.ok(contains(extracted.all, formatLiasseEur(4602)));
    assert.ok(contains(extracted.all, formatLiasseEur(180)));
    assert.ok(contains(extracted.all, formatLiasseEur(601)));
    assert.ok(contains(extracted.all, formatLiasseEur(40)));
  });

  it("affiche brut / durée / dotation / cumul / VNC, sans déductible ni reporté par ligne", async () => {
    const extracted = await extractPdf(renderLiasseDossierPdf(principalDocument()));
    const immoPage = extracted.pages.find((page) => contains(page, LIASSE_DOSSIER_SECTION.immobilisations));
    assert.ok(immoPage, "page immobilisations absente");
    assert.ok(contains(immoPage!, "Gros oeuvre"));
    assert.ok(contains(immoPage!, "Valeur brute"));
    assert.ok(contains(immoPage!, "Durée"));
    assert.ok(contains(immoPage!, "Dotation"));
    assert.ok(contains(immoPage!, "Cumul"));
    assert.ok(contains(immoPage!, "VNC"));
    assert.ok(contains(immoPage!, formatLiasseEur(37186)));
    assert.ok(contains(immoPage!, "75 ans"));
    assert.ok(contains(immoPage!, formatLiasseEur(372)));
    assert.ok(contains(immoPage!, formatLiasseEur(36814)));
    assert.equal(contains(immoPage!, "déductible"), false);
    assert.equal(contains(immoPage!, "reporté"), false);
    assert.ok(contains(immoPage!, "Terrain"));
    assert.ok(contains(immoPage!, formatLiasseEur(17960)));
  });

  it("affiche le financement fusionné lorsqu'il existe", async () => {
    const extracted = await extractPdf(renderLiasseDossierPdf(principalDocument()));
    assert.ok(contains(extracted.all, "Capital initial"));
    assert.ok(contains(extracted.all, formatLiasseEur(130751)));
    assert.ok(contains(extracted.all, "Taux nominal"));
    assert.ok(contains(extracted.all, "300 mois"));
    assert.ok(contains(extracted.all, "Capital restant dû au 31/12"));
    assert.ok(contains(extracted.all, formatLiasseEur(130256)));
  });

  it("affiche les stocks / 39C, et l'ouverture seulement si persistée", async () => {
    const withOpening = await extractPdf(renderLiasseDossierPdf(principalDocument()));
    assert.ok(contains(withOpening.all, "Stock d'amortissements reportés à clôture"));
    assert.ok(contains(withOpening.all, "Stocks d'ouverture"));
    assert.ok(contains(withOpening.all, formatLiasseEur(100)));
    assert.ok(contains(withOpening.all, "2024"));

    const withoutOpening = await extractPdf(renderLiasseDossierPdf(buildLiasseDossierDocument(rfs(fiscalResult()))));
    assert.ok(contains(withoutOpening.all, "Stock d'amortissements reportés à clôture"));
    assert.equal(contains(withoutOpening.all, "Stocks d'ouverture"), false);
  });
});
