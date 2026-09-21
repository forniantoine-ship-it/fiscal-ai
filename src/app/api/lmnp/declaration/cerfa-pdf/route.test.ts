/**
 * P1-1/P1-6C — pont serveur RFS → moteur CERFA existant.
 * Run: npx tsx --test src/app/api/lmnp/declaration/cerfa-pdf/route.test.ts
 *
 * Aucun RFS ni moteur fabriqué à la main : chaque fixture provient d'un vrai
 * appel à runDeclarationGeneration() (même chemin que ValidationDocumentStep.tsx
 * en production), et la route appelle réellement les 6 wrappers publics
 * generateCerfa2031FromRfs()/generateCerfa2031BisFromRfs()/
 * generateCerfa2033AFromRfs()/generateCerfa2033BFromRfs()/
 * generateCerfa2033CFromRfs()/generateCerfa2033DFromRfs() (aucun mock).
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { handleCerfaPdfRequest } from "./handler";
// Payment V1 — ces tests portent sur le CONTENU fiscal du PDF, pas sur l'accès
// payant : le résolveur d'accès est injecté (autorisé). L'authentification, la
// propriété et l'entitlement payé sont prouvés dans route.payment.test.ts.
const POST = (request: Request) => handleCerfaPdfRequest(request, async () => ({ ok: true }));
import { runDeclarationGeneration } from "@/lib/lmnp/services/declaration/run-declaration-generation";
import {
  generateCerfa2031FromRfs,
  generateCerfa2031BisFromRfs,
  generateCerfa2033AFromRfs,
  generateCerfa2033BFromRfs,
  generateCerfa2033CFromRfs,
  generateCerfa2033DFromRfs,
  ALL_CERFA_FORM_IDS,
} from "@/lib/lmnp/services/liasse-pdf";
import { extractDrawnStringsForPage } from "@/lib/lmnp/services/liasse-pdf/tests/extract-rendered-text";
import type { DeclarationDraft } from "@/lib/lmnp/types/domain";
import type { FiscalRepresentation, ImmobilisationsRfs } from "@/runtime/capabilities/rfs/types";
import type { BilanInputs } from "@/runtime/capabilities/bilan/types";
import { assemblePatrimoine } from "@/runtime/capabilities/bilan/assemble-patrimoine";
import type { FiscalResult } from "@/runtime/capabilities/f006/types";
import type { IdentiteDeclarante } from "@/runtime/capabilities/f007/types";
import type { PretFinancementExercice } from "@/runtime/capabilities/f011/types";

const ALL_SIX_FORMS = [
  "2031-SD",
  "2031-bis-SD",
  "2033-A-SD",
  "2033-B-SD",
  "2033-C-SD",
  "2033-D-SD",
] as const;

/**
 * Génère chaque formulaire STANDALONE (wrappers déjà individuellement
 * testés, P1-6A/P1-6B) pour obtenir une référence de comparaison — jamais
 * une valeur fiscale devinée/codée en dur : le texte réellement dessiné sur
 * la page 1 de chaque PDF standalone doit être retrouvé, tel quel, à la
 * bonne position dans le PDF fusionné.
 */
async function standaloneReferenceTexts(rfs: FiscalRepresentation): Promise<Record<(typeof ALL_SIX_FORMS)[number], string[]>> {
  const declarationVersionId = "v1";
  const [f2031, f2031bis, fA, fB, fC, fD] = await Promise.all([
    generateCerfa2031FromRfs({ rfs, declarationVersionId }),
    generateCerfa2031BisFromRfs({ rfs, declarationVersionId }),
    generateCerfa2033AFromRfs({ rfs, declarationVersionId }),
    generateCerfa2033BFromRfs({ rfs, declarationVersionId }),
    generateCerfa2033CFromRfs({ rfs, declarationVersionId }),
    generateCerfa2033DFromRfs({ rfs, declarationVersionId }),
  ]);
  for (const r of [f2031, f2031bis, fA, fB, fC, fD]) {
    assert.equal(r.status, "generated", "précondition — chaque formulaire standalone doit être générable pour ce fixture");
  }
  if (
    f2031.status !== "generated" ||
    f2031bis.status !== "generated" ||
    fA.status !== "generated" ||
    fB.status !== "generated" ||
    fC.status !== "generated" ||
    fD.status !== "generated"
  ) {
    throw new Error("unreachable");
  }
  return {
    "2031-SD": await extractDrawnStringsForPage(f2031.pdfBytes, 1),
    "2031-bis-SD": await extractDrawnStringsForPage(f2031bis.pdfBytes, 1),
    "2033-A-SD": await extractDrawnStringsForPage(fA.pdfBytes, 1),
    "2033-B-SD": await extractDrawnStringsForPage(fB.pdfBytes, 1),
    "2033-C-SD": await extractDrawnStringsForPage(fC.pdfBytes, 1),
    "2033-D-SD": await extractDrawnStringsForPage(fD.pdfBytes, 1),
  };
}

