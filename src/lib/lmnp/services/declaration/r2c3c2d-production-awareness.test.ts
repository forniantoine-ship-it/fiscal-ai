/**
 * R2C.3c2d — PRODUCTION WORKSPACE AWARENESS / UI-SAFE WIRING : l'écran de validation et la vue déclaration RECONNAISSENT un
 * dossier multi (readiness technique, raisons structurées avec propertyId/domain/recoverable, documents transmis) SANS jamais
 * l'activer : aucune génération utilisateur, persistance, paiement, Cerfa, clôture ni N+1 multi.
 *
 * Run: npx tsx --test src/lib/lmnp/services/declaration/r2c3c2d-production-awareness.test.ts
 */
import "@/lab/v2-dossier/test-public-env";
import { CONFIRMED_ATTESTATIONS } from "./multi-property-test-support";
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, it, mock } from "node:test";

import { buildBlockingReasonRows, ValidationMultiPropertyBlock } from "@/components/lmnp/validation-workflow/ValidationMultiPropertyBlock";
import { MULTI_PROPERTY_CAPABILITIES } from "@/lib/lmnp/dossier/multi-property-activation";
import { resolveDocumentScope } from "@/lib/lmnp/dossier/property-scope";
import { resolveDeclarationGenerationGate } from "@/lib/lmnp/services/declaration/declaration-generation-gate";
import { resolveDeclarationOutOfDate } from "@/lib/lmnp/services/declaration/declaration-freshness";
import { canOfferPaymentWithoutCerfa, resolveDossierReadyForPaymentWithoutCerfa } from "@/lib/lmnp/services/declaration/payment-readiness";
import { runDeclarationGenerationFromWorkspace } from "@/lib/lmnp/services/declaration/generation-workspace";
import { classifyBlockingReason } from "@/lib/lmnp/services/declaration/workspace-blocking-reasons";
import { resolveImmobilisationsContinuityForGeneration } from "@/lib/lmnp/services/dossier/fiscal-year-cycle";
import { resolvePersistedExternalTakeoverOpening } from "@/lib/lmnp/services/declaration/prior-history-eligibility";
import type { PersistedWorkspace } from "@/lib/lmnp/store/persistence";

const ROOT = process.cwd();
const BASELINE = "da2d9244cf20c33a31ebfff34915aea4028dbfae";
const Y = 2026;
const T = "2026-01-01T00:00:00.000Z";
const FIXED = Date.parse("2026-06-01T12:00:00.000Z");
const A = "home-1";
const B = "bien-b";
const SIRET = "12345678900012";
const clone = <V>(value: V): V => JSON.parse(JSON.stringify(value));
const src = (file: string) => readFileSync(path.join(ROOT, file), "utf8");

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
const mutate = (ws: PersistedWorkspace, change: (ws: PersistedWorkspace) => void) => { const next = clone(ws); change(next); return next; };
const doc = (id: string, propertyId?: string | null) =>
  ({ id, fiscalYearId: "fy-2026", fileName: `${id}.pdf`, mimeType: "application/pdf", sizeBytes: 1, category: "charges", documentType: "unknown", status: "analyzed", uploadedAt: T,
     ...(propertyId !== undefined ? { propertyId } : {}) }) as unknown as PersistedWorkspace["documents"][number];

function generated(workspace: PersistedWorkspace): PersistedWorkspace {
  const result = withFixedClock(() => runDeclarationGenerationFromWorkspace(workspace));
  assert.equal(result.status, "generated");
  if (result.status !== "generated") throw new Error("unreachable");
  const ws = clone(workspace);
  Object.assign(draftOf(ws), { fiscalResult: result.fiscalResult, rfs: result.rfs, liasseResult: result.liasseResult, liasseRfs: result.liasseRfs });
  ws.fiscalYear = { ...ws.fiscalYear, declarationGeneratedAt: T } as PersistedWorkspace["fiscalYear"];
  return ws;
}

