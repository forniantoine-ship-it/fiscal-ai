/**
 * MB-MULTI-SERVER-TRUST-2 — le CLIENT peut DEMANDER une action ; il ne DÉFINIT JAMAIS le résultat fiscal livré.
 *
 * Contrat de confiance testé (checkout + livraison Cerfa + aide 2042-C-PRO) : le serveur authentifie, vérifie la propriété et
 * l'entitlement, charge le snapshot PERSISTÉ courant, vérifie `expectedRevision`, évalue le domaine, RECALCULE la génération
 * (un seul F-006), puis livre exclusivement depuis SA RFS. Une RFS envoyée par le client n'est jamais une autorité.
 *
 * Résiduel assumé (hors périmètre, documenté) : le propriétaire peut mentir dans les faits bruts qu'il persiste (attestations,
 * nombre de biens…). Ces tests ne prétendent pas prouver la vérité de ces faits mais l'absence de contournement par la requête.
 *
 * Run: npx tsx --test src/lib/lmnp/services/declaration/server-trust-2.test.ts
 */
import "@/lab/v2-dossier/test-public-env";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it, mock } from "node:test";
import { PDFDocument } from "pdf-lib";

import { handleAide2042PdfRequest } from "@/app/api/lmnp/declaration/aide-2042-pdf/handler";
import { handleCerfaPdfRequest } from "@/app/api/lmnp/declaration/cerfa-pdf/handler";
import { MULTI_PROPERTY_DOMAIN_REASON_CODES as REASON } from "@/lib/lmnp/dossier/multi-property-domain";
import { handleCheckoutRequest } from "@/lib/lmnp/services/payment/checkout-handler";
import { handlePriorHistoryRequest } from "@/lib/lmnp/services/payment/prior-history-handler";
import { resolveDeliveryAccess } from "@/lib/lmnp/services/payment/delivery-access";
import { createFakePaymentEnv, jsonPost } from "@/lib/lmnp/services/payment/payment-fakes";
import { buildCerfaPdfRequestPayload } from "@/lib/lmnp/services/declaration/download-cerfa-pdf";
import { fetchAide2042PdfBytes } from "@/lib/lmnp/services/declaration/download-aide-2042-pdf";
import { resolveAuthoritativeDelivery } from "@/lib/lmnp/services/declaration/authoritative-delivery";
import { runDeclarationGenerationFromWorkspace } from "@/lib/lmnp/services/declaration/generation-workspace";
import { resolveImmobilisationsContinuityForGeneration } from "@/lib/lmnp/services/dossier/fiscal-year-cycle";
import { extractDrawnStringsForPage } from "@/lib/lmnp/services/liasse-pdf/tests/extract-rendered-text";
import { workspaceSnapshotSchemaVersion } from "@/lib/lmnp/store/workspace-snapshot";
import { produceFiscalResult } from "@/runtime/capabilities/f006/produce-fiscal-result";
import type { PersistedWorkspace } from "@/lib/lmnp/store/persistence";
import type { FiscalRepresentation } from "@/runtime/capabilities/rfs/types";

import { A, B, SPEC_A, STOCKS, T, Y, monoWorkspace, multiWorkspace, oracleBien } from "./multi-property-test-support";

const URL_CERFA = "https://app.fiscal-ai.test/api/lmnp/declaration/cerfa-pdf";
const URL_AIDE = "https://app.fiscal-ai.test/api/lmnp/declaration/aide-2042-pdf";
const URL_CHECKOUT = "https://app.fiscal-ai.test/api/lmnp/payment/checkout";
const DOSSIER = "dossier-X";
const FORMS = ["2031-SD", "2033-B-SD"];
const clone = <V>(value: V): V => JSON.parse(JSON.stringify(value));

// --- fixtures -----------------------------------------------------------------------------------------------------------------

