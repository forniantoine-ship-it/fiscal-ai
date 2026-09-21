/**
 * G1-P1 — branchement réel de la continuité patrimoniale (compte exploitant /
 * RAN) N → N+1. Miroir exact de `stocks-ouverture-n-plus-1.test.ts` : teste
 * la CHAÎNE RÉELLE, pas les fonctions pures isolément.
 *
 *   draft N (bilanPatrimonial + rfs.patrimoine résolu)
 *     → closeFiscalYear() → FiscalYearClosure.patrimoine
 *     → persistFiscalYearClosureAndTransition() → resolvePatrimoineOuvertureNPlusUn()
 *     → FiscalYear(N+1).patrimoineOuverture (persisté IndexedDB, survit à un
 *       refresh) → PatrimonialIntakeCard / buildBilanPatrimonial() → cases 120/134
 *
 * Exemple numérique de référence (imposé) :
 *   ouverture N = 1000, apports N = 500, prélèvements N = 200, résultat N = 3000
 *   → 120(N) = 1300 (n'inclut PAS le résultat)
 *   → ouverture 120(N+1) = 1300 + 3000 = 4300
 *
 * Run: npx tsx --test --env-file=.env.local src/lib/lmnp/store/patrimoine-ouverture-n-plus-1.test.ts
 */
import "fake-indexeddb/auto";
(globalThis as unknown as { window: unknown }).window = globalThis;

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { persistFiscalYearClosureAndTransition } from "./dossier-db";
import { getFiscalYearRecord } from "./db";
import type { FiscalYearRecord } from "./dossier-db";
import type { PersistedWorkspace } from "./persistence";
import type { DeclarationDraft, FiscalEngineOutput, FiscalYear } from "../types/domain";
import { resolvePatrimoineOuvertureNPlusUn } from "../services/dossier/fiscal-year-cycle";
import {
  buildBilanPatrimonial,
  EMPTY_PATRIMONIAL_INTAKE_STATE,
  type PatrimonialIntakeState,
} from "../services/declaration/patrimonial-intake";
import { assemblePatrimoine } from "@/runtime/capabilities/bilan/assemble-patrimoine";
import { buildFiscalRepresentation } from "@/runtime/capabilities/rfs/build-fiscal-representation";
import { map2033AFromRfs } from "@/runtime/capabilities/rfs/projection/map-2033a";
import type { BilanInputs } from "@/runtime/capabilities/bilan/types";
import type { FiscalResult } from "@/runtime/capabilities/f006/types";
import type { IdentiteDeclarante } from "@/runtime/capabilities/f007/types";
import type { FiscalRepresentation } from "@/runtime/capabilities/rfs/types";

let idCounter = 0;
function uid(prefix: string): string {
  idCounter += 1;
  return `${prefix}-${idCounter}`;
}

const IDENTITE: IdentiteDeclarante = { siren: "104545108", siret: "10454510800011", denomination: "G1-P1 continuité" };

function fiscalResultFull(overrides: Partial<FiscalResult> = {}): FiscalResult {
  return {
    exercice: 2025,
    recettes: { total: 9000 },
    charges: { totalDeductible: 2000, chargesExploitation: 2000, chargesFinancement: 0, chargesPreExploitation: 0, totalNonDeductible: 0 },
    resultatAvantAmort: 3000,
    amortCalcule: 0,
    amortDeduct: 0,
    amortReporte: 0,
    amortNonDeduitExercice: 0,
    amortReportesUtilises: 0,
    resultatFiscal: 3000,
    deficitNouveau: 0,
    deficitsImputes: 0,
    perteExceptionnelle: 0,
    stocks: { deficits: [], amortissementsReportes: 0, deficitsExpires: [] },
    trace: { ksArtifacts: ["TRF-0032"], computedAt: "2026-09-06T00:00:00.000Z", journal: [] },
    status: "computed",
    anomalies: [],
    ...overrides,
  };
}

