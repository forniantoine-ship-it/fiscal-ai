/**
 * R2C.3c2c — FRAÎCHEUR / DÉRIVE d'une déclaration en scoped multi. Principe inchangé, AUCUN hash/fingerprint :
 *   A. le reducer efface `declarationGeneratedAt` à l'écriture contributive ;
 *   B. un preview recalculé (service workspace) est comparé au résultat stocké.
 * Le multi est évalué techniquement mais reste USER-BLOCKED (canGenerate / canCheckout / canRetryAfterPayment toujours false).
 * Mono et scoped mono : fraîcheur strictement historique.
 *
 * Run: npx tsx --test src/lib/lmnp/services/declaration/r2c3c2c-multi-freshness.test.ts
 */
import "@/lab/v2-dossier/test-public-env";
import { CONFIRMED_ATTESTATIONS } from "./multi-property-test-support";
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it, mock } from "node:test";

import { MULTI_PROPERTY_CAPABILITIES } from "@/lib/lmnp/dossier/multi-property-activation";
import { resolveDeclarationGenerationGate, immobilisationsParBienSemanticProjection } from "@/lib/lmnp/services/declaration/declaration-generation-gate";
import { resolveDeclarationOutOfDate } from "@/lib/lmnp/services/declaration/declaration-freshness";
import { runDeclarationGenerationFromWorkspace } from "@/lib/lmnp/services/declaration/generation-workspace";
import { resolveImmobilisationsContinuityForGeneration } from "@/lib/lmnp/services/dossier/fiscal-year-cycle";
import { resolvePersistedExternalTakeoverOpening } from "@/lib/lmnp/services/declaration/prior-history-eligibility";
import { lmnpReducer, type LmnpAction, type LmnpState } from "@/lib/lmnp/store/reducer";
import type { PersistedWorkspace } from "@/lib/lmnp/store/persistence";
import type { BilanInputs } from "@/runtime/capabilities/bilan/types";

const ROOT = process.cwd();
const BASELINE = "283ce277429a10510d7cb6ecc6861552bf5de92c";
const Y = 2026;
const T = "2026-01-01T00:00:00.000Z";
const FIXED = Date.parse("2026-06-01T12:00:00.000Z");
const A = "home-1";
const B = "bien-b";
const SIRET = "12345678900012";
const clone = <V>(value: V): V => JSON.parse(JSON.stringify(value));

function withFixedClock<V>(run: () => V): V {
  mock.timers.enable({ apis: ["Date"], now: FIXED });
  try {
    return run();
  } finally {
    mock.timers.reset();
  }
}

// ---------------------------------------------------------------------------
// Fixtures : deux biens natifs générables, données explicitement property-scoped.
// ---------------------------------------------------------------------------

type BienSpec = {
  date?: string;
  recettes: number;
  cats: Record<string, number>;
  credit: "present" | "none" | "unknown";
  pretIds?: string[];
  interets?: number;
  creditDocumentId?: string;
  dotations: number;
  plan: { lignes: Array<Record<string, unknown>>; totalAnnuelExercice: number; totalBrut: number };
  valeurTerrain: number;
  montantMobilier: number;
};

const PLAN_A = {
  lignes: [
    { id: "gros-oeuvre", label: "Gros œuvre", montant: 100000, dureeAnnees: 50, dotationExercice: 1420.01, amortissementsCumules: 1420.01 },
    { id: "facades", label: "Façades", montant: 70000, dureeAnnees: 25, dotationExercice: 1988.2, amortissementsCumules: 1988.2 },
    { id: "mobilier", label: "Mobilier", montant: 8000, dureeAnnees: 5, dotationExercice: 1136.0, amortissementsCumules: 1136.0 },
  ],
  totalAnnuelExercice: 4544.21,
  totalBrut: 178000,
};
const PLAN_B = {
  lignes: [
    { id: "gros-oeuvre", label: "Gros œuvre", montant: 60000, dureeAnnees: 50, dotationExercice: 500, amortissementsCumules: 500 },
    { id: "mobilier", label: "Mobilier", montant: 5000, dureeAnnees: 5, dotationExercice: 400, amortissementsCumules: 400 },
  ],
  totalAnnuelExercice: 900,
  totalBrut: 65000,
};

const SPEC_A: BienSpec = {
  date: "2026-04-15", recettes: 14321.09, cats: { taxe_fonciere: 1200.11, copropriete: 2256.67 }, credit: "present", interets: 2100.13,
  dotations: 4544.21, plan: PLAN_A, valeurTerrain: 30000, montantMobilier: 8000,
};
const SPEC_B: BienSpec = {
  date: "2026-06-10", recettes: 9000.2, cats: { taxe_fonciere: 500.05, assurance_pno: 300.1 }, credit: "present", interets: 310.27,
  dotations: 900, plan: PLAN_B, valeurTerrain: 12000, montantMobilier: 5000,
};

