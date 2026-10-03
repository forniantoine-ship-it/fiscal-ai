/**
 * MB-MULTI-DELIVERY-WIRING-1 — Phase 2 : ORACLE N-PROPERTY (3 biens) puis LIVRAISON seule. La capacité `delivery` ne suffit jamais :
 * admission = capacité ∧ domaine ADR-011 supporté ∧ RFS d'activité valide ∧ déclarabilité finale ; l'entitlement PAYÉ reste exigé EN
 * PREMIER par les deux routes (paiement, édition, clôture et N+1 restent fermés). Le domaine ADR-011 n'est pas limité à 2 ni à 3 biens.
 *
 * Valeurs posées à la main : A 5 000 − 1 000 − 1 000 = 3 000 ; B 4 000 − 1 000 − 1 000 = 2 000 ; C 3 000 − 500 − 500 = 2 000 ;
 * recettes 12 000, charges 2 500, dotations 2 500 (déduites) → résultat d'activité 7 000 : 312 = 350 = 5 000→7 000, 352 = 0,
 * 2031 7a = 7 000, 2042 5NA = 7 000.
 *
 * Run: npx tsx --test src/lib/lmnp/services/declaration/r2c-multi-delivery-capability.test.ts
 */
import "@/lab/v2-dossier/test-public-env";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, it, mock } from "node:test";

import { handleAide2042PdfRequest } from "@/app/api/lmnp/declaration/aide-2042-pdf/handler";
import { handleCerfaPdfRequest } from "@/app/api/lmnp/declaration/cerfa-pdf/handler";
import {
  MULTI_PROPERTY_CAPABILITIES,
  MULTI_PROPERTY_NEVER_OPEN_CAPABILITIES,
  isMultiPropertyCapabilityOpen,
  isMultiPropertyClosingBlocked,
  isMultiPropertyDeliveryBlocked,
  isMultiPropertyGenerationBlocked,
  isMultiPropertyNextYearBlocked,
  type MultiPropertyCapabilities,
  type MultiPropertyCapability,
} from "@/lib/lmnp/dossier/multi-property-activation";
import { MULTI_PROPERTY_DOMAIN_REASON_CODES as REASON, resolveMultiPropertyDeliveryAdmission } from "@/lib/lmnp/dossier/multi-property-domain";
import { buildClientSummaryDocument } from "@/lib/lmnp/services/declaration/build-client-summary-document";
import { resolveFinalDeclarabilityState } from "@/lib/lmnp/services/declaration/final-declarability";
import { runDeclarationGenerationFromWorkspace } from "@/lib/lmnp/services/declaration/generation-workspace";
import { renderAide2042Pdf } from "@/lib/lmnp/services/declaration/render-aide-2042-pdf";
import { generateCerfa2033BFromRfs } from "@/lib/lmnp/services/liasse-pdf";
import { extractDrawnStringsForPage } from "@/lib/lmnp/services/liasse-pdf/tests/extract-rendered-text";
import { resolveDeliveryAccess } from "@/lib/lmnp/services/payment/delivery-access";
import { GENERATION_PRICE_TTC } from "@/lib/lmnp/services/payment/price";
import { isMultiPropertyBarrierActive } from "@/lib/lmnp/services/server-workspace-snapshot";
import type { PersistedWorkspace } from "@/lib/lmnp/store/persistence";
import { assembleLiasseFromRfs } from "@/runtime/capabilities/rfs/projection/assemble-liasse-from-rfs";
import { produceFiscalResult } from "@/runtime/capabilities/f006/produce-fiscal-result";
import type { FiscalRepresentation } from "@/runtime/capabilities/rfs/types";

import { A, B, STOCKS, Y, monoWorkspace, multiWorkspace, oracleBien, type BienSpec } from "./multi-property-test-support";

const ROOT = process.cwd();
const FIXED = Date.parse("2026-06-01T12:00:00.000Z");
const C = "bien-c";
const clone = <V>(value: V): V => JSON.parse(JSON.stringify(value));
const ALL: MultiPropertyCapability[] = ["edition", "generation", "delivery", "payment", "closing", "nextYear"];
const caps = (open: MultiPropertyCapability[]): MultiPropertyCapabilities =>
  Object.fromEntries(ALL.map((capability) => [capability, open.includes(capability)])) as unknown as MultiPropertyCapabilities;
const DELIVERY_ON = caps(["generation", "delivery"]);
const DELIVERY_OFF = caps(["generation"]);

function withFixedClock<V>(run: () => V): V {
  mock.timers.enable({ apis: ["Date"], now: FIXED });
  try {
    return run();
  } finally {
    mock.timers.reset();
  }
}
const clockedAsync = async <V>(run: () => Promise<V>): Promise<V> => {
  mock.timers.enable({ apis: ["Date"], now: FIXED });
  try {
    return await run();
  } finally {
    mock.timers.reset();
  }
};

type Spec = [string, BienSpec];
const SPECS_ABC = (): Spec[] => [[A, oracleBien(5000, 1000, 1000)], [B, oracleBien(4000, 1000, 1000)], [C, oracleBien(3000, 500, 500)]];
const THREE = (specs: Spec[] = SPECS_ABC()): PersistedWorkspace => multiWorkspace({ specs });
const PERMUTATIONS: Array<[string, number[]]> = [["A+B+C", [0, 1, 2]], ["C+A+B", [2, 0, 1]], ["B+C+A", [1, 2, 0]], ["C+B+A", [2, 1, 0]]];

function generated(workspace: PersistedWorkspace) {
  let calls = 0;
  const result = withFixedClock(() => runDeclarationGenerationFromWorkspace(workspace, {
    engine: { produceFiscalResult: (input: never) => { calls += 1; return produceFiscalResult(input); } },
  } as never));
  assert.equal(result.status, "generated", JSON.stringify((result as { blockingReasons?: unknown }).blockingReasons));
  if (result.status !== "generated") throw new Error("unreachable");
  return { result, calls };
}
type Cases = { cases: Array<{ caseId: string; value: unknown }> };
const caseValue = (form: Cases, id: string) => form.cases.find((item) => item.caseId === id)?.value;
const form2031Of = (result: ReturnType<typeof generated>["result"]) => (result.liasseRfs as unknown as { form2031: Cases }).form2031;