/** État persisté par l'écran de validation d'un dossier réellement prêt : antériorité répondue, étapes confirmées. */
function confirmed(workspace: PersistedWorkspace): PersistedWorkspace {
  const ws = clone(workspace);
  const draft = ws.declarationDraft as unknown as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
  (ws.fiscalYear as { priorHistoryDeclaration?: unknown }).priorHistoryDeclaration = { status: "FIRST_REAL_YEAR", declaredAt: T };
  draft.inpiConfirmedAt = T;
  if (!draft.biens) {
    draft.revenusConfirmedAt ??= T;
    if (draft.financementCharges !== undefined) draft.creditConfirmedAt ??= T;
  }
  for (const bien of Object.values<Record<string, unknown>>(draft.biens ?? {})) {
    bien.revenusConfirmedAt ??= T;
    if (bien.financementCharges !== undefined) bien.creditConfirmedAt ??= T;
  }
  return ws;
}

const SIMPLE_MULTI = (): PersistedWorkspace => confirmed(multiWorkspace({ specs: [[A, oracleBien(6000, 1000, 1000)], [B, oracleBien(5000, 2000, 2000)]] }));
/** Deux pertes avec dotations : ARD GÉNÉRÉ après F-006 (G21). */
const LOSSES_WITH_DEPRECIATION = (): PersistedWorkspace =>
  confirmed(multiWorkspace({ specs: [[A, oracleBien(1000, 3000, 1000)], [B, oracleBien(1000, 3000, 1000)]] }));
const MONO = (): PersistedWorkspace => confirmed(monoWorkspace(SPEC_A));

function rowOf(workspace: PersistedWorkspace, revision = 1) {
  const schemaVersion = workspaceSnapshotSchemaVersion(workspace);
  return { schemaVersion, revision, payload: clone({ schemaVersion, workspace }) } as never;
}

function setup(workspace?: PersistedWorkspace, revision = 1) {
  const env = createFakePaymentEnv();
  env.addUser("tok-antoine", "user-antoine");
  env.addUser("tok-eve", "user-eve");
  env.addDossier(DOSSIER, "user-antoine");
  env.addDossier("dossier-EVE", "user-eve");
  if (workspace) env.setSnapshot(DOSSIER, Y, rowOf(workspace, revision));
  const access = (input: Parameters<typeof resolveDeliveryAccess>[0]) => resolveDeliveryAccess(input, env.deps);
  const deliveryDeps = (extra: Record<string, unknown> = {}) => ({ readSnapshot: env.deps.readWorkspaceSnapshot, ...extra });
  const base = (extra: Record<string, unknown> = {}) => ({
    declarationVersionId: "v1", forms: FORMS, authToken: "tok-antoine", dossierId: DOSSIER, fiscalYear: Y, expectedRevision: revision, ...extra,
  });
  const cerfa = (body: Record<string, unknown>, extra: Record<string, unknown> = {}) =>
    (handleCerfaPdfRequest as (...args: unknown[]) => Promise<Response>)(jsonPost(URL_CERFA, body), access, undefined, deliveryDeps(extra));
  const aide = (body: Record<string, unknown>, extra: Record<string, unknown> = {}) =>
    (handleAide2042PdfRequest as (...args: unknown[]) => Promise<Response>)(jsonPost(URL_AIDE, body), access, undefined, deliveryDeps(extra));
  const checkout = (extra: Record<string, unknown> = {}) =>
    handleCheckoutRequest(jsonPost(URL_CHECKOUT, { authToken: "tok-antoine", dossierId: DOSSIER, fiscalYear: Y, ...extra }), () => env.deps);
  /** Réponse d'antériorité enregistrée côté serveur, comme par l'écran de validation (sans elle l'éligibilité refuse tout paiement). */
  const declareEligible = () =>
    handlePriorHistoryRequest(
      jsonPost("https://app.fiscal-ai.test/api/lmnp/payment/prior-history", { authToken: "tok-antoine", dossierId: DOSSIER, fiscalYear: Y, status: "FIRST_REAL_YEAR" }),
      () => env.deps,
    );
  return { env, base, cerfa, aide, checkout, declareEligible };
}

/** RFS « client » honnête telle que le navigateur la produit aujourd'hui (même appel de génération). */
function clientRfs(workspace: PersistedWorkspace): FiscalRepresentation {
  const outcome = runDeclarationGenerationFromWorkspace(workspace, {});
  assert.equal(outcome.status, "generated", JSON.stringify((outcome as { blockingReasons?: unknown }).blockingReasons));
  if (outcome.status !== "generated") throw new Error("unreachable");
  return clone(outcome.rfs);
}