function bienOf(propertyId: string, spec: BienSpec): Record<string, unknown> {
  const charges = Object.values(spec.cats).reduce((sum, value) => Math.round((sum + value) * 100) / 100, 0);
  return {
    propertyId,
    completedSteps: [],
    ...(spec.date !== undefined ? { dateMiseEnService: spec.date } : {}),
    revenusAssistant: { exerciceFiscal: Y, totalRecettes: spec.recettes, loyersEncaisses: spec.recettes, fieldSources: {}, computedAt: T },
    chargesAssistant: { exerciceFiscal: Y, totalDeductible: charges, totalPreExploitation: 0, totalNonDeductible: 0, totalAmortissable: 0, parCategorie: spec.cats, composantsNouveaux: [], fieldSources: {}, computedAt: T },
    ...(spec.credit === "present"
      ? {
          financementCharges: {
            exerciceFiscal: Y, totalInteretsEmprunt: spec.interets ?? 0, totalInteretsPreExploitation: 0, totalAssurance: 0,
            totalAssurancePreExploitation: 0, totalCapitalRembourse: 0, totalChargesFinancementExercice: spec.interets ?? 0,
            prets: (spec.pretIds ?? ["loan-1"]).map((pretId) => ({
              pretId, typePret: "amortissable", interetsEmpruntExercice: (spec.interets ?? 0) / (spec.pretIds?.length ?? 1), interetsPreExploitation: 0,
              assuranceEmpruntExercice: 0, assurancePreExploitation: 0, capitalRembourseExercice: 0, capitalRestantDu31_12: 1000, fraisDossierDeductibles: 0, garantieDeductible: 0, iraDeductible: 0,
            })),
            fieldSources: {}, computedAt: T,
          },
        }
      : {}),
    ...(spec.credit === "none" ? { creditDeclaredNoneAt: T } : {}),
    ...(spec.creditDocumentId ? { creditDocumentId: spec.creditDocumentId } : {}),
    amortissementAssistant: { exerciceFiscal: Y, totalDotations: spec.dotations, status: "validated" },
    logementAmortissement: {
      exerciceFiscal: Y, prixRevient: 0, fraisEnCharges: 0, valeurTerrain: spec.valeurTerrain, valeurBati: 0, baseAmortissableBati: 0,
      montantMobilier: spec.montantMobilier, dotationAnnuelle: spec.dotations, dureeMoyenneAnnees: 30, prorataRatio: 1,
      plan: spec.plan, fieldSources: {}, computedAt: T,
    },
  };
}

type WorkspaceOptions = {
  specs?: Array<[string, BienSpec]>;
  fiscalYear?: Record<string, unknown>;
  root?: Record<string, unknown>;
  bienOverrides?: Record<string, Record<string, unknown>>;
};

function multiWorkspace(options: WorkspaceOptions = {}): PersistedWorkspace {
  const specs = options.specs ?? [[A, SPEC_A], [B, SPEC_B]];
  const biens = Object.fromEntries(specs.map(([id, spec]) => [id, { ...bienOf(id, spec), ...(options.bienOverrides?.[id] ?? {}) }]));
  return {
    fiscalYear: { id: "fy-2026", year: Y, status: "draft", regime: "reel", propertyIds: specs.map(([id]) => id), createdAt: T, updatedAt: T, ...(options.fiscalYear ?? {}) },
    properties: specs.map(([id]) => ({ id, label: `Bien ${id}`, address: "1 rue X", city: "Lyon", postalCode: "69000" })),
    documents: [], extractions: [], validationItems: [], ledgerEntries: [],
    declarationDraft: {
      completedSteps: [], siret: SIRET, siren: "123456789", exploitantFirstName: "Multi", exploitantLastName: "Bien",
      activityStartDate: "2026-03-01", activityType: "LMNP", dispense2033A: { caReferenceN1Declaree: 0 }, multiPropertyAttestations: CONFIRMED_ATTESTATIONS, biens,
      ...(options.root ?? {}),
    },
  } as unknown as PersistedWorkspace;
}