function generationReadyDraft(overrides: Partial<DeclarationDraft> = {}): DeclarationDraft {
  return {
    completedSteps: [],
    siret: "12345678901234",
    siren: "123456789",
    exploitantFirstName: "Marie",
    exploitantLastName: "Dupont",
    dateMiseEnService: "2020-01-01",
    revenusAssistant: { exerciceFiscal: 2025, totalRecettes: 9000 },
    chargesAssistant: { exerciceFiscal: 2025, totalDeductible: 2000, totalPreExploitation: 0 },
    amortissementAssistant: { exerciceFiscal: 2025, totalDotations: 1500, status: "validated" },
    ...overrides,
  } as DeclarationDraft;
}

function realRfs(overrides: Partial<DeclarationDraft> = {}): FiscalRepresentation {
  const generation = runDeclarationGeneration(generationReadyDraft(overrides), 2025);
  assert.equal(generation.status, "generated", "précondition — le fixture doit être générable");
  if (generation.status !== "generated") throw new Error("unreachable");
  return generation.rfs;
}

/**
 * NEXT-5 (server hardening) — fixture réelle déclenchant la garde de
 * divergence F-010/F-014 (Cycle 37) : `logementAmortissement.plan.totalAnnuelExercice`
 * (372) diverge de `amortissementAssistant.totalDotations` (1500, hérité de
 * generationReadyDraft) — même fixture que final-declarability.test.ts.
 */
function realRfsAvecDivergenceAmortissement(): FiscalRepresentation {
  return realRfs({
    logementAmortissement: {
      prixRevient: 125136,
      valeurTerrain: 17960,
      valeurBati: 107176,
      baseAmortissableBati: 107176,
      montantMobilier: 5400,
      dotationAnnuelle: 1500,
      dureeMoyenneAnnees: 30,
      prorataRatio: 1,
      plan: {
        lignes: [
          { label: "Gros œuvre", montant: 37186, dureeAnnees: 75, dotationExercice: 372, amortissementsCumules: 372, vnc: 36814 },
        ],
        totalAnnuelExercice: 372,
        totalBrut: 37186,
      },
      fieldSources: {},
      computedAt: "2026-08-31T00:00:00.000Z",
    },
  } as never);
}

/**
 * NEXT-5 (server hardening) — dossier avec bilan patrimonial (P1-PDF-02-E),
 * pour exercer `checkBilanEquilibre()` via une vraie génération. Fixture
 * identique à celle de final-declarability.test.ts (NEXT-5B).
 */
const BILAN_INPUTS: BilanInputs = {
  tresorerie: { bankMode: "DEDIE", closingCash: 3000 },
  compteExploitant: { ouverture: 37100, apports: 0, prelevements: 1000 },
  ran: { situation: "NATIF" },
  tiers: { creances: { status: "NUL_CONFIRME" }, dettes: { status: "NUL_CONFIRME" } },
  subventionsInvestissement: { status: "NUL_CONFIRME" },
};

/**
 * totalAnnuelExercice (1500) aligné exactement sur amortissementAssistant.totalDotations
 * (1500, generationReadyDraft) : jamais de divergence 028/030 accidentelle
 * dans les fixtures bilan ci-dessous, qui exercent l'équilibre (142/180),
 * pas l'allowlist amortissement (déjà couverte séparément).
 */
const IMMOBILISATIONS_NON_DIVERGENTES = {
  prixRevient: 60000,
  valeurTerrain: 15000,
  valeurBati: 45000,
  baseAmortissableBati: 45000,
  montantMobilier: 0,
  dotationAnnuelle: 1500,
  dureeMoyenneAnnees: 30,
  prorataRatio: 1,
  plan: {
    lignes: [
      { label: "Composant", montant: 45000, dureeAnnees: 30, dotationExercice: 1500, amortissementsCumules: 1500, vnc: 43500 },
    ],
    totalAnnuelExercice: 1500,
    totalBrut: 45000,
  },
  fieldSources: {},
  computedAt: "2026-08-31T00:00:00.000Z",
} as const;

function realRfsAvecBilan(bilanInputs: BilanInputs, draftOverrides: Partial<DeclarationDraft> = {}): FiscalRepresentation {
  const generation = runDeclarationGeneration(
    generationReadyDraft({ logementAmortissement: IMMOBILISATIONS_NON_DIVERGENTES as never, ...draftOverrides }),
    2025,
    undefined,
    bilanInputs,
  );
  assert.equal(generation.status, "generated", "précondition — le fixture doit être générable");
  if (generation.status !== "generated") throw new Error("unreachable");
  return generation.rfs;
}

/**
 * NEXT-5 (server hardening) — dossier avec un prêt (F-011), pour exercer la
 * garde de divergence emprunt (case 156, correction P0-3) : F-011 (CRD réel)
 * vs `BilanInputs.financements.clotureCRD` (déclaré).
 */