function engineOutput(overrides: Partial<FiscalEngineOutput> = {}): FiscalEngineOutput {
  return {
    exercice: 2025,
    resultatFiscal: 3000,
    resultatAvantAmort: 3000,
    totalRecettes: 9000,
    totalCharges: 2000,
    amortDeduct: 0,
    amortReporte: 0,
    amortNonDeduitExercice: 0,
    deficitNouveau: 0,
    stocks: { deficits: [], amortissementsReportes: 0 },
    trace: { ksArtifacts: [], computedAt: "2026-09-06T00:00:00.000Z", journal: [] },
    computedAt: "2026-09-06T00:00:00.000Z",
    ...overrides,
  };
}

/** Construit rfs.patrimoine réel (via assemblePatrimoine(), jamais un PatrimonialState inventé à la main). */
function rfsAvecPatrimoine(bilanInputs: BilanInputs, fiscalResultOverrides: Partial<FiscalResult> = {}): FiscalRepresentation {
  const fiscalResult = fiscalResultFull(fiscalResultOverrides);
  const rfsSansPatrimoine = buildFiscalRepresentation({ fiscalResult, identite: IDENTITE });
  const patrimoine = assemblePatrimoine(rfsSansPatrimoine, bilanInputs);
  return buildFiscalRepresentation({ fiscalResult, identite: IDENTITE, patrimoine });
}

function readyWorkspace(overrides: {
  fiscalYearId?: string;
  fiscalYearOverrides?: Partial<FiscalYear>;
  fiscalResultOverrides?: Partial<FiscalEngineOutput>;
  bilanPatrimonial?: BilanInputs;
  rfsFiscalResultOverrides?: Partial<FiscalResult>;
} = {}): PersistedWorkspace {
  const fiscalYearId = overrides.fiscalYearId ?? uid("fy");
  const propertyId = uid("prop");
  const draft: DeclarationDraft = {
    completedSteps: [],
    siren: "104545108",
    fiscalResult: engineOutput(overrides.fiscalResultOverrides),
    bilanPatrimonial: overrides.bilanPatrimonial,
    rfs: overrides.bilanPatrimonial
      ? rfsAvecPatrimoine(overrides.bilanPatrimonial, overrides.rfsFiscalResultOverrides)
      : undefined,
  };
  return {
    fiscalYear: {
      id: fiscalYearId,
      year: 2025,
      status: "ready_to_close",
      regime: "reel",
      propertyIds: [propertyId],
      declarationGeneratedAt: "2026-09-06T00:00:00.000Z",
      createdAt: "2025-01-01T00:00:00.000Z",
      updatedAt: "2025-01-01T00:00:00.000Z",
      closures: [],
      ...overrides.fiscalYearOverrides,
    },
    properties: [{ id: propertyId, label: "Mon bien", address: "1 rue X", city: "Lyon", postalCode: "69000" }],
    documents: [],
    extractions: [],
    validationItems: [],
    ledgerEntries: [],
    declarationDraft: draft,
  };
}

/** Réponses NATIF minimales (Q1/Q2/Q3/Q4) pour construire un BilanInputs exploitable — cf. exemple numérique imposé. */
function natifAvec(compteExploitant: { ouverture?: number; apports: number; prelevements: number }): BilanInputs {
  const state: PatrimonialIntakeState = {
    ...EMPTY_PATRIMONIAL_INTAKE_STATE,
    routage: "NATIF",
    apportsRaw: String(compteExploitant.apports),
    prelevementsRaw: String(compteExploitant.prelevements),
    subvention: "NON",
    autresElements: "NON",
  };
  const built = buildBilanPatrimonial(state);
  if (!built) throw new Error("unreachable — routage NATIF toujours constructible");
  // NATIF force ouverture=0 par construction (G1-P0) : pour le cas "ouverture N=1000"
  // de l'exemple imposé (dossier dont l'ouverture N a été saisie manuellement lors
  // d'une reprise antérieure), on écrase explicitement ce seul champ — cf. test dédié.
  if (compteExploitant.ouverture !== undefined) {
    built.compteExploitant.ouverture = compteExploitant.ouverture;
  }
  return built;
}