const bytesOf = async (response: Response) => new Uint8Array(await response.arrayBuffer());
async function liasseTexts(response: Response) {
  assert.equal(response.status, 200);
  const bytes = await bytesOf(response);
  return { p1: await extractDrawnStringsForPage(bytes, 1), p2: await extractDrawnStringsForPage(bytes, 2), p3: await extractDrawnStringsForPage(bytes, 3) };
}
const aideTexts = (bytes: Uint8Array): string[] =>
  [...Buffer.from(bytes).toString("latin1").matchAll(/\(((?:[^()\\]|\\.)*)\)\s*Tj/g)].map((match) => match[1]!);
const bodyOf = async (response: Response) => (await response.json()) as Record<string, unknown>;

// ===========================================================================================================================
// DELIVERY TRUST
// ===========================================================================================================================

describe("DELIVERY — le serveur recalcule depuis le snapshot courant, jamais depuis la RFS du client", () => {
  it("1. snapshot à deux biens HORS domaine + RFS client sans marqueur multi → jamais traité comme mono", async () => {
    const { env, base, cerfa } = setup(LOSSES_WITH_DEPRECIATION());
    await env.seedPaid(DOSSIER, Y);
    const monoLooking = clientRfs(MONO());
    assert.equal((monoLooking as { immobilisationsParBien?: unknown }).immobilisationsParBien, undefined, "précondition : RFS client à forme mono");
    const res = await cerfa(base({ rfs: monoLooking }));
    assert.equal(res.status, 422);
    assert.equal((await bodyOf(res)).status, "blocked");
  });

  it("2. le recalcul serveur produit un ARD > 0 alors que la RFS client dit 0 → refus G21", async () => {
    const { env, base, cerfa } = setup(LOSSES_WITH_DEPRECIATION());
    await env.seedPaid(DOSSIER, Y);
    const rfs = clientRfs(SIMPLE_MULTI());
    rfs.fiscalResult = { ...rfs.fiscalResult, amortNonDeduitExercice: 0 };
    const res = await cerfa(base({ rfs }));
    assert.equal(res.status, 422);
    const body = await bodyOf(res);
    assert.equal(body.reason, "multi_property_domain_unsupported");
    assert.ok((body.domainReasons as string[]).includes("multi_property_39c_allocation_not_supported"));
  });

  it("3. résultat imposable falsifié dans la RFS client → le livré vient du recalcul serveur (Cerfa)", async () => {
    const { env, base, cerfa } = setup(MONO());
    await env.seedPaid(DOSSIER, Y);
    const honest = await liasseTexts(await cerfa(base({ rfs: clientRfs(MONO()) })));
    const forged = clientRfs(MONO());
    forged.fiscalResult = { ...forged.fiscalResult, resultatFiscalAvantDeficits: 123456, resultatFiscal: 123456, recettes: { ...forged.fiscalResult.recettes, total: 999999 } } as never;
    assert.deepEqual(await liasseTexts(await cerfa(base({ rfs: forged }))), honest);
  });

  it("3b. même garantie pour l'aide 2042-C-PRO", async () => {
    const { env, base, aide } = setup(MONO());
    await env.seedPaid(DOSSIER, Y);
    const body = (rfs?: unknown) => base({ ...(rfs ? { rfs } : {}), forms: undefined });
    const honestRes = await aide(body(clientRfs(MONO())));
    assert.equal(honestRes.status, 200);
    const forged = clientRfs(MONO());
    forged.fiscalResult = { ...forged.fiscalResult, resultatFiscalAvantDeficits: 123456, resultatFiscal: 123456 } as never;
    const forgedRes = await aide(body(forged));
    assert.equal(forgedRes.status, 200);
    assert.deepEqual(aideTexts(await bytesOf(forgedRes)), aideTexts(await bytesOf(honestRes)));
  });

  it("4. ventilation par bien falsifiée dans la RFS client → le livré vient du recalcul serveur", async () => {
    const { env, base, cerfa } = setup(SIMPLE_MULTI());
    await env.seedPaid(DOSSIER, Y);
    const honest = await liasseTexts(await cerfa(base({ rfs: clientRfs(SIMPLE_MULTI()) })));
    const forged = clientRfs(SIMPLE_MULTI());
    forged.immobilisationsParBien = (forged.immobilisationsParBien ?? []).map((bloc, index) => ({ ...bloc, propertyId: `faux-${index}`, dotationsExercice: 777 })) as never;
    forged.fiscalResult = { ...forged.fiscalResult, resultatFiscalAvantDeficits: 424242, resultatFiscal: 424242 } as never;
    assert.deepEqual(await liasseTexts(await cerfa(base({ rfs: forged }))), honest);
  });

  it("5. déficits falsifiés dans la RFS client → le livré vient du recalcul serveur", async () => {
    const { env, base, cerfa } = setup(MONO());
    await env.seedPaid(DOSSIER, Y);
    const honest = await liasseTexts(await cerfa(base({ rfs: clientRfs(MONO()) })));
    const forged = clientRfs(MONO());
    forged.deficitsOuverture = { source: "fiscal_year_stocks_ouverture", deficits: [{ millesime: 2024, montant: 90000 }] } as never;
    forged.fiscalResult = { ...forged.fiscalResult, deficitsImputes: 90000, resultatFiscalApresDeficits: 0, deficitNouveau: 8000 } as never;
    assert.deepEqual(await liasseTexts(await cerfa(base({ rfs: forged }))), honest);
  });

  it("6. aucun snapshot serveur → échec fermé (jamais de repli sur la RFS du client)", async () => {
    const { env, base, cerfa, aide } = setup();
    await env.seedPaid(DOSSIER, Y);
    const withRfs = base({ rfs: clientRfs(MONO()) });
    const res = await cerfa(withRfs);
    assert.equal(res.status, 409);
    assert.equal((await bodyOf(res)).code, "workspace_snapshot_missing");
    const resAide = await aide({ ...withRfs, forms: undefined });
    assert.equal(resAide.status, 409);
    assert.equal((await bodyOf(resAide)).code, "workspace_snapshot_missing");
  });

  it("7. snapshot d'un autre dossier / d'un autre utilisateur → refus", async () => {
    const { env, base, cerfa } = setup(MONO());
    await env.seedPaid("dossier-EVE", Y);
    assert.equal((await cerfa(base({ dossierId: "dossier-EVE" }))).status, 403, "dossier d'autrui : propriété refusée avant toute lecture");
    // payload persisté qui se déclare appartenir à un autre dossier : jamais accepté comme celui demandé
    const foreign = MONO();
    (foreign.fiscalYear as { dossierId?: string }).dossierId = "dossier-EVE";
    env.setSnapshot(DOSSIER, Y, rowOf(foreign));
    await env.seedPaid(DOSSIER, Y);
    const res = await cerfa(base());
    assert.equal(res.status, 409);
    assert.equal((await bodyOf(res)).code, "workspace_snapshot_unreadable");
  });

  it("27. G22 — stock d'amortissements d'ouverture > 0 dans le snapshot → refus à la livraison (la RFS client ne peut pas l'effacer)", async () => {
    const workspace = confirmed(multiWorkspace({
      specs: [[A, oracleBien(6000, 1000, 1000)], [B, oracleBien(5000, 2000, 2000)]],
      fiscalYear: { stocksOuverture: { ...STOCKS, stocks: { deficits: [], amortissementsReportes: 500, deficitsExpires: [] } } },
    }));
    const { env, base, cerfa } = setup(workspace);
    await env.seedPaid(DOSSIER, Y);
    const res = await cerfa(base({ rfs: clientRfs(SIMPLE_MULTI()) }));
    assert.equal(res.status, 422);
    const body = await bodyOf(res);
    assert.ok((body.domainReasons as string[]).includes("multi_property_historical_ard_not_supported"));
  });
});

