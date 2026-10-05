/**
 * INT-4.1 — fermeture des blockers pré-switch : domaine exact multi (stocks globaux, ACTIVITY globale, charges communes),
 * sémantique « aucune charge à répartir », ownership du bilan locatif, première année, gate pur du switch.
 * Le F006 productif reste le PROXY historique ; le moteur exact reste DORMANT ; rien n'est activé.
 * Run: npx tsx --test src/lib/lmnp/services/article-39c/article-39c-switch-gate.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import type { PersistedWorkspace } from "@/lib/lmnp/store/persistence";
import type { LigneCharge } from "@/runtime/capabilities/f012/types";
import type { BilanInputs } from "@/runtime/capabilities/bilan/types";
import { assemblePatrimoine } from "@/runtime/capabilities/bilan/assemble-patrimoine";
import type { FiscalRepresentation } from "@/runtime/capabilities/rfs/types";
import { describeRentalBilanOwnership, resolveEffectiveBilanWithRentInventory } from "@/lib/lmnp/services/f013/v2/f013-v2-bilan-wiring";
import {
  NO_ALLOCATION_CHARGES_WORDING_VERSION,
  recordNoAllocationChargesAttestation,
  resolveMultiPropertyAttestation,
  resolveNoAllocationChargesAttestation,
  type MultiPropertyAttestations,
} from "@/lib/lmnp/dossier/multi-property-attestations";
import { LEGACY_PROXY_OMITS_EXACT_CHARGES_CODE } from "@/lib/lmnp/services/declaration/legacy-proxy-guard";
import { runDeclarationGenerationFromWorkspace } from "@/lib/lmnp/services/declaration/generation-workspace";
import { runDeclarationGeneration } from "@/lib/lmnp/services/declaration/run-declaration-generation";
import { ACTIVITY, DOSSIER, YEAR, bien, collected, eur, monoWorkspace, multiWorkspace, rentState, roundtrip } from "./article-39c-test-fixtures";
import { resolveArticle39cOpeningStocks, type Article39cOpeningStocks } from "./opening-stocks";
import { evaluateArticle39cPreSwitchReadiness } from "./pre-switch-readiness";
import { canSwitchToExactFiscalEngine, type RemoteAntiDowngradeAttestation } from "./switch-gate";
import { buildActivityChargeDeclaration } from "./qualification-ui-model";
import type { Article39cQualificationAction } from "./qualification-writers";

const AT = "2026-12-01T00:00:00.000Z";
const REMOTE_OK: RemoteAntiDowngradeAttestation = { status: "VERIFIED", projectRef: "dev-staging-ref", checkedAt: AT, downgradeFunction: true, downgradeTrigger: true, closedSnapshotTrigger: true, aclAsExpected: true };
const NEUTRAL: BilanInputs = { tresorerie: { bankMode: "DEDIE", closingCash: 3000 }, compteExploitant: { ouverture: 37100, apports: 0, prelevements: 1000 }, ran: { situation: "NATIF" } };
const attest = (answer: "confirmed" | "declared_out_of_domain", wordingVersion = NO_ALLOCATION_CHARGES_WORDING_VERSION): { multiPropertyAttestations: MultiPropertyAttestations } => ({
  multiPropertyAttestations: { noCommonCharges: { answer, at: AT, wordingVersion } },
});

async function loadReducer() {
  process.env.NEXT_PUBLIC_SUPABASE_URL ??= "https://test.invalid.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??= "test-anon-key";
  return (await import("@/lib/lmnp/store/reducer")).lmnpReducer;
}
async function dispatch(workspace: PersistedWorkspace, action: Article39cQualificationAction | undefined): Promise<PersistedWorkspace> {
  assert.ok(action);
  const reducer = await loadReducer();
  const next = reducer({ ...workspace, fileRegistry: new Map() } as never, action as never) as unknown as PersistedWorkspace;
  const { fileRegistry: _ignored, ...persistable } = next as unknown as Record<string, unknown>;
  void _ignored;
  return roundtrip(persistable as unknown as PersistedWorkspace).reloaded;
}
const firstYear = (ws: PersistedWorkspace): PersistedWorkspace =>
  ({ ...ws, fiscalYear: { ...ws.fiscalYear, priorHistoryDeclaration: { status: "FIRST_REAL_YEAR", declaredAt: AT } } }) as PersistedWorkspace;
const withStocks = (ws: PersistedWorkspace, stocks: { deficits: { millesime: number; montant: number }[]; amortissementsReportes: number }): PersistedWorkspace =>
  ({ ...ws, fiscalYear: { ...ws.fiscalYear, previousFiscalYearId: "fy-0", stocksOuverture: { sourceClosureId: "closure-2025", stocks } } }) as PersistedWorkspace;
const exactBien = (id: string, e: number, c: Parameters<typeof collected>[0] = {}, extra: Parameters<typeof bien>[1] = {}, cc = 0, ac = 0) =>
  bien(id, { rent: rentState(id, e, cc, ac), collected: collected(c), logement: {}, dotation: 0, ...extra });
const gate = (ws: PersistedWorkspace, remote: RemoteAntiDowngradeAttestation | null = REMOTE_OK, extra: { openingStocks?: Article39cOpeningStocks; activityLines?: readonly LigneCharge[] } = {}) =>
  canSwitchToExactFiscalEngine({ workspace: roundtrip(ws).reloaded, expectedDossierId: DOSSIER, ...(remote !== null ? { remoteAntiDowngrade: remote } : {}), ...extra });
const pre = (ws: PersistedWorkspace, extra: { openingStocks?: Article39cOpeningStocks; activityLines?: readonly LigneCharge[] } = {}) =>
  evaluateArticle39cPreSwitchReadiness({ workspace: roundtrip(ws).reloaded, expectedDossierId: DOSSIER, ...extra });
const addAccounting = async (ws: PersistedWorkspace, amount = "1000", nature: "ACCOUNTING_FEES" | "OTHER" = "ACCOUNTING_FEES", description = "") => {
  const res = buildActivityChargeDeclaration({ draft: ws.declarationDraft, fiscalYear: YEAR, nature, amountText: amount, description, answeredAt: AT });
  assert.ok(res.ok, JSON.stringify(res));
  return dispatch(ws, res.action);
};
/** Multi de base : A L10k/B2k, B L8k/B1k, dotations 1k + 1k (aucune ARD générée). */
const multiBase = (extraDraft: Record<string, unknown> = { ...attest("confirmed") }) =>
  multiWorkspace(
    { A: exactBien("A", 10000, { taxeFonciere: 2000 }, { dotation: 1000 }), B: exactBien("B", 8000, { taxeFonciere: 1000 }, { dotation: 1000 }) },
    { bilanPatrimonial: NEUTRAL, ...extraDraft },
  );