function importeAvec(ran: { valeur: number }, compteExploitant: { ouverture: number; apports: number; prelevements: number }): BilanInputs {
  return {
    tresorerie: { bankMode: "INCONNU" },
    compteExploitant: { ouverture: compteExploitant.ouverture, apports: compteExploitant.apports, prelevements: compteExploitant.prelevements },
    ran: { situation: "IMPORTE", importedRAN: ran.valeur },
    subventionsInvestissement: { status: "NUL_CONFIRME" },
    lignesSimples: undefined,
    tiers: undefined,
  };
}

describe("G1-P1 — A. premier exercice natif : aucune continuité, comportement G1-P0 inchangé", () => {
  it("un FiscalYear frais (aucun previousFiscalYearId, jamais passé par une transition) ne porte structurellement aucun patrimoineOuverture", () => {
    // `persistFiscalYearClosureAndTransition()` est par construction une
    // fonction de TRANSITION (elle produit toujours un N+1 dont
    // previousFiscalYearId pointe vers N) : elle ne peut donc jamais servir à
    // modéliser "aucun exercice antérieur" — exactement comme
    // stocks-ouverture-n-plus-1.test.ts teste ce cas en appelant
    // runDeclarationGeneration() SANS 3e argument, jamais via la persistance.
    const fresh: FiscalYear = {
      id: "fy-fresh",
      year: 2025,
      status: "draft",
      regime: "reel",
      propertyIds: ["prop-1"],
      createdAt: "2025-01-01T00:00:00.000Z",
      updatedAt: "2025-01-01T00:00:00.000Z",
    };
    assert.equal(fresh.patrimoineOuverture, undefined);
    assert.equal(resolvePatrimoineOuvertureNPlusUn(fresh, undefined).status, "unavailable");
  });

  it("buildBilanPatrimonial() sans continuité (routage NATIF) : ouverture=0/RAN=0 comme avant G1-P1, aucune régression G1-P0", () => {
    const state: PatrimonialIntakeState = { ...EMPTY_PATRIMONIAL_INTAKE_STATE, routage: "NATIF", apportsRaw: "0", prelevementsRaw: "0" };
    const built = buildBilanPatrimonial(state);
    assert.equal(built?.compteExploitant.ouverture, 0);
    assert.deepEqual(built?.ran, { situation: "NATIF" });
  });
});

describe("G1-P1 — B. compte exploitant N → N+1 (exemple numérique imposé)", () => {
  it("ouverture N=1000, apports N=500, prélèvements N=200, résultat N=3000 → 120(N)=1300, ouverture(N+1)=4300", async () => {
    const dossierId = uid("dossier");
    const userId = uid("user");
    const bilanPatrimonialN = natifAvec({ ouverture: 1000, apports: 500, prelevements: 200 });
    const workspace = readyWorkspace({
      bilanPatrimonial: bilanPatrimonialN,
      rfsFiscalResultOverrides: { resultatAvantAmort: 3000, amortCalcule: 0, charges: { totalDeductible: 2000, chargesExploitation: 2000, chargesFinancement: 0, chargesPreExploitation: 0, totalNonDeductible: 0 } },
    });

    // Vérifie d'abord que 120(N) = 1300 (n'inclut PAS le résultat de 3000).
    const patrimoineN = workspace.declarationDraft?.rfs?.patrimoine;
    assert.equal(patrimoineN?.compteExploitant.clotureN, 1300, "120(N) ne doit jamais inclure le résultat comptable N (3000)");
    assert.equal(patrimoineN?.resultatComptable, 3000);

    const result = await persistFiscalYearClosureAndTransition({ dossierId, userId, workspace, now: "2026-09-06T00:00:00.000Z" });

    // La closure de N porte bien les deux valeurs SÉPARÉES, jamais fusionnées.
    const closureN = result.closedFiscalYear.closures?.[result.closedFiscalYear.closures.length - 1];
    assert.deepEqual(closureN?.patrimoine, {
      compteExploitantAvantAffectationResultat: 1300,
      resultatComptableExercice: 3000,
      ranSituation: "NATIF",
      ranValeur: 0,
    });

    // Ouverture N+1 = 1300 + 3000 = 4300, jamais 1300 seul (résultat perdu) ni un double comptage.
    assert.ok(result.nextFiscalYear.patrimoineOuverture, "N+1 doit porter une continuité patrimoniale");
    assert.equal(result.nextFiscalYear.patrimoineOuverture?.ouvertureCompteExploitant, 4300);
    assert.notEqual(result.nextFiscalYear.patrimoineOuverture?.ouvertureCompteExploitant, 1300, "le résultat N ne doit jamais être perdu");
    assert.notEqual(result.nextFiscalYear.patrimoineOuverture?.ouvertureCompteExploitant, 7300, "le résultat N ne doit jamais être compté deux fois (1300+3000+3000)");
  });
});

