/**
 * R2 — ouverture patrimoniale (compte de l'exploitant 120 / RAN) cohérente avec l'antériorité déclarée.
 *
 * Défaut reproduit sur 2b3058b : `priorHistoryDeclaration = EXTERNAL_HISTORY` (Opening externe validée,
 * éligible) mais Q0 de PatrimonialIntakeCard = « première activité » (NATIF) → ouverture 0, RAN NATIF →
 * génération acceptée avec 2033-A 120 = 0, puis clôture reportée telle quelle en N+1.
 *
 * Chemins de production : `resolvePriorHistoryEligibility` → `derivePatrimonialRoutage` (passé par
 * ValidationDocumentStep à la carte) → `withDerivedRoutage` + `buildBilanPatrimonial` (carte) →
 * `runDeclarationGeneration` → `buildFiscalYearClosure` → `resolveOuvertureCompteExploitantNPlusUn`.
 *
 * Run: npx tsx --test src/lib/lmnp/services/declaration/r2-patrimonial-opening-prior-history.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

import { runDeclarationGeneration } from "./run-declaration-generation";
import { ALICE_YEAR, aliceDraft } from "./alice-test-draft";
import {
  buildBilanPatrimonial,
  deriveIntakeStateFromBilanPatrimonial,
  derivePatrimonialRoutage,
  EMPTY_PATRIMONIAL_INTAKE_STATE,
  withDerivedRoutage,
  type PatrimonialIntakeState,
} from "./patrimonial-intake";
import { resolvePriorHistoryEligibility, resolveExternalOpeningProofFromFiscalYear } from "./prior-history-eligibility";
import { computeOpeningContentHash } from "@/lib/lmnp/services/fiscal-year-opening/content-hash";
import { available, unavailable } from "@/lib/lmnp/services/fiscal-year-opening/opening-fact";
import type { FiscalYearOpening } from "@/lib/lmnp/services/fiscal-year-opening";
import { buildFiscalYearClosure } from "@/lib/lmnp/services/dossier/fiscal-year-cycle";
import { resolveOuvertureCompteExploitantNPlusUn } from "@/runtime/capabilities/bilan/resolve-ouverture-n-plus-1";
import type { BilanInputs } from "@/runtime/capabilities/bilan/types";
import type { DeclarationDraft, FiscalYear, PriorHistoryDeclarationStatus } from "@/lib/lmnp/types";

const FY = ALICE_YEAR; // 2025

/** Opening externe validée (stocks seuls) — patrimoine d'ouverture indisponible, comme en production (4F.1). */
function externalOpening(): FiscalYearOpening {
  const opening = {
    openingId: "opening-r2",
    revision: 1,
    targetFiscalYear: FY,
    dossierId: "dossier-r2",
    source: { kind: "external_takeover", takeoverId: "takeover-r2", sourceFiscalYear: FY - 1 },
    stocks: { deficits: available([]), amortissementsReportes: available(0) },
    assets: unavailable("stocks seuls"),
    loans: unavailable("hors scope"),
    patrimoine: {
      ouvertureCompteExploitant: unavailable("hors scope 4F.1"),
      ran: unavailable("hors scope 4F.1"),
      tresorerieOuverture: unavailable("hors scope 4F.1"),
    },
    properties: unavailable("hors scope"),
    identity: unavailable("hors scope"),
    provenance: {
      source: { fieldPath: "source", sourceKind: "external", sourceRef: "takeover-r2" },
      "stocks.deficits": { fieldPath: "stocks.deficits", sourceKind: "external" },
      "stocks.amortissementsReportes": { fieldPath: "stocks.amortissementsReportes", sourceKind: "external" },
    },
    validation: { status: "pending" },
  } as unknown as FiscalYearOpening;
  opening.validation = {
    status: "validated",
    openingRevision: 1,
    contentHash: computeOpeningContentHash(opening),
    validatedAt: "2026-01-15T00:00:00.000Z",
    validator: "r2-test",
  } as FiscalYearOpening["validation"];
  return opening;
}

function fiscalYearFacts(status: PriorHistoryDeclarationStatus, withOpening: boolean): Pick<FiscalYear, "year" | "priorHistoryDeclaration" | "externalTakeoverOpening"> {
  return {
    year: FY,
    priorHistoryDeclaration: { status, declaredAt: "2026-01-10T00:00:00.000Z" },
    ...(withOpening ? { externalTakeoverOpening: { sourceRef: "takeover-r2", opening: externalOpening() } } : {}),
  };
}

/** = ValidationDocumentStep : éligibilité puis routage dérivé passé à la carte. */
function routageFor(fy: ReturnType<typeof fiscalYearFacts>) {
  return derivePatrimonialRoutage(resolvePriorHistoryEligibility(fy, resolveExternalOpeningProofFromFiscalYear(fy)));
}

