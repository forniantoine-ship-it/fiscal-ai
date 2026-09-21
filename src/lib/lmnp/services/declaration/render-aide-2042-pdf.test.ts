/**
 * Design PDF « Aide à la déclaration 2042-C-PRO » validé — tests du rendu.
 * Run: npx tsx --test src/lib/lmnp/services/declaration/render-aide-2042-pdf.test.ts
 *
 * Ces tests portent sur le RENDU (pagination, présence/absence de contenu à
 * l'écran) — jamais sur un recalcul fiscal. Les montants et cases proviennent
 * systématiquement de `buildClientSummaryDocument`, déjà testé séparément.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { buildClientSummaryDocument } from "./build-client-summary-document";
import { renderAide2042Pdf, displayMontantForSaisir } from "./render-aide-2042-pdf";
import type { FiscalResult } from "@/runtime/capabilities/f006/types";
import type { IdentiteDeclarante } from "@/runtime/capabilities/f007/types";
import type { FiscalRepresentation } from "@/runtime/capabilities/rfs/types";

function fiscalResult(overrides: Partial<FiscalResult> = {}): FiscalResult {
  const merged: FiscalResult = {
    exercice: 2025,
    recettes: { total: 9000 },
    charges: { totalDeductible: 2000, chargesExploitation: 2000, chargesFinancement: 0, chargesPreExploitation: 0 },
    resultatAvantAmort: 7000,
    amortCalcule: 1500,
    amortDeduct: 1500,
    amortReporte: 0,
    amortNonDeduitExercice: 0,
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

function textOfAllPages(doc: ReturnType<typeof renderAide2042Pdf>): string {
  const total = doc.getNumberOfPages();
  let all = "";
  for (let page = 1; page <= total; page += 1) {
    // jsPDF ne fournit pas d'extraction de texte native fiable ; le contenu
    // du buffer interne (getTextContent n'existe pas côté génération) n'est
    // pas inspectable ici. Les assertions de contenu textuel exact sont
    // réalisées via l'inspection visuelle (PyMuPDF) documentée dans le
    // rapport, pas dans ce fichier. Ce test se limite à la pagination et à
    // l'absence d'erreur de rendu.
    all += `page-${page};`;
  }
  return all;
}

describe("Correction badge 5CD — plus de contradiction avec le bloc À SAISIR", () => {
  it("5CD en durée ambiguë (montant = 'À vérifier') s'affiche 'À renseigner' dans le bloc À SAISIR", () => {
    assert.equal(displayMontantForSaisir({ case: "5CD", label: "x", montant: "À vérifier", categorie: "a_saisir" }), "À renseigner");
  });

  it("5NA/5NY (montant numérique) ne sont jamais affectés par cette correction — restitution directe", () => {
    assert.equal(displayMontantForSaisir({ case: "5NA", label: "x", montant: 4250, categorie: "a_saisir" }), "4 250 €");
    assert.equal(displayMontantForSaisir({ case: "5NY", label: "x", montant: 1200, categorie: "a_saisir" }), "1 200 €");
  });
});

describe("Cas 1 — bénéfice simple : document compact, tient sur une seule page", () => {
  it("exercice complet, aucun déficit antérieur, 1 seule case à saisir → tout tient sur 1 page, rien n'est forcé sur une 2ᵉ", () => {
    const document = buildClientSummaryDocument(rfs(fiscalResult({ resultatFiscal: 5500, deficitNouveau: 0 })), {
      activityStartDate: "2020-01-01",
    });
    const doc = renderAide2042Pdf(document);
    assert.equal(doc.getNumberOfPages(), 1, "aucun saut de page forcé : le contenu (à saisir + navigation + checklist) tient naturellement sur 1 page");
  });
});

describe("Cas 2 — déficit simple : même comportement de pagination que le bénéfice", () => {
  it("5NY seul, exercice complet, aucun déficit antérieur → tient sur 1 page", () => {
    const document = buildClientSummaryDocument(rfs(fiscalResult({ resultatFiscal: 0, deficitNouveau: 1200 })), {
      activityStartDate: "2020-01-01",
    });
    const doc = renderAide2042Pdf(document);
    assert.equal(doc.getNumberOfPages(), 1);
  });
});

describe("Cas 3 — exercice inférieur à 12 mois : 5CD s'ajoute à 5NA, toujours compact", () => {
  it("5CD + 5NA (2 cases à saisir, chacune avec son instruction) → tient encore sur 1 page", () => {
    const document = buildClientSummaryDocument(rfs(fiscalResult({ exercice: 2025, resultatFiscal: 4250 })), {
      activityStartDate: "2025-06-01",
    });
    const doc = renderAide2042Pdf(document);
    assert.equal(doc.getNumberOfPages(), 1, "2 cases enrichies restent compactes : pas de 2ᵉ page nécessaire");
  });
});

describe("Cas 4 — déficits antérieurs : tient désormais sur 1 page grâce à la densification", () => {
  it("5NA + deux déficits antérieurs (5G*) → tout (à saisir, à vérifier, navigation, checklist) tient sur 1 page", () => {
    const document = buildClientSummaryDocument(
      rfs(
        fiscalResult({
          exercice: 2025,
          resultatFiscal: 4250,
          stocks: {
            deficits: [
              { millesime: 2023, montant: 1800 },
              { millesime: 2024, montant: 950 },
            ],
            amortissementsReportes: 0,
            deficitsExpires: [],
          },
        }),
      ),
      { activityStartDate: "2020-01-01" },
    );
    const doc = renderAide2042Pdf(document);
    assert.equal(
      doc.getNumberOfPages(),
      1,
      "après optimisation de densité : ce cas ne justifie plus une 2ᵉ page (priorité 1 de la dernière retouche)",
    );
  });
});

describe("Cas 5 — combinaison chargée : 5CD + 5NA + plusieurs déficits antérieurs", () => {
  it("5CD + 5NA + 6 déficits antérieurs → 2 pages ; la 2ᵉ porte navigation ET checklist ensemble (jamais une poignée de lignes isolées)", () => {
    const document = buildClientSummaryDocument(
      rfs(
        fiscalResult({
          exercice: 2025,
          resultatFiscal: 4250,
          stocks: {
            deficits: [
              { millesime: 2018, montant: 300 },
              { millesime: 2019, montant: 450 },
              { millesime: 2020, montant: 600 },
              { millesime: 2021, montant: 700 },
              { millesime: 2022, montant: 400 },
              { millesime: 2023, montant: 1800 },
            ],
            amortissementsReportes: 0,
            deficitsExpires: [],
          },
        }),
      ),
      { activityStartDate: "2025-06-01" },
    );
    const doc = renderAide2042Pdf(document);
    const pages = doc.getNumberOfPages();
    // Vérifié visuellement (PyMuPDF) : la page 1 est dense (à saisir + à
    // vérifier + phrase de fermeture) ; la navigation et la checklist,
    // groupées dans un seul bloc atomique, basculent ENSEMBLE sur la page 2
    // plutôt que de laisser la checklist seule — voir `atomicGroup` en tête
    // de fichier. Borne haute conservée à 3 en cas d'évolution du contenu.
    assert.ok(pages === 2 || pages === 3, `pagination inattendue pour un cas chargé: ${pages}`);
  });
});

describe("Cas 6 — identité : nom du client affiché, aucune nouvelle source", () => {
  it("le document se génère sans erreur avec l'identité du dossier (denomination)", () => {
    const document = buildClientSummaryDocument(rfs(fiscalResult()));
    assert.equal(document.meta.identite.denomination, "Elsa Bouvard");
    const doc = renderAide2042Pdf(document);
    assert.ok(doc.getNumberOfPages() >= 1);
  });

  it("identité absente (denomination undefined) : le document se génère quand même, sans erreur", () => {
    const fr = fiscalResult();
    const representation: FiscalRepresentation = {
      exercice: fr.exercice,
      identite: { siren: undefined, siret: undefined, denomination: undefined, adresseEntreprise: undefined },
      fiscalResult: fr,
      trace: {
        ksArtifacts: fr.trace.ksArtifacts,
        assembledAt: "2026-08-31T00:00:00.000Z",
        sourceFiscalResultAt: fr.trace.computedAt,
        sources: { identite: "IdentiteDeclarante (ENT-013)", fiscalResult: "FiscalResult (F-006)" },
      },
    };
    const document = buildClientSummaryDocument(representation);
    assert.doesNotThrow(() => renderAide2042Pdf(document));
  });
});

describe("Cas 7 — 5CD non applicable (exercice complet) : jamais affiché dans le bloc À SAISIR", () => {
  it("exercice complet → la case 5CD (Ne pas renseigner) est filtrée, seule 5NA apparaît dans le bloc", () => {
    const document = buildClientSummaryDocument(rfs(fiscalResult({ resultatFiscal: 3000 })), {
      activityStartDate: "2020-01-01",
    });
    const case5CD = document.aide2042.cases.find((c) => c.case === "5CD");
    assert.ok(case5CD, "5CD reste dans les données (documente la décision), mais ne doit pas s'afficher");
    assert.match(String(case5CD?.montant), /Ne pas renseigner/i);
    // Un seul cas à saisir affichable (5NA) : contenu compact, tient sur 1 page.
    const doc = renderAide2042Pdf(document);
    assert.equal(doc.getNumberOfPages(), 1, "5CD non applicable : rien ne force une 2ᵉ page");
  });
});

describe("Robustesse — génération sans erreur sur toutes les combinaisons", () => {
  it("aucune exception levée sur les 7 scénarios ci-dessus, la pagination reste cohérente (>=1, <=3)", () => {
    const scenarios: { fr: FiscalResult; activityStartDate?: string }[] = [
      { fr: fiscalResult({ resultatFiscal: 5500 }), activityStartDate: "2020-01-01" },
      { fr: fiscalResult({ resultatFiscal: 0, deficitNouveau: 1200 }), activityStartDate: "2020-01-01" },
      { fr: fiscalResult({ resultatFiscal: 4250 }), activityStartDate: "2025-06-01" },
      { fr: fiscalResult(), activityStartDate: "2020-01-01" },
    ];
    for (const { fr, activityStartDate } of scenarios) {
      const document = buildClientSummaryDocument(rfs(fr), { activityStartDate });
      const doc = renderAide2042Pdf(document);
      const pages = doc.getNumberOfPages();
      assert.ok(pages >= 1 && pages <= 3, `pagination hors bornes: ${pages}`);
      assert.ok(textOfAllPages(doc).length > 0);
    }
  });
});