describe("INT-4.1 — stocks d'ouverture multi : globaux et démontrés, jamais répartis", () => {
  it("4.1-01 — multi + ARD global démontré (continuité native) → exact readiness accepte, ARD consommé globalement", () => {
    const r = pre(withStocks(multiBase(), { deficits: [], amortissementsReportes: 1500 }));
    assert.equal(r.status, "READY");
    assert.equal(r.exact.engine!.figures!.ardConsomme, 1500);
    assert.deepEqual(r.exact.consolidated.architecture, { capacityScope: "ACTIVITY", engineCalls: 1 });
    assert.equal(r.checks.find((c) => c.id === "MULTI_STOCKS_GLOBAL")!.ok, true);
  });

  it("4.1-02 — multi + ARD de portée non démontrée (par bien) ou ARD GÉNÉRÉE → OUT_OF_DOMAIN (allocation par bien non établie, TRF-0035)", () => {
    const base = firstYear(multiBase());
    for (const stocks of [
      { kind: "PROVIDED", historicalArdStock: 1000, priorDeficits: [] }, // portée absente
      { kind: "PROVIDED", historicalArdStock: 1000, priorDeficits: [], scope: "PROPERTY_ATTRIBUTED" },
    ] as Article39cOpeningStocks[]) {
      const r = pre(base, { openingStocks: stocks });
      assert.equal(r.status, "OUT_OF_DOMAIN");
      assert.ok(r.reasons.includes("OPENING_STOCK_REQUIRES_PROPERTY_ALLOCATION"));
    }
    // ARD générée : dotation > capacité en multi.
    const generated = firstYear(
      multiWorkspace({ A: exactBien("A", 10000, { taxeFonciere: 9000 }, { dotation: 2000 }), B: exactBien("B", 8000, { taxeFonciere: 7000 }, { dotation: 2000 }) }, { bilanPatrimonial: NEUTRAL, ...attest("confirmed") }),
    );
    const g = pre(generated);
    assert.equal(g.status, "OUT_OF_DOMAIN");
    assert.ok(g.reasons.includes("GENERATED_ARD_REQUIRES_PROPERTY_ALLOCATION"));
    // Le même scénario en MONO reste dans le domaine (ARD générée suivie globalement).
    const mono = firstYear(monoWorkspace("A", exactBien("A", 10000, { taxeFonciere: 9000 }, { dotation: 2000 }), { bilanPatrimonial: NEUTRAL }));
    assert.equal(pre(mono).status, "READY");
  });

  it("4.1-03 — multi + déficit antérieur global démontré → accepté, imputé globalement après l'ARD", () => {
    const r = pre(withStocks(multiBase(), { deficits: [{ millesime: 2025, montant: 800 }], amortissementsReportes: 0 }));
    assert.equal(r.status, "READY");
    assert.equal(r.exact.engine!.figures!.deficitsImputes, 800);
  });

  it("4.1-04 — ARD et déficit restent deux stocks séparés (multi)", () => {
    const ws = withStocks(multiBase(), { deficits: [{ millesime: 2025, montant: 800 }], amortissementsReportes: 600 });
    const resolved = resolveArticle39cOpeningStocks({ fiscalYear: ws.fiscalYear });
    assert.deepEqual(resolved.status === "RESOLVED" && resolved.stocks.kind === "PROVIDED" ? [resolved.stocks.historicalArdStock, resolved.stocks.priorDeficits] : null, [600, [{ millesime: 2025, montant: 800 }]]);
    const f = pre(ws).exact.engine!.figures!;
    assert.deepEqual([f.ardConsomme, f.deficitsImputes], [600, 800]);
  });
});