// ===========================================================================================================================
// REVISION
// ===========================================================================================================================

describe("REVISION — expectedRevision obligatoire et déterministe", () => {
  it("8. expectedRevision = révision courante → la livraison continue", async () => {
    const { env, base, cerfa } = setup(MONO(), 4);
    await env.seedPaid(DOSSIER, Y);
    assert.equal((await cerfa(base())).status, 200);
  });

  it("9. expectedRevision différente → 409 workspace_snapshot_stale (Cerfa et aide)", async () => {
    const { env, base, cerfa, aide } = setup(MONO(), 5);
    await env.seedPaid(DOSSIER, Y);
    for (const call of [() => cerfa(base({ expectedRevision: 4 })), () => aide(base({ expectedRevision: 4, forms: undefined }))]) {
      const res = await call();
      assert.equal(res.status, 409);
      assert.equal((await bodyOf(res)).code, "workspace_snapshot_stale");
    }
  });

  it("10. expectedRevision absente ou invalide → échec fermé (400 expected_revision_required), jamais acceptée silencieusement", async () => {
    const { env, base, cerfa, aide } = setup(MONO(), 1);
    await env.seedPaid(DOSSIER, Y);
    for (const bad of [undefined, null, "1", 0, -1, 1.5]) {
      const res = await cerfa(base({ expectedRevision: bad }));
      assert.equal(res.status, 400, String(bad));
      assert.equal((await bodyOf(res)).code, "expected_revision_required");
    }
    assert.equal((await aide(base({ expectedRevision: undefined, forms: undefined }))).status, 400);
  });
});