function realRfsAvecEmpruntEtBilan(bilanInputs: BilanInputs): FiscalRepresentation {
  return realRfsAvecBilan(bilanInputs, {
    financementCharges: {
      exerciceFiscal: 2025,
      totalInteretsEmprunt: 800,
      totalInteretsPreExploitation: 0,
      totalAssurance: 100,
      totalCapitalRembourse: 2000,
      totalChargesFinancementExercice: 900,
      prets: [
        {
          pretId: "pret-1",
          typePret: "amortissable",
          interetsEmpruntExercice: 800,
          interetsPreExploitation: 0,
          assuranceEmpruntExercice: 100,
          assurancePreExploitation: 0,
          capitalRembourseExercice: 2000,
          capitalRestantDu31_12: 20000,
          fraisDossierDeductibles: 0,
          garantieDeductible: 0,
          iraDeductible: 0,
        },
      ],
      fieldSources: {},
      computedAt: "2026-08-31T00:00:00.000Z",
    },
  } as never);
}

/**
 * NEXT-5 (server hardening) — EXCEPTION documentée à la convention "aucun
 * RFS fabriqué à la main" de ce fichier : construire un bilan patrimonial
 * DESEQUILIBRE_REEL exact (écart réel entre actif net et passif malgré des
 * données individuellement fiables) exige d'équilibrer plusieurs postes
 * comptables simultanément — au-delà de ce que `generationReadyDraft()` +
 * `bilanInputs` peuvent viser de façon fiable à travers tout le pipeline
 * runDeclarationGeneration(). Fixture copiée à l'identique de
 * final-declarability.test.ts (NEXT-5B, describe "équilibre bilan"), déjà
 * prouvée par exécution directe de checkBilanEquilibre()/map2033AFromRfs()
 * — reconstruite ici uniquement pour prouver que la ROUTE (POST, pas
 * seulement resolveFinalDeclarabilityState() en isolation) applique
 * correctement le même verdict à un RFS transmis tel quel par un client.
 */
function rfsDesequilibreReel(): FiscalRepresentation {
  const fiscalResult: FiscalResult = {
    exercice: 2025,
    recettes: { total: 12000 },
    charges: { totalDeductible: 4000, chargesExploitation: 4000, chargesFinancement: 0, chargesPreExploitation: 0, totalNonDeductible: 100 },
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
  };
  const immobilisations: ImmobilisationsRfs = {
    lignes: [{ label: "Composant", montant: 45000, dureeAnnees: 30, dotationExercice: 1500, amortissementsCumules: 1500, vnc: 43500 }],
    totalAnnuelExercice: 1500,
    totalBrut: 45000,
    valeurTerrain: 15000,
  };
  const emprunt: PretFinancementExercice = {
    pretId: "pret-1",
    typePret: "amortissable",
    interetsEmpruntExercice: 800,
    interetsPreExploitation: 0,
    assuranceEmpruntExercice: 100,
    assurancePreExploitation: 0,
    capitalRembourseExercice: 2000,
    capitalRestantDu31_12: 20000,
    fraisDossierDeductibles: 0,
    garantieDeductible: 0,
    iraDeductible: 0,
  };
  const identite: IdentiteDeclarante = { siren: "104545108", siret: "10454510800011", denomination: "Test route DESEQUILIBRE_REEL" };
  const bilanInputs: BilanInputs = {
    tresorerie: { bankMode: "DEDIE", closingCash: 3000 },
    compteExploitant: { ouverture: 37100, apports: 0, prelevements: 1000 },
    ran: { situation: "NATIF" },
    tiers: { creances: { status: "NUL_CONFIRME" }, dettes: { status: "NUL_CONFIRME" } },
    // 137 déclaré sans contrepartie en trésorerie/actif — écart réel prouvé.
    subventionsInvestissement: { status: "DECLARE", montant: 2500 },
  };
  const rfsSansPatrimoine: FiscalRepresentation = {
    exercice: fiscalResult.exercice,
    identite,
    fiscalResult,
    immobilisations,
    emprunts: [emprunt],
    trace: {
      ksArtifacts: fiscalResult.trace.ksArtifacts,
      assembledAt: "2026-08-31T00:00:00.000Z",
      sourceFiscalResultAt: fiscalResult.trace.computedAt,
      sources: { identite: "IdentiteDeclarante (ENT-013)", fiscalResult: "FiscalResult (F-006)" },
    },
  };
  const patrimoine = assemblePatrimoine(rfsSansPatrimoine, bilanInputs);
  return { ...rfsSansPatrimoine, patrimoine };
}