/** Réponses patrimoniales communes (hors ouverture). */
const ANSWERS: PatrimonialIntakeState = {
  ...EMPTY_PATRIMONIAL_INTAKE_STATE,
  bankMode: "DEDIE",
  closingCashRaw: "3000",
  apportsRaw: "200",
  prelevementsRaw: "700",
  subvention: "NON",
  autresElements: "NON",
};

/** = PatrimonialIntakeCard : état (éventuellement hérité) + routage dérivé → BilanInputs. */
function cardBilan(state: PatrimonialIntakeState, routage: ReturnType<typeof routageFor>): BilanInputs | undefined {
  return buildBilanPatrimonial(withDerivedRoutage(state, routage));
}

function generate(bilan: BilanInputs | undefined, opening: FiscalYearOpening | undefined, draft: DeclarationDraft = aliceDraft()) {
  const g = runDeclarationGeneration(draft, FY, undefined, bilan, draft.dispense2033A, undefined, opening);
  if (g.status !== "generated") return { status: g.status, anomalies: g.anomalies } as const;
  const c120 = g.liasseRfs.form2033A.cases.find((c) => c.caseId === "120");
  return { status: g.status, c120: c120?.value as number | undefined, g } as const;
}

/** Brouillon persisté AVANT R2 : Q0 = NATIF (ouverture 0, RAN NATIF). */
const LEGACY_NATIF = buildBilanPatrimonial({ ...ANSWERS, routage: "NATIF" })!;
/** Brouillon persisté AVANT R2 : Q0 = REPRISE avec 5 000 € / RAN 1 000 €. */
const LEGACY_REPRISE = buildBilanPatrimonial({ ...ANSWERS, routage: "REPRISE", ouvertureRepriseRaw: "5000", ranRepriseRaw: "1000" })!;