// ===========================================================================================================================
// CHECKOUT — état serveur courant
// ===========================================================================================================================

describe("CHECKOUT — l'admission se fonde sur le snapshot serveur courant", () => {
  it("11. multi : snapshot courant lu à chaque appel (supporté → checkout ; devenu non supporté → refus)", async () => {
    const { env, checkout, declareEligible } = setup(SIMPLE_MULTI());
    await declareEligible();
    assert.equal((await checkout()).status, 200, "T1 : payable");
    env.setSnapshot(DOSSIER, Y, rowOf(LOSSES_WITH_DEPRECIATION(), 2));
    const res = await checkout();
    assert.equal(res.status, 409);
  });

  const oneBien = (spec: ReturnType<typeof oracleBien>, extra: Record<string, unknown> = {}) => ({ ...spec, ...extra });
  const exclusions: Array<[string, () => PersistedWorkspace, string]> = [
    ["12. charges communes (attestation hors domaine)", () => confirmed(multiWorkspace({
      specs: [[A, oracleBien(6000, 1000, 1000)], [B, oracleBien(5000, 2000, 2000)]],
      root: { multiPropertyAttestations: { ssi: { answer: "confirmed", at: T, wordingVersion: "t" }, directHolding: { answer: "confirmed", at: T, wordingVersion: "t" }, noCommonCharges: { answer: "declared_out_of_domain", at: T, wordingVersion: "t" } } },
    })), REASON.commonChargesNotSupported],
    ["13. prêt partagé", () => confirmed(multiWorkspace({
      specs: [[A, oneBien(SPEC_A, { creditDocumentId: "doc-pret-commun", credit: "present" }) as never], [B, oneBien(oracleBien(5000, 1000, 1000), { creditDocumentId: "doc-pret-commun", credit: "present", pretIds: ["loan-2"], interets: 100 }) as never]],
    })), REASON.sharedLoanNotSupported],
    ["14. date de mise en service manquante", () => confirmed(multiWorkspace({ specs: [[A, oracleBien(6000, 1000, 1000)], [B, { ...oracleBien(5000, 2000, 2000), date: undefined }]] })), REASON.serviceDateMissing],
    ["15. document non rattaché", () => {
      const workspace = SIMPLE_MULTI();
      workspace.documents = [{ id: "doc-x", fiscalYearId: "fy-2026", fileName: "x.pdf", mimeType: "application/pdf", sizeBytes: 1, category: "charges", documentType: "unknown", status: "analyzed", uploadedAt: T } as never];
      return workspace;
    }, REASON.unattributedDocument],
    ["16. attestations absentes", () => confirmed(multiWorkspace({ specs: [[A, oracleBien(6000, 1000, 1000)], [B, oracleBien(5000, 2000, 2000)]], root: { multiPropertyAttestations: undefined } })), REASON.ssiAttestationMissing],
    ["17. déficit antérieur (stock d'ouverture)", () => confirmed(multiWorkspace({ specs: [[A, oracleBien(6000, 1000, 1000)], [B, oracleBien(5000, 2000, 2000)]], fiscalYear: { stocksOuverture: STOCKS } })), REASON.priorDeficitNotSupported],
    ["18. ARD d'ouverture", () => confirmed(multiWorkspace({
      specs: [[A, oracleBien(6000, 1000, 1000)], [B, oracleBien(5000, 2000, 2000)]],
      fiscalYear: { stocksOuverture: { ...STOCKS, stocks: { deficits: [], amortissementsReportes: 500, deficitsExpires: [] } } },
    })), REASON.historicalArdNotSupported],
    ["19. ARD généré (après recalcul serveur)", () => LOSSES_WITH_DEPRECIATION(), REASON.allocation39cNotSupported],
  ];
  for (const [label, build, expected] of exclusions) {
    it(`${label} → le checkout refuse pour ce motif (aucune session Stripe)`, async () => {
      const { env, checkout, declareEligible } = setup(build());
      await declareEligible();
      const res = await checkout();
      assert.equal(res.status, 409, label);
      const body = await bodyOf(res);
      assert.ok((body.reasons as string[] | undefined)?.includes(expected), `${label} : motif attendu ${expected}, reçu ${JSON.stringify(body)}`);
      assert.equal(env.created.length, 0);
    });
  }

  it("20. imputation de déficit : un stock de déficits d'ouverture (imputation à venir) refuse pour ce motif avant tout paiement", async () => {
    const { env, checkout, declareEligible } = setup(confirmed(multiWorkspace({ specs: [[A, oracleBien(6000, 1000, 1000)], [B, oracleBien(5000, 2000, 2000)]], fiscalYear: { stocksOuverture: STOCKS } })));
    await declareEligible();
    const res = await checkout();
    assert.equal(res.status, 409);
    assert.ok(((await bodyOf(res)).reasons as string[]).includes(REASON.priorDeficitNotSupported));
    assert.equal(env.created.length, 0);
  });

  it("24. mono : checkout compatible avec un snapshot lisible ; sans snapshot serveur → refus clair AVANT tout paiement", async () => {
    const withSnapshot = setup(MONO());
    await withSnapshot.declareEligible();
    assert.equal((await withSnapshot.checkout()).status, 200);
    const without = setup();
    await without.declareEligible();
    const res = await without.checkout();
    assert.equal(res.status, 409);
    assert.equal((await bodyOf(res)).code, "workspace_snapshot_missing");
    assert.equal(without.env.created.length, 0);
    const unreadable = setup();
    await unreadable.declareEligible();
    unreadable.env.setSnapshot(DOSSIER, Y, { schemaVersion: 1, revision: 1, payload: { nope: true } } as never);
    assert.equal((await bodyOf(await unreadable.checkout())).code, "workspace_snapshot_unreadable");
  });
});