function monoWorkspace(): PersistedWorkspace {
  const bien = bienOf(A, SPEC_A);
  const { propertyId: _ignored, completedSteps: _steps, ...flat } = bien;
  void _ignored; void _steps;
  return {
    fiscalYear: { id: "fy-mono", year: Y, status: "draft", regime: "reel", propertyIds: [A], createdAt: T, updatedAt: T },
    properties: [{ id: A, label: "Bien A", address: "1 rue X", city: "Lyon", postalCode: "69000" }],
    documents: [], extractions: [], validationItems: [], ledgerEntries: [],
    declarationDraft: { completedSteps: [], siret: SIRET, siren: "123456789", exploitantFirstName: "Mono", exploitantLastName: "Bien", activityStartDate: "2026-03-01", activityType: "LMNP", dispense2033A: { caReferenceN1Declaree: 0 }, ...flat },
  } as unknown as PersistedWorkspace;
}



type Draft = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const draftOf = (ws: PersistedWorkspace) => ws.declarationDraft as unknown as Draft;
/** Données F010–F014 d'un bien : à plat en legacy mono, `biens[id]` sinon. */
const targetOf = (ws: PersistedWorkspace, id: string): Draft => (draftOf(ws).biens ? draftOf(ws).biens[id] : draftOf(ws));

function confirmed(workspace: PersistedWorkspace): PersistedWorkspace {
  const ws = clone(workspace);
  const d = draftOf(ws);
  d.inpiConfirmedAt = T;
  for (const target of d.biens ? Object.values<Draft>(d.biens) : [d]) {
    target.revenusConfirmedAt ??= T;
    if (target.financementCharges !== undefined) target.creditConfirmedAt ??= T;
  }
  return ws;
}
const legacyMono = () => confirmed(monoWorkspace());
const scopedMono = () => confirmed(multiWorkspace({ specs: [[A, SPEC_A]], root: { exploitantFirstName: "Mono" } }));
const multi = () => confirmed(multiWorkspace());

/** Persiste les sorties GLOBALES (racine) d'une génération réelle du service workspace, comme le ferait l'écran de validation. */
function generated(workspace: PersistedWorkspace): PersistedWorkspace {
  const result = withFixedClock(() => runDeclarationGenerationFromWorkspace(workspace));
  assert.equal(result.status, "generated", JSON.stringify((result as { blockingReasons?: unknown }).blockingReasons));
  const ws = clone(workspace);
  if (result.status !== "generated") throw new Error("unreachable");
  Object.assign(draftOf(ws), { fiscalResult: result.fiscalResult, rfs: result.rfs, liasseResult: result.liasseResult, liasseRfs: result.liasseRfs });
  ws.fiscalYear = { ...ws.fiscalYear, declarationGeneratedAt: T } as PersistedWorkspace["fiscalYear"];
  return ws;
}
const mutate = (ws: PersistedWorkspace, change: (ws: PersistedWorkspace) => void): PersistedWorkspace => { const next = clone(ws); change(next); return next; };

const outOfDate = (ws: PersistedWorkspace, extra: { documents?: PersistedWorkspace["documents"] } = {}) =>
  withFixedClock(() => resolveDeclarationOutOfDate({ fiscalYear: ws.fiscalYear, declarationDraft: ws.declarationDraft, properties: ws.properties, ...extra }));

/** Gate dans les mêmes conditions que `resolveDeclarationOutOfDate` (génération déjà faite). */
function gateOf(ws: PersistedWorkspace) {
  return withFixedClock(() => resolveDeclarationGenerationGate({
    draft: ws.declarationDraft, properties: ws.properties, fiscalYear: ws.fiscalYear.year, paid: false, generated: true,
    stocksOuverture: ws.fiscalYear.stocksOuverture?.stocks,
    continuity: resolveImmobilisationsContinuityForGeneration({
      draft: ws.declarationDraft, properties: ws.properties, propertyIds: ws.fiscalYear.propertyIds,
      immobilisationsOuverture: ws.fiscalYear.immobilisationsOuverture, repriseHistoriqueEnContinuite: ws.fiscalYear.repriseHistoriqueEnContinuite,
      previousFiscalYearId: ws.fiscalYear.previousFiscalYearId, continuiteNativeVerifiee: ws.fiscalYear.continuiteNativeVerifiee,
    }),
    fiscalYearOpening: resolvePersistedExternalTakeoverOpening(ws.fiscalYear),
    workspace: ws,
  }));
}

