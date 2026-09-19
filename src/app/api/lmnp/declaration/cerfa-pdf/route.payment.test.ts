/**
 * Payment V1 — livraison finale payée : Cerfa (`cerfa-pdf`) et aide 2042-C-PRO
 * (`aide-2042-pdf`).
 *
 *   AUTH → PROPRIÉTÉ → ENTITLEMENT PAYÉ (dossier + exercice) → DÉCLARABILITÉ → PDF
 *
 * Le résolveur d'accès est le VRAI (`resolveDeliveryAccess`) ; seule la base est
 * en mémoire. La frontière de déclarabilité existante reste testée par route.test.ts.
 * Run: npx tsx --test src/app/api/lmnp/declaration/cerfa-pdf/route.payment.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

import { handleCerfaPdfRequest } from "./handler";
import { handleAide2042PdfRequest } from "../aide-2042-pdf/handler";
import { resolveDeliveryAccess } from "@/lib/lmnp/services/payment/delivery-access";
import { createFakePaymentEnv, jsonPost } from "@/lib/lmnp/services/payment/payment-fakes";
import { runDeclarationGeneration } from "@/lib/lmnp/services/declaration/run-declaration-generation";
import type { DeclarationDraft } from "@/lib/lmnp/types/domain";
import type { FiscalRepresentation } from "@/runtime/capabilities/rfs/types";

const URL_CERFA = "https://app.fiscal-ai.test/api/lmnp/declaration/cerfa-pdf";
const URL_AIDE = "https://app.fiscal-ai.test/api/lmnp/declaration/aide-2042-pdf";

function draft(year: number, overrides: Partial<DeclarationDraft> = {}, recettes = 9000): DeclarationDraft {
  return {
    completedSteps: [],
    siret: "12345678901234",
    siren: "123456789",
    exploitantFirstName: "Marie",
    exploitantLastName: "Dupont",
    dateMiseEnService: "2020-01-01",
    revenusAssistant: { exerciceFiscal: year, totalRecettes: recettes },
    chargesAssistant: { exerciceFiscal: year, totalDeductible: 2000, totalPreExploitation: 0 },
    amortissementAssistant: { exerciceFiscal: year, totalDotations: 1500, status: "validated" },
    ...overrides,
  } as DeclarationDraft;
}

function realRfs(year = 2025, overrides: Partial<DeclarationDraft> = {}, recettes = 9000): FiscalRepresentation {
  const generation = runDeclarationGeneration(draft(year, overrides, recettes), year);
  assert.equal(generation.status, "generated", "précondition — fixture générable");
  if (generation.status !== "generated") throw new Error("unreachable");
  return generation.rfs;
}

/** Divergence amortissement F-010/F-014 : même fixture que route.test.ts → non déclarable (422). */
function nonDeclarableRfs(year = 2025): FiscalRepresentation {
  return realRfs(year, {
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
        lignes: [{ label: "Gros œuvre", montant: 37186, dureeAnnees: 75, dotationExercice: 372, amortissementsCumules: 372, vnc: 36814 }],
        totalAnnuelExercice: 372,
        totalBrut: 37186,
      },
      fieldSources: {},
      computedAt: "2026-08-31T00:00:00.000Z",
    },
  } as never);
}

function setup() {
  const env = createFakePaymentEnv();
  env.addUser("tok-antoine", "user-antoine");
  env.addUser("tok-eve", "user-eve");
  env.addDossier("dossier-X", "user-antoine");
  env.addDossier("dossier-Y", "user-antoine");
  env.addDossier("dossier-EVE", "user-eve");
  const access = (input: Parameters<typeof resolveDeliveryAccess>[0]) => resolveDeliveryAccess(input, env.deps);
  const cerfa = (body: unknown) => handleCerfaPdfRequest(jsonPost(URL_CERFA, body), access);
  const aide = (body: unknown) => handleAide2042PdfRequest(jsonPost(URL_AIDE, body), access);
  return { env, cerfa, aide };
}

const FORMS = ["2033-A-SD"];
const isPdf = (bytes: Uint8Array) => String.fromCharCode(bytes[0]!, bytes[1]!, bytes[2]!, bytes[3]!) === "%PDF";

function cerfaBody(rfs: FiscalRepresentation, extra: Record<string, unknown> = {}) {
  return { rfs, declarationVersionId: "v1", forms: FORMS, authToken: "tok-antoine", dossierId: "dossier-X", fiscalYear: 2025, ...extra };
}