describe("G1-P1 — C. RAN N → N+1 : report identitaire, aucun calcul", () => {
  it("RAN N = IMPORTE/4521.37 → RAN N+1 = IMPORTE/4521.37, sans transformation", async () => {
    const dossierId = uid("dossier");
    const userId = uid("user");
    const bilanPatrimonialN = importeAvec({ valeur: 4521.37 }, { ouverture: 30000, apports: 0, prelevements: 0 });
    const workspace = readyWorkspace({ bilanPatrimonial: bilanPatrimonialN });

    const result = await persistFiscalYearClosureAndTransition({ dossierId, userId, workspace, now: "2026-09-06T00:00:00.000Z" });

    assert.deepEqual(result.nextFiscalYear.patrimoineOuverture?.ran, { situation: "IMPORTE", valeur: 4521.37 });
    // Le résultat N (3000 par défaut de la fixture) ne doit JAMAIS s'ajouter au RAN
    // (contrairement au compte exploitant) — NATIF + résultat N ≠ nouveau RAN.
    assert.notEqual(result.nextFiscalYear.patrimoineOuverture?.ran.valeur, 4521.37 + 3000);
  });
});

describe("G1-P1 — combinaison compte exploitant + RAN dans une seule closure", () => {
  it("les deux continuités sont résolues indépendamment et correctement dans le même appel", async () => {
    const dossierId = uid("dossier");
    const userId = uid("user");
    const workspace = readyWorkspace({
      bilanPatrimonial: importeAvec({ valeur: 4521.37 }, { ouverture: 1000, apports: 500, prelevements: 200 }),
      rfsFiscalResultOverrides: { resultatAvantAmort: 3000, amortCalcule: 0, charges: { totalDeductible: 2000, chargesExploitation: 2000, chargesFinancement: 0, chargesPreExploitation: 0, totalNonDeductible: 0 } },
    });

    const result = await persistFiscalYearClosureAndTransition({ dossierId, userId, workspace, now: "2026-09-06T00:00:00.000Z" });

    assert.equal(result.nextFiscalYear.patrimoineOuverture?.ouvertureCompteExploitant, 4300);
    assert.deepEqual(result.nextFiscalYear.patrimoineOuverture?.ran, { situation: "IMPORTE", valeur: 4521.37 });
  });
});