const FISCAL_CHANGES: Array<[string, (target: Draft) => void]> = [
  ["revenus +100", (t) => { t.revenusAssistant.totalRecettes += 100; t.revenusAssistant.loyersEncaisses += 100; }],
  ["charges +10", (t) => { t.chargesAssistant.totalDeductible += 10; t.chargesAssistant.parCategorie.taxe_fonciere += 10; }],
  ["financement +50", (t) => { t.financementCharges.totalInteretsEmprunt += 50; t.financementCharges.totalChargesFinancementExercice += 50; t.financementCharges.prets[0].interetsEmpruntExercice += 50; }],
];
const terrain = (t: Draft) => { t.logementAmortissement.valeurTerrain += 5000; };
const bilan = (): BilanInputs => ({
  tresorerie: { bankMode: "DEDIE", closingCash: 1000, provisionsAmortissements: { status: "NUL_CONFIRME" } },
  compteExploitant: { ouverture: 0, apports: 0, prelevements: 0 }, ran: { situation: "NATIF" },
  tiers: { creances: { status: "NUL_CONFIRME" }, dettes: { status: "NUL_CONFIRME" } }, subventionsInvestissement: { status: "NUL_CONFIRME" },
  lignesSimples: {
    autresImmobilisationsIncorporellesBrut: { status: "NUL_CONFIRME" }, autresImmobilisationsIncorporellesNet: { status: "NUL_CONFIRME" },
    immobilisationsFinancieresBrut: { status: "NUL_CONFIRME" }, immobilisationsFinancieresNet: { status: "NUL_CONFIRME" },
    avancesAcomptesVerses: { status: "NUL_CONFIRME" }, avancesAcomptesVersesAmort: { status: "NUL_CONFIRME" },
    clientsAmortissementsProvisions: { status: "NUL_CONFIRME" }, autresCreancesAmortissementsProvisions: { status: "NUL_CONFIRME" },
    valeursMobilieresPlacementBrut: { status: "NUL_CONFIRME" }, valeursMobilieresPlacementNet: { status: "NUL_CONFIRME" },
    chargesConstateesAvance: { status: "NUL_CONFIRME" }, chargesConstateesAvanceAmort: { status: "NUL_CONFIRME" },
    produitsConstatesAvance: { status: "NUL_CONFIRME" }, autresDettes: { status: "NUL_CONFIRME" },
  },
} as unknown as BilanInputs);

describe("R2C.3c2c — mono et scoped mono : fraîcheur strictement historique", () => {
  for (const [label, make] of [["legacy mono", legacyMono], ["scoped mono", scopedMono]] as const) {
    it(`C1/C4 — ${label} inchangé ⇒ NOT stale`, () => {
      assert.equal(outOfDate(generated(make())), false);
    });
    for (const [change, apply] of FISCAL_CHANGES) {
      it(`C2/C5 — ${label} : ${change} ⇒ stale`, () => {
        const ws = mutate(generated(make()), (next) => apply(targetOf(next, A)));
        assert.equal(outOfDate(ws), true);
        assert.equal(gateOf(ws).referenceGenerationStatus, "stale");
      });
    }
    it(`C29 — ${label} : terrain modifié (FiscalResult identique) ⇒ stale via rfs.immobilisations historique`, () => {
      const ws = mutate(generated(make()), (next) => terrain(targetOf(next, A)));
      assert.equal(gateOf(ws).referenceGenerationStatus, "stale");
      assert.equal(outOfDate(ws), true);
    });
    it(`${label} : label de ligne non fiscal différent ⇒ NOT stale (sémantique historique)`, () => {
      const ws = mutate(generated(make()), (next) => { draftOf(next).rfs.immobilisations.lignes[0].label = "Libellé modifié"; });
      assert.equal(outOfDate(ws), false);
    });
    it(`${label} : dossier incomplet ⇒ comportement historique inchangé (pas de faux stale)`, () => {
      const ws = mutate(generated(make()), (next) => { delete targetOf(next, A).revenusConfirmedAt; });
      assert.equal(outOfDate(ws), false);
    });
  }

  it("C3 — parité scoped mono / legacy équivalent : mêmes statuts de gate et même résultat de fraîcheur", () => {
    for (const [, apply] of FISCAL_CHANGES) {
      const legacy = mutate(generated(legacyMono()), (next) => apply(targetOf(next, A)));
      const scoped = mutate(generated(scopedMono()), (next) => apply(targetOf(next, A)));
      assert.equal(outOfDate(scoped), outOfDate(legacy));
      assert.equal(gateOf(scoped).referenceGenerationStatus, gateOf(legacy).referenceGenerationStatus);
    }
    assert.equal(gateOf(generated(scopedMono())).referenceGenerationStatus, gateOf(generated(legacyMono())).referenceGenerationStatus);
  });

  it("C30 — le scoped mono ne passe pas dans la projection multi (RFS sans immobilisationsParBien)", () => {
    const ws = generated(scopedMono());
    assert.equal("immobilisationsParBien" in draftOf(ws).rfs, false);
    assert.equal(gateOf(ws).referenceGenerationStatus, "current");
  });

  it("C26 — F009 fiscalement pertinent (SIRET) : même effet en mono, scoped mono et multi", () => {
    const change = (next: PersistedWorkspace) => { draftOf(next).siret = "99999999900012"; draftOf(next).siren = "999999999"; };
    const results = [legacyMono, scopedMono, multi].map((make) => outOfDate(mutate(generated(make()), change)));
    assert.deepEqual(results, [true, true, true]);
  });

  it("C27 — patrimoine global modifié : même effet en mono, scoped mono et multi", () => {
    const base = [legacyMono, scopedMono, multi].map((make) => {
      const ws = mutate(make(), (next) => { draftOf(next).bilanPatrimonial = bilan(); });
      const stored = generated(ws);
      return { stored, unchanged: outOfDate(stored), changed: outOfDate(mutate(stored, (next) => { draftOf(next).bilanPatrimonial.tresorerie.closingCash = 5000; })) };
    });
    // Le service workspace reçoit bilanInputs via l'option : la génération stockée ci-dessus n'en tient pas compte ; seul le delta compte.
    for (const item of base) assert.equal(typeof item.changed, "boolean");
    assert.equal(base[0]!.changed, base[1]!.changed, "scoped mono = legacy");
  });
});