describe("INT-4.1 — ACTIVITY globale et charges communes : admission précise", () => {
  it("4.1-05 — ACTIVITY globale 1 000 € → exact readiness accepte, sans propertyId, une seule fois", async () => {
    const ws = firstYear(await addAccounting(multiBase()));
    const r = pre(ws);
    assert.equal(r.status, "READY");
    const globals = r.exact.consolidated.contributions.filter((c) => c.scope.level === "ACTIVITY");
    assert.equal(globals.length, 1);
    assert.ok(!("propertyId" in globals[0]!.scope));
    assert.equal(r.exact.consolidated.activityCents.ACTIVITY, eur(1000));
    assert.deepEqual(globals[0]!.scope, ACTIVITY);
  });

  it("4.1-06 — dossier LEGACY (OLD_PROXY) : le garde productif reste FERMÉ (aucune charge d'activité omise en silence) ; dossier exact : jamais de repli proxy", async () => {
    const legacyBien = bien("A", { collected: collected({ taxeFonciere: 7000 }), logement: {}, dotation: 0 });
    const legacy = await addAccounting(monoWorkspace("A", legacyBien, { revenusAssistant: { exerciceFiscal: YEAR, totalRecettes: 12000 } }));
    const viaWorkspace = runDeclarationGenerationFromWorkspace(legacy, {});
    assert.equal(viaWorkspace.status, "blocked");
    assert.ok(viaWorkspace.status === "blocked" && "blockingReasons" in viaWorkspace && viaWorkspace.blockingReasons.some((b) => b.code === LEGACY_PROXY_OMITS_EXACT_CHARGES_CODE));
    const direct = runDeclarationGeneration(legacy.declarationDraft, YEAR);
    assert.ok(direct.status === "blocked" && direct.anomalies.some((a) => a.message.includes(LEGACY_PROXY_OMITS_EXACT_CHARGES_CODE)));
    // Dossier exact : le calcul exact consomme la charge ; ni le garde OLD_PROXY ni un repli ne s'appliquent.
    const exactWs = await addAccounting(firstYear(monoWorkspace("A", exactBien("A", 10000, { taxeFonciere: 7000 }, { dotation: 0 }), { bilanPatrimonial: NEUTRAL })));
    assert.equal(pre(exactWs).status, "READY");
    const exactRun = runDeclarationGenerationFromWorkspace(exactWs, {});
    assert.ok(!(exactRun.status === "blocked" && "blockingReasons" in exactRun && exactRun.blockingReasons.some((b) => b.code === LEGACY_PROXY_OMITS_EXACT_CHARGES_CODE)));
    // Une simple réponse de nature (PNO…) ne crée aucune charge : le garde ne se déclenche pas sur un dossier legacy.
    const plain = monoWorkspace("A", legacyBien, { revenusAssistant: { exerciceFiscal: YEAR, totalRecettes: 12000 } });
    const g = runDeclarationGenerationFromWorkspace(plain, {});
    assert.ok(!(g.status === "blocked" && "blockingReasons" in g && g.blockingReasons.some((b) => b.code === LEGACY_PROXY_OMITS_EXACT_CHARGES_CODE)));
  });

  it("4.1-07 — charge commune B → fail-closed (aucune répartition)", () => {
    const commonB = { id: "tf", description: "Taxe", montant: 500, categorie: "taxe_fonciere", deductibilite: "deductible", montantDeductible: 500, montantPreExploitation: 0, montantAmortissable: 0, source: "manual" } as LigneCharge;
    const r = pre(firstYear(multiBase()), { activityLines: [commonB] });
    assert.equal(r.status, "OUT_OF_DOMAIN");
    assert.ok(r.reasons.includes("COMMON_CHARGE_NOT_SUPPORTED"));
  });

  it("4.1-08 — charge commune non qualifiée (UNKNOWN) → fail-closed même si immatérielle ; la CFE reste régie par la matérialité du moteur", async () => {
    const other = await addAccounting(firstYear(multiBase()), "50", "OTHER", "Frais divers");
    const r = pre(other);
    assert.equal(r.status, "OUT_OF_DOMAIN");
    assert.ok(r.reasons.includes("COMMON_CHARGE_NOT_SUPPORTED"));
    const noProperty = r.exact.consolidated.contributions.find((c) => c.scope.level === "ACTIVITY")!;
    assert.equal(noProperty.class, "NEEDS_QUALIFICATION");
  });

  it("4.1-09 — charge commune ACTIVITY : aucune allocation (B inchangé, aucun montant par bien)", async () => {
    const without = pre(firstYear(multiBase()));
    const withCharge = pre(firstYear(await addAccounting(multiBase())));
    assert.equal(withCharge.exact.consolidated.byClassCents.B, without.exact.consolidated.byClassCents.B);
    assert.deepEqual(withCharge.exact.consolidated.byPropertyCents, without.exact.consolidated.byPropertyCents);
    assert.equal(withCharge.exact.engine!.figures!.capacite, without.exact.engine!.figures!.capacite, "la capacité C ne bouge pas");
  });
});