/** Le gate tel que l'écran de validation l'appelle (workspace canonique du provider : fiscalYear, properties, documents, declarationDraft). */
function gateOf(ws: PersistedWorkspace, options: { generated?: boolean; paid?: boolean; withWorkspace?: boolean } = {}) {
  const generatedFlag = options.generated ?? false;
  return withFixedClock(() => resolveDeclarationGenerationGate({
    draft: ws.declarationDraft, properties: ws.properties, fiscalYear: ws.fiscalYear.year, paid: options.paid ?? false, generated: generatedFlag,
    stocksOuverture: ws.fiscalYear.stocksOuverture?.stocks,
    continuity: resolveImmobilisationsContinuityForGeneration({
      draft: ws.declarationDraft, properties: ws.properties, propertyIds: ws.fiscalYear.propertyIds,
      immobilisationsOuverture: ws.fiscalYear.immobilisationsOuverture, repriseHistoriqueEnContinuite: ws.fiscalYear.repriseHistoriqueEnContinuite,
      previousFiscalYearId: ws.fiscalYear.previousFiscalYearId, continuiteNativeVerifiee: ws.fiscalYear.continuiteNativeVerifiee,
    }),
    fiscalYearOpening: resolvePersistedExternalTakeoverOpening(ws.fiscalYear),
    ...(options.withWorkspace === false ? {} : { workspace: { fiscalYear: ws.fiscalYear, properties: ws.properties, documents: ws.documents, declarationDraft: ws.declarationDraft } }),
  }));
}
const reasonsOf = (ws: PersistedWorkspace, options = {}) => gateOf(ws, options).workspaceReadiness?.blockingReasons ?? [];
const strip = (value: unknown) => JSON.stringify(value, (key, v) => (key === "computedAt" || key === "assembledAt" || key === "sourceFiscalResultAt" ? undefined : v));