// ===========================================================================================================================
// POST-PAYMENT MUTATION, MONO, F006, ENTITLEMENT
// ===========================================================================================================================

describe("POST-PAYMENT — un dossier payé puis rendu non supporté échoue fermé à la livraison", () => {
  it("21. payable à T1, payé, snapshot non supporté à T2, livraison à T3 refusée (domaine)", async () => {
    const { env, base, cerfa, checkout, declareEligible } = setup(SIMPLE_MULTI(), 1);
    await declareEligible();
    assert.equal((await checkout()).status, 200, "T1 : payable");
    await env.seedPaid(DOSSIER, Y);
    assert.equal((await cerfa(base({ expectedRevision: 1 }))).status, 200, "T1 : livrable");
    env.setSnapshot(DOSSIER, Y, rowOf(LOSSES_WITH_DEPRECIATION(), 2)); // T2
    const res = await cerfa(base({ expectedRevision: 2, rfs: clientRfs(SIMPLE_MULTI()) })); // T3
    assert.equal(res.status, 422);
    assert.equal((await bodyOf(res)).reason, "multi_property_domain_unsupported");
  });
});

describe("MONO — parité de sortie et livraison payée", () => {
  it("22/23. mono : la livraison serveur seule (aucune RFS client) donne le même contenu que la RFS générée côté client", async () => {
    const { env, base, cerfa } = setup(MONO());
    await env.seedPaid(DOSSIER, Y);
    const server = await liasseTexts(await cerfa(base()));
    const legacy = await liasseTexts(await cerfa(base({ rfs: clientRfs(MONO()) })));
    assert.deepEqual(server, legacy);
  });
});