describe("INT-4.1 — sémantique « aucune charge à répartir » (dormante)", () => {
  it("4.1-10 — la nouvelle attestation n'autorise jamais une charge commune B ; lecture productive INCHANGÉE", () => {
    const commonB = { id: "tf", description: "Taxe", montant: 500, categorie: "taxe_fonciere", deductibilite: "deductible", montantDeductible: 500, montantPreExploitation: 0, montantAmortissable: 0, source: "manual" } as LigneCharge;
    const ws = firstYear(multiBase(attest("confirmed")));
    assert.equal(resolveNoAllocationChargesAttestation(ws.declarationDraft?.multiPropertyAttestations), "confirmed");
    assert.equal(pre(ws, { activityLines: [commonB] }).status, "OUT_OF_DOMAIN");
    // Table de lecture.
    assert.equal(resolveNoAllocationChargesAttestation(undefined), "absent");
    assert.equal(resolveNoAllocationChargesAttestation(attest("confirmed", "2026-10-03.1").multiPropertyAttestations), "confirmed", "l'ancienne confirmation implique la nouvelle");
    assert.equal(resolveNoAllocationChargesAttestation(attest("declared_out_of_domain", "2026-10-03.1").multiPropertyAttestations), "legacy_declared_common", "ancien refus ambigu : à reposer");
    assert.equal(resolveNoAllocationChargesAttestation(attest("declared_out_of_domain").multiPropertyAttestations), "declared_requires_allocation");
    // Garde productif : la même réponse est lue comme avant (aucune réinterprétation).
    assert.equal(resolveMultiPropertyAttestation(attest("declared_out_of_domain").multiPropertyAttestations, "noCommonCharges"), "declared_out_of_domain");
    assert.equal(resolveMultiPropertyAttestation(recordNoAllocationChargesAttestation(undefined, "confirmed", AT), "noCommonCharges"), "confirmed");
    // Statuts du dossier exact selon l'attestation.
    assert.equal(pre(firstYear(multiBase({}))).status, "INVALID");
    assert.equal(pre(firstYear(multiBase(attest("declared_out_of_domain", "2026-10-03.1")))).status, "NEEDS_QUALIFICATION");
    assert.equal(pre(firstYear(multiBase(attest("declared_out_of_domain")))).status, "OUT_OF_DOMAIN");
  });
});