describe("cerfa-pdf — chaîne AUTH → PROPRIÉTÉ → PAYÉ → déclarabilité → PDF", () => {
  it("sans authentification → 401 (aucun PDF)", async () => {
    const { cerfa } = setup();
    const rfs = realRfs();
    const res = await cerfa({ rfs, declarationVersionId: "v1", forms: FORMS, dossierId: "dossier-X", fiscalYear: 2025 });
    assert.equal(res.status, 401);
    assert.notEqual(res.headers.get("content-type"), "application/pdf");
    assert.equal((await cerfa(cerfaBody(rfs, { authToken: "faux" }))).status, 401);
  });

  it("l'ancien appel direct (RFS seule, sans contexte) → 401 : plus aucun PDF sans identité", async () => {
    const { cerfa } = setup();
    const res = await cerfa({ rfs: realRfs(), declarationVersionId: "v1", forms: FORMS });
    assert.equal(res.status, 401);
  });

  it("utilisateur authentifié mais dossier d'autrui → 403, même si l'exercice de ce dossier est payé", async () => {
    const { env, cerfa } = setup();
    await env.seedPaid("dossier-EVE", 2025);
    const res = await cerfa(cerfaBody(realRfs(), { dossierId: "dossier-EVE" }));
    assert.equal(res.status, 403);
  });

  it("propriétaire, exercice NON payé (aucune ligne, ou ligne pending) → 402 payment_required", async () => {
    const { env, cerfa } = setup();
    const none = await cerfa(cerfaBody(realRfs()));
    assert.equal(none.status, 402);
    assert.equal(((await none.json()) as { code: string }).code, "payment_required");
    await env.store.ensureRow("dossier-X", 2025); // pending
    assert.equal((await cerfa(cerfaBody(realRfs()))).status, 402);
  });

  it("propriétaire + payé + déclarable → 200 application/pdf (vrai PDF)", async () => {
    const { env, cerfa } = setup();
    await env.seedPaid("dossier-X", 2025);
    const res = await cerfa(cerfaBody(realRfs()));
    assert.equal(res.status, 200);
    assert.equal(res.headers.get("content-type"), "application/pdf");
    assert.ok(isPdf(new Uint8Array(await res.arrayBuffer())));
  });

  it("propriétaire + payé + NON déclarable → 422 existant préservé (le paiement ne remplace pas la déclarabilité)", async () => {
    const { env, cerfa } = setup();
    await env.seedPaid("dossier-X", 2025);
    const res = await cerfa(cerfaBody(nonDeclarableRfs()));
    assert.equal(res.status, 422);
    const payload = (await res.json()) as { status: string; reason: string };
    assert.equal(payload.status, "blocked");
    assert.equal(payload.reason, "internal_projection_issue");
  });

  it("l'entitlement de l'exercice 2026 ne débloque JAMAIS 2027 (ni par fiscalYear, ni par RFS)", async () => {
    const { env, cerfa } = setup();
    await env.seedPaid("dossier-X", 2026);
    // fiscalYear 2027 déclaré : ligne 2027 absente → 402
    const byYear = await cerfa(cerfaBody(realRfs(2027), { fiscalYear: 2027 }));
    assert.equal(byYear.status, 402);
    // RFS 2027 présentée avec l'exercice payé 2026 → 403 (la RFS doit porter l'exercice payé)
    const byRfs = await cerfa(cerfaBody(realRfs(2027), { fiscalYear: 2026 }));
    assert.equal(byRfs.status, 403);
    assert.equal(((await byRfs.json()) as { code: string }).code, "fiscal_year_mismatch");
  });

  it("l'entitlement du dossier A ne débloque JAMAIS le dossier B, même pour le même propriétaire", async () => {
    const { env, cerfa } = setup();
    await env.seedPaid("dossier-X", 2025);
    const res = await cerfa(cerfaBody(realRfs(), { dossierId: "dossier-Y" }));
    assert.equal(res.status, 402);
  });

  it("un autre utilisateur ne peut pas utiliser l'entitlement d'autrui", async () => {
    const { env, cerfa } = setup();
    await env.seedPaid("dossier-X", 2025);
    const res = await cerfa(cerfaBody(realRfs(), { authToken: "tok-eve" }));
    assert.equal(res.status, 403);
  });

  it("historique externe enregistré → livraison fermée (403), même pour un exercice payé", async () => {
    const { env, cerfa } = setup();
    await env.seedPaid("dossier-X", 2025, "EXTERNAL_HISTORY");
    const res = await cerfa(cerfaBody(realRfs()));
    assert.equal(res.status, 403);
    assert.equal(((await res.json()) as { code: string }).code, "prior_history_not_eligible");
  });

  it("entrées invalides côté accès (fiscalYear absent) → 400 après authentification", async () => {
    const { cerfa } = setup();
    const res = await cerfa({ rfs: realRfs(), declarationVersionId: "v1", forms: FORMS, authToken: "tok-antoine", dossierId: "dossier-X" });
    assert.equal(res.status, 400);
  });
});

describe("corps invalide", () => {
  it("JSON `null` → 400 sur cerfa-pdf et aide-2042-pdf (jamais un 500)", async () => {
    const { cerfa, aide } = setup();
    assert.equal((await cerfa(null)).status, 400);
    assert.equal((await aide(null)).status, 400);
  });
});