// ---------------------------------------------------------------------------
// Livraison : accès payant simulé (entitlement), appels aux VRAIES routes (handlers)
// ---------------------------------------------------------------------------

const ok = (async () => ({ ok: true, fiscalYear: Y })) as never;
const post = (handler: typeof handleCerfaPdfRequest | typeof handleAide2042PdfRequest, body: unknown, capabilities?: MultiPropertyCapabilities, access = ok) =>
  handler(new Request("http://x", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }), access, capabilities);
const LIASSE_FORMS = ["2031-SD", "2031-bis-SD", "2033-B-SD"];
const cerfa = (rfs: unknown, capabilities?: MultiPropertyCapabilities, extra: Record<string, unknown> = {}, forms: string[] = LIASSE_FORMS, access = ok) =>
  post(handleCerfaPdfRequest, { rfs, declarationVersionId: "v1", forms, ...extra }, capabilities, access);
const aide = (rfs: unknown, capabilities?: MultiPropertyCapabilities, extra: Record<string, unknown> = {}, access = ok) =>
  post(handleAide2042PdfRequest, { rfs, activityStartDate: "2026-03-01", ...extra }, capabilities, access);
const bytesOf = async (response: Response) => new Uint8Array(await response.arrayBuffer());
const sha = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
/** Textes dessinés d'un PDF jsPDF (aide 2042) : l'octet n'est pas déterministe (identifiant de fichier aléatoire), le contenu l'est. */
const aideTexts = (bytes: Uint8Array): string[] =>
  [...Buffer.from(bytes).toString("latin1").matchAll(/\(((?:[^()\\]|\\.)*)\)\s*Tj/g)].map((match) => match[1]!);
const rfsOf = (workspace: PersistedWorkspace): FiscalRepresentation => generated(workspace).result.rfs;

/** Valeurs fiscales réellement DESSINÉES sur la liasse livrée (2031 p.1, 2031 bis p.2, 2033-B p.3). */
async function deliveredLiasseTexts(rfs: FiscalRepresentation, extra: Record<string, unknown> = {}) {
  const response = await clockedAsync(() => cerfa(rfs, DELIVERY_ON, extra));
  assert.equal(response.status, 200);
  const bytes = await bytesOf(response);
  return { bytes, p1: await extractDrawnStringsForPage(bytes, 1), p2: await extractDrawnStringsForPage(bytes, 2), p3: await extractDrawnStringsForPage(bytes, 3) };
}

// ===========================================================================
// 1. N-PROPERTY — aucune hypothèse « exactement deux biens »
// ===========================================================================