describe("R2C.3c2d — le gate reconnaît le multi (visibilité) sans l'activer", () => {
  it("D3/D4 — scoped multi identifié comme multi ; techniquement complet ⇒ technicalReady = true", () => {
    const readiness = gateOf(multi()).workspaceReadiness!;
    assert.ok(readiness);
    assert.equal(readiness.mode, "scoped_multi");
    assert.equal(readiness.technicalReady, true);
  });

  it("D5/D6/D7/D8 — technicalReady ∧ génération ouverte n'autorise QUE canGenerate (avant génération) ; canCheckout / canRetryAfterPayment restent false (payé ou non) ; déjà généré : tout reste false", () => {
    for (const paid of [false, true]) {
      for (const generatedFlag of [false, true]) {
        const ws = generatedFlag ? generated(multi()) : multi();
        const gate = gateOf(ws, { paid, generated: generatedFlag });
        assert.equal(gate.workspaceReadiness?.technicalReady, true);
        // MB-MULTI-CAPABILITY-WIRING-1 : avant génération, la gate admet la génération (capacité ∧ domaine ∧ readiness) ; jamais le paiement.
        assert.deepEqual({ g: gate.canGenerate, c: gate.canCheckout, r: gate.canRetryAfterPayment }, { g: !generatedFlag, c: false, r: false }, `paid=${paid} generated=${generatedFlag}`);
      }
    }
    for (const capability of ["edition", "generation", "delivery", "payment", "closing", "nextYear"] as const) {
      assert.equal(MULTI_PROPERTY_CAPABILITIES[capability], ["generation", "delivery"].includes(capability), `capacité multi ${capability}`);
    }
  });

  it("D9/D13 — les documents du workspace sont transmis au preview : un document sans propertyId bloque (unattributed_documents)", () => {
    const ws = mutate(multi(), (next) => { next.documents = [doc("doc-x")]; });
    const reason = reasonsOf(ws).find((item) => item.code === "unattributed_documents");
    assert.ok(reason, "documents transmis au preview");
    assert.equal(gateOf(ws).workspaceReadiness?.technicalReady, false);
  });

  it("D10/D11/D12 — documents du bien A, du bien B et commun conservent leur portée, sans blocker", () => {
    const ws = mutate(multi(), (next) => { next.documents = [doc("doc-a", A), doc("doc-b", B), doc("doc-c", null)]; });
    assert.deepEqual(resolveDocumentScope(ws, ws.documents[0]!), { kind: "property", propertyId: A, via: "explicit" });
    assert.deepEqual(resolveDocumentScope(ws, ws.documents[1]!), { kind: "property", propertyId: B, via: "explicit" });
    assert.deepEqual(resolveDocumentScope(ws, ws.documents[2]!), { kind: "common" });
    const readiness = gateOf(ws).workspaceReadiness!;
    assert.equal(readiness.blockingReasons.some((reason) => reason.code === "unattributed_documents"), false);
    assert.equal(readiness.technicalReady, true);
  });

  it("D14/D32 — déclaration stockée + document non attribué ⇒ preview non current, jamais un faux fresh (fraîcheur avec workspace.documents)", () => {
    const stored = generated(multi());
    const ws = mutate(stored, (next) => { next.documents = [doc("doc-x")]; });
    assert.notEqual(gateOf(ws, { generated: true }).referenceGenerationStatus, "current");
    const freshness = (documents?: PersistedWorkspace["documents"]) => withFixedClock(() => resolveDeclarationOutOfDate({
      fiscalYear: ws.fiscalYear, declarationDraft: ws.declarationDraft, properties: ws.properties, ...(documents ? { documents } : {}),
    }));
    assert.equal(freshness(ws.documents), true);
  });

  it("D15/D16/D17 — aucun bien actif : readiness, fraîcheur et blockers globaux identiques (fonctions pures, aucun paramètre d'interface)", () => {
    const ws = mutate(generated(multi()), (next) => { targetOf(next, B).chargesNatureReview = { status: "needs_review", reason: "legacy_mono_charges_nature_unknown" }; });
    assert.equal(strip(gateOf(ws, { generated: true })), strip(gateOf(ws, { generated: true })));
    for (const file of ["declaration-generation-gate.ts", "workspace-readiness.ts", "declaration-freshness.ts"]) {
      assert.doesNotMatch(src(`src/lib/lmnp/services/declaration/${file}`), /activeProperty|useV3CorrectionScope/);
    }
  });

  it("D18/D19/D20 — la raison d'un bien conserve son propertyId et expose le domaine canonique", () => {
    const wsA = mutate(multi(), (next) => { delete targetOf(next, A).revenusAssistant; });
    const wsB = mutate(multi(), (next) => { delete targetOf(next, B).revenusAssistant; });
    const a = reasonsOf(wsA).find((reason) => reason.code === "property_input_invalid")!;
    const b = reasonsOf(wsB).find((reason) => reason.code === "property_input_invalid")!;
    assert.deepEqual({ p: a.propertyId, d: a.domain, r: a.recoverable }, { p: A, d: "revenus", r: true });
    assert.deepEqual({ p: b.propertyId, d: b.domain, r: b.recoverable }, { p: B, d: "revenus", r: true });
  });

  it("D30/D31 — mono et scoped mono : aucun blocker artificiel (pas de readiness multi)", () => {
    for (const make of [legacyMono, scopedMono]) {
      const gate = gateOf(make());
      assert.equal(gate.workspaceReadiness, undefined);
      assert.equal(gate.snapshot.isMultiProperty, false);
    }
  });

  it("D1/D2/D43 — legacy mono : gate STRICTEMENT inchangé avec ou sans workspace ; scoped mono équivalent au legacy (capacités et résultat)", () => {
    const legacy = legacyMono();
    assert.equal(strip(gateOf(legacy)), strip(gateOf(legacy, { withWorkspace: false })));
    assert.equal(strip(gateOf(generated(legacy), { generated: true })), strip(gateOf(generated(legacy), { generated: true, withWorkspace: false })));
    const scoped = gateOf(scopedMono());
    const reference = gateOf(legacy);
    assert.deepEqual({ g: scoped.canGenerate, c: scoped.canCheckout, r: scoped.canRetryAfterPayment }, { g: reference.canGenerate, c: reference.canCheckout, r: reference.canRetryAfterPayment });
    assert.equal(reference.canCheckout, true, "précondition : mono prêt ⇒ checkout proposé");
    assert.equal(strip(scoped.fiscalResult), strip(reference.fiscalResult));
    assert.equal(gateOf(scopedMono(), { paid: true }).canRetryAfterPayment, true);
  });

  it("D40 — payment-readiness multi : toujours false (contrat existant, fichier inchangé)", () => {
    const gate = gateOf(multi());
    assert.equal(gate.snapshot.isMultiProperty, true);
    assert.equal(resolveDossierReadyForPaymentWithoutCerfa(gate), false);
    assert.equal(canOfferPaymentWithoutCerfa({ gate, paid: false, phaseIsIdle: true }), false);
  });
});