describe("G1-P1 — D. reprise historique", () => {
  it("ouverture connue (Q_OUV renseignée pour N, dossier lui-même une reprise) → continuité N+1 dérivée normalement", async () => {
    const dossierId = uid("dossier");
    const userId = uid("user");
    const workspace = readyWorkspace({
      bilanPatrimonial: importeAvec({ valeur: 1200 }, { ouverture: 42000, apports: 0, prelevements: 0 }),
    });

    const result = await persistFiscalYearClosureAndTransition({ dossierId, userId, workspace, now: "2026-09-06T00:00:00.000Z" });

    assert.ok(result.nextFiscalYear.patrimoineOuverture, "une reprise dont l'exercice N a réellement résolu son patrimoine doit produire une continuité N+1 exploitable");
    assert.equal(result.nextFiscalYear.patrimoineOuverture?.ouvertureCompteExploitant, 42000 + 3000);
    assert.deepEqual(result.nextFiscalYear.patrimoineOuverture?.ran, { situation: "IMPORTE", valeur: 1200 });
  });

  it("ouverture inconnue (bilanPatrimonial jamais renseigné pour N) → N+1 reste INCONNU, jamais 0", async () => {
    const dossierId = uid("dossier");
    const userId = uid("user");
    const workspace = readyWorkspace(); // bilanPatrimonial absent

    const result = await persistFiscalYearClosureAndTransition({ dossierId, userId, workspace, now: "2026-09-06T00:00:00.000Z" });

    assert.equal(result.closedFiscalYear.closures?.[result.closedFiscalYear.closures.length - 1]?.patrimoine, undefined);
    assert.equal(result.nextFiscalYear.patrimoineOuverture, undefined, "absence de donnée patrimoniale sur N ⇒ jamais un 0 inventé sur N+1");
  });
});

describe("G1-P1 — gardes de continuité (mêmes 6 conditions que resolveStocksOuverture, non affaiblies)", () => {
  const now = "2026-09-06T00:00:00.000Z";
  const closureN = {
    id: "closure-1",
    fiscalYearId: "fy-N",
    dossierId: "dossier-1",
    stocks: { deficits: [], amortissementsReportes: 0 },
    patrimoine: { compteExploitantAvantAffectationResultat: 1300, resultatComptableExercice: 3000, ranSituation: "NATIF" as const, ranValeur: 0 },
    computedAt: now,
    closedAt: now,
  };
  const closedN: FiscalYear = {
    id: "fy-N",
    year: 2025,
    status: "closed",
    regime: "reel",
    propertyIds: ["prop-1"],
    dossierId: "dossier-1",
    createdAt: now,
    updatedAt: now,
    closures: [closureN],
  };

  it("mauvais dossier → jamais de continuité héritée", () => {
    const nPlus1AutreDossier: FiscalYear = { ...closedN, id: "fy-N+1", year: 2026, dossierId: "dossier-AUTRE", previousFiscalYearId: "fy-N", closures: [] };
    assert.equal(resolvePatrimoineOuvertureNPlusUn(nPlus1AutreDossier, closedN).status, "unavailable");
  });

  it("exercice précédent non adjacent (N-2 au lieu de N-1) → unavailable", () => {
    const nMoins2: FiscalYear = { ...closedN, id: "fy-N-2", year: 2023 };
    const nPlus1NonAdjacent: FiscalYear = { ...closedN, id: "fy-N+1", year: 2026, dossierId: "dossier-1", previousFiscalYearId: "fy-N-2", closures: [] };
    assert.equal(resolvePatrimoineOuvertureNPlusUn(nPlus1NonAdjacent, nMoins2).status, "unavailable");
  });

  it("N non clôturé → unavailable même avec une closure présente en mémoire", () => {
    const nNonClos: FiscalYear = { ...closedN, status: "ready_to_close" };
    const nPlus1SurNNonClos: FiscalYear = { ...closedN, id: "fy-N+1", year: 2026, dossierId: "dossier-1", previousFiscalYearId: "fy-N", closures: [] };
    assert.equal(resolvePatrimoineOuvertureNPlusUn(nPlus1SurNNonClos, nNonClos).status, "unavailable");
  });

  it("closure exploitable mais SANS patrimoine (intake G1-P0 non renseigné) → unavailable, raison explicite", () => {
    const closureSansPatrimoine = { ...closureN, patrimoine: undefined };
    const nSansPatrimoine: FiscalYear = { ...closedN, closures: [closureSansPatrimoine] };
    const nPlus1: FiscalYear = { ...closedN, id: "fy-N+1", year: 2026, dossierId: "dossier-1", previousFiscalYearId: "fy-N", closures: [] };
    const resolved = resolvePatrimoineOuvertureNPlusUn(nPlus1, nSansPatrimoine);
    assert.equal(resolved.status, "unavailable");
    if (resolved.status === "unavailable") {
      assert.match(resolved.reason, /aucune donnée patrimoniale/i);
    }
  });

  it("cas nominal — provenance et sourceClosureId corrects", () => {
    const nPlus1: FiscalYear = { ...closedN, id: "fy-N+1", year: 2026, dossierId: "dossier-1", previousFiscalYearId: "fy-N", closures: [] };
    const resolved = resolvePatrimoineOuvertureNPlusUn(nPlus1, closedN);
    assert.equal(resolved.status, "available");
    if (resolved.status === "available") {
      assert.equal(resolved.sourceClosureId, "closure-1");
      assert.equal(resolved.ouvertureCompteExploitant, 4300);
      assert.deepEqual(resolved.ran, { situation: "NATIF", valeur: 0 });
    }
  });
});