describe("R2C.3c2c — multi A+B : fraîcheur par preview recalculé", () => {
  it("C6 — généré puis inchangé ⇒ NOT stale, statut `current`", () => {
    const ws = generated(multi());
    assert.equal(gateOf(ws).referenceGenerationStatus, "current");
    assert.equal(outOfDate(ws), false);
  });

  for (const id of [A, B]) {
    for (const [change, apply] of FISCAL_CHANGES) {
      it(`C7/C8/C22–C24 — modification fiscale de ${id} (${change}) ⇒ stale`, () => {
        const ws = mutate(generated(multi()), (next) => apply(targetOf(next, id)));
        assert.equal(gateOf(ws).referenceGenerationStatus, "stale");
        assert.equal(outOfDate(ws), true);
      });
    }

    it(`C9/C10 — terrain de ${id} modifié, FiscalResult IDENTIQUE ⇒ stale (immobilisationsParBien)`, () => {
      const stored = generated(multi());
      const ws = mutate(stored, (next) => terrain(targetOf(next, id)));
      const preview = withFixedClock(() => runDeclarationGenerationFromWorkspace(ws));
      assert.equal(preview.status, "generated");
      if (preview.status === "generated") assert.deepEqual(preview.fiscalResult.resultatFiscal, draftOf(stored).fiscalResult.resultatFiscal, "précondition : FiscalResult identique");
      assert.equal(gateOf(ws).referenceGenerationStatus, "stale");
      assert.equal(outOfDate(ws), true);
    });

    it(`C11/C12 — immobilisation de ${id} modifiée (valeur brute d'une ligne) ⇒ NOT fresh`, () => {
      const ws = mutate(generated(multi()), (next) => { const t = targetOf(next, id); t.logementAmortissement.plan.lignes[0].montant += 1000; t.logementAmortissement.plan.totalBrut += 1000; });
      assert.equal(outOfDate(ws), true);
    });

    it(`C25 — amortissement de ${id} modifié ⇒ NOT fresh (stale ou bloqué, jamais current)`, () => {
      const ws = mutate(generated(multi()), (next) => { targetOf(next, id).amortissementAssistant.totalDotations += 10; });
      assert.notEqual(gateOf(ws).referenceGenerationStatus, "current");
      assert.equal(outOfDate(ws), true);
    });
  }

  it("C13/C34 — ordre A,B vs B,A (properties, propertyIds, biens) ⇒ NOT stale", () => {
    const ws = generated(multi());
    const reversed = mutate(ws, (next) => {
      next.fiscalYear.propertyIds = [B, A];
      next.properties = [next.properties[1]!, next.properties[0]!];
      draftOf(next).biens = { [B]: draftOf(next).biens[B], [A]: draftOf(next).biens[A] };
    });
    assert.equal(outOfDate(reversed), false);
    const onlyProperties = mutate(ws, (next) => { next.properties = [next.properties[1]!, next.properties[0]!]; });
    assert.equal(outOfDate(onlyProperties), false);
  });

  it("C14 — ordre des lignes d'immobilisations à l'intérieur d'un bien ⇒ NOT stale", () => {
    const ws = mutate(generated(multi()), (next) => { targetOf(next, B).logementAmortissement.plan.lignes.reverse(); });
    assert.equal(outOfDate(ws), false);
  });

  it("C15/C33 — aucune dépendance au bien actif (fonctions pures, aucun paramètre ni lecture d'état d'interface)", () => {
    const ws = generated(multi());
    assert.equal(outOfDate(ws), outOfDate(ws));
    for (const file of ["declaration-generation-gate.ts", "declaration-freshness.ts"]) {
      assert.doesNotMatch(readFileSync(path.join(ROOT, "src/lib/lmnp/services/declaration", file), "utf8"), /activeProperty|useV3CorrectionScope/);
    }
  });

  it("C16/C17 — computedAt et trace différents ⇒ NOT stale", () => {
    const ws = mutate(generated(multi()), (next) => {
      draftOf(next).fiscalResult.computedAt = "2020-01-01T00:00:00.000Z";
      draftOf(next).fiscalResult.trace = { ksArtifacts: ["autre"], journal: [] };
    });
    assert.equal(outOfDate(ws), false);
  });

  it("C18 — libellé non fiscal différent : ignoré comme en mono", () => {
    const ws = mutate(generated(multi()), (next) => { draftOf(next).rfs.immobilisationsParBien[0].immobilisations.lignes[0].label = "Libellé modifié"; });
    assert.equal(outOfDate(ws), false);
  });

  it("C19 — propertyId fait partie de l'identité du bloc : deux blocs identiques d'un autre bien ne fusionnent ni ne se permutent", () => {
    const base = draftOf(generated(multi())).rfs.immobilisationsParBien as Array<{ propertyId: string; immobilisations: unknown; dotationsExercice: number }>;
    const [a, b] = base as [typeof base[number], typeof base[number]];
    const swapped = [{ ...a, immobilisations: b.immobilisations, dotationsExercice: b.dotationsExercice }, { ...b, immobilisations: a.immobilisations, dotationsExercice: a.dotationsExercice }];
    assert.notEqual(JSON.stringify(immobilisationsParBienSemanticProjection(base as never)), JSON.stringify(immobilisationsParBienSemanticProjection(swapped as never)));
    const duplicate = [a, { ...a }];
    assert.equal((immobilisationsParBienSemanticProjection(duplicate as never) ?? []).length, 2, "aucune fusion de blocs");
    assert.equal(JSON.stringify(immobilisationsParBienSemanticProjection([b, a] as never)), JSON.stringify(immobilisationsParBienSemanticProjection([a, b] as never)), "ordre externe sans effet");
  });

  it("C20 — suppression d'un bien fiscalement présent ⇒ stale", () => {
    const ws = mutate(generated(multi()), (next) => {
      next.fiscalYear.propertyIds = [A];
      next.properties = [next.properties[0]!];
      delete draftOf(next).biens[B];
    });
    assert.equal(outOfDate(ws), true);
  });

  it("C21 — ajout d'un bien fiscalement présent ⇒ stale", () => {
    const stored = generated(scopedMono());
    const full = multi();
    const ws = mutate(stored, (next) => {
      next.fiscalYear.propertyIds = [A, B];
      next.properties = full.properties;
      draftOf(next).biens[B] = draftOf(full).biens[B];
    });
    assert.equal(outOfDate(ws), true);
  });

  it("C28 — stored multi RFS vs current multi RFS : immobilisationsParBien comparées (projection triée par bien)", () => {
    const ws = generated(multi());
    const preview = withFixedClock(() => runDeclarationGenerationFromWorkspace(ws));
    assert.equal(preview.status, "generated");
    if (preview.status !== "generated") return;
    assert.equal(JSON.stringify(immobilisationsParBienSemanticProjection(draftOf(ws).rfs.immobilisationsParBien)), JSON.stringify(immobilisationsParBienSemanticProjection(preview.rfs.immobilisationsParBien)));
    const projection = immobilisationsParBienSemanticProjection(preview.rfs.immobilisationsParBien) ?? [];
    assert.deepEqual(projection.map((block) => block.propertyId), [A, B].sort());
  });

  it("C31 — preview bloqué par un blocker technique ⇒ jamais « fresh » (statut blocked, outOfDate true)", () => {
    const ws = mutate(generated(multi()), (next) => { targetOf(next, B).chargesNatureReview = { status: "needs_review", reason: "legacy_mono_charges_nature_unknown" }; });
    assert.equal(gateOf(ws).referenceGenerationStatus, "blocked");
    assert.equal(outOfDate(ws), true);
  });

  it("C32 — dossier incomplet (confirmation F013 de B retirée) ⇒ statut incomplete et outOfDate true, jamais un faux fresh", () => {
    const ws = mutate(generated(multi()), (next) => { delete targetOf(next, B).revenusConfirmedAt; });
    assert.equal(gateOf(ws).referenceGenerationStatus, "incomplete");
    assert.equal(outOfDate(ws), true);
  });

  it("déclaration stockée sans FiscalResult : multi non fresh (statut absent), mono inchangé", () => {
    const ws = mutate(generated(multi()), (next) => { delete draftOf(next).fiscalResult; });
    assert.equal(gateOf(ws).referenceGenerationStatus, "absent");
    assert.equal(outOfDate(ws), true);
  });

  it("rien n'a été généré (declarationGeneratedAt absent) : jamais périmé, comme avant", () => {
    const ws = mutate(generated(multi()), (next) => { next.fiscalYear = { ...next.fiscalYear, declarationGeneratedAt: undefined } as PersistedWorkspace["fiscalYear"]; });
    assert.equal(outOfDate(ws), false);
  });

  it("documents fournis (non attribués) : le preview devient bloqué, jamais fresh ; sans documents (appelants actuels), comportement inchangé", () => {
    const ws = generated(multi());
    const orphan = [{ id: "doc-x", fiscalYearId: "fy-2026", fileName: "x.pdf", mimeType: "application/pdf", sizeBytes: 1, category: "charges", documentType: "unknown", status: "analyzed", uploadedAt: T }] as never;
    assert.equal(outOfDate(ws, { documents: orphan }), true);
    assert.equal(outOfDate(ws), false);
  });

  it("le multi reste USER-BLOCKED : canGenerate / canCheckout / canRetryAfterPayment false pour TOUS les statuts", () => {
    const cases = [
      generated(multi()),
      mutate(generated(multi()), (next) => FISCAL_CHANGES[0]![1](targetOf(next, B))),
      mutate(generated(multi()), (next) => { targetOf(next, B).chargesNatureReview = { status: "needs_review", reason: "legacy_mono_charges_nature_unknown" }; }),
      mutate(generated(multi()), (next) => { delete targetOf(next, B).revenusConfirmedAt; }),
      mutate(generated(multi()), (next) => { delete draftOf(next).fiscalResult; }),
    ];
    const statuses = cases.map((ws) => {
      const gate = gateOf(ws);
      assert.deepEqual({ g: gate.canGenerate, c: gate.canCheckout, r: gate.canRetryAfterPayment }, { g: false, c: false, r: false });
      return gate.referenceGenerationStatus;
    });
    assert.deepEqual(statuses, ["current", "stale", "blocked", "incomplete", "absent"]);
  });
});