describe("régénération illimitée d'un exercice payé (aucun compteur, aucune consommation)", () => {
  it("payé N → générer → corriger la déclaration → régénérer → retélécharger : toujours 200, aucun nouveau paiement", async () => {
    const { env, cerfa, aide } = setup();
    const row = await env.seedPaid("dossier-X", 2025);
    const before = { ...row };

    const first = await cerfa(cerfaBody(realRfs(2025, {}, 9000)));
    // Correction d'une donnée déclarative (recettes) puis régénération.
    const corrected = await cerfa(cerfaBody(realRfs(2025, {}, 12000), { declarationVersionId: "v2" }));
    const again = await cerfa(cerfaBody(realRfs(2025, {}, 12000), { declarationVersionId: "v3", forms: ["2033-A-SD", "2033-B-SD"] }));
    const help1 = await aide(aideBody(realRfs(2025, {}, 12000)));
    const help2 = await aide(aideBody(realRfs(2025, {}, 12000)));

    for (const res of [first, corrected, again, help1, help2]) assert.equal(res.status, 200);

    assert.deepEqual(env.rows.find((r) => r.id === row.id), before, "la ligne payée est strictement inchangée");
    assert.equal(env.created.length, 0, "aucune nouvelle session de paiement");
    assert.equal(env.markPaidCalls.length, 0);
    assert.equal(env.rows.length, 1);
  });
});

describe("N → N+1 : livraison finale de N+1 bloquée tant que N+1 n'est pas payé", () => {
  it("N payé (2025) : N livrable ; N+1 (2026) → 402 ; après paiement de 2026 → 200 ; N reste livrable", async () => {
    const { env, cerfa } = setup();
    await env.seedPaid("dossier-X", 2025);

    assert.equal((await cerfa(cerfaBody(realRfs(2025)))).status, 200);
    const unpaid = await cerfa(cerfaBody(realRfs(2026), { fiscalYear: 2026 }));
    assert.equal(unpaid.status, 402, "le paiement de N n'accorde pas N+1");

    await env.seedPaid("dossier-X", 2026);
    assert.equal((await cerfa(cerfaBody(realRfs(2026), { fiscalYear: 2026 }))).status, 200);
    assert.equal((await cerfa(cerfaBody(realRfs(2025)))).status, 200, "payer N+1 ne modifie pas N");
  });
});

function aideBody(rfs: FiscalRepresentation, extra: Record<string, unknown> = {}) {
  return { rfs, activityStartDate: "2020-01-01", authToken: "tok-antoine", dossierId: "dossier-X", fiscalYear: 2025, ...extra };
}

describe("aide-2042-pdf — même chaîne de livraison payée", () => {
  it("401 sans authentification, 403 dossier d'autrui, 402 non payé", async () => {
    const { env, aide } = setup();
    const rfs = realRfs();
    assert.equal((await aide({ rfs, dossierId: "dossier-X", fiscalYear: 2025 })).status, 401);
    assert.equal((await aide(aideBody(rfs, { authToken: "tok-eve" }))).status, 403);
    assert.equal((await aide(aideBody(rfs))).status, 402);
    await env.seedPaid("dossier-EVE", 2025);
    assert.equal((await aide(aideBody(rfs, { dossierId: "dossier-EVE" }))).status, 403);
  });

  it("payé + déclarable → 200 PDF ; payé + non déclarable → 422 ; exercice 2027 avec paiement 2026 → 403/402", async () => {
    const { env, aide } = setup();
    await env.seedPaid("dossier-X", 2025);
    const ok = await aide(aideBody(realRfs()));
    assert.equal(ok.status, 200);
    assert.ok(isPdf(new Uint8Array(await ok.arrayBuffer())));
    assert.equal((await aide(aideBody(nonDeclarableRfs()))).status, 422);
    assert.equal((await aide(aideBody(realRfs(2027), { fiscalYear: 2025 }))).status, 403);
    assert.equal((await aide(aideBody(realRfs(2027), { fiscalYear: 2027 }))).status, 402);
  });
});

describe("garde de câblage — aucune livraison finale ne contourne le serveur", () => {
  const root = path.join(__dirname, "../../../../..");
  const read = (rel: string) => readFileSync(path.join(root, rel), "utf-8");

  it("les routes réelles utilisent le résolveur d'accès PAR DÉFAUT (jamais un résolveur permissif)", () => {
    for (const rel of [
      "app/api/lmnp/declaration/cerfa-pdf/route.ts",
      "app/api/lmnp/declaration/aide-2042-pdf/route.ts",
    ]) {
      const source = read(rel);
      assert.match(source, /Request\(request\)/);
      assert.doesNotMatch(source, /ok:\s*true/, `${rel} ne doit jamais injecter un accès permissif`);
    }
  });

  it("les handlers appellent le résolveur d'accès AVANT toute validation de RFS ou génération", () => {
    for (const rel of [
      "app/api/lmnp/declaration/cerfa-pdf/handler.ts",
      "app/api/lmnp/declaration/aide-2042-pdf/handler.ts",
    ]) {
      const source = read(rel);
      const accessAt = source.indexOf("await resolveAccess(");
      assert.ok(accessAt > 0, rel);
      assert.ok(accessAt < source.indexOf("const rfs = body.rfs"), `${rel} : accès avant lecture de la RFS`);
    }
  });
});