describe("G1-P1 — sourceClosureId identifie précisément la closure d'origine", () => {
  it("sourceClosureId correspond exactement à l'id de la dernière closure de N, survit à la relecture IndexedDB", async () => {
    const dossierId = uid("dossier");
    const userId = uid("user");
    const workspace = readyWorkspace({ bilanPatrimonial: natifAvec({ apports: 0, prelevements: 0 }) });

    const result = await persistFiscalYearClosureAndTransition({ dossierId, userId, workspace, now: "2026-09-06T00:00:00.000Z" });
    const closureId = result.closedFiscalYear.closures?.[result.closedFiscalYear.closures.length - 1]?.id;
    assert.equal(result.nextFiscalYear.patrimoineOuverture?.sourceClosureId, closureId);

    const archivedNPlus1 = await getFiscalYearRecord<FiscalYearRecord>(result.nextFiscalYear.id);
    assert.deepEqual(archivedNPlus1?.patrimoineOuverture, result.nextFiscalYear.patrimoineOuverture);
  });
});

describe("G1-P1 — propagation jusqu'aux cases 2033-A (120/134)", () => {
  it("PatrimonialIntakeCard (via buildBilanPatrimonial avec continuité) → 120 et 134 publiées avec les valeurs dérivées, jamais un DECLARE utilisateur", async () => {
    const dossierId = uid("dossier");
    const userId = uid("user");
    const workspace = readyWorkspace({
      bilanPatrimonial: natifAvec({ ouverture: 1000, apports: 500, prelevements: 200 }),
      rfsFiscalResultOverrides: { resultatAvantAmort: 3000, amortCalcule: 0, charges: { totalDeductible: 2000, chargesExploitation: 2000, chargesFinancement: 0, chargesPreExploitation: 0, totalNonDeductible: 0 } },
    });
    const result = await persistFiscalYearClosureAndTransition({ dossierId, userId, workspace, now: "2026-09-06T00:00:00.000Z" });
    const continuite = result.nextFiscalYear.patrimoineOuverture;
    assert.ok(continuite);
    if (!continuite) return;

    // Exactement ce que fait PatrimonialIntakeCard.tsx : continuite fournie ⇒
    // Q0/Q_OUV jamais posées, mais Q2 (apports/prélèvements DE N+1, un NOUVEAU
    // flux, jamais celui de N) répondue normalement.
    const stateNPlus1: PatrimonialIntakeState = {
      ...EMPTY_PATRIMONIAL_INTAKE_STATE,
      continuite,
      apportsRaw: "0",
      prelevementsRaw: "0",
      subvention: "NON",
      autresElements: "NON",
    };
    const bilanPatrimonialNPlus1 = buildBilanPatrimonial(stateNPlus1);
    assert.ok(bilanPatrimonialNPlus1);
    if (!bilanPatrimonialNPlus1) return;

    // L'ouverture N+1 est bien DERIVE (4300), jamais redemandée/déclarée.
    assert.equal(bilanPatrimonialNPlus1.compteExploitant.ouverture, 4300);
    assert.equal(bilanPatrimonialNPlus1.ran.situation, "NATIF");

    const rfsNPlus1 = buildFiscalRepresentation({
      fiscalResult: fiscalResultFull({ exercice: 2026, resultatAvantAmort: 1000, resultatFiscal: 1000 }),
      identite: IDENTITE,
      patrimoine: assemblePatrimoine(
        buildFiscalRepresentation({ fiscalResult: fiscalResultFull({ exercice: 2026, resultatAvantAmort: 1000, resultatFiscal: 1000 }), identite: IDENTITE }),
        bilanPatrimonialNPlus1,
      ),
    });
    const form = map2033AFromRfs(rfsNPlus1);
    assert.equal(form.cases.find((c) => c.caseId === "120")?.value, 4300, "case 120 de N+1 doit refléter l'ouverture dérivée de la clôture N");
    assert.equal(form.cases.find((c) => c.caseId === "134")?.value, 0, "RAN NATIF reste 0, jamais recalculé depuis le résultat");
  });
});