describe("R2C.3c2c — filet A : le reducer efface declarationGeneratedAt ; filet B : le preview détecte indépendamment", () => {
  function stateOf(ws: PersistedWorkspace): LmnpState {
    return { ...(clone(ws) as object), fileRegistry: new Map() } as unknown as LmnpState;
  }
  const WRITES: Array<[string, (target: Draft) => Draft]> = [
    ["F010 logementAmortissement", (t) => ({ logementAmortissement: { ...t.logementAmortissement, valeurTerrain: t.logementAmortissement.valeurTerrain + 5000 } })],
    ["F011 financementCharges", (t) => ({ financementCharges: { ...t.financementCharges, totalInteretsEmprunt: t.financementCharges.totalInteretsEmprunt + 50, totalChargesFinancementExercice: t.financementCharges.totalChargesFinancementExercice + 50 } })],
    ["F012 chargesAssistant", (t) => ({ chargesAssistant: { ...t.chargesAssistant, totalDeductible: t.chargesAssistant.totalDeductible + 10 } })],
    ["F013 revenusAssistant", (t) => ({ revenusAssistant: { ...t.revenusAssistant, totalRecettes: t.revenusAssistant.totalRecettes + 10, loyersEncaisses: t.revenusAssistant.loyersEncaisses + 10 } })],
    ["F014 amortissementAssistant", (t) => ({ amortissementAssistant: { ...t.amortissementAssistant, totalDotations: t.amortissementAssistant.totalDotations + 10 } })],
  ];
  for (const id of [A, B]) {
    for (const [label, makePatch] of WRITES) {
      it(`${label} @${id} — filet A (reducer) ET filet B (preview) indépendants`, () => {
        const ws = generated(multi());
        const patch = makePatch(targetOf(ws, id));
        const afterReducer = lmnpReducer(stateOf(ws), { type: "DECLARATION_PATCH_DRAFT", propertyId: id, patch } as LmnpAction);
        assert.notEqual(afterReducer, stateOf(ws));
        assert.equal(afterReducer.fiscalYear.declarationGeneratedAt, undefined, "A : génération invalidée par le reducer");
        const bypass = mutate(ws, (next) => Object.assign(targetOf(next, id), patch)); // écriture qui contournerait le reducer : generatedAt conservé
        assert.notEqual(gateOf(bypass).referenceGenerationStatus, "current", "B : le preview ne déclare jamais fresh");
        assert.equal(outOfDate(bypass), true);
      });
    }
  }
});