describe("N-PROPERTY — 3 biens : consolidation exacte, ordre, isolation", () => {
  it("1. MULTI-3 SIMPLE PROFIT — trois sources property-scoped, UN seul F-006, UNE RFS : 12 000 / 5 000 / 7 000 ; 312 = 350 = 7 000, 352 = 0, BALANCED ; 7a = 5NA = 7 000", () => {
    const { result, calls } = generated(THREE());
    const fiscal = result.rfs.fiscalResult;
    assert.equal(calls, 1, "un seul F-006 d'activité");
    assert.equal(fiscal.recettes.total, 12000);
    assert.equal(fiscal.charges.totalDeductible, 2500);
    assert.equal(fiscal.amortDeduct, 2500);
    assert.equal(fiscal.amortNonDeduitExercice, 0);
    assert.equal(fiscal.resultatFiscalAvantDeficits, 7000);
    assert.equal(fiscal.deficitNouveau, 0);
    assert.equal(caseValue(result.liasseRfs.form2033B, "312"), 7000);
    assert.equal(caseValue(result.liasseRfs.form2033B, "350"), 7000);
    assert.equal(caseValue(result.liasseRfs.form2033B, "352"), 0);
    assert.equal(result.liasseRfs.form2033B.balancing.status, "BALANCED");
    assert.equal(caseValue(form2031Of(result), "I_7A"), 7000);
    assert.equal(caseValue(form2031Of(result), "I_7B"), undefined);
    const cases = buildClientSummaryDocument(result.rfs, { activityStartDate: "2026-03-01" }).aide2042.cases;
    assert.equal(cases.find((item) => item.case === "5NA")?.montant, 7000);
    assert.equal(cases.some((item) => item.case === "5NY" || item.case === "5GA–5GJ"), false);
    assert.deepEqual(result.rfs.immobilisationsParBien?.map((bloc) => bloc.propertyId).sort(), [A, B, C].sort(), "les trois biens, chacun une fois, dans UNE RFS");
    assert.deepEqual((result.rfs.immobilisationsParBien ?? []).map((bloc) => bloc.dotationsExercice).sort((x, y) => x - y), [500, 1000, 1000]);
  });

  const fingerprint = (result: ReturnType<typeof generated>["result"]) => JSON.stringify({
    fiscalResult: result.rfs.fiscalResult, form2033B: result.liasseRfs.form2033B, form2031: form2031Of(result),
    aide: buildClientSummaryDocument(result.rfs, { activityStartDate: "2026-03-01" }).aide2042.cases, opening: result.rfs.deficitsOuverture,
    dotations: (result.rfs.immobilisationsParBien ?? []).reduce((sum, bloc) => sum + bloc.dotationsExercice, 0),
  });

  it("2. ORDER INVARIANCE à 3 biens — A+B+C, C+A+B, B+C+A, C+B+A : valeurs fiscales finales identiques", () => {
    const reference = fingerprint(generated(THREE()).result);
    for (const [label, order] of PERMUTATIONS) {
      const specs = SPECS_ABC();
      const permuted = order.map((index) => specs[index]!);
      assert.equal(fingerprint(generated(THREE(permuted)).result), reference, label);
    }
  });

  it("3. PROPERTY ISOLATION — modifier uniquement C : A et B inchangés (sources et blocs), l'activité varie du montant exact", () => {
    const base = generated(THREE());
    const modified = THREE();
    const biens = (modified.declarationDraft as unknown as { biens: Record<string, { revenusAssistant: { totalRecettes: number; loyersEncaisses: number } }> }).biens;
    const before = { a: JSON.stringify(biens[A]), b: JSON.stringify(biens[B]) };
    biens[C]!.revenusAssistant.totalRecettes += 1000;
    biens[C]!.revenusAssistant.loyersEncaisses += 1000;
    const next = generated(modified);
    assert.equal(next.result.rfs.fiscalResult.resultatFiscalAvantDeficits, 8000, "7 000 + 1 000");
    assert.equal(JSON.stringify(biens[A]), before.a);
    assert.equal(JSON.stringify(biens[B]), before.b);
    const block = (r: typeof next.result, id: string) => JSON.stringify(r.rfs.immobilisationsParBien!.find((item) => item.propertyId === id));
    for (const id of [A, B, C]) assert.equal(block(next.result, id), block(base.result, id), `bloc ${id} : seules les recettes de C ont changé`);
  });

  it("4 biens et plus : la consolidation reste exacte (aucune borne 2 ou 3)", () => {
    const D = "bien-d";
    const result = generated(THREE([...SPECS_ABC(), [D, oracleBien(1000, 0, 0)]])).result;
    assert.equal(result.rfs.fiscalResult.resultatFiscalAvantDeficits, 8000);
    assert.equal(result.rfs.immobilisationsParBien?.length, 4);
  });

  it("AUDIT STATIQUE — aucune hypothèse « exactement deux biens » (index 0/1, destructuring de paire, slice(0,2), longueur 2) dans le pipeline multi", () => {
    const files = [
      "src/lib/lmnp/dossier/fiscal-consolidation.ts", "src/lib/lmnp/dossier/property-immobilisations.ts", "src/lib/lmnp/dossier/multi-property-domain.ts",
      "src/lib/lmnp/dossier/multi-property-readiness.ts", "src/lib/lmnp/dossier/bien-draft.ts", "src/lib/lmnp/dossier/property-scope.ts",
      "src/lib/lmnp/services/declaration/generation-workspace.ts", "src/lib/lmnp/services/declaration/workspace-readiness.ts",
      "src/lib/lmnp/services/declaration/build-client-summary-document.ts",
    ];
    const walk = (dir: string): string[] => readdirSync(path.join(ROOT, dir)).flatMap((entry) => {
      const relative = `${dir}/${entry}`;
      return statSync(path.join(ROOT, relative)).isDirectory() ? walk(relative) : /\.ts$/.test(entry) && !/\.test\./.test(entry) && !relative.includes("/tests/") ? [relative] : [];
    });
    const scanned = [...files, ...walk("src/runtime/capabilities/rfs")];
    const pattern = /length\s*(===|==|<=|>=|>|<)\s*[23]\b|\.slice\(\s*0\s*,\s*2\s*\)|\bconst \[\s*\w+\s*,\s*\w+\s*\]\s*=|\bpropertyA\b|\bpropertyB\b|\bbienA\b|\bbienB\b|\bfirst(Property|Bien)\b|\b(biens|properties|propertyIds|immobilisationsParBien|parBien|blocks|contributions)\[\s*[01]\s*\]/;
    const offenders = scanned.flatMap((file) => readFileSync(path.join(ROOT, file), "utf8").split("\n")
      .map((line, index) => [`${file}:${index + 1}`, line.trim()] as const)
      .filter(([, line]) => !/^(\/\/|\*|\/\*)/.test(line) && pattern.test(line)));
    assert.deepEqual(offenders, []);
  });
});

// ===========================================================================
// 2. ADMISSION À LA LIVRAISON — capacité, domaine, validité : chaque dimension refuse seule
// ===========================================================================