describe("MONO — parité fiscale : recalcul serveur == génération client (mêmes entrées dérivées de l'état persisté)", () => {
  const FIXED = Date.parse("2026-06-01T12:00:00.000Z");
  const clientOptions = (workspace: PersistedWorkspace) => {
    const { fiscalYear, properties, declarationDraft: draft } = workspace;
    return {
      stocksOuverture: fiscalYear.stocksOuverture?.stocks,
      bilanInputs: draft?.bilanPatrimonial,
      dispense2033AIntake: draft?.dispense2033A,
      continuity: resolveImmobilisationsContinuityForGeneration({
        draft, properties, propertyIds: fiscalYear.propertyIds, immobilisationsOuverture: fiscalYear.immobilisationsOuverture,
        repriseHistoriqueEnContinuite: fiscalYear.repriseHistoriqueEnContinuite, previousFiscalYearId: fiscalYear.previousFiscalYearId,
        continuiteNativeVerifiee: fiscalYear.continuiteNativeVerifiee,
      }),
    };
  };
  const cases: Array<[string, () => PersistedWorkspace]> = [
    ["mono à plat, bien de référence", () => confirmed(monoWorkspace(SPEC_A))],
    ["mono à plat, cas profit simple", () => confirmed(monoWorkspace(oracleBien(12000, 2500, 2500)))],
    ["mono à plat, cas déficitaire", () => confirmed(monoWorkspace(oracleBien(1000, 3000, 1000)))],
    ["mono scopé (un seul bien dans declarationDraft.biens)", () => confirmed(multiWorkspace({ specs: [[A, oracleBien(6000, 1000, 1000)]] }))],
  ];
  for (const [label, build] of cases) {
    it(`${label} : RFS serveur identique à la RFS générée côté client`, async () => {
      const workspace = build();
      mock.timers.enable({ apis: ["Date"], now: FIXED });
      try {
        const client = runDeclarationGenerationFromWorkspace(workspace, clientOptions(workspace));
        const server = await resolveAuthoritativeDelivery(
          { dossierId: DOSSIER, fiscalYear: Y, expectedRevision: 3 },
          { readSnapshot: async () => rowOf(workspace, 3) },
        );
        assert.equal(client.status, "generated");
        assert.equal(server.ok, true);
        if (client.status !== "generated" || !server.ok) throw new Error("unreachable");
        assert.deepEqual(clone(server.rfs), clone(client.rfs));
      } finally {
        mock.timers.reset();
      }
    });
  }
});

describe("LIASSE COMPLÈTE — le serveur produit aussi les pages documentaires (le navigateur n'assemble plus rien)", () => {
  it("bundle=liasse_fiscale : pages documentaires + Cerfa depuis le dossier persisté ; une RFS client falsifiée n'y change rien", async () => {
    const { env, base, cerfa } = setup(MONO());
    await env.seedPaid(DOSSIER, Y);
    const cerfaOnly = await cerfa(base({ forms: ["2031-SD"] }));
    const bundled = await cerfa(base({ forms: ["2031-SD"], bundle: "liasse_fiscale" }));
    assert.equal(cerfaOnly.status, 200);
    assert.equal(bundled.status, 200);
    const cerfaPages = (await PDFDocument.load(await bytesOf(cerfaOnly))).getPageCount();
    const bundledPages = (await PDFDocument.load(await bytesOf(bundled))).getPageCount();
    assert.ok(bundledPages > cerfaPages, "des pages documentaires précèdent les pages Cerfa");
    const forged = clientRfs(MONO());
    forged.fiscalResult = { ...forged.fiscalResult, resultatFiscalAvantDeficits: 424242 } as never;
    const withForged = await cerfa(base({ forms: ["2031-SD"], bundle: "liasse_fiscale", rfs: forged }));
    assert.equal((await PDFDocument.load(await bytesOf(withForged))).getPageCount(), bundledPages);
  });
});