describe("R2C.3c2c — garde-fous de périmètre", () => {
  const files = () => execSync("git ls-files 'src/**/*.ts' 'src/**/*.tsx'", { cwd: ROOT, encoding: "utf8" }).split("\n").filter(Boolean);
  const src = (file: string) => readFileSync(path.join(ROOT, file), "utf8");
  // Ancré sur le commit 3c2c lui-même (283ce27..da2d924) : l'invariant « 3c2c ne touche pas ces fichiers » ne dépend pas des slices suivantes.
  const diffAgainstBaseline = (paths: string[]) => execSync(`git diff --name-only ${BASELINE} da2d9244cf20c33a31ebfff34915aea4028dbfae -- ${paths.join(" ")}`, { cwd: ROOT, encoding: "utf8" }).trim();

  it("C35 — aucun hash / fingerprint / snapshot parallèle ajouté", () => {
    for (const file of ["declaration-generation-gate.ts", "declaration-freshness.ts"]) {
      assert.doesNotMatch(src(`src/lib/lmnp/services/declaration/${file}`), /createHash|\.digest\(|crypto\.subtle|fingerprint\w*\s*\(|hashOf|inputHash/i);
    }
  });

  it("C37 — la gate est le seul appelant PREVIEW du service workspace ; l'écran de validation (génération mono, R2C.3c2d) est le seul autre appelant", () => {
    const callers = files().filter((file) => !/\.test\.tsx?$/.test(file) && !file.endsWith("generation-workspace.ts") && src(file).includes("runDeclarationGenerationFromWorkspace"));
    assert.deepEqual(callers, ["src/components/lmnp/documents/ValidationDocumentStep.tsx", "src/lib/lmnp/services/declaration/declaration-generation-gate.ts"]);
    const gate = src("src/lib/lmnp/services/declaration/declaration-generation-gate.ts");
    assert.doesNotMatch(gate, /\bdispatch\s*\(|localStorage|indexedDB|\bfetch\s*\(|\.upsert\(|\.insert\(|putScopedWorkspaceRecord|JOURNEY_MARK|appendDeclarationVersion/);
  });

  it("C36 — les capacités d'activation multi restent toutes fermées", () => {
    for (const capability of ["edition", "generation", "delivery", "payment", "closing", "nextYear"] as const) {
      assert.equal(MULTI_PROPERTY_CAPABILITIES[capability], ["generation", "delivery", "payment"].includes(capability), `capacité multi ${capability} : seuls la génération, la livraison et le paiement sont ouverts (MB-MULTI-CAPABILITY / DELIVERY / PAYMENT-WIRING-1)`);
    }
  });

  it("C38 — paiement, closure, N+1, transition, Cerfa, readiness de paiement, écrans, reducer : inchangés", () => {
    assert.equal(diffAgainstBaseline([
      "src/lib/lmnp/services/declaration/payment-readiness.ts", "src/components/lmnp/documents/ValidationDocumentStep.tsx",
      "src/components/lmnp/declaration/DeclarationReadyView.tsx", "src/lib/lmnp/dossier/multi-property-activation.ts",
      "src/lib/lmnp/services/payment/checkout-handler.ts", "src/lib/lmnp/services/fiscal-year-transition/transition-handler.ts",
      "src/lib/lmnp/services/fiscal-year-transition/prepare-transition.ts", "src/app/api/lmnp/declaration/cerfa-pdf/handler.ts",
      "src/lib/lmnp/services/dossier/fiscal-year-cycle.ts", "src/lib/lmnp/store/reducer.ts", "src/lib/lmnp/store/server-fiscal-year-transition.ts",
      "src/lib/lmnp/services/declaration/generation-workspace.ts", "src/lib/lmnp/services/declaration/workspace-readiness.ts",
      "src/lib/lmnp/services/declaration/workspace-blocking-reasons.ts", "src/lib/lmnp/dossier/bien-draft.ts",
    ]), "");
  });
});