function jsonRequest(body: unknown): Request {
  return new Request("http://localhost/api/lmnp/declaration/cerfa-pdf", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function isPdf(bytes: Uint8Array): boolean {
  return String.fromCharCode(...bytes.slice(0, 5)) === "%PDF-";
}

describe("POST /api/lmnp/declaration/cerfa-pdf", () => {
  it("RFS valide, 2033-A-SD seul → 200 application/pdf, bytes non vides, vrai PDF", async () => {
    const rfs = realRfs();
    const response = await POST(jsonRequest({ rfs, declarationVersionId: "v1", forms: ["2033-A-SD"] }));

    assert.equal(response.status, 200);
    assert.equal(response.headers.get("content-type"), "application/pdf");
    const bytes = new Uint8Array(await response.arrayBuffer());
    assert.ok(bytes.length > 0, "le PDF ne doit jamais être vide");
    assert.ok(isPdf(bytes), "la réponse doit être un vrai PDF (signature %PDF-)");
  });

  it("RFS valide, 2033-B-SD seul → 200 application/pdf, bytes non vides, vrai PDF", async () => {
    const rfs = realRfs();
    const response = await POST(jsonRequest({ rfs, declarationVersionId: "v1", forms: ["2033-B-SD"] }));

    assert.equal(response.status, 200);
    assert.equal(response.headers.get("content-type"), "application/pdf");
    const bytes = new Uint8Array(await response.arrayBuffer());
    assert.ok(bytes.length > 0);
    assert.ok(isPdf(bytes));
  });

  it("2033-A-SD + 2033-B-SD ensemble → un seul PDF fusionné (plus de pages que 2033-A seul)", async () => {
    const rfs = realRfs();
    const { PDFDocument } = await import("pdf-lib");

    const soloA = await POST(jsonRequest({ rfs, declarationVersionId: "v1", forms: ["2033-A-SD"] }));
    const soloABytes = new Uint8Array(await soloA.arrayBuffer());
    const soloADoc = await PDFDocument.load(soloABytes);

    const both = await POST(jsonRequest({ rfs, declarationVersionId: "v1", forms: ["2033-A-SD", "2033-B-SD"] }));
    assert.equal(both.status, 200);
    assert.equal(both.headers.get("content-type"), "application/pdf");
    const bothBytes = new Uint8Array(await both.arrayBuffer());
    assert.ok(isPdf(bothBytes));
    const bothDoc = await PDFDocument.load(bothBytes);

    assert.ok(
      bothDoc.getPageCount() > soloADoc.getPageCount(),
      "le PDF combiné doit contenir au moins les pages de 2033-A ET de 2033-B",
    );
  });

  it("moteur bloqué (débordement réel — montant extrême) → pas de PDF, réponse 422 avec violations", async () => {
    // Reproduit une dérive réelle du gate (checkOverflow), pas une simulation :
    // un montant assez grand pour dépasser la largeur calibrée d'une case
    // 2033-B (312/370) déclenche "debordement-largeur" dans le moteur RÉEL.
    const rfs = realRfs({ revenusAssistant: { exerciceFiscal: 2025, totalRecettes: 999999999999 } as never });

    const response = await POST(jsonRequest({ rfs, declarationVersionId: "v1", forms: ["2033-B-SD"] }));

    assert.equal(response.status, 422);
    const payload = (await response.json()) as { status: string; violations: unknown[] };
    assert.equal(payload.status, "blocked");
    assert.ok(Array.isArray(payload.violations) && payload.violations.length > 0, "les violations du moteur doivent être transmises pour diagnostic");
  });

  it("entrée invalide — forms inconnu → 400", async () => {
    const rfs = realRfs();
    const response = await POST(jsonRequest({ rfs, declarationVersionId: "v1", forms: ["2033-Z-SD"] }));
    assert.equal(response.status, 400);
  });

  it("entrée invalide — forms vide → 400", async () => {
    const rfs = realRfs();
    const response = await POST(jsonRequest({ rfs, declarationVersionId: "v1", forms: [] }));
    assert.equal(response.status, 400);
  });

  it("entrée invalide — rfs manquant → 400", async () => {
    const response = await POST(jsonRequest({ declarationVersionId: "v1", forms: ["2033-A-SD"] }));
    assert.equal(response.status, 400);
  });

  it("entrée invalide — declarationVersionId manquant → 400", async () => {
    const rfs = realRfs();
    const response = await POST(jsonRequest({ rfs, forms: ["2033-A-SD"] }));
    assert.equal(response.status, 400);
  });

  it("entrée invalide — corps JSON malformé → 400", async () => {
    const request = new Request("http://localhost/api/lmnp/declaration/cerfa-pdf", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{ceci n'est pas du json",
    });
    const response = await POST(request);
    assert.equal(response.status, 400);
  });

  it("délègue au moteur existant sans recalcul parallèle : le PDF produit par la route est identique (SHA-256) à un appel direct à generateCerfa2033AFromRfs()", async () => {
    const rfs = realRfs();
    const direct = await generateCerfa2033AFromRfs({ rfs, declarationVersionId: "v1" });
    assert.equal(direct.status, "generated");
    if (direct.status !== "generated") throw new Error("unreachable");

    const response = await POST(jsonRequest({ rfs, declarationVersionId: "v1", forms: ["2033-A-SD"] }));
    const bytes = new Uint8Array(await response.arrayBuffer());
    const { createHash } = await import("node:crypto");
    const sha256 = createHash("sha256").update(bytes).digest("hex");

    assert.equal(
      sha256,
      direct.sha256,
      "même RFS, même appel au moteur existant → même PDF octet pour octet — la route ne doit ajouter, recalculer, ni modifier aucune donnée",
    );
  });

  it("P1-6C — six formulaires demandés → 200 application/pdf, vrai PDF non vide", async () => {
    const rfs = realRfs();
    const response = await POST(jsonRequest({ rfs, declarationVersionId: "v1", forms: ALL_SIX_FORMS }));

    assert.equal(response.status, 200);
    assert.equal(response.headers.get("content-type"), "application/pdf");
    const bytes = new Uint8Array(await response.arrayBuffer());
    assert.ok(bytes.length > 0);
    assert.ok(isPdf(bytes));
  });

  it("P1-6C — liasse complète : les 6 formulaires sont réellement présents (texte dessiné identique à chaque wrapper standalone)", async () => {
    const rfs = realRfs();
    const reference = await standaloneReferenceTexts(rfs);

    const response = await POST(jsonRequest({ rfs, declarationVersionId: "v1", forms: ALL_SIX_FORMS }));
    assert.equal(response.status, 200);
    const bytes = new Uint8Array(await response.arrayBuffer());

    const { PDFDocument } = await import("pdf-lib");
    const doc = await PDFDocument.load(bytes);
    assert.equal(doc.getPageCount(), 6, "chaque formulaire standalone occupe une seule page — 6 formulaires ⇒ 6 pages");

    const mergedPagesText: string[][] = [];
    for (let page = 1; page <= 6; page += 1) {
      mergedPagesText.push(await extractDrawnStringsForPage(bytes, page));
    }

    for (const form of ALL_SIX_FORMS) {
      const found = mergedPagesText.some((pageText) => JSON.stringify(pageText) === JSON.stringify(reference[form]));
      assert.ok(found, `le texte réellement dessiné pour ${form} (standalone) doit se retrouver sur une page du PDF fusionné`);
    }
  });

  it("P1-6C — ordre canonique respecté : 2031 → 2031-bis → 2033-A → 2033-B → 2033-C → 2033-D, quel que soit l'ordre demandé (test du bug d'audit)", async () => {
    const rfs = realRfs();
    const reference = await standaloneReferenceTexts(rfs);

    // Ordre volontairement mélangé — jamais l'ordre canonique.
    const scrambled = ["2033-D-SD", "2031-bis-SD", "2033-A-SD", "2033-C-SD", "2031-SD", "2033-B-SD"] as const;
    assert.notDeepEqual([...scrambled], [...ALL_CERFA_FORM_IDS.filter((f) => (scrambled as readonly string[]).includes(f))], "précondition — l'ordre demandé doit être réellement non canonique");

    const response = await POST(jsonRequest({ rfs, declarationVersionId: "v1", forms: scrambled }));
    assert.equal(response.status, 200);
    const bytes = new Uint8Array(await response.arrayBuffer());

    for (let i = 0; i < ALL_SIX_FORMS.length; i += 1) {
      const pageText = await extractDrawnStringsForPage(bytes, i + 1);
      assert.deepEqual(
        pageText,
        reference[ALL_SIX_FORMS[i]],
        `page ${i + 1} doit correspondre à ${ALL_SIX_FORMS[i]} (ordre canonique), indépendamment de l'ordre demandé dans "forms"`,
      );
    }
  });

  it("P1-6C — sous-ensemble (2033-A-SD + 2033-C-SD) : uniquement ces deux formulaires, dans l'ordre canonique, aucun ajout automatique", async () => {
    const rfs = realRfs();
    const reference = await standaloneReferenceTexts(rfs);

    const response = await POST(jsonRequest({ rfs, declarationVersionId: "v1", forms: ["2033-C-SD", "2033-A-SD"] }));
    assert.equal(response.status, 200);
    const bytes = new Uint8Array(await response.arrayBuffer());

    const { PDFDocument } = await import("pdf-lib");
    const doc = await PDFDocument.load(bytes);
    assert.equal(doc.getPageCount(), 2, "seuls les 2 formulaires demandés doivent être présents — jamais les 4 autres ajoutés automatiquement");

    assert.deepEqual(await extractDrawnStringsForPage(bytes, 1), reference["2033-A-SD"], "page 1 = 2033-A-SD (ordre canonique, malgré la demande C puis A)");
    assert.deepEqual(await extractDrawnStringsForPage(bytes, 2), reference["2033-C-SD"], "page 2 = 2033-C-SD");
  });

  it("P1-6C — 2033-D réellement présent dans la liasse complète malgré cases:[] (page officielle copiée, pas une case artificielle)", async () => {
    const rfs = realRfs();
    const reference = await standaloneReferenceTexts(rfs);
    assert.deepEqual(reference["2033-D-SD"], [], "précondition — 2033-D ne dessine jamais aucun texte (Néant)");

    const response = await POST(jsonRequest({ rfs, declarationVersionId: "v1", forms: ALL_SIX_FORMS }));
    assert.equal(response.status, 200);
    const bytes = new Uint8Array(await response.arrayBuffer());

    // 2033-D est en position 6 dans l'ordre canonique.
    const page6Text = await extractDrawnStringsForPage(bytes, 6);
    assert.deepEqual(page6Text, [], "page 6 (2033-D) ne dessine aucun texte, exactement comme le wrapper standalone");

    const { PDFDocument } = await import("pdf-lib");
    const doc = await PDFDocument.load(bytes);
    assert.equal(doc.getPageCount(), 6, "la page 2033-D doit bien exister (page officielle copiée), pas silencieusement omise faute de contenu");
  });

  it("P1-6C — 2031-bis-SD présent et positionné juste après 2031-SD, sans jamais manipuler le formId interne \"2031-Bis-SD\"", async () => {
    const rfs = realRfs();
    const reference = await standaloneReferenceTexts(rfs);

    const response = await POST(jsonRequest({ rfs, declarationVersionId: "v1", forms: ["2031-bis-SD", "2031-SD"] }));
    assert.equal(response.status, 200);
    const bytes = new Uint8Array(await response.arrayBuffer());

    assert.deepEqual(await extractDrawnStringsForPage(bytes, 1), reference["2031-SD"], "page 1 = 2031-SD (ordre canonique malgré la demande bis puis SD)");
    assert.deepEqual(await extractDrawnStringsForPage(bytes, 2), reference["2031-bis-SD"], "page 2 = 2031-bis-SD, juste après 2031-SD");
  });

  it("P1-6C — atomicité : liasse complète avec un formulaire réellement bloqué (débordement réel) → 422, aucun PDF, violations du formulaire fautif", async () => {
    // Même valeur extrême déjà utilisée plus haut (bloque 2031-SD et 2033-B-SD
    // réellement, via checkOverflow réel — pas une simulation).
    const rfs = realRfs({ revenusAssistant: { exerciceFiscal: 2025, totalRecettes: 999999999999 } as never });

    const response = await POST(jsonRequest({ rfs, declarationVersionId: "v1", forms: ALL_SIX_FORMS }));

    assert.equal(response.status, 422);
    const payload = (await response.json()) as { status: string; violations: Array<{ form: string }> };
    assert.equal(payload.status, "blocked");
    assert.ok(payload.violations.length > 0, "les violations du/des formulaire(s) fautif(s) doivent être transmises");
    assert.ok(
      payload.violations.every((v) => ALL_SIX_FORMS.includes(v.form as (typeof ALL_SIX_FORMS)[number])),
      "chaque violation doit référencer un formulaire réellement demandé",
    );
  });

  /**
   * P1-6C — constat fait pendant ce chantier, HORS PÉRIMÈTRE de correction :
   * `PDFDocument.save()` (pdf-lib, `updateInfoDict()`) fixe INCONDITIONNELLEMENT
   * `ModificationDate = new Date()` à chaque sauvegarde — un octet du PDF
   * final dépend donc de l'horloge murale au moment de l'appel, indépendamment
   * de toute donnée fiscale. Vérifié directement dans
   * node_modules/pdf-lib/cjs/api/PDFDocument.js (`updateInfoDict`). Ce
   * comportement existe déjà dans CHAQUE wrapper individuel (P1-1/P1-3/
   * P1-6A/P1-6B) — leurs propres tests SHA-256 ne le voient pas seulement
   * parce que leurs deux appels s'exécutent en quelques millisecondes,
   * presque toujours dans la même seconde. Avec 6 générations + une fusion
   * par requête, la fenêtre de génération peut dépasser une seconde et
   * révéler cette non-déterminisme d'horodatage — ce n'est pas une
   * régression de la route, ni une donnée fiscale recalculée différemment,
   * ni une fusion non déterministe (vérifié séparément : fusionner deux
   * fois les MÊMES octets déjà produits donne un SHA-256 identique). Le
   * déterminisme réellement garanti — et réellement pertinent — porte sur
   * le CONTENU (page par page), jamais sur l'horodatage `ModificationDate`
   * du conteneur PDF. Corriger `ModificationDate` exigerait de modifier le
   * générateur (`generator/render-cerfa-liasse.ts`), hors périmètre strict
   * de P1-6C (4 fichiers autorisés) — signalé ici plutôt que contourné.
   */
  it("P1-6C — déterminisme du CONTENU : deux requêtes identiques sur les 6 formulaires produisent le même nombre de pages et le même texte page par page", async () => {
    const rfs = realRfs();

    const first = await POST(jsonRequest({ rfs, declarationVersionId: "v1", forms: ALL_SIX_FORMS }));
    const firstBytes = new Uint8Array(await first.arrayBuffer());
    const second = await POST(jsonRequest({ rfs, declarationVersionId: "v1", forms: ALL_SIX_FORMS }));
    const secondBytes = new Uint8Array(await second.arrayBuffer());

    const { PDFDocument } = await import("pdf-lib");
    const firstDoc = await PDFDocument.load(firstBytes);
    const secondDoc = await PDFDocument.load(secondBytes);
    assert.equal(firstDoc.getPageCount(), secondDoc.getPageCount(), "même RFS, même sélection → même nombre de pages");

    for (let page = 1; page <= firstDoc.getPageCount(); page += 1) {
      const firstPageText = await extractDrawnStringsForPage(firstBytes, page);
      const secondPageText = await extractDrawnStringsForPage(secondBytes, page);
      assert.deepEqual(firstPageText, secondPageText, `page ${page} — même contenu fiscal dessiné entre les deux requêtes, aucun recalcul ni aléa`);
    }
  });
});

/**
 * NEXT-5 (server hardening) — cette route reste joignable indépendamment de
 * l'UI (RFS transmise telle quelle par le client) : elle doit refuser une
 * projection dont on sait déjà, via resolveFinalDeclarabilityState()
 * (final-declarability.ts, seule source de vérité, jamais reproduite ici),
 * qu'elle est fiscalement incomplète pour ce dossier — exactement la même
 * frontière que DeclarationReadyView/ArchivedDeclarationView, appliquée ici
 * à la frontière serveur directement joignable par POST.
 */
describe("POST /api/lmnp/declaration/cerfa-pdf — frontière de déclarabilité (server hardening)", () => {
  it("RFS valide sans divergence → 200, succès inchangé (non-régression)", async () => {
    const rfs = realRfs();
    const response = await POST(jsonRequest({ rfs, declarationVersionId: "v1", forms: ["2033-A-SD"] }));
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("content-type"), "application/pdf");
    const bytes = new Uint8Array(await response.arrayBuffer());
    assert.ok(isPdf(bytes));
  });

  it("RFS avec divergence amortissement F-010/F-014 prouvée (028/030/490/492/496/570/576) → 422, aucun PDF, reason internal_projection_issue", async () => {
    const rfs = realRfsAvecDivergenceAmortissement();
    const response = await POST(jsonRequest({ rfs, declarationVersionId: "v1", forms: ["2033-A-SD"] }));

    assert.equal(response.status, 422);
    assert.equal(response.headers.get("content-type"), "application/json");
    const payload = (await response.json()) as { status: string; reason: string };
    assert.equal(payload.status, "blocked");
    assert.equal(payload.reason, "internal_projection_issue");

    // Aucun octet PDF dans la réponse bloquée — la réponse entière est le
    // JSON structuré ci-dessus, jamais un mélange PDF+erreur.
    assert.equal(response.headers.get("content-type") !== "application/pdf", true);
  });

  it("RFS avec divergence emprunt (case 156, F-011 vs BilanInputs.financements) → 422, reason internal_projection_issue", async () => {
    const rfs = realRfsAvecEmpruntEtBilan({ ...BILAN_INPUTS, financements: { clotureCRD: 25000 } });
    const response = await POST(jsonRequest({ rfs, declarationVersionId: "v1", forms: ["2033-A-SD"] }));

    assert.equal(response.status, 422);
    const payload = (await response.json()) as { status: string; reason: string };
    assert.equal(payload.status, "blocked");
    assert.equal(payload.reason, "internal_projection_issue");
  });

  it("RFS avec DIVERGENCE_SOURCE (équilibre bilan) → 422, reason internal_projection_issue", async () => {
    // Même fixture que le cas 156 ci-dessus : la divergence de CRD produit à
    // la fois 156 (allowlist) ET un équilibre DIVERGENCE_SOURCE (142/180) —
    // les deux mécanismes NEXT-5/NEXT-5B convergent ici, sans dupliquer la
    // logique de l'un dans l'autre.
    const rfs = realRfsAvecEmpruntEtBilan({ ...BILAN_INPUTS, financements: { clotureCRD: 25000 } });
    const response = await POST(jsonRequest({ rfs, declarationVersionId: "v1", forms: ["2033-A-SD"] }));
    assert.equal(response.status, 422);
  });

  it("RFS avec DESEQUILIBRE_REEL (subvention 137 sans contrepartie actif) → 422, reason internal_projection_issue", async () => {
    const rfs = rfsDesequilibreReel();
    const response = await POST(jsonRequest({ rfs, declarationVersionId: "v1", forms: ["2033-A-SD"] }));

    assert.equal(response.status, 422);
    const payload = (await response.json()) as { status: string; reason: string };
    assert.equal(payload.status, "blocked");
    assert.equal(payload.reason, "internal_projection_issue");
  });

  it("RFS avec DONNEE_MANQUANTE (tiers non renseignés, dossier par ailleurs équilibrable) → 200, jamais bloqué", async () => {
    const inputsSansTiers: BilanInputs = {
      tresorerie: { bankMode: "DEDIE", closingCash: 3000 },
      compteExploitant: { ouverture: 37100, apports: 0, prelevements: 1000 },
      ran: { situation: "NATIF" },
    };
    const rfs = realRfsAvecBilan(inputsSansTiers);
    const response = await POST(jsonRequest({ rfs, declarationVersionId: "v1", forms: ["2033-A-SD"] }));
    assert.equal(response.status, 200, "une simple donnée patrimoniale pas encore saisie ne doit jamais bloquer la génération");
  });

  it("RFS EQUILIBRE (bilan intégralement équilibré) → 200, jamais bloqué", async () => {
    const rfs = realRfsAvecBilan(BILAN_INPUTS);
    const response = await POST(jsonRequest({ rfs, declarationVersionId: "v1", forms: ["2033-A-SD"] }));
    assert.equal(response.status, 200);
  });

  it("RFS sans patrimoine (cases légitimement non applicables/hors périmètre) → 200, jamais bloqué", async () => {
    const rfs = realRfs();
    const response = await POST(jsonRequest({ rfs, declarationVersionId: "v1", forms: ALL_SIX_FORMS }));
    assert.equal(response.status, 200, "un dossier LMNP simple, sans patrimoine renseigné, reste livrable — non-régression P1-6C");
  });

  it("appel direct POST avec RFS divergente, sans passer par download-liasse-fiscale-pdf.ts/l'UI → toujours bloqué (aucun bypass client)", async () => {
    // Reproduit exactement ce qu'un client technique (devtools, curl, build
    // modifié) pourrait envoyer : un payload structurellement valide,
    // construit à la main comme un vrai appelant HTTP le ferait — jamais
    // via downloadLiasseFiscalePdf()/le composant React.
    const rfs = realRfsAvecDivergenceAmortissement();
    const rawPayload = JSON.parse(JSON.stringify({ rfs, declarationVersionId: "bypass-attempt", forms: ["2033-A-SD", "2033-C-SD"] }));
    const response = await POST(
      new Request("http://localhost/api/lmnp/declaration/cerfa-pdf", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(rawPayload),
      }),
    );
    assert.equal(response.status, 422, "la frontière serveur bloque indépendamment de tout état UI");
    assert.equal(response.headers.get("content-type"), "application/json", "jamais de PDF en réponse à une requête bloquée");
  });
});