describe("INT-4.1 — bilan : ownership F013 des postes locatifs, autres dettes intactes", () => {
  const FISCAL_RESULT = {
    exercice: YEAR, recettes: { total: 12000 },
    charges: { totalDeductible: 4000, chargesExploitation: 4000, chargesFinancement: 0, chargesPreExploitation: 0, totalNonDeductible: 100 },
    resultatAvantAmort: 7000, amortCalcule: 1500, amortDeduct: 1500, amortReporte: 0, amortNonDeduitExercice: 0, amortReportesUtilises: 0,
    resultatFiscal: 5500, deficitNouveau: 0, deficitsImputes: 0, perteExceptionnelle: 0,
    stocks: { deficits: [], amortissementsReportes: 0, deficitsExpires: [] },
    trace: { ksArtifacts: ["TRF-0032"], computedAt: "2026-08-31T00:00:00.000Z", journal: [] },
    status: "computed", anomalies: [],
  };
  const RFS = {
    exercice: YEAR,
    identite: { siren: "104545108", siret: "10454510800011", denomination: "Ownership" },
    fiscalResult: FISCAL_RESULT,
    immobilisations: { lignes: [{ label: "Composant", montant: 45000, dureeAnnees: 30, dotationExercice: 1500, amortissementsCumules: 1500, vnc: 43500 }], totalAnnuelExercice: 1500, totalBrut: 45000, valeurTerrain: 15000 },
    emprunts: [],
    trace: { ksArtifacts: ["TRF-0032"], assembledAt: "2026-08-31T00:00:00.000Z", sourceFiscalResultAt: FISCAL_RESULT.trace.computedAt, sources: { identite: "x", fiscalResult: "y" } },
  } as unknown as FiscalRepresentation;
  const states = [rentState("A", 12500, 0, 500)];

  it("4.1-11 — avance F013 + `tiers.dettes = NUL_CONFIRME` : le plan est APPLIQUÉ au switch (INT-5), plus aucune contradiction, le pré-switch est vert", () => {
    const ws = firstYear(monoWorkspace("A", exactBien("A", 12500, { taxeFonciere: 7000 }, {}, 0, 500), { bilanPatrimonial: { ...NEUTRAL, tiers: { dettes: { status: "NUL_CONFIRME" } } } }));
    const g = gate(ws);
    assert.equal(g.preSwitch.status, "READY");
    assert.deepEqual(g.blockers, []);
    assert.deepEqual(g.preSwitch.bilan.conflicts, []);
    assert.ok(g.preSwitch.bilan.superseded >= 1);
  });

  it("4.1-12 — l'ownership identifie PRÉCISÉMENT chaque source concurrente du poste locatif", () => {
    const legacy: BilanInputs = {
      ...NEUTRAL,
      tiers: { dettes: { status: "NUL_CONFIRME" } },
      lignesSimples: { produitsConstatesAvance: { status: "DECLARE", montant: 800 } },
      ventilationTiers: { postes: [{ id: "legacy-ac", montant: 500, nature: "LOYER_ENCAISSE_D_AVANCE" }, { id: "fourn", montant: 200, nature: "FOURNISSEUR_NON_PAYE" }] },
    };
    const o = describeRentalBilanOwnership({ bilan: legacy, fiscalYear: YEAR, propertyIds: ["A"], states });
    assert.equal(o.owner, "F013_V2_AUTHORITATIVE");
    assert.deepEqual(o.ownedNatures.slice().sort(), ["LOYER_DU_PAR_LOCATAIRE", "LOYER_ENCAISSE_D_AVANCE"]);
    assert.deepEqual(
      o.competing.map((c) => [c.source, c.ref ?? null, c.resolution]),
      [["ventilation_poste", "legacy-ac", "REPLACED_BY_F013"], ["ligne_simple_174", null, "NEUTRALIZED_BY_F013"], ["tiers_bucket", "tiers.dettes", "REPLACED_BY_F013"]],
    );
    assert.ok(!o.competing.some((c) => c.ref === "fourn"), "une dette fournisseur n'est jamais une source concurrente du loyer");
    assert.deepEqual(o.switchPlans, [{ bucket: "dettes", nature: "LOYER_ENCAISSE_D_AVANCE", action: "REPLACE_NUL_CONFIRME_BY_F013_RENTAL_COMPONENT", resultingBucket: { status: "DECLARE", montant: 500 }, otherItemsPreserved: true }]);
    assert.equal(describeRentalBilanOwnership({ bilan: legacy, fiscalYear: YEAR, propertyIds: ["A"], states: [] }).owner, "NOT_APPLICABLE");
  });

  it("4.1-13 — les autres dettes restent INTACTES : bucket DECLARE conservé tel quel, postes non locatifs conservés, jamais INCONNU", () => {
    const tiers = { dettes: { status: "DECLARE", montant: 700 } } as const;
    const legacy: BilanInputs = { ...NEUTRAL, tiers, ventilationTiers: { postes: [{ id: "legacy-ac", montant: 500, nature: "LOYER_ENCAISSE_D_AVANCE" }, { id: "fourn", montant: 200, nature: "FOURNISSEUR_NON_PAYE" }] } };
    const eff = resolveEffectiveBilanWithRentInventory({ bilan: legacy, fiscalYear: YEAR, propertyIds: ["A"], states });
    assert.equal(eff.bilan.tiers, tiers, "un bucket DECLARE n'est pas modifié (ni effacé ni mis à INCONNU)");
    const patrimoine = assemblePatrimoine(RFS, eff.bilan);
    const cases = patrimoine.ventilationTiers.cases;
    assert.deepEqual([cases.fournisseurs.status, (cases.fournisseurs as { montant: number }).montant], ["DECLARE", 200]);
    assert.equal((cases.produitsConstatesAvance as { montant: number }).montant, 500, "avance comptée une seule fois");
    assert.deepEqual(patrimoine.ventilationTiers.conflits, [], "bucket 700 = 200 + 500 : couverture complète");
    // NUL_CONFIRME : seul le composant locatif est apporté ; le bucket n'est jamais INCONNU.
    const plan = describeRentalBilanOwnership({ bilan: { ...NEUTRAL, tiers: { dettes: { status: "NUL_CONFIRME" } } }, fiscalYear: YEAR, propertyIds: ["A"], states }).switchPlans[0]!;
    assert.deepEqual(plan.resultingBucket, { status: "DECLARE", montant: 500 });
    assert.equal(plan.otherItemsPreserved, true);
  });
});