describe("F006 — un seul appel consolidé par génération", () => {
  it("25. une requête de livraison multi → une génération, un seul F-006", async () => {
    const { env, base, cerfa } = setup(SIMPLE_MULTI());
    await env.seedPaid(DOSSIER, Y);
    let generations = 0;
    let f006 = 0;
    const generate = (workspace: PersistedWorkspace, options: Record<string, unknown>) => {
      generations += 1;
      return runDeclarationGenerationFromWorkspace(workspace, {
        ...options,
        engine: { produceFiscalResult: (input: never) => { f006 += 1; return produceFiscalResult(input); } },
      } as never);
    };
    assert.equal((await cerfa(base(), { generate })).status, 200);
    assert.equal(generations, 1);
    assert.equal(f006, 1);
  });
});

describe("ENTITLEMENT — inchangé, jamais lié à une révision", () => {
  it("28. un exercice payé ne débloque pas un autre exercice", async () => {
    const { env, base, cerfa } = setup(MONO());
    await env.seedPaid(DOSSIER, Y);
    env.setSnapshot(DOSSIER, Y - 1, rowOf(MONO()));
    assert.equal((await cerfa(base({ fiscalYear: Y - 1 }))).status, 402);
  });

  it("29. le paiement n'est pas lié à expectedRevision ni à une révision de snapshot", async () => {
    const { env, checkout, declareEligible } = setup(MONO(), 9);
    await declareEligible();
    const res = await checkout({ expectedRevision: 1 });
    assert.equal(res.status, 200, "expectedRevision n'est pas une entrée du checkout");
    const row = env.rows.find((candidate: { dossier_id: string }) => candidate.dossier_id === DOSSIER);
    assert.ok(row);
    assert.deepEqual(Object.keys(row as object).filter((key) => /revision|snapshot/i.test(key)), []);
  });
});

// ===========================================================================================================================
// CLIENT CONTRACT + SOURCE AUDIT
// ===========================================================================================================================

describe("CLIENT — la requête de livraison ne transporte plus aucune RFS", () => {
  it("la charge utile Cerfa ne contient pas de RFS", () => {
    const payload = buildCerfaPdfRequestPayload(clientRfs(MONO()), "v1") as unknown as Record<string, unknown>;
    assert.equal("rfs" in payload, false);
    assert.ok(Array.isArray(payload.forms));
  });

  it("la requête aide 2042 ne transporte ni RFS ni date d'activité d'autorité, mais expectedRevision", async () => {
    let sent: Record<string, unknown> | undefined;
    const original = globalThis.fetch;
    globalThis.fetch = (async (_url: unknown, init?: { body?: string }) => {
      sent = JSON.parse(init?.body ?? "{}");
      return new Response(new Uint8Array([37, 80, 68, 70]), { status: 200 });
    }) as never;
    try {
      await fetchAide2042PdfBytes({ rfs: clientRfs(MONO()), activityStartDate: "2026-03-01" } as never, { authToken: "t", dossierId: DOSSIER, fiscalYear: Y, expectedRevision: 7 } as never);
    } finally {
      globalThis.fetch = original;
    }
    assert.ok(sent);
    assert.equal("rfs" in sent, false);
    assert.equal(sent.expectedRevision, 7);
  });
});

describe("SOURCE — aucun handler de livraison de production ne lit la RFS du corps de requête", () => {
  for (const file of ["src/app/api/lmnp/declaration/cerfa-pdf/handler.ts", "src/app/api/lmnp/declaration/aide-2042-pdf/handler.ts"]) {
    it(`${file} : pas de lecture de body.rfs`, () => {
      const code = readFileSync(path.join(process.cwd(), file), "utf8").split("\n").filter((line) => !/^\s*(\/\/|\*|\/\*)/.test(line)).join("\n");
      assert.doesNotMatch(code, /body\.rfs\b|\brfs\?: unknown/);
    });
  }
});