describe("R2C.3c2d — modèle de lignes UI et rendu (aucune navigation inventée, aucun faux bouton)", () => {
  const properties = [
    { id: A, label: "Studio Lyon", address: "1 rue X", city: "Lyon", postalCode: "69000" },
    { id: B, label: "", address: "3 rue Y", city: "Nantes", postalCode: "44000" },
  ] as never;
  const cases: Array<[string, string | undefined]> = [
    ["charges_nature_needs_review", B], ["entry_mode_unknown", A], ["multi_property_39c_allocation_not_supported", undefined],
    ["multi_property_historical_ard_not_supported", undefined], ["exercise_opening_not_attributable", undefined],
    ["unsupported_shared_loan", undefined], ["common_charges_not_supported", undefined],
  ];

  it("D21/D23–D29 — les raisons non résolubles restent VISIBLES, non recoverable, sans navigation", () => {
    const rows = buildBlockingReasonRows(cases.map(([code, propertyId]) => classifyBlockingReason({ code, ...(propertyId ? { propertyId } : {}) })), properties);
    assert.equal(rows.length, cases.length);
    for (const row of rows) {
      assert.equal(row.recoverable, false, row.code);
      assert.equal("href" in row, false, "aucune URL inventée");
    }
  });

  it("D22 — un code inconnu reste fail-closed ET visible", () => {
    const rows = buildBlockingReasonRows([classifyBlockingReason({ code: "futur_code_inconnu", propertyId: B })], properties);
    assert.equal(rows.length, 1);
    assert.deepEqual({ known: rows[0]!.known, recoverable: rows[0]!.recoverable, propertyId: rows[0]!.propertyId }, { known: false, recoverable: false, propertyId: B });
  });

  it("propriété : libellé fiable (label, sinon adresse) ; propertyId conservé ; jamais « Bien 2 / Appartement A » inventé", () => {
    const rows = buildBlockingReasonRows([
      classifyBlockingReason({ code: "service_date_missing", propertyId: A }),
      classifyBlockingReason({ code: "service_date_missing", propertyId: B }),
      classifyBlockingReason({ code: "service_date_missing", propertyId: "bien-inconnu" }),
      classifyBlockingReason({ code: "common_charges_not_supported" }),
    ], properties);
    assert.deepEqual(rows.map((row) => [row.propertyId, row.propertyLabel]), [[A, "Studio Lyon"], [B, "3 rue Y"], ["bien-inconnu", undefined], [undefined, undefined]]);
    assert.equal(rows[0]!.recoverable, true);
    assert.equal(rows[0]!.domain, "logement");
  });

  it("D41/D42 — le rendu liste les raisons et n'expose aucun CTA de génération, paiement ni clôture", () => {
    const rows = buildBlockingReasonRows([
      classifyBlockingReason({ code: "charges_nature_needs_review", propertyId: A }),
      classifyBlockingReason({ code: "service_date_missing", propertyId: B }),
    ], properties);
    const html = renderToStaticMarkup(createElement(ValidationMultiPropertyBlock, { cardStyle: {}, reasons: rows }));
    assert.match(html, /Studio Lyon/);
    assert.match(html, /charges_nature_needs_review/);
    assert.match(html, /service_date_missing/);
    assert.match(html, /non résoluble/i);
    assert.doesNotMatch(html, /Générer|Payer|payer|Clôturer|Valider et payer|href="\/(assistants|documents)/);
    assert.doesNotMatch(renderToStaticMarkup(createElement(ValidationMultiPropertyBlock, { cardStyle: {} })), /charges_nature/, "sans raisons : rendu historique");
  });
});

describe("R2C.3c2d — câblage : aucune activation (balayages de source)", () => {
  /** Code exécutable : commentaires `//` et `/* *​/` retirés (les commentaires citent légitimement les anciens noms). */
  const executable = (text: string) => text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  const vds = () => executable(src("src/components/lmnp/documents/ValidationDocumentStep.tsx"));
  const drv = () => executable(src("src/components/lmnp/declaration/DeclarationReadyView.tsx"));
  const handlerBody = () => {
    const text = vds();
    const start = text.indexOf("const handleGenerationComplete");
    const end = text.indexOf("if (generated && paid && !gate.canGenerate", start);
    assert.ok(start > 0 && end > start);
    return text.slice(start, end);
  };

  it("D9/D32 — l'écran transmet le workspace canonique du provider (documents compris) à la gate ; la vue déclaration transmet documents à la fraîcheur", () => {
    assert.match(vds(), /workspace:\s*\{[^}]*documents:\s*workspace\.documents/);
    assert.match(drv(), /documents:\s*workspace\.documents/);
    assert.doesNotMatch(drv(), /generation-workspace|runDeclarationGenerationFromWorkspace/);
  });

  it("D33/D34/D35/D36 — génération : garde multi AVANT tout calcul ; aucune génération ni persistance multi", () => {
    const body = handlerBody();
    const guard = body.indexOf("isMultiPropertyGenerationBlocked(workspace)");
    const call = body.indexOf("runDeclarationGenerationFromWorkspace(");
    assert.ok(guard >= 0 && call > guard, "garde multi avant l'appel au service");
    assert.doesNotMatch(body, /\brunDeclarationGeneration\(/, "plus d'appel direct historique : un seul seam (service workspace)");
    assert.ok(body.indexOf("DECLARATION_PATCH_DRAFT") > call && body.indexOf("JOURNEY_MARK_DECLARATION_GENERATED") > call, "persistance uniquement après la garde et l'appel");
    assert.equal((vds().match(/runDeclarationGenerationFromWorkspace\(/g) ?? []).length, 1);
  });

  it("D41/D42 — DeclarationReadyView : un multi n'est jamais présenté comme généré/prêt ; téléchargement fermé ; aucun CTA actif", () => {
    const text = drv();
    assert.match(text, /isMultiPropertyDeliveryBlocked\(workspace\)/);
    const earlyReturn = text.indexOf("isMultiPropertyDeliveryBlocked(workspace)", text.indexOf("export function DeclarationReadyView"));
    assert.ok(earlyReturn > 0 && earlyReturn < text.indexOf("vos éléments fiscaux sont générés"), "garde multi avant l'affichage « générés »");
    assert.match(text, /canDownloadLiasse\s*=\s*Boolean\([\s\S]*?!isMultiPropertyDeliveryBlocked\(workspace\)/);
  });

  it("D37–D39/D44 + périmètre — checkout, transition, clôture/N+1, Cerfa, readiness de paiement, reducer, moteur, workspace-readiness, SQL : inchangés", () => {
    const untouched = [
      "src/lib/lmnp/services/payment", "src/lib/lmnp/services/fiscal-year-transition", "src/app", "src/lib/lmnp/services/dossier/fiscal-year-cycle.ts",
      "src/lib/lmnp/services/declaration/payment-readiness.ts", "src/lib/lmnp/store", "src/lib/lmnp/dossier",
      "src/lib/lmnp/services/declaration/generation-workspace.ts", "src/lib/lmnp/services/declaration/workspace-readiness.ts",
      "src/lib/lmnp/services/declaration/workspace-blocking-reasons.ts", "src/lib/lmnp/services/declaration/declaration-freshness.ts",
      "supabase",
    ];
    const diff = execSync(`git diff --name-only ${BASELINE} -- ${untouched.join(" ")}`, { cwd: ROOT, encoding: "utf8" }).split("\n").filter((file) => file && !/\.test\.tsx?$/.test(file));
    assert.deepEqual(diff, []);
  });

  it("aucun second feature flag : la constante 3c1 est la seule autorité d'activation", () => {
    for (const text of [vds(), drv(), src("src/lib/lmnp/services/declaration/declaration-generation-gate.ts")]) {
      assert.doesNotMatch(text, /MULTI_PROPERTY_\w*ENABLED\s*=|NEXT_PUBLIC_\w*MULTI/);
    }
  });
});