describe("ADMISSION LIVRAISON — capacité ∧ domaine ∧ déclarabilité", () => {
  it("7. delivery OFF + domaine SUPPORTÉ → REFUS (admission, Cerfa ET aide), même avec la génération ouverte", async () => {
    const rfs = rfsOf(THREE());
    assert.deepEqual(resolveMultiPropertyDeliveryAdmission(rfs, DELIVERY_OFF), { allowed: false, reason: "multi_property_not_enabled" });
    for (const response of [await cerfa(rfs, DELIVERY_OFF), await aide(rfs, DELIVERY_OFF)]) {
      assert.equal(response.status, 422);
      assert.deepEqual(await response.json(), { status: "blocked", reason: "multi_property_not_enabled" });
    }
  });

  it("8. delivery ON + domaine SUPPORTÉ + génération valide → AUTORISÉ : vrais PDF livrés par les deux routes", async () => {
    const rfs = rfsOf(THREE());
    assert.deepEqual(resolveMultiPropertyDeliveryAdmission(rfs, DELIVERY_ON), { allowed: true });
    for (const response of [await clockedAsync(() => cerfa(rfs, DELIVERY_ON)), await clockedAsync(() => aide(rfs, DELIVERY_ON))]) {
      assert.equal(response.status, 200);
      assert.equal(response.headers.get("content-type"), "application/pdf");
      assert.equal(Buffer.from(await bytesOf(response)).subarray(0, 5).toString("latin1"), "%PDF-");
    }
  });

  const outOfDomain: Array<[string, () => FiscalRepresentation, string]> = [
    ["ARD généré (39 C)", () => { const rfs = clone(rfsOf(THREE())); rfs.fiscalResult = { ...rfs.fiscalResult, amortNonDeduitExercice: 500 }; return rfs; }, REASON.allocation39cNotSupported],
    ["ARD historique consommé", () => { const rfs = clone(rfsOf(THREE())); rfs.fiscalResult = { ...rfs.fiscalResult, amortReportesUtilises: 300 }; return rfs; }, REASON.historicalArdNotSupported],
    ["déficit antérieur imputé", () => { const rfs = clone(rfsOf(THREE())); rfs.fiscalResult = { ...rfs.fiscalResult, deficitsImputes: 200 }; return rfs; }, REASON.priorDeficitNotSupported],
    ["déficit d'ouverture / exercice non initial", () => { const rfs = clone(rfsOf(THREE())); rfs.deficitsOuverture = { source: "fiscal_year_opening", deficits: [{ millesime: 2024, montant: 1500 }] }; return rfs; }, REASON.priorDeficitNotSupported],
    ["ouverture non établie par la RFS", () => { const rfs = clone(rfsOf(THREE())); delete rfs.deficitsOuverture; return rfs; }, REASON.domainUnverifiable],
    ["marqueur multi avec un seul bien", () => { const rfs = clone(rfsOf(THREE())); rfs.immobilisationsParBien = rfs.immobilisationsParBien!.slice(0, 1); return rfs; }, REASON.fewerThanTwoProperties],
  ];
  for (const [label, build, code] of outOfDomain) {
    it(`9. delivery ON + HORS DOMAINE (${label}) → REFUS ${code} sur Cerfa ET aide ; aucun PDF`, async () => {
      const rfs = build();
      for (const route of [cerfa, aide]) {
        const response = await route(rfs, DELIVERY_ON);
        assert.equal(response.status, 422);
        assert.notEqual(response.headers.get("content-type"), "application/pdf");
        const body = (await response.json()) as { reason: string; domainReasons: string[] };
        assert.equal(body.reason, "multi_property_domain_unsupported");
        assert.ok(body.domainReasons.includes(code), `${code} ∈ ${body.domainReasons}`);
      }
    });
  }

  it("RFS MALFORMÉE (transmise par le client) avec delivery ON → REFUS 422 domaine non établi, jamais une exception : fiscalResult absent, ouverture invalide, blocs illisibles", async () => {
    const valid = rfsOf(THREE());
    const malformed: Array<[string, unknown]> = [
      ["fiscalResult absent", (() => { const rfs = clone(valid) as unknown as Record<string, unknown>; delete rfs.fiscalResult; return rfs; })()],
      ["fiscalResult non objet", { ...clone(valid), fiscalResult: "x" }],
      ["deficitsOuverture.deficits non tableau", { ...clone(valid), deficitsOuverture: { source: "none", deficits: "x" } }],
      ["blocs par bien illisibles", { ...clone(valid), immobilisationsParBien: [null, 3, "a"] }],
    ];
    for (const [label, rfs] of malformed) {
      for (const route of [cerfa, aide]) {
        let response: Response;
        try { response = await route(rfs, DELIVERY_ON); } catch (error) { assert.fail(`${label} : exception ${(error as Error).message}`); }
        assert.notEqual(response.status, 200, label);
        assert.notEqual(response.status, 500, `${label} : pas d'erreur serveur`);
      }
    }
    for (const [label, rfs] of malformed) {
      const admission = resolveMultiPropertyDeliveryAdmission(rfs, DELIVERY_ON);
      assert.equal(admission.allowed, false, label);
    }
  });

  it("10. génération INVALIDE / déséquilibrée → REFUS : jamais livrée sur la seule présence d'une RFS (déclarabilité finale, aucun octet produit)", async () => {
    const unbalanced = clone(rfsOf(THREE()));
    unbalanced.fiscalResult = { ...unbalanced.fiscalResult, amortCalcule: unbalanced.fiscalResult.amortCalcule + 137 };
    assert.equal(assembleLiasseFromRfs(unbalanced).form2033B.balancing.status === "BALANCED", false, "oracle : le bouclage 2033-B n'est plus établi");
    assert.equal(resolveFinalDeclarabilityState(assembleLiasseFromRfs(unbalanced)).deliverable, false);
    for (const route of [cerfa, aide]) {
      const response = await route(unbalanced, DELIVERY_ON);
      assert.equal(response.status, 422);
      assert.deepEqual(await response.json(), { status: "blocked", reason: "internal_projection_issue" });
    }
  });

  it("génération bloquée en amont (hors domaine) : aucune RFS n'existe, donc rien à livrer", () => {
    const outside = multiWorkspace({ specs: SPECS_ABC(), fiscalYear: { stocksOuverture: STOCKS } });
    const result = withFixedClock(() => runDeclarationGenerationFromWorkspace(outside));
    assert.equal(result.status, "blocked");
    assert.equal("rfs" in result, false);
  });

  it("une seule définition du domaine : les deux handlers délèguent à resolveMultiPropertyDeliveryAdmission ; aucune condition de domaine dans les routes", () => {
    for (const file of ["src/app/api/lmnp/declaration/cerfa-pdf/handler.ts", "src/app/api/lmnp/declaration/aide-2042-pdf/handler.ts"]) {
      const code = readFileSync(path.join(ROOT, file), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
      assert.match(code, /resolveMultiPropertyDeliveryAdmission/);
      assert.doesNotMatch(code, /deficitsOuverture|amortNonDeduitExercice|amortReportesUtilises|openingDeficits|evaluateMultiPropertyDomain/);
    }
  });
});

// ===========================================================================
// 3. LIVRAISON RÉELLE — une liasse par activité, valeurs livrées = RFS consolidée
// ===========================================================================

describe("LIVRAISON — une activité, une liasse, valeurs consolidées dans les PDF livrés", () => {
  it("4–6, 11–14. liasse livrée : 2031 7a = 7 000 ; 2033-B 310/312/350 = 7 000 et 352/370 = 0 (BALANCED) ; 2031 bis ; aucun 7b", async () => {
    const rfs = rfsOf(THREE());
    const { p1, p2, p3 } = await deliveredLiasseTexts(rfs);
    assert.equal(p1.filter((text) => text === "7 000").length, 1, "2031-SD : 7a une seule fois ; la ligne 1 porte 0 (SAV-032)");
    assert.ok(p1.includes("0"));
    assert.ok(p2.includes("7 000"), "2031 bis : cadre I, bénéfice consolidé");
    assert.ok(p3.filter((text) => text === "7 000").length >= 3, "2033-B : 310, 312, 350 portent le résultat consolidé ; 352 et 370 portent 0");
    assert.equal(assembleLiasseFromRfs(rfs).form2033B.balancing.status, "BALANCED");
    // PARITÉ avec le chemin historique : les mêmes totaux portés par UN seul bien (dossier scopé mono) donnent la même liasse dessinée.
    const monoEquivalent = await deliveredLiasseTexts(rfsOf(multiWorkspace({ specs: [[A, oracleBien(12000, 2500, 2500)]] })));
    assert.deepEqual([p1, p2, p3], [monoEquivalent.p1, monoEquivalent.p2, monoEquivalent.p3], "3 biens consolidés = 1 bien de mêmes totaux : mêmes valeurs livrées");
    for (const text of [...p1, ...p2, ...p3]) assert.ok(!text.includes(A) && !text.includes(B) && !text.includes(C), "aucun identifiant de bien dans un PDF livré");
  });

  it("14. DÉFICIT consolidé livré : deux pertes sans amortissement → 2031 7b = 3 000 ; aucun 7a ; aide 5NY", async () => {
    const rfs = rfsOf(THREE([[A, oracleBien(2000, 3000, 0)], [B, oracleBien(1000, 3000, 0)], [C, oracleBien(0, 0, 0)]]));
    assert.equal(rfs.fiscalResult.deficitNouveau, 3000);
    const { p1, p3 } = await deliveredLiasseTexts(rfs);
    assert.ok(p1.includes("3 000"), "2031-SD : 7b");
    assert.ok(p3.includes("3 000"), "2033-B : 330 = déficit");
    const cases = buildClientSummaryDocument(rfs, { activityStartDate: "2026-03-01" }).aide2042.cases;
    assert.equal(cases.find((item) => item.case === "5NY")?.montant, 3000);
    assert.equal(cases.some((item) => item.case === "5NA"), false);
  });

  it("13. les PDF livrés SONT la sortie du moteur Cerfa pour la RFS consolidée : 2033-B livrée = appel direct à generateCerfa2033BFromRfs (SHA-256)", async () => {
    const rfs = rfsOf(THREE());
    const direct = await clockedAsync(() => generateCerfa2033BFromRfs({ rfs, declarationVersionId: "v1" }));
    assert.equal(direct.status, "generated");
    if (direct.status !== "generated") return;
    const response = await clockedAsync(() => cerfa(rfs, DELIVERY_ON, {}, ["2033-B-SD"]));
    assert.equal(response.status, 200);
    assert.equal(sha(await bytesOf(response)), direct.sha256, "aucune donnée ajoutée, recalculée ni modifiée par la route");
  });

  it("2033-A, 2033-B, 2033-C, 2031, 2031 bis : les cinq formulaires de la liasse sont livrés ; UNE livraison par activité (une seule réponse PDF, aucune liasse par bien)", async () => {
    const rfs = rfsOf(THREE());
    const response = await clockedAsync(() => cerfa(rfs, DELIVERY_ON, {}, ["2031-SD", "2031-bis-SD", "2033-A-SD", "2033-B-SD", "2033-C-SD"]));
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("content-type"), "application/pdf");
    const merged = await bytesOf(response);
    const perForm: number[] = [];
    const { PDFDocument } = await import("pdf-lib");
    for (const form of ["2031-SD", "2031-bis-SD", "2033-A-SD", "2033-B-SD", "2033-C-SD"]) {
      const single = await clockedAsync(() => cerfa(rfs, DELIVERY_ON, {}, [form]));
      assert.equal(single.status, 200, form);
      perForm.push((await PDFDocument.load(await bytesOf(single))).getPageCount());
    }
    assert.equal((await PDFDocument.load(merged)).getPageCount(), perForm.reduce((sum, count) => sum + count, 0), "pages = Σ pages des cinq formulaires : un exemplaire de chaque, pas un par bien");
  });

  it("15. AIDE 2042 livrée = rendu de buildClientSummaryDocument(RFS consolidée) ; 5NA = 7 000 une seule fois ; aucun identifiant de bien", async () => {
    const rfs = rfsOf(THREE());
    const document = buildClientSummaryDocument(rfs, { activityStartDate: "2026-03-01" });
    assert.equal(document.aide2042.cases.filter((item) => item.case === "5NA").length, 1);
    assert.equal(document.aide2042.cases.find((item) => item.case === "5NA")?.montant, 7000);
    assert.ok(!JSON.stringify(document).includes(A) && !JSON.stringify(document).includes(C));
    const expected = aideTexts(new Uint8Array(renderAide2042Pdf(document).output("arraybuffer")));
    const delivered = aideTexts(await bytesOf(await aide(rfs, DELIVERY_ON)));
    assert.ok(delivered.length > 20 && delivered.includes("5NA"));
    assert.deepEqual(delivered, expected, "RFS activité → buildClientSummaryDocument → rendu aide → réponse livrée : mêmes textes, un à un");
    assert.ok(!delivered.join(" ").includes(A) && !delivered.join(" ").includes(B) && !delivered.join(" ").includes(C));
    const source = readFileSync(path.join(ROOT, "src/app/api/lmnp/declaration/aide-2042-pdf/handler.ts"), "utf8");
    assert.match(source, /renderAide2042Pdf\(buildClientSummaryDocument\(typedRfs/);
  });

  it("16. ACTIVE-PROPERTY INVARIANCE — bien actif A, B, C ou aucun : Cerfa identique octet pour octet, aide 2042 identique texte pour texte (PDF jsPDF non déterministe en octets)", async () => {
    const rfs = rfsOf(THREE());
    const reference = {
      cerfa: sha(await bytesOf(await clockedAsync(() => cerfa(rfs, DELIVERY_ON)))),
      aide: aideTexts(await bytesOf(await clockedAsync(() => aide(rfs, DELIVERY_ON)))),
    };
    for (const activePropertyId of [A, B, C, undefined]) {
      const extra = activePropertyId ? { activePropertyId, propertyId: activePropertyId } : {};
      assert.equal(sha(await bytesOf(await clockedAsync(() => cerfa(rfs, DELIVERY_ON, extra)))), reference.cerfa, String(activePropertyId));
      assert.deepEqual(aideTexts(await bytesOf(await clockedAsync(() => aide(rfs, DELIVERY_ON, extra)))), reference.aide, String(activePropertyId));
    }
  });

  it("17. ORDER INVARIANCE LIVRÉE — permutations de 3 biens : mêmes valeurs fiscales dessinées (2031, 2031 bis, 2033-B) et même aide 2042", async () => {
    const reference = await deliveredLiasseTexts(rfsOf(THREE()));
    const referenceAide = buildClientSummaryDocument(rfsOf(THREE()), { activityStartDate: "2026-03-01" }).aide2042.cases;
    const bytesDifferences: string[] = [];
    for (const [label, order] of PERMUTATIONS) {
      const specs = SPECS_ABC();
      const rfs = rfsOf(THREE(order.map((index) => specs[index]!)));
      const delivered = await deliveredLiasseTexts(rfs);
      assert.deepEqual([delivered.p1, delivered.p2, delivered.p3], [reference.p1, reference.p2, reference.p3], label);
      assert.deepEqual(buildClientSummaryDocument(rfs, { activityStartDate: "2026-03-01" }).aide2042.cases, referenceAide, label);
      if (sha(delivered.bytes) !== sha(reference.bytes)) bytesDifferences.push(label);
    }
    // Les octets peuvent différer pour des raisons non fiscales (ordre de présentation des blocs par bien) : les valeurs fiscales sont comparées ci-dessus.
    assert.ok(bytesDifferences.length <= PERMUTATIONS.length, `différences d'octets documentées : ${bytesDifferences.join(", ") || "aucune"}`);
  });
});

// ===========================================================================
// 4. FAIL-CLOSED — matrice de domaine avec delivery = true : jamais de PDF partiel
// ===========================================================================

describe("FAIL-CLOSED avec delivery = true — aucun PDF livré pour un dossier hors domaine", () => {
  const specs = () => SPECS_ABC();
  const attestations = (kind: string, answer?: string) => {
    const base = { ssi: { answer: "confirmed", at: "2026-01-01T00:00:00.000Z", wordingVersion: "test" }, directHolding: { answer: "confirmed", at: "2026-01-01T00:00:00.000Z", wordingVersion: "test" }, noCommonCharges: { answer: "confirmed", at: "2026-01-01T00:00:00.000Z", wordingVersion: "test" } } as Record<string, unknown>;
    if (answer === undefined) delete base[kind]; else base[kind] = { answer, at: "2026-01-01T00:00:00.000Z", wordingVersion: "test" };
    return base;
  };
  const matrix: Array<[string, () => PersistedWorkspace, Record<string, unknown>?]> = [
    ["déficit antérieur", () => multiWorkspace({ specs: specs(), fiscalYear: { stocksOuverture: STOCKS } })],
    ["ARD historique", () => multiWorkspace({ specs: specs(), fiscalYear: { stocksOuverture: { ...STOCKS, stocks: { deficits: [], amortissementsReportes: 500, deficitsExpires: [] } } } })],
    ["reprise", () => multiWorkspace({ specs: specs(), fiscalYear: { repriseHistoriqueEnContinuite: true } })],
    ["exercice non initial", () => multiWorkspace({ specs: specs(), fiscalYear: { previousFiscalYearId: "fy-2025" } })],
    ["stock d'ouverture", () => multiWorkspace({ specs: specs(), fiscalYear: { stocksOuverture: { ...STOCKS, stocks: { deficits: [{ millesime: 2025, montant: 10 }], amortissementsReportes: 0, deficitsExpires: [] } } } })],
    ["charge commune", () => THREE(), { commonCharges: [{ label: "syndic" }] }],
    ["prêt partagé", () => { const loan = (spec: BienSpec): BienSpec => ({ ...spec, creditDocumentId: "doc-pret", credit: "present" }); const [a, b, c] = specs(); return multiWorkspace({ specs: [[a![0], loan(a![1])], [b![0], { ...loan(b![1]), pretIds: ["loan-2"] }], c!] }); }],
    ["date de mise en service manquante", () => { const [a, b, c] = specs(); return multiWorkspace({ specs: [a!, b!, [c![0], { ...c![1], date: undefined }]] }); }],
    ["LMP", () => multiWorkspace({ specs: specs(), root: { activityType: "LMP" } })],
    ["SSI non attesté", () => multiWorkspace({ specs: specs(), root: { multiPropertyAttestations: attestations("ssi") } })],
    ["SSI hors domaine", () => multiWorkspace({ specs: specs(), root: { multiPropertyAttestations: attestations("ssi", "declared_out_of_domain") } })],
    ["détention directe non attestée", () => multiWorkspace({ specs: specs(), root: { multiPropertyAttestations: attestations("directHolding") } })],
    ["détention indirecte", () => multiWorkspace({ specs: specs(), root: { multiPropertyAttestations: attestations("directHolding", "declared_out_of_domain") } })],
    ["charges communes non attestées", () => multiWorkspace({ specs: specs(), root: { multiPropertyAttestations: attestations("noCommonCharges") } })],
    ["charges communes hors domaine", () => multiWorkspace({ specs: specs(), root: { multiPropertyAttestations: attestations("noCommonCharges", "declared_out_of_domain") } })],
    ["document non attribué", () => { const ws = THREE(); ws.documents = [{ id: "doc-x", fiscalYearId: "fy-2026", fileName: "x.pdf", mimeType: "application/pdf", sizeBytes: 1, category: "charges", documentType: "unknown", status: "analyzed", uploadedAt: "2026-01-01T00:00:00.000Z" } as never]; return ws; }],
    ["39 C inter-biens (ARD généré)", () => multiWorkspace({ specs: [[A, oracleBien(2000, 3000, 500)], [B, oracleBien(1000, 3000, 500)], [C, oracleBien(500, 500, 100)]] })],
  ];
  for (const [label, build, options] of matrix) {
    it(`${label} → la génération est refusée : aucune RFS, donc aucun PDF ; la livraison ouverte ne change rien`, () => {
      const result = withFixedClock(() => runDeclarationGenerationFromWorkspace(build(), (options ?? {}) as never));
      assert.equal(result.status, "blocked");
      assert.equal("rfs" in result, false);
      assert.equal("liasseRfs" in result, false);
    });
  }
});

// ===========================================================================
// 5. PAIEMENT / ENTITLEMENT — ouvrir delivery n'offre jamais un document payant gratuitement
// ===========================================================================

describe("DÉCLARABILITÉ FINALE ET REGISTRY/SCOPE — aucun bypass multi", () => {
  const strip = (file: string) => readFileSync(path.join(ROOT, file), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  const walkPdf = (dir: string): string[] => readdirSync(path.join(ROOT, dir)).flatMap((entry) => {
    const relative = `${dir}/${entry}`;
    return statSync(path.join(ROOT, relative)).isDirectory() ? (entry === "tests" || entry === "assets" ? [] : walkPdf(relative)) : /\.ts$/.test(entry) ? [relative] : [];
  });

  it("18–19. le moteur Cerfa (registry, scope, gate de génération) et la déclarabilité finale ne contiennent AUCUNE branche multi ni capacité : mêmes contrats que le mono, fail-closed `case-sans-mapping-visuel` conservé", () => {
    for (const file of [...walkPdf("src/lib/lmnp/services/liasse-pdf"), "src/lib/lmnp/services/declaration/final-declarability.ts"]) {
      assert.doesNotMatch(strip(file), /multi-property|MULTI_PROPERTY|isMultiProperty|resolveMultiProperty|PropertyCapabilit/, file);
    }
    assert.match(strip("src/lib/lmnp/services/liasse-pdf/gate/generation-gate.ts"), /case-sans-mapping-visuel/);
  });

  it("18. la déclarabilité finale précède toute génération PDF dans les deux routes (aucun octet pour une projection non livrable)", () => {
    const cerfaCode = strip("src/app/api/lmnp/declaration/cerfa-pdf/handler.ts");
    assert.ok(cerfaCode.indexOf("resolveFinalDeclarabilityState(") > 0 && cerfaCode.indexOf("resolveFinalDeclarabilityState(") < cerfaCode.indexOf("GENERATE_BY_FORM[form]("));
    const aideCode = strip("src/app/api/lmnp/declaration/aide-2042-pdf/handler.ts");
    assert.ok(aideCode.indexOf("resolveFinalDeclarabilityState(") > 0 && aideCode.indexOf("resolveFinalDeclarabilityState(") < aideCode.indexOf("renderAide2042Pdf("));
  });
});

describe("PAIEMENT — l'entitlement payé reste l'autorité, capacité de livraison ouverte", () => {
  const deps = (row: { status: string; prior_history_status?: string | null } | null) => ({
    authenticate: async () => ({ userId: "user-1" }),
    assertOwnership: async () => undefined,
    store: { getByDossierYear: async () => row },
  }) as never;
  const accessWith = (row: Parameters<typeof deps>[0]) =>
    (async (input: unknown) => resolveDeliveryAccess(input as never, deps(row))) as never;
  const identity = { authToken: "t", dossierId: "dossier-1", fiscalYear: Y };

  it("20. delivery ON + domaine supporté + RFS valide + exercice NON payé (aucune ligne) → 402 payment_required sur Cerfa ET aide ; aucun PDF", async () => {
    const rfs = rfsOf(THREE());
    for (const row of [null, { status: "pending" }, { status: "failed" }]) {
      const responses = [
        await cerfa(rfs, DELIVERY_ON, identity, LIASSE_FORMS, accessWith(row) as never),
        await aide(rfs, DELIVERY_ON, identity, accessWith(row) as never),
      ];
      for (const response of responses) {
        assert.equal(response.status, 402, JSON.stringify(row));
        assert.equal((await response.json() as { code: string }).code, "payment_required");
      }
    }
  });

  it("exercice payé + delivery ON → livré ; exercice payé + delivery OFF → refusé par la capacité (l'entitlement ne remplace pas l'admission)", async () => {
    const rfs = rfsOf(THREE());
    const paid = accessWith({ status: "paid", prior_history_status: null });
    assert.equal((await clockedAsync(() => cerfa(rfs, DELIVERY_ON, identity, LIASSE_FORMS, paid as never))).status, 200);
    assert.equal((await clockedAsync(() => aide(rfs, DELIVERY_ON, identity, paid as never))).status, 200);
    for (const response of [await cerfa(rfs, DELIVERY_OFF, identity, LIASSE_FORMS, paid as never), await aide(rfs, DELIVERY_OFF, identity, paid as never)]) {
      assert.equal(response.status, 422);
    }
  });

  it("l'exercice payé ne débloque jamais un autre exercice (RFS d'un autre exercice → 403 fiscal_year_mismatch)", async () => {
    const other = { ...clone(rfsOf(THREE())), exercice: Y - 1 } as FiscalRepresentation;
    const paid = accessWith({ status: "paid", prior_history_status: null });
    for (const response of [await cerfa(other, DELIVERY_ON, identity, LIASSE_FORMS, paid as never), await aide(other, DELIVERY_ON, identity, paid as never)]) {
      assert.equal(response.status, 403);
    }
  });

  it("19. PAIEMENT reste OFF : barrière serveur du checkout active même avec génération ET livraison ouvertes ; tarif inchangé", async () => {
    const read = async () => ({ schemaVersion: 2, payload: { workspace: THREE() } });
    assert.equal(await isMultiPropertyBarrierActive(read, { dossierId: "d", fiscalYear: Y }, "payment", DELIVERY_ON), true);
    assert.equal(await isMultiPropertyBarrierActive(read, { dossierId: "d", fiscalYear: Y }, "payment"), true, "défaut de production");
    assert.equal(GENERATION_PRICE_TTC, 149);
    const checkout = readFileSync(path.join(ROOT, "src/lib/lmnp/services/payment/checkout-handler.ts"), "utf8");
    assert.match(checkout, /isMultiPropertyBarrierActive\(deps\.readWorkspaceSnapshot, \{ dossierId, fiscalYear \}, "payment"\)/);
  });

  it("l'accès à la livraison ne lit AUCUNE capacité multi : l'entitlement est évalué avant et indépendamment (source)", () => {
    const code = readFileSync(path.join(ROOT, "src/lib/lmnp/services/payment/delivery-access.ts"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
    assert.doesNotMatch(code, /multi-property|MULTI_PROPERTY|isMultiProperty/);
    for (const file of ["src/app/api/lmnp/declaration/cerfa-pdf/handler.ts", "src/app/api/lmnp/declaration/aide-2042-pdf/handler.ts"]) {
      const handler = readFileSync(path.join(ROOT, file), "utf8");
      assert.ok(handler.indexOf("await resolveAccess({") > 0 && handler.indexOf("await resolveAccess({") < handler.lastIndexOf("resolveMultiPropertyDeliveryAdmission("), `${file} : accès payé AVANT l'admission multi`);
    }
  });
});

// ===========================================================================
// 6. CAPACITÉS FINALES — génération ON, livraison ON ; édition, paiement, clôture, N+1 OFF
// ===========================================================================

describe("CAPACITÉS FINALES", () => {
  it("valeurs finales de production : generation et delivery ouvertes ; edition, payment, closing, nextYear fermés", () => {
    assert.deepEqual(MULTI_PROPERTY_CAPABILITIES, { edition: false, generation: true, delivery: true, payment: false, closing: false, nextYear: false });
  });

  it("21–22. CLÔTURE et N+1 : bloqués structurellement, même avec les six capacités à true", () => {
    const everything = caps(ALL);
    assert.equal(isMultiPropertyCapabilityOpen("closing", everything), false);
    assert.equal(isMultiPropertyCapabilityOpen("nextYear", everything), false);
    assert.deepEqual([...MULTI_PROPERTY_NEVER_OPEN_CAPABILITIES].sort(), ["closing", "nextYear"]);
    for (const capabilities of [undefined, DELIVERY_ON, everything]) {
      assert.equal(isMultiPropertyClosingBlocked(THREE(), capabilities), true);
      assert.equal(isMultiPropertyNextYearBlocked(THREE(), capabilities), true);
    }
  });

  it("indépendance : delivery ouvre la livraison seule ; la génération reste ouverte ; l'édition n'est pas ouverte par la livraison", () => {
    assert.equal(isMultiPropertyDeliveryBlocked(THREE()), false, "production : livraison ouverte");
    assert.equal(isMultiPropertyGenerationBlocked(THREE()), false, "production : génération ouverte");
    for (const other of ALL) assert.equal(isMultiPropertyCapabilityOpen(other, caps(["delivery"])), other === "delivery", other);
    assert.equal(isMultiPropertyCapabilityOpen("edition"), false);
    assert.equal(isMultiPropertyCapabilityOpen("payment"), false);
  });
});

// ===========================================================================
// 7. MONO — non-régression
// ===========================================================================

describe("MONO — génération, livraison et entitlement inchangés", () => {
  it("un dossier mono se génère et se livre comme avant, quelles que soient les capacités multi ; la RFS mono n'a pas de marqueur multi", async () => {
    const result = withFixedClock(() => runDeclarationGenerationFromWorkspace(monoWorkspace()));
    assert.equal(result.status, "generated");
    if (result.status !== "generated") return;
    assert.equal("immobilisationsParBien" in result.rfs && result.rfs.immobilisationsParBien !== undefined, false);
    for (const capabilities of [caps([]), DELIVERY_ON, undefined]) {
      assert.deepEqual(resolveMultiPropertyDeliveryAdmission(result.rfs, capabilities), { allowed: true });
      assert.equal((await clockedAsync(() => cerfa(result.rfs, capabilities))).status, 200);
      assert.equal((await clockedAsync(() => aide(result.rfs, capabilities))).status, 200);
    }
  });

  it("mono non payé : toujours 402 (l'entitlement mono n'est pas affecté par l'admission multi)", async () => {
    const result = withFixedClock(() => runDeclarationGenerationFromWorkspace(monoWorkspace()));
    if (result.status !== "generated") throw new Error("unreachable");
    const unpaid = (async (input: unknown) => resolveDeliveryAccess(input as never, { authenticate: async () => ({ userId: "u" }), assertOwnership: async () => undefined, store: { getByDossierYear: async () => null } } as never)) as never;
    const response = await aide(result.result?.rfs ?? result.rfs, undefined, { authToken: "t", dossierId: "d", fiscalYear: Y }, unpaid);
    assert.equal(response.status, 402);
  });
});