describe("R2 — l'ouverture patrimoniale suit l'antériorité déclarée", () => {
  it("RED (garde de génération) — Opening externe validée + ouverture NATIF héritée : jamais 120 = 0, BLOQUÉ", () => {
    assert.equal(LEGACY_NATIF.compteExploitant.ouverture, 0);
    const r = generate(LEGACY_NATIF, externalOpening());
    assert.equal(r.status, "blocked", "sur 2b3058b : généré avec 120 = 0");
    assert.ok(r.status === "blocked" && r.anomalies.some((a) => a.field === "bilanPatrimonial.ran"));
  });

  it("TEST A — EXTERNAL_HISTORY → REPRISE (Opening validée ou en attente) ; Q_OUV fait foi : 120 = 5 000 + 200 − 700 = 4 500", () => {
    assert.equal(routageFor(fiscalYearFacts("EXTERNAL_HISTORY", true)), "REPRISE");
    assert.equal(routageFor(fiscalYearFacts("EXTERNAL_HISTORY", false)), "REPRISE", "Opening pas encore validée : REPRISE aussi");
    const bilan = cardBilan({ ...ANSWERS, routage: "NATIF", ouvertureRepriseRaw: "5000", ranRepriseRaw: "1000" }, "REPRISE");
    assert.equal(bilan!.ran.situation, "IMPORTE");
    const r = generate(bilan, externalOpening());
    assert.equal(r.status, "generated");
    assert.equal(r.c120, 4500);
  });

  it("TEST B — FIRST_REAL_YEAR → NATIF, aucune question de reprise : 120 = 0 + 200 − 700 = −500", () => {
    assert.equal(routageFor(fiscalYearFacts("FIRST_REAL_YEAR", false)), "NATIF");
    const bilan = cardBilan(ANSWERS, "NATIF");
    assert.equal(bilan!.ran.situation, "NATIF");
    const r = generate(bilan, undefined);
    assert.equal(r.status, "generated");
    assert.equal(r.c120, -500);
  });

  it("TEST C — hérité EXTERNAL_HISTORY + NATIF : la dérivation l'emporte (REPRISE sans montant) → 120 non alimentée, jamais 0", () => {
    const restored = deriveIntakeStateFromBilanPatrimonial(LEGACY_NATIF);
    assert.equal(restored.routage, "NATIF", "précondition : Q0 hérité contradictoire");
    const bilan = cardBilan(restored, routageFor(fiscalYearFacts("EXTERNAL_HISTORY", true)));
    assert.equal(bilan!.compteExploitant.ouverture, undefined);
    const r = generate(bilan, externalOpening());
    assert.equal(r.status, "generated");
    assert.equal(r.c120, undefined, "case 120 non publiée (donnée absente), jamais 0");
    assert.ok(r.status === "generated" && r.g.liasseRfs.form2033A.casesNonAlimentees.some((c) => c.caseId === "120"));
  });

  it("TEST D — hérité FIRST_REAL_YEAR + REPRISE (5 000 / 1 000) : aucune ouverture historique, NATIF", () => {
    const bilan = cardBilan(deriveIntakeStateFromBilanPatrimonial(LEGACY_REPRISE), routageFor(fiscalYearFacts("FIRST_REAL_YEAR", false)));
    assert.equal(bilan!.compteExploitant.ouverture, 0);
    assert.deepEqual(bilan!.ran, { situation: "NATIF" });
    assert.equal(generate(bilan, undefined).c120, -500);
  });

  it("TEST E — sauvegarde / restauration : EXTERNAL_HISTORY reste REPRISE, les montants Q_OUV persistés sont restitués", () => {
    const fy = JSON.parse(JSON.stringify(fiscalYearFacts("EXTERNAL_HISTORY", true)));
    const persisted: BilanInputs = JSON.parse(JSON.stringify(cardBilan({ ...ANSWERS, ouvertureRepriseRaw: "5000", ranRepriseRaw: "1000" }, routageFor(fy))));
    const bilan = cardBilan(deriveIntakeStateFromBilanPatrimonial(persisted), routageFor(fy));
    assert.equal(routageFor(fy), "REPRISE");
    assert.equal(bilan!.compteExploitant.ouverture, 5000);
    assert.deepEqual(bilan!.ran, { situation: "IMPORTE", importedRAN: 1000 });
  });

  it("TEST F — N → N+1 : la clôture externe (REPRISE) porte 4 500, reprise telle quelle comme ouverture N+1", () => {
    const bilan = cardBilan({ ...ANSWERS, ouvertureRepriseRaw: "5000", ranRepriseRaw: "1000" }, "REPRISE");
    const r = generate(bilan, externalOpening());
    assert.ok(r.status === "generated" && r.g.rfs.patrimoine);
    if (r.status !== "generated" || !r.g.rfs.patrimoine) return;
    const closure = buildFiscalYearClosure({
      fiscalYearId: "fy-2025",
      stocks: { deficits: [], amortissementsReportes: 0 } as never,
      computedAt: "2026-04-01T00:00:00.000Z",
      now: "2026-04-01T00:00:00.000Z",
      patrimoine: { state: r.g.rfs.patrimoine, ranSituation: bilan!.ran.situation },
    });
    assert.equal(closure.patrimoine?.compteExploitantAvantAffectationResultat, 4500);
    assert.equal(closure.patrimoine?.ranSituation, "IMPORTE");
    const ouvertureN1 = resolveOuvertureCompteExploitantNPlusUn({
      cloture120N: closure.patrimoine!.compteExploitantAvantAffectationResultat,
      resultatComptableN: closure.patrimoine!.resultatComptableExercice,
    });
    assert.equal(ouvertureN1, round2(4500 + (closure.patrimoine!.resultatComptableExercice ?? 0)));
  });

  it("TEST G — 2033-A dû : EXTERNAL_HISTORY sans montant Q_OUV → 120 non alimentée (contrôle existant), jamais 0", () => {
    const r = generate(cardBilan(ANSWERS, "REPRISE"), externalOpening());
    assert.equal(r.status, "generated");
    assert.equal(r.c120, undefined);
  });

  it("TEST H — 2033-A dispensé (CA N-1 20 000 € < 61 000 €, dispense choisie) : aucune ouverture exigée, garde sans objet", () => {
    const draft = aliceDraft(undefined, { dispense2033A: { caReferenceN1Declaree: 20000, decision: "USE_DISPENSE" } });
    assert.equal(generate(cardBilan(ANSWERS, "REPRISE"), externalOpening(), draft).status, "generated");
    assert.equal(generate(LEGACY_NATIF, externalOpening(), draft).status, "generated", "2033-A non produit : pas de blocage inutile");
  });

  it("continuité Fiscal AI prouvée → REPRISE (jamais 0 par défaut) ; antériorité non établie → aucun routage", () => {
    assert.equal(derivePatrimonialRoutage({ eligible: true, status: "NATIVE_CONTINUITY", basis: "proven_by_data" }), "REPRISE");
    assert.equal(derivePatrimonialRoutage({ eligible: false, status: "UNKNOWN", reason: "ANSWER_REQUIRED", needsAnswer: true }), undefined);
    assert.equal(buildBilanPatrimonial(withDerivedRoutage(ANSWERS, undefined)), undefined);
  });

  it("carte et écran : Q0 n'est plus posée, le routage vient de l'antériorité (aucune nouvelle question)", () => {
    const card = readFileSync(path.join(process.cwd(), "src/components/lmnp/documents/PatrimonialIntakeCard.tsx"), "utf8");
    assert.doesNotMatch(card, /patch\(\{ routage:/, "plus aucun bouton Q0");
    assert.match(card, /buildBilanPatrimonial\(withDerivedRoutage\(state, routage\)\)/);
    const step = readFileSync(path.join(process.cwd(), "src/components/lmnp/documents/ValidationDocumentStep.tsx"), "utf8");
    assert.match(step, /routage=\{derivePatrimonialRoutage\(priorHistory\)\}/);
  });
});

function round2(n: number) {
  return Math.round(n * 100) / 100;
}
