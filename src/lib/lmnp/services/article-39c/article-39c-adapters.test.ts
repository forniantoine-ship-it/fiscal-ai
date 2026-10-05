/**
 * INT-1 — oracles des adapters PURS article 39 C (faits → `Article39cContribution[]`).
 * Run: npx tsx --test src/lib/lmnp/services/article-39c/article-39c-adapters.test.ts
 *
 * Les montants attendus sont les assertions (SAV-030, SAV-031, SAV-034, INT-0) : aucune valeur n'est codée dans les
 * adapters. Le moteur exact (`computeArticle39c`) n'est appelé QUE par les tests, pour prouver que les contributions
 * produisent les entrées attendues ; aucun code productif ne l'appelle.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { computeArticle39c } from "@/runtime/capabilities/f006/article-39c-capacity";
import type { Charge } from "@/runtime/capabilities/f012/charge";
import type { LigneCharge } from "@/runtime/capabilities/f012/types";
import type { PretFinancementExercice } from "@/runtime/capabilities/f011/types";
import {
  applyFactsChange,
  confirmRentReconciliation,
  createRentReconciliationState,
  type RentReconciliationV2State,
} from "@/lib/lmnp/services/f013/v2/f013-v2-state";
import type { MoneyFact } from "@/lib/lmnp/services/f013/v2/f013-v2-contract";
import {
  summarizeArticle39cContributions,
  toArticle39cQualifiedAmounts,
  validateArticle39cContributions,
  type Article39cContribution,
} from "./contribution";
import { adaptF013V2ToArticle39cRent } from "./from-f013-v2";
import { adaptF012ToArticle39cContributions, f012LineFingerprint } from "./from-f012";
import { adaptF011ToArticle39cContributions } from "./from-f011";
import {
  acquisitionCostTreatmentFromOption,
  fingerprintCfeNotice,
  qualifyAcquisitionCost,
  qualifyCfe,
  qualifyOtherProduct,
  type BankFeeNatureFact,
  type CfeNotice,
} from "./qualification-facts";

const YEAR = 2026;
const eur = (n: number) => Math.round(n * 100);

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const validated = (amountCents: number): MoneyFact => ({ status: "VALIDATED", amountCents });

function f013State(propertyId: string, e: number, cc: number, opts: { co?: number; ao?: number; ac?: number; confirm?: boolean } = {}): RentReconciliationV2State {
  let state = createRentReconciliationState({ propertyId, fiscalYear: YEAR });
  state = applyFactsChange(state, {
    collections: validated(eur(e)),
    collectionsCoverage: { completeness: "COMPLETE", validation: "VALIDATED" },
    openingReceivables: validated(eur(opts.co ?? 0)),
    closingReceivables: validated(eur(cc)),
    openingAdvances: validated(eur(opts.ao ?? 0)),
    closingAdvances: validated(eur(opts.ac ?? 0)),
    exceptionsReviewed: true,
  });
  if (opts.confirm === false) return state;
  const confirmed = confirmRentReconciliation(state, { propertyId, fiscalYear: YEAR }, "2026-12-31T00:00:00.000Z");
  assert.ok(confirmed.ok, "confirmation attendue");
  return confirmed.state;
}

function rent(propertyId: string, state: unknown, dossierId = "D1", stateDossierId = "D1") {
  return adaptF013V2ToArticle39cRent({ dossierId, stateDossierId, propertyId, fiscalYear: YEAR, state });
}

function ligne(partial: Partial<LigneCharge> & Pick<LigneCharge, "id" | "categorie">): LigneCharge {
  const montant = partial.montant ?? 0;
  return {
    description: partial.id,
    montant,
    deductibilite: "deductible",
    montantDeductible: montant,
    montantPreExploitation: 0,
    montantAmortissable: 0,
    source: "manual",
    ...partial,
  };
}

const PROP_A = { level: "PROPERTY", propertyId: "A" } as const;
const PROP_B = { level: "PROPERTY", propertyId: "B" } as const;
const ACTIVITY = { level: "ACTIVITY" } as const;

function f012(lignes: LigneCharge[], extra: Partial<Parameters<typeof adaptF012ToArticle39cContributions>[0]> = {}) {
  return adaptF012ToArticle39cContributions({ owner: PROP_A, fiscalYear: YEAR, lignes, ...extra });
}

function lineFp(l: LigneCharge, owner: typeof PROP_A | typeof ACTIVITY | typeof PROP_B = PROP_A): string {
  return f012LineFingerprint(l, { owner, fiscalYear: YEAR });
}

function bankFact(l: LigneCharge, fact: Partial<BankFeeNatureFact> & Pick<BankFeeNatureFact, "nature">): BankFeeNatureFact {
  return {
    kind: "BANK_FEE",
    lineId: l.id,
    provenance: "document",
    sourceFingerprint: lineFp(l),
    ...fact,
  };
}

function engine(contributions: readonly Article39cContribution[], extra: { dotation?: number } = {}) {
  assert.deepEqual(validateArticle39cContributions(contributions), [], "contributions valides");
  return computeArticle39c({
    exercice: YEAR,
    amounts: toArticle39cQualifiedAmounts(contributions),
    currentDepreciation: extra.dotation ?? 0,
  });
}

function only(items: readonly Article39cContribution[]): Article39cContribution {
  assert.equal(items.length, 1, `une seule contribution attendue, reçu ${items.map((i) => i.contributionId).join(", ")}`);
  return items[0]!;
}

function rentContribution(propertyId: string, e: number, cc: number): Article39cContribution {
  const r = rent(propertyId, f013State(propertyId, e, cc));
  assert.equal(r.status, "DEFINITIVE");
  return r.contribution!;
}

// ---------------------------------------------------------------------------
// Oracles INT1-01 → INT1-16
// ---------------------------------------------------------------------------

describe("INT-1 — oracles", () => {
  it("INT1-01 — F013 définitif : E=11k, CC=1k → L = 12k", () => {
    const r = rent("A", f013State("A", 11000, 1000));
    assert.equal(r.status, "DEFINITIVE");
    const l = r.contribution!;
    assert.equal(l.class, "L");
    assert.equal(l.amountCents, eur(12000));
    assert.deepEqual(l.scope, { level: "PROPERTY", propertyId: "A" });
    assert.equal(l.qualificationStatus, "VALIDATED");
    assert.ok(l.sourceFingerprint && l.sourceRevision !== undefined);
    const figures = engine([l]);
    assert.equal(figures.status, "COMPUTED");
    assert.equal(figures.figures!.capacite, 12000);
  });

  it("INT1-02 — F013 non confirmé : confirmation stale ou absente → aucun L définitif", () => {
    const confirmed = f013State("A", 11000, 1000);
    // Révision avancée sans nouvelle confirmation : la confirmation est périmée.
    const stale: RentReconciliationV2State = { ...confirmed, facts: { ...confirmed.facts, revision: confirmed.facts.revision + 1 } };
    const rs = rent("A", stale);
    assert.equal(rs.status, "NOT_DEFINITIVE");
    assert.equal(rs.contribution, undefined);
    assert.equal(rs.blockers[0]!.code, "F013_V2_CONFIRMATION_STALE");

    // Empreinte divergente à révision égale (fait modifié sans passer par applyFactsChange).
    const tampered: RentReconciliationV2State = { ...confirmed, facts: { ...confirmed.facts, closingReceivables: validated(eur(2000)) } };
    const rt = rent("A", tampered);
    assert.equal(rt.status, "NOT_DEFINITIVE");
    assert.equal(rt.blockers[0]!.code, "F013_V2_CONFIRMATION_STALE");

    // Modification légitime : applyFactsChange supprime la confirmation.
    const edited = applyFactsChange(confirmed, { closingReceivables: validated(eur(500)) });
    const re = rent("A", edited);
    assert.equal(re.status, "NOT_DEFINITIVE");
    assert.equal(re.blockers[0]!.code, "F013_V2_CONFIRMATION_MISSING");

    const unconfirmed = f013State("A", 11000, 1000, { confirm: false });
    assert.equal(rent("A", unconfirmed).blockers[0]!.code, "F013_V2_CONFIRMATION_MISSING");
  });

  it("INT1-03 — comptabilité 1k → ACTIVITY 1k", () => {
    const l = ligne({ id: "honoraires-comptable", categorie: "honoraires_comptable", montant: 1000 });
    const c = only(f012([l]).contributions);
    assert.equal(c.class, "ACTIVITY");
    assert.equal(c.amountCents, eur(1000));
  });

  it("INT1-04 — taxe foncière 7k → B 7k", () => {
    const c = only(f012([ligne({ id: "taxe-fonciere", categorie: "taxe_fonciere", montant: 7000 })]).contributions);
    assert.equal(c.class, "B");
    assert.equal(c.amountCents, eur(7000));
    assert.equal(c.proofLevel, "DIRECT");
  });

  it("INT1-05 — CFE minimum 500 → ACTIVITY 500, STRONG_INFERENCE", () => {
    const notice: CfeNotice = { sourceId: "cfe-2026", fiscalYear: YEAR, amountCents: eur(500) };
    const c = qualifyCfe(notice, {
      sourceId: "cfe-2026",
      fiscalYear: YEAR,
      cfeBaseKind: "MINIMUM",
      provenance: "document",
      sourceFingerprint: fingerprintCfeNotice(notice),
    })!;
    assert.equal(c.class, "ACTIVITY");
    assert.equal(c.amountCents, eur(500));
    assert.equal(c.proofLevel, "STRONG_INFERENCE");
    assert.deepEqual(c.scope, { level: "ACTIVITY" });
    assert.ok(!("propertyId" in c.scope));
  });

  it("INT1-06 — CFE base locative 500 → B_OR_ACTIVITY non résolu, matérialité laissée au moteur", () => {
    const notice: CfeNotice = { sourceId: "cfe-2026", fiscalYear: YEAR, amountCents: eur(500) };
    const c = qualifyCfe(notice, {
      sourceId: "cfe-2026",
      fiscalYear: YEAR,
      cfeBaseKind: "RENTAL_VALUE",
      provenance: "declaration",
      sourceFingerprint: fingerprintCfeNotice(notice),
    })!;
    assert.equal(c.class, "NEEDS_QUALIFICATION");
    assert.deepEqual([...c.plausibleClasses!].sort(), ["ACTIVITY", "B"]);
    assert.equal(c.proofLevel, "AMBIGUOUS");
    // Le moteur — pas l'adapter — tranche la matérialité : dotation 6k, L 12k, B 7k → C 5k (ACTIVITY) ≠ C 4,5k (B).
    const L = rentContribution("A", 12000, 0);
    const B = only(f012([ligne({ id: "taxe-fonciere", categorie: "taxe_fonciere", montant: 7000 })]).contributions);
    assert.equal(engine([L, B, c], { dotation: 6000 }).status, "NEEDS_QUALIFICATION");
    // Dotation nulle : branches équivalentes → calcul autorisé avec avertissement.
    assert.equal(engine([L, B, c], { dotation: 0 }).status, "COMPUTED_UNRESOLVED_IMMATERIAL");
  });

  it("INT1-07 — frais bancaires de financement 200 → B 200 (prêt référencé)", () => {
    const l = ligne({ id: "frais-bancaires", categorie: "frais_bancaires", montant: 200 });
    const c = only(f012([l], { natureFacts: [bankFact(l, { nature: "PROPERTY_FINANCING", loanId: "loan-1" })] }).contributions);
    assert.equal(c.class, "B");
    assert.equal(c.amountCents, eur(200));
    assert.equal(c.loanId, "loan-1");
  });

  it("INT1-08 — frais bancaires de compte d'activité 200 → ACTIVITY 200", () => {
    const l = ligne({ id: "frais-bancaires", categorie: "frais_bancaires", montant: 200 });
    const c = only(f012([l], { natureFacts: [bankFact(l, { nature: "ACTIVITY_ACCOUNT" })] }).contributions);
    assert.equal(c.class, "ACTIVITY");
    assert.equal(c.amountCents, eur(200));
    // Source portée par l'activité : jamais un propertyId fictif.
    const global = only(
      f012([l], { owner: ACTIVITY, natureFacts: [{ ...bankFact(l, { nature: "ACTIVITY_ACCOUNT" }), sourceFingerprint: lineFp(l, ACTIVITY) }] }).contributions,
    );
    assert.equal(global.class, "ACTIVITY");
    assert.deepEqual(global.scope, { level: "ACTIVITY" });
  });

  it("INT1-09 — frais bancaires de nature inconnue 200 → NEEDS_QUALIFICATION", () => {
    const l = ligne({ id: "frais-bancaires", categorie: "frais_bancaires", montant: 200 });
    for (const natureFacts of [[], [bankFact(l, { nature: "UNKNOWN" })]]) {
      const c = only(f012([l], { natureFacts }).contributions);
      assert.equal(c.class, "NEEDS_QUALIFICATION");
      assert.equal(c.amountCents, eur(200));
    }
  });

  it("INT1-10 — copropriété : fonds de travaux 1k → EXCLUDED", () => {
    const l = ligne({ id: "copro-fonds-alur", categorie: "copropriete", deductibilite: "non_deductible", montant: 1000, montantDeductible: 0 });
    const c = only(f012([l]).contributions);
    assert.equal(c.class, "EXCLUDED");
    assert.equal(c.ruleId, "SAV-031:copro_works_fund");
  });

  it("INT1-11 — copropriété : charge courante qualifiée 1k → B", () => {
    const c = only(f012([ligne({ id: "copropriete-deductible", categorie: "copropriete", montant: 1000 })]).contributions);
    assert.equal(c.class, "B");
    assert.equal(c.amountCents, eur(1000));
  });

  it("INT1-12 — prime GLI 300 → B", () => {
    const c = only(f012([ligne({ id: "assurance-gli", categorie: "assurance_gli", montant: 300 })]).contributions);
    assert.equal(c.class, "B");
    assert.equal(c.amountCents, eur(300));
  });

  it("INT1-13 — indemnité GLI 1k → OUT_OF_DOMAIN, jamais L", () => {
    const c = qualifyOtherProduct({ sourceId: "gli-indem", propertyId: "A", fiscalYear: YEAR, amountCents: eur(1000), nature: "GLI_INDEMNITY", provenance: "document" })!;
    assert.equal(c.class, "OUT_OF_DOMAIN");
    assert.notEqual(c.class, "L");
    assert.equal(engine([rentContribution("A", 12000, 0), c]).status, "OUT_OF_DOMAIN");
  });

  it("INT1-14 — frais d'acquisition capitalisés 5k → EXCLUDED de B", () => {
    const c = qualifyAcquisitionCost({
      sourceId: "acq-A",
      propertyId: "A",
      fiscalYear: YEAR,
      amountCents: eur(5000),
      treatment: acquisitionCostTreatmentFromOption("integration"),
    })!;
    assert.equal(c.class, "EXCLUDED");
    const figures = engine([rentContribution("A", 10000, 0), c]);
    assert.equal(figures.figures!.capacite, 10000, "les 5 000 n'entrent jamais dans B");
  });

  it("INT1-15 — frais d'acquisition immédiatement déduits non résolus → NEEDS_QUALIFICATION", () => {
    for (const treatment of ["IMMEDIATELY_DEDUCTED", "UNKNOWN"] as const) {
      const c = qualifyAcquisitionCost({ sourceId: "acq-A", propertyId: "A", fiscalYear: YEAR, amountCents: eur(5000), treatment })!;
      assert.equal(c.class, "NEEDS_QUALIFICATION");
    }
    assert.equal(acquisitionCostTreatmentFromOption("deduction"), "IMMEDIATELY_DEDUCTED");
    assert.equal(acquisitionCostTreatmentFromOption(undefined), "UNKNOWN");
  });

  it("INT1-16 — multi : A L10k/B2k, B L8k/B1k, comptabilité globale 1k → aucune allocation", () => {
    const lA = rentContribution("A", 10000, 0);
    const lB = rentContribution("B", 8000, 0);
    const bA = f012([ligne({ id: "taxe-fonciere", categorie: "taxe_fonciere", montant: 2000 })], { owner: PROP_A });
    const bB = f012([ligne({ id: "taxe-fonciere", categorie: "taxe_fonciere", montant: 1000 })], { owner: PROP_B });
    const act = f012([ligne({ id: "honoraires-comptable", categorie: "honoraires_comptable", montant: 1000 })], { owner: ACTIVITY });

    const all = [lA, lB, ...bA.contributions, ...bB.contributions, ...act.contributions];
    const activity = all.filter((c) => c.scope.level === "ACTIVITY");
    assert.equal(activity.length, 1);
    assert.equal(activity[0]!.class, "ACTIVITY");
    assert.equal(activity[0]!.amountCents, eur(1000), "aucun fractionnement 50/50 ni prorata");
    assert.ok(!("propertyId" in activity[0]!.scope));
    // Les faits de A restent sur A, ceux de B sur B.
    assert.deepEqual(
      all.filter((c) => c.scope.level === "PROPERTY" && c.scope.propertyId === "A").map((c) => `${c.class}:${c.amountCents}`).sort(),
      [`B:${eur(2000)}`, `L:${eur(10000)}`].sort(),
    );
    assert.deepEqual(
      all.filter((c) => c.scope.level === "PROPERTY" && c.scope.propertyId === "B").map((c) => `${c.class}:${c.amountCents}`).sort(),
      [`B:${eur(1000)}`, `L:${eur(8000)}`].sort(),
    );
    const summary = summarizeArticle39cContributions(all);
    assert.equal(summary.byClassCents.L, eur(18000));
    assert.equal(summary.byClassCents.B, eur(3000));
    assert.equal(summary.byClassCents.ACTIVITY, eur(1000));
    // Le moteur exact reste l'unique calcul : C global = 15 000, résultat avant amortissement = 14 000.
    const result = engine(all);
    assert.equal(result.status, "COMPUTED");
    assert.equal(result.figures!.capacite, 15000);
    assert.equal(result.figures!.resultatAvantAmort, 14000);
  });
});

// ---------------------------------------------------------------------------
// Fail-closed
// ---------------------------------------------------------------------------

describe("INT-1 — fail-closed", () => {
  it("UNKNOWN ≠ 0 : un rapprochement vierge ou incomplet ne produit jamais L=0", () => {
    const blank = createRentReconciliationState({ propertyId: "A", fiscalYear: YEAR });
    const r = rent("A", blank);
    assert.equal(r.status, "NOT_DEFINITIVE");
    assert.equal(r.contribution, undefined);
    assert.equal(rent("A", undefined).status, "NOT_PRESENT");
    assert.equal(rent("A", null).status, "NOT_PRESENT");
  });

  it("PROPOSED ≠ VALIDATED : un fait seulement proposé bloque L", () => {
    let state = f013State("A", 11000, 1000, { confirm: false });
    state = applyFactsChange(state, { closingReceivables: { status: "PROPOSED", amountCents: eur(1000) } });
    assert.equal(rent("A", state).status, "NOT_DEFINITIVE");
    const coverage = applyFactsChange(f013State("A", 11000, 1000, { confirm: false }), {
      collectionsCoverage: { completeness: "COMPLETE", validation: "PROPOSED" },
    });
    assert.equal(rent("A", coverage).status, "NOT_DEFINITIVE");
  });

  it("F013 : couverture partielle, exceptions non revues, hors domaine, mauvais bien / exercice / dossier", () => {
    const base = f013State("A", 11000, 1000, { confirm: false });
    assert.equal(rent("A", applyFactsChange(base, { collectionsCoverage: { completeness: "PARTIAL", validation: "VALIDATED" } })).status, "NOT_DEFINITIVE");
    assert.equal(rent("A", applyFactsChange(base, { exceptionsReviewed: false })).status, "NOT_DEFINITIVE");
    const ood = applyFactsChange(base, { outOfDomain: ["gli"] });
    assert.equal(rent("A", ood).status, "OUT_OF_DOMAIN");
    assert.equal(rent("B", f013State("A", 11000, 1000)).blockers[0]!.code, "F013_V2_SCOPE_MISMATCH");
    assert.equal(rent("A", f013State("A", 11000, 1000), "D1", "D2").blockers[0]!.code, "DOSSIER_MISMATCH");
    const otherYear = adaptF013V2ToArticle39cRent({ dossierId: "D1", stateDossierId: "D1", propertyId: "A", fiscalYear: YEAR + 1, state: f013State("A", 11000, 1000) });
    assert.equal(otherYear.blockers[0]!.code, "FISCAL_YEAR_MISMATCH");
  });

  it("F013 v1 ≠ L exact : totalRecettes / encaissements legacy ne produisent jamais de L", () => {
    for (const legacy of [
      { totalRecettes: 12000, exerciceFiscal: YEAR },
      { contractVersion: "legacy_cash_v1", loyersEncaisses: 12000 },
      { stateVersion: 1, facts: { contractVersion: "legacy_cash_v1", totalRecettes: 12000 } },
    ]) {
      const r = rent("A", legacy);
      assert.equal(r.status, "NOT_DEFINITIVE");
      assert.equal(r.contribution, undefined);
      assert.equal(r.blockers[0]!.code, "F013_V2_LEGACY_CONTRACT");
    }
  });

  it("L : seul `loyersAcquisCents` est utilisé — une observation ne produit jamais de L en plus du total", () => {
    const state = f013State("A", 11000, 1000);
    // Une observation de 99 999 € attachée à l'état n'est ni lue ni sommée.
    const withObservation = { ...state, observations: [{ id: "obs-1", amountCents: eur(99999), kind: "payment" }] } as unknown as RentReconciliationV2State;
    const l = rent("A", withObservation);
    assert.equal(l.status, "DEFINITIVE");
    assert.equal(l.contribution!.amountCents, eur(12000));
    // Deux L pour le même bien / exercice = violation d'anti-double-comptage.
    const dupe = { ...l.contribution!, contributionId: "other-L" };
    assert.deepEqual(
      validateArticle39cContributions([l.contribution!, dupe]).map((v) => v.code),
      ["DUPLICATE_DEDUPE_KEY", "DUPLICATE_RENT_FOR_PROPERTY"],
    );
  });

  it("catégorie générique ≠ B : divers, catégorie inconnue, gestion sans nature", () => {
    const divers = only(f012([ligne({ id: "divers-1", categorie: "divers", montant: 300 })]).contributions);
    assert.equal(divers.class, "NEEDS_QUALIFICATION");
    const gestion = ligne({ id: "honoraires-gestion", categorie: "honoraires_gestion", montant: 800 });
    assert.equal(only(f012([gestion]).contributions).class, "NEEDS_QUALIFICATION");
    const fingerprint = lineFp(gestion);
    const proven = only(
      f012([gestion], { natureFacts: [{ kind: "MANAGEMENT_NATURE", lineId: gestion.id, nature: "PROPERTY_MANAGEMENT", provenance: "document", sourceFingerprint: fingerprint }] }).contributions,
    );
    assert.equal(proven.class, "B");
    const mixed = only(
      f012([gestion], { natureFacts: [{ kind: "MANAGEMENT_NATURE", lineId: gestion.id, nature: "LETTING", provenance: "document", sourceFingerprint: fingerprint }] }).contributions,
    );
    assert.equal(mixed.class, "NEEDS_QUALIFICATION");
  });

  it("CFE inconnue ≠ ACTIVITY ; copropriété inconnue ≠ B ; frais bancaires inconnus ≠ B", () => {
    const notice: CfeNotice = { sourceId: "cfe-2026", fiscalYear: YEAR, amountCents: eur(500) };
    assert.equal(qualifyCfe(notice, undefined)!.class, "NEEDS_QUALIFICATION");
    assert.equal(
      qualifyCfe(notice, { sourceId: "cfe-2026", fiscalYear: YEAR, cfeBaseKind: "UNKNOWN", provenance: "declaration", sourceFingerprint: fingerprintCfeNotice(notice) })!.class,
      "NEEDS_QUALIFICATION",
    );
    const coproCharge: Charge = {
      id: "copro:2026:untyped:0",
      familyId: "syndic",
      category: "copropriete",
      amount: 1000,
      exercise: YEAR,
      source: "manual",
      provenance: "manual",
      status: "recorded",
    };
    const untyped = only(f012([], { registryCharges: [coproCharge] }).contributions);
    assert.equal(untyped.class, "NEEDS_QUALIFICATION");
    assert.deepEqual([...untyped.plausibleClasses!].sort(), ["B", "EXCLUDED"]);
  });

  it("montant ambigu ≠ 0 : un montant non fini est un blocage, jamais une contribution nulle", () => {
    const r = f012([ligne({ id: "taxe-fonciere", categorie: "taxe_fonciere", montant: Number.NaN })]);
    assert.equal(r.contributions.length, 0);
    assert.equal(r.blockers[0]!.code, "INVALID_AMOUNT");
  });

  it("absence de donnée ≠ EXCLUDED : aucune ligne → aucune contribution ; prêt exclu → blocage explicite", () => {
    assert.deepEqual(f012([]).contributions, []);
    const f011 = adaptF011ToArticle39cContributions({ propertyId: "A", fiscalYear: YEAR, prets: [], excludedLoanIds: ["loan-9"] });
    assert.equal(f011.contributions.length, 0);
    assert.equal(f011.blockers[0]!.code, "LOAN_EXCLUDED_FROM_F011");
  });

  it("un net de copropriété négatif n'est jamais transmis comme contribution négative", () => {
    const negative = ligne({ id: "copropriete-deductible", categorie: "copropriete", montant: -300, montantDeductible: -300 });
    const c = only(f012([negative]).contributions);
    assert.equal(c.class, "NEEDS_QUALIFICATION");
    assert.equal(c.amountCents, eur(300));
    assert.ok(c.amountCents >= 0);
    assert.deepEqual(validateArticle39cContributions([c]), []);
    // Le net positif (provisions − régularisation) reste dans une seule classe B, tracé par la ligne unique.
    const net = only(f012([ligne({ id: "copropriete-deductible", categorie: "copropriete", montant: 700, montantDeductible: 700 })]).contributions);
    assert.equal(net.class, "B");
    assert.equal(net.amountCents, eur(700));
  });

  it("charges pré-opérationnelles : jamais résolues opportunistement", () => {
    const l = ligne({ id: "assurance-gli", categorie: "assurance_gli", montant: 600, montantDeductible: 400, montantPreExploitation: 200 });
    const items = f012([l]).contributions;
    assert.equal(items.length, 2);
    const byPart = Object.fromEntries(items.map((c) => [c.contributionId.split("|").pop()!, c]));
    assert.equal(byPart.in_year!.class, "B");
    assert.equal(byPart.in_year!.amountCents, eur(400));
    assert.equal(byPart.pre_operational!.class, "NEEDS_QUALIFICATION");
    assert.equal(byPart.pre_operational!.amountCents, eur(200));
  });

  it("charge commune au niveau activité : seule ACTIVITY passe, B reste bloqué", () => {
    const r = f012([ligne({ id: "taxe-fonciere", categorie: "taxe_fonciere", montant: 500 })], { owner: ACTIVITY });
    const c = only(r.contributions);
    assert.equal(c.class, "OUT_OF_DOMAIN");
    assert.equal(r.blockers[0]!.code, "COMMON_CHARGE_NOT_SUPPORTED");
    // L ou B au niveau activité est interdit par le validateur.
    const forged: Article39cContribution = { ...rentContribution("A", 1000, 0), scope: { level: "ACTIVITY" } };
    assert.ok(validateArticle39cContributions([forged]).some((v) => v.code === "ACTIVITY_LEVEL_FORBIDDEN_CLASS"));
  });
});

// ---------------------------------------------------------------------------
// F011
// ---------------------------------------------------------------------------

function pret(partial: Partial<PretFinancementExercice> & { pretId: string }): PretFinancementExercice {
  return {
    typePret: "amortissable",
    interetsEmpruntExercice: 0,
    interetsPreExploitation: 0,
    assuranceEmpruntExercice: 0,
    assurancePreExploitation: 0,
    capitalRembourseExercice: 0,
    capitalRestantDu31_12: 0,
    fraisDossierDeductibles: 0,
    garantieDeductible: 0,
    iraDeductible: 0,
    ...partial,
  };
}

describe("INT-1 — F011 → B", () => {
  it("intérêts, assurance emprunteur, frais de dossier, garantie → B ; IRA, pré-exploitation → non résolus ; capital ignoré", () => {
    const r = adaptF011ToArticle39cContributions({
      propertyId: "A",
      fiscalYear: YEAR,
      prets: [
        pret({
          pretId: "loan-1",
          interetsEmpruntExercice: 3000,
          assuranceEmpruntExercice: 400,
          fraisDossierDeductibles: 200,
          garantieDeductible: 150,
          iraDeductible: 100,
          interetsPreExploitation: 80,
          assurancePreExploitation: 20,
          capitalRembourseExercice: 9000,
        }),
      ],
    });
    const byPart = Object.fromEntries(r.contributions.map((c) => [c.contributionId.split("|").pop()!, c]));
    for (const part of ["interest", "insurance", "application_fee", "guarantee_fee"]) {
      assert.equal(byPart[part]!.class, "B", part);
      assert.deepEqual(byPart[part]!.scope, { level: "PROPERTY", propertyId: "A" });
      assert.equal(byPart[part]!.loanId, "loan-1");
    }
    assert.equal(byPart.application_fee!.proofLevel, "INFERENCE");
    assert.equal(byPart.interest!.amountCents, eur(3000));
    assert.equal(byPart.ira!.class, "NEEDS_QUALIFICATION");
    assert.equal(byPart.preop_interest!.class, "NEEDS_QUALIFICATION");
    assert.equal(byPart.preop_insurance!.class, "NEEDS_QUALIFICATION");
    assert.equal(r.contributions.length, 7, "le capital remboursé ne produit aucune contribution");
  });

  it("prêt partagé : hors domaine, jamais classé", () => {
    const r = adaptF011ToArticle39cContributions({
      propertyId: "A",
      fiscalYear: YEAR,
      prets: [pret({ pretId: "loan-S", interetsEmpruntExercice: 1000 })],
      sharedLoanIds: ["loan-S"],
    });
    assert.equal(only(r.contributions).class, "OUT_OF_DOMAIN");
    assert.equal(r.blockers[0]!.code, "SHARED_LOAN_OUT_OF_DOMAIN");
  });

  it("deux biens, un même pretId : identités distinctes (loanKey), aucune fusion", () => {
    const a = adaptF011ToArticle39cContributions({ propertyId: "A", fiscalYear: YEAR, prets: [pret({ pretId: "loan-1", interetsEmpruntExercice: 100 })] });
    const b = adaptF011ToArticle39cContributions({ propertyId: "B", fiscalYear: YEAR, prets: [pret({ pretId: "loan-1", interetsEmpruntExercice: 200 })] });
    const all = [...a.contributions, ...b.contributions];
    assert.deepEqual(validateArticle39cContributions(all), []);
    assert.equal(new Set(all.map((c) => c.contributionId)).size, 2);
  });
});

// ---------------------------------------------------------------------------
// Anti-double-comptage
// ---------------------------------------------------------------------------

describe("INT-1 — anti-double-comptage", () => {
  const f011Fee = () =>
    adaptF011ToArticle39cContributions({
      propertyId: "A",
      fiscalYear: YEAR,
      prets: [pret({ pretId: "loan-1", fraisDossierDeductibles: 200 })],
    }).contributions;

  it("même frais de financement présent en F011 et signalé overlap en F012 → une seule contribution B", () => {
    const overlap = ligne({
      id: "frais-dossier-bancaire",
      categorie: "divers",
      deductibilite: "non_deductible",
      montant: 200,
      montantDeductible: 0,
      exclusionReason: "f011_overlap",
    });
    const f012Items = f012([overlap]).contributions;
    assert.equal(only(f012Items).class, "EXCLUDED");
    const all = [...f011Fee(), ...f012Items];
    assert.deepEqual(validateArticle39cContributions(all), []);
    assert.equal(summarizeArticle39cContributions(all).byClassCents.B, eur(200));
  });

  it("même frais de financement en frais bancaires F012 non signalé → doublon détecté ; signalé → EXCLUDED", () => {
    const l = ligne({ id: "frais-bancaires", categorie: "frais_bancaires", montant: 200 });
    const unflagged = f012([l], { natureFacts: [bankFact(l, { nature: "PROPERTY_FINANCING", loanId: "loan-1", financingFeeKind: "APPLICATION" })] }).contributions;
    assert.equal(only(unflagged).class, "B");
    assert.ok(validateArticle39cContributions([...f011Fee(), ...unflagged]).some((v) => v.code === "DUPLICATE_DEDUPE_KEY"));

    const flagged = f012([l], {
      natureFacts: [bankFact(l, { nature: "PROPERTY_FINANCING", loanId: "loan-1", financingFeeKind: "APPLICATION", alreadyCountedByF011: true })],
    }).contributions;
    assert.equal(only(flagged).class, "EXCLUDED");
    const all = [...f011Fee(), ...flagged];
    assert.deepEqual(validateArticle39cContributions(all), []);
    assert.equal(summarizeArticle39cContributions(all).byClassCents.B, eur(200));
  });

  it("une charge ne produit jamais simultanément B et ACTIVITY (une classe par partie)", () => {
    const lignes = [
      ligne({ id: "taxe-fonciere", categorie: "taxe_fonciere", montant: 1000 }),
      ligne({ id: "honoraires-comptable", categorie: "honoraires_comptable", montant: 500 }),
      ligne({ id: "divers-1", categorie: "divers", montant: 100 }),
      ligne({ id: "assurance-pno", categorie: "assurance_pno", montant: 300, montantDeductible: 200, montantPreExploitation: 100 }),
    ];
    const items = f012(lignes).contributions;
    assert.equal(new Set(items.map((c) => c.contributionId)).size, items.length);
    const classesByLine = new Map<string, Set<string>>();
    for (const c of items) {
      const part = c.contributionId.split("|").pop()!;
      const key = `${c.sourceId}|${part}`;
      classesByLine.set(key, (classesByLine.get(key) ?? new Set()).add(c.class));
    }
    for (const [, classes] of classesByLine) assert.equal(classes.size, 1);
    assert.equal(summarizeArticle39cContributions(items).byClassCents.ACTIVITY, eur(500));
  });

  it("un fait EXCLUDED ne produit aucun montant fiscal actif", () => {
    const excluded = [
      only(f012([ligne({ id: "copro-fonds-alur", categorie: "copropriete", deductibilite: "non_deductible", montant: 4000, montantDeductible: 0 })]).contributions),
      only(f012([ligne({ id: "travaux-1", categorie: "travaux", deductibilite: "amortissement", montant: 9000, montantDeductible: 0, montantAmortissable: 9000 })]).contributions),
    ];
    assert.ok(excluded.every((c) => c.class === "EXCLUDED"));
    const baseline = engine([rentContribution("A", 10000, 0)]);
    const withExcluded = engine([rentContribution("A", 10000, 0), ...excluded]);
    assert.deepEqual(withExcluded.figures, baseline.figures);
  });

  it("un OTHER_PRODUCT ne devient jamais L et n'augmente jamais C (SAV-030 : L 10k, B 7k, produit 2k → C 3k)", () => {
    const product = qualifyOtherProduct({
      sourceId: "prod-1",
      propertyId: "A",
      fiscalYear: YEAR,
      amountCents: eur(2000),
      nature: "QUALIFIED_TAXABLE_PRODUCT",
      demonstratedTaxable: true,
      demonstratedOutsideRent: true,
      provenance: "document",
    })!;
    assert.equal(product.class, "OTHER_PRODUCT");
    const B = only(f012([ligne({ id: "taxe-fonciere", categorie: "taxe_fonciere", montant: 7000 })]).contributions);
    const result = engine([rentContribution("A", 10000, 0), B, product]);
    assert.equal(result.figures!.capacite, 3000);
    assert.equal(result.figures!.resultatAvantAmort, 5000);
    // Provenant du rapprochement des loyers, un OTHER_PRODUCT est une violation.
    const forged: Article39cContribution = { ...product, source: "F013_V2_RENT_RECONCILIATION" };
    assert.ok(validateArticle39cContributions([forged]).some((v) => v.code === "OTHER_PRODUCT_IN_RENT"));
  });

  it("autres produits non qualifiés : jamais OTHER_PRODUCT par défaut, jamais L", () => {
    const natures = [
      ["INSURANCE_INDEMNITY", "OUT_OF_DOMAIN"],
      ["VISALE_INDEMNITY", "OUT_OF_DOMAIN"],
      ["DISPUTE_OR_REMISSION", "OUT_OF_DOMAIN"],
      ["SUBSIDY", "NEEDS_QUALIFICATION"],
      ["DEPOSIT_RETAINED", "NEEDS_QUALIFICATION"],
      ["CAF_THIRD_PARTY", "NEEDS_QUALIFICATION"],
      ["PLATFORM_NET_PAYOUT", "NEEDS_QUALIFICATION"],
      ["GENERIC_REFUND", "NEEDS_QUALIFICATION"],
      ["UNQUALIFIED_REVENUE_REGULARISATION", "NEEDS_QUALIFICATION"],
    ] as const;
    for (const [nature, expected] of natures) {
      const c = qualifyOtherProduct({ sourceId: `p-${nature}`, fiscalYear: YEAR, amountCents: eur(100), nature, provenance: "declaration" })!;
      assert.equal(c.class, expected, nature);
    }
    // « QUALIFIED » sans les deux preuves reste non qualifié.
    const half = qualifyOtherProduct({ sourceId: "p", fiscalYear: YEAR, amountCents: eur(100), nature: "QUALIFIED_TAXABLE_PRODUCT", demonstratedTaxable: true, provenance: "declaration" })!;
    assert.equal(half.class, "NEEDS_QUALIFICATION");
  });
});

// ---------------------------------------------------------------------------
// Empreinte de source / invalidation
// ---------------------------------------------------------------------------

describe("INT-1 — empreinte de source et invalidation", () => {
  it("une qualification de frais bancaires ne reste jamais VALIDATED si le montant change", () => {
    const l200 = ligne({ id: "frais-bancaires", categorie: "frais_bancaires", montant: 200 });
    const fact = bankFact(l200, { nature: "PROPERTY_FINANCING", loanId: "loan-1" });
    assert.equal(only(f012([l200], { natureFacts: [fact] }).contributions).class, "B");
    const l250 = ligne({ id: "frais-bancaires", categorie: "frais_bancaires", montant: 250 });
    const stale = only(f012([l250], { natureFacts: [fact] }).contributions);
    assert.equal(stale.class, "NEEDS_QUALIFICATION");
    assert.equal(stale.qualificationStatus, "STALE");
  });

  it("une réponse CFE périmée (montant, exercice ou avis modifié) redevient non résolue", () => {
    const notice: CfeNotice = { sourceId: "cfe-2026", fiscalYear: YEAR, amountCents: eur(500) };
    const fact = {
      sourceId: "cfe-2026",
      fiscalYear: YEAR,
      cfeBaseKind: "MINIMUM" as const,
      provenance: "document" as const,
      sourceFingerprint: fingerprintCfeNotice(notice),
    };
    assert.equal(qualifyCfe(notice, fact)!.class, "ACTIVITY");
    const changed = qualifyCfe({ ...notice, amountCents: eur(550) }, fact)!;
    assert.equal(changed.class, "NEEDS_QUALIFICATION");
    assert.equal(changed.qualificationStatus, "STALE");
    assert.equal(qualifyCfe({ ...notice, sourceId: "cfe-autre" }, fact)!.qualificationStatus, "STALE");
    assert.equal(qualifyCfe({ ...notice, fiscalYear: YEAR + 1 }, fact)!.qualificationStatus, "STALE");
  });

  it("L : l'empreinte et la révision de la source sont portées par la contribution", () => {
    const state = f013State("A", 11000, 1000);
    const l = rent("A", state).contribution!;
    assert.equal(l.sourceRevision, state.facts.revision);
    assert.match(l.sourceFingerprint!, /^[0-9a-f]{8}$/);
    // Même total, faits différents : empreinte différente (E 12 000 / CC 0 vs E 11 000 / CC 1 000).
    const sameTotal = rent("A", f013State("A", 12000, 0)).contribution!;
    assert.equal(sameTotal.amountCents, l.amountCents);
    assert.notEqual(sameTotal.sourceFingerprint, l.sourceFingerprint);
  });
});

// ---------------------------------------------------------------------------
// Pureté / déterminisme
// ---------------------------------------------------------------------------

describe("INT-1 — pureté et déterminisme", () => {
  const lignes = (): LigneCharge[] => [
    ligne({ id: "taxe-fonciere", categorie: "taxe_fonciere", montant: 1000 }),
    ligne({ id: "honoraires-comptable", categorie: "honoraires_comptable", montant: 500 }),
    ligne({ id: "assurance-gli", categorie: "assurance_gli", montant: 300, montantDeductible: 250, montantPreExploitation: 50 }),
    ligne({ id: "copro-fonds-alur", categorie: "copropriete", deductibilite: "non_deductible", montant: 700, montantDeductible: 0 }),
    ligne({ id: "divers-1", categorie: "divers", montant: 80 }),
  ];

  it("même entrée → même sortie ; ordre des lignes sans effet ; aucune dépendance à l'horloge", () => {
    const RealDate = globalThis.Date;
    class NoClockDate extends RealDate {
      constructor(...args: ConstructorParameters<typeof Date>) {
        if (args.length === 0) throw new Error("horloge système interdite");
        super(...args);
      }
      static override now(): number {
        throw new Error("horloge système interdite");
      }
    }
    globalThis.Date = NoClockDate as unknown as DateConstructor;
    try {
      const first = f012(lignes());
      const second = f012(lignes());
      const reversed = f012([...lignes()].reverse());
      assert.deepEqual(first, second);
      assert.deepEqual(first, reversed);

      const state = f013State("A", 11000, 1000);
      assert.deepEqual(rent("A", state), rent("A", structuredClone(state)));

      const prets = [pret({ pretId: "loan-1", interetsEmpruntExercice: 100 }), pret({ pretId: "loan-2", interetsEmpruntExercice: 200 })];
      assert.deepEqual(
        adaptF011ToArticle39cContributions({ propertyId: "A", fiscalYear: YEAR, prets }),
        adaptF011ToArticle39cContributions({ propertyId: "A", fiscalYear: YEAR, prets: [...prets].reverse() }),
      );
    } finally {
      globalThis.Date = RealDate;
    }
  });

  it("les entrées ne sont pas mutées", () => {
    const input = lignes();
    const snapshot = structuredClone(input);
    f012(input);
    assert.deepEqual(input, snapshot);
  });
});