describe("G1-P1 — aucune double comptabilisation sur 3 exercices (N → N+1 → N+2)", () => {
  it("N+2 reflète la clôture de N+1, jamais un cumul avec N", async () => {
    const dossierId = uid("dossier");
    const userId = uid("user");
    const workspaceN = readyWorkspace({ bilanPatrimonial: natifAvec({ ouverture: 1000, apports: 500, prelevements: 200 }) });
    const resultN = await persistFiscalYearClosureAndTransition({ dossierId, userId, workspace: workspaceN, now: "2026-09-06T00:00:00.000Z" });
    assert.equal(resultN.nextFiscalYear.patrimoineOuverture?.ouvertureCompteExploitant, 4300);

    // N+1 travaillé et clôturé avec SES PROPRES flux (apports 100, prélèvements 50).
    const bilanPatrimonialNPlus1: BilanInputs = {
      tresorerie: { bankMode: "INCONNU" },
      compteExploitant: { ouverture: resultN.nextFiscalYear.patrimoineOuverture!.ouvertureCompteExploitant, apports: 100, prelevements: 50 },
      ran: { situation: "NATIF" },
      subventionsInvestissement: { status: "NUL_CONFIRME" },
    };
    const workspaceNPlus1: PersistedWorkspace = {
      ...resultN.nextWorkspace,
      fiscalYear: { ...resultN.nextFiscalYear, status: "ready_to_close", declarationGeneratedAt: "2027-05-01T00:00:00.000Z" },
      declarationDraft: {
        ...resultN.nextWorkspace.declarationDraft,
        fiscalResult: engineOutput({ exercice: 2026 }),
        bilanPatrimonial: bilanPatrimonialNPlus1,
        rfs: rfsAvecPatrimoine(bilanPatrimonialNPlus1, { exercice: 2026, resultatAvantAmort: 500, resultatFiscal: 500 }),
      },
    };
    const resultNPlus1 = await persistFiscalYearClosureAndTransition({ dossierId, userId, workspace: workspaceNPlus1, now: "2027-09-06T00:00:00.000Z" });

    // 120(N+1) = 4300 + 100 - 50 = 4350 ; ouverture(N+2) = 4350 + 500 = 4850.
    // Jamais un cumul incluant le résultat de N (3000) une deuxième fois.
    assert.equal(resultNPlus1.nextFiscalYear.patrimoineOuverture?.ouvertureCompteExploitant, 4850);
  });
});