describe("INT-4.1 — première année et switch gate", () => {
  const monoExact = () => firstYear(monoWorkspace("A", exactBien("A", 10000, { taxeFonciere: 7000, honorairesComptable: 1000 }, { dotation: 2500 }), { bilanPatrimonial: NEUTRAL }));

  it("4.1-14 — première année explicitement déclarée → NONE_FIRST_YEAR ; 4.1-15 — date de mise en service / début d'activité seules → UNKNOWN", () => {
    const declared = resolveArticle39cOpeningStocks({ fiscalYear: monoExact().fiscalYear });
    assert.equal(declared.status === "RESOLVED" ? declared.stocks.kind : null, "NONE_FIRST_YEAR");
    const bare = monoWorkspace("A", exactBien("A", 10000), { activityStartDate: "2026-01-01", dateMiseEnService: "2026-01-01", bilanPatrimonial: NEUTRAL });
    assert.deepEqual(resolveArticle39cOpeningStocks({ fiscalYear: bare.fiscalYear }), { status: "UNKNOWN", reasons: ["OPENING_STOCKS_UNKNOWN", "PRIOR_HISTORY_ANSWER_REQUIRED"] });
    assert.equal(gate(bare).canSwitch, false);
  });

  it("4.1-16 — F013 v1 : jamais prêt au switch", () => {
    const v1 = firstYear(monoWorkspace("A", bien("A", { collected: collected({ taxeFonciere: 7000 }), logement: {}, dotation: 0 }), { bilanPatrimonial: NEUTRAL, revenusAssistant: { exerciceFiscal: YEAR, totalRecettes: 12000 } }));
    const g = gate(v1);
    assert.equal(g.canSwitch, false);
    assert.equal(g.preSwitch.readyForExact39c, false);
    assert.equal(g.f013V2ActivationBlocker, "DOSSIER_NOT_READY");
  });

  it("4.1-17 — F013 v2 complet + mono exact → switch-ready (le gate ne switch rien)", () => {
    const g = gate(monoExact());
    assert.deepEqual(g.blockers, []);
    assert.equal(g.canSwitch, true);
    assert.deepEqual([g.effect, g.productiveF006, g.f013V2ActivationBlocker], ["NONE", "OLD_PROXY", "SWITCH_BOUND_ONLY"]);
    assert.ok(g.switchBoundItems.includes("F013_V2_GLOBAL_FLAG_OFF") && g.switchBoundItems.includes("PRODUCTIVE_F006_STILL_OLD_PROXY"));
  });

  it("4.1-18 — F013 v2 multi exact + ACTIVITY globale + stocks démontrés → switch-ready", async () => {
    const ws = await addAccounting(withStocks(multiBase(), { deficits: [{ millesime: 2025, montant: 300 }], amortissementsReportes: 400 }));
    const g = gate(ws);
    assert.deepEqual(g.blockers, []);
    assert.equal(g.canSwitch, true);
    assert.equal(g.preSwitch.multi.applicable, true);
    assert.ok(g.switchBoundItems.includes("ADR011_PRODUCTIVE_MULTI_DOMAIN_GUARD_TO_EVOLVE_AT_SWITCH"));
  });

  it("remote anti-downgrade : absent / non vérifié / échec / attestation incomplète → gate ROUGE, dossier pourtant prêt", () => {
    const ws = monoExact();
    assert.equal(pre(ws).readyForExact39c, true);
    assert.deepEqual([gate(ws, null).canSwitch, gate(ws, null).blockers], [false, ["REMOTE_ANTI_DOWNGRADE_NOT_VERIFIED"]]);
    assert.deepEqual(gate(ws, { status: "NOT_VERIFIED" }).blockers, ["REMOTE_ANTI_DOWNGRADE_NOT_VERIFIED"]);
    assert.deepEqual(gate(ws, { status: "FAIL", reason: "trigger absent" }).blockers, ["REMOTE_ANTI_DOWNGRADE_FAIL"]);
    const incomplete = { ...REMOTE_OK, projectRef: " " } as RemoteAntiDowngradeAttestation;
    assert.deepEqual(gate(ws, incomplete).blockers, ["REMOTE_ANTI_DOWNGRADE_FAIL"]);
    assert.equal(gate(ws, REMOTE_OK).canSwitch, true);
  });

  it("ORACLE 39C-01 (via le gate) : L 10k, B 7k, ACT 1k, dotation 2,5k → C 3k, D 2,5k, ARD 0, après −500, déficit 500", () => {
    const f = gate(monoExact()).preSwitch.exact.engine!.figures!;
    assert.deepEqual([f.capacite, f.amortDeduit, f.ardNouvelle, f.resultatApresAmortissements, f.deficitNouveau], [3000, 2500, 0, -500, 500]);
  });

  it("ORACLE C (via le gate, 2033-B inchangée) : ACT 1k, dotation 1,5k, ARD historique 1,5k → avant 2k, C 3k, D 1,5k, H 1,5k, après −1k, ARD final 0, déficit 1k", () => {
    const ws = withStocks(monoWorkspace("A", exactBien("A", 10000, { taxeFonciere: 7000, honorairesComptable: 1000 }, { dotation: 1500 }), { bilanPatrimonial: NEUTRAL }), { deficits: [], amortissementsReportes: 1500 });
    const g = gate(ws);
    assert.equal(g.canSwitch, true);
    const f = g.preSwitch.exact.engine!.figures!;
    assert.deepEqual(
      [f.resultatAvantAmort, f.capacite, f.amortDeduit, f.ardConsomme, f.resultatApresAmortissements, f.stockArdFinal, f.deficitNouveau],
      [2000, 3000, 1500, 1500, -1000, 0, 1000],
    );
  });
});