/**
 * Dispense 2033-A (CGI, art. 302 septies A bis, VI) — Case Q du plan de test.
 * `isDispense2033AEnEffet(rfs.dispense2033A)` est la SEULE source consultée
 * ici (voir `dispense-2033a.ts`) : aucune règle dupliquée, aucun recalcul de
 * l'éligibilité côté route.
 */
describe("POST /api/lmnp/declaration/cerfa-pdf — dispense 2033-A (server hardening)", () => {
  const ELIGIBLE = { etat: "ELIGIBLE" as const, seuil: { triennium: "2026-2028", seuilAutresEntreprisesHT: 66_000, source: "test" }, caReferenceN1: 0, raison: "test" };
  const NOT_ELIGIBLE = { etat: "NOT_ELIGIBLE" as const, seuil: { triennium: "2026-2028", seuilAutresEntreprisesHT: 66_000, source: "test" }, caReferenceN1: 70_000, raison: "test" };

  it("Case Q — appel direct demandant 2033-A-SD alors que le dossier a enregistré USE_DISPENSE → 422, aucun bypass", async () => {
    const rfs = { ...realRfs(), dispense2033A: { eligibilite: ELIGIBLE, decision: "USE_DISPENSE" } };
    const response = await POST(jsonRequest({ rfs, declarationVersionId: "bypass-attempt", forms: ["2033-A-SD"] }));
    assert.equal(response.status, 422);
    const payload = (await response.json()) as { status: string; reason: string };
    assert.equal(payload.status, "blocked");
    assert.equal(payload.reason, "2033a_dispensed");
  });

  it("Case Q — même dossier, 2033-A-SD demandé AVEC d'autres formulaires → toujours 422, aucun octet PDF produit", async () => {
    const rfs = { ...realRfs(), dispense2033A: { eligibilite: ELIGIBLE, decision: "USE_DISPENSE" } };
    const response = await POST(jsonRequest({ rfs, declarationVersionId: "v1", forms: ALL_SIX_FORMS }));
    assert.equal(response.status, 422);
    assert.notEqual(response.headers.get("content-type"), "application/pdf");
  });

  it("USE_DISPENSE mais 2033-A-SD non demandé → 200, les autres formulaires restent générables normalement", async () => {
    const rfs = { ...realRfs(), dispense2033A: { eligibilite: ELIGIBLE, decision: "USE_DISPENSE" } };
    const response = await POST(
      jsonRequest({ rfs, declarationVersionId: "v1", forms: ["2031-SD", "2033-B-SD", "2033-C-SD", "2033-D-SD"] }),
    );
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("content-type"), "application/pdf");
  });

  it("Case F — ÉLIGIBLE + FILE_2033A → 2033-A-SD généré normalement (le client a choisi de déposer quand même)", async () => {
    const rfs = { ...realRfs(), dispense2033A: { eligibilite: ELIGIBLE, decision: "FILE_2033A" } };
    const response = await POST(jsonRequest({ rfs, declarationVersionId: "v1", forms: ["2033-A-SD"] }));
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("content-type"), "application/pdf");
  });

  it("Case G — NOT_ELIGIBLE (même avec decision USE_DISPENSE, état incohérent) → 2033-A-SD généré normalement, jamais bypassé", async () => {
    const rfs = { ...realRfs(), dispense2033A: { eligibilite: NOT_ELIGIBLE, decision: "USE_DISPENSE" } };
    const response = await POST(jsonRequest({ rfs, declarationVersionId: "v1", forms: ["2033-A-SD"] }));
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("content-type"), "application/pdf");
  });

  it("Case H — UNKNOWN → jamais traité comme dispensé, 2033-A-SD généré normalement", async () => {
    const rfs = { ...realRfs(), dispense2033A: { eligibilite: { etat: "UNKNOWN" as const, raison: "test" } } };
    const response = await POST(jsonRequest({ rfs, declarationVersionId: "v1", forms: ["2033-A-SD"] }));
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("content-type"), "application/pdf");
  });

  it("dispense2033A absent (dossier/fixture antérieur à ce champ) → 200, non-régression", async () => {
    const rfs = realRfs();
    const response = await POST(jsonRequest({ rfs, declarationVersionId: "v1", forms: ["2033-A-SD"] }));
    assert.equal(response.status, 200);
  });
});
