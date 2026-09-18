/**
 * P1-2 — pont client vers la route P1-1. Ce fichier teste uniquement les
 * fonctions PURES (payload, extraction de message d'erreur). Le fetch Cerfa
 * (`fetchOfficialCerfaPdfBytes`) est réutilisé par la liasse fiscale
 * (`downloadLiasseFiscalePdf`) ; il n'existe plus de téléchargement Cerfa
 * seul. Les libellés et le câblage UI sont couverts par
 * DeclarationReadyView.ux.test.ts.
 * Run: npx tsx --test src/lib/lmnp/services/declaration/download-cerfa-pdf.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  CERFA_PDF_FORMS,
  buildCerfaPdfRequestPayload,
  describeCerfaPdfErrorBody,
} from "./download-cerfa-pdf";
import { ALL_CERFA_FORM_IDS } from "@/lib/lmnp/services/liasse-pdf";
import type { Dispense2033AState } from "@/runtime/capabilities/rfs/dispense-2033a";
import type { FiscalRepresentation } from "@/runtime/capabilities/rfs/types";

const FAKE_RFS = { fiscalResult: { exercice: 2025 } } as unknown as FiscalRepresentation;

function eligible(): Dispense2033AState["eligibilite"] {
  return { etat: "ELIGIBLE", seuil: { triennium: "2026-2028", seuilAutresEntreprisesHT: 66_000, source: "test" }, caReferenceN1: 0, raison: "test" };
}

function notEligible(): Dispense2033AState["eligibilite"] {
  return { etat: "NOT_ELIGIBLE", seuil: { triennium: "2026-2028", seuilAutresEntreprisesHT: 66_000, source: "test" }, caReferenceN1: 70_000, raison: "test" };
}

const EXPECTED_SIX_FORMS = ["2031-SD", "2031-bis-SD", "2033-A-SD", "2033-B-SD", "2033-C-SD", "2033-D-SD"] as const;

describe("buildCerfaPdfRequestPayload", () => {
  it("transporte la RFS et le declarationVersionId tels quels, jamais transformés", () => {
    const payload = buildCerfaPdfRequestPayload(FAKE_RFS, "version-1");
    assert.equal(payload.rfs, FAKE_RFS, "la RFS doit être la MÊME référence, jamais reconstruite");
    assert.equal(payload.declarationVersionId, "version-1");
  });

  it("P1-6C — forms est toujours la liasse complète (6 formulaires), dans l'ordre canonique", () => {
    const payload = buildCerfaPdfRequestPayload(FAKE_RFS, "version-1");
    assert.deepEqual(payload.forms, EXPECTED_SIX_FORMS);
    assert.deepEqual(CERFA_PDF_FORMS, EXPECTED_SIX_FORMS);
  });

  it("P1-6C — CERFA_PDF_FORMS respecte l'ordre canonique du projet (ALL_CERFA_FORM_IDS), jamais un second ordre inventé", () => {
    // Ne recrée pas une deuxième liste canonique : compare directement à la
    // source unique déjà utilisée par le pipeline PDF (types.ts).
    const canonicalPositions = CERFA_PDF_FORMS.map((form) => ALL_CERFA_FORM_IDS.indexOf(form));
    const sorted = [...canonicalPositions].sort((a, b) => a - b);
    assert.deepEqual(canonicalPositions, sorted, "CERFA_PDF_FORMS doit déjà être dans l'ordre canonique de ALL_CERFA_FORM_IDS");
  });

  it("Case E — ÉLIGIBLE + USE_DISPENSE → 2033-A-SD retiré de la sélection, les 5 autres formulaires inchangés", () => {
    const rfs = { ...FAKE_RFS, dispense2033A: { eligibilite: eligible(), decision: "USE_DISPENSE" } } as unknown as FiscalRepresentation;
    const payload = buildCerfaPdfRequestPayload(rfs, "version-1");
    assert.deepEqual(payload.forms, ["2031-SD", "2031-bis-SD", "2033-B-SD", "2033-C-SD", "2033-D-SD"]);
  });

  it("Case F — ÉLIGIBLE + FILE_2033A → sélection complète inchangée, le client a choisi de déposer quand même", () => {
    const rfs = { ...FAKE_RFS, dispense2033A: { eligibilite: eligible(), decision: "FILE_2033A" } } as unknown as FiscalRepresentation;
    const payload = buildCerfaPdfRequestPayload(rfs, "version-1");
    assert.deepEqual(payload.forms, EXPECTED_SIX_FORMS);
  });

  it("Case G — NOT_ELIGIBLE → sélection complète inchangée, quel que soit `decision`", () => {
    const rfs = { ...FAKE_RFS, dispense2033A: { eligibilite: notEligible(), decision: "USE_DISPENSE" } } as unknown as FiscalRepresentation;
    const payload = buildCerfaPdfRequestPayload(rfs, "version-1");
    assert.deepEqual(payload.forms, EXPECTED_SIX_FORMS);
  });

  it("Case H — UNKNOWN → sélection complète inchangée, jamais traité comme dispensé", () => {
    const rfs = { ...FAKE_RFS, dispense2033A: { eligibilite: { etat: "UNKNOWN", raison: "test" } } } as unknown as FiscalRepresentation;
    const payload = buildCerfaPdfRequestPayload(rfs, "version-1");
    assert.deepEqual(payload.forms, EXPECTED_SIX_FORMS);
  });

  it("Case I — autres formulaires jamais affectés par la dispense, même quand elle est en effet", () => {
    const rfs = { ...FAKE_RFS, dispense2033A: { eligibilite: eligible(), decision: "USE_DISPENSE" } } as unknown as FiscalRepresentation;
    const payload = buildCerfaPdfRequestPayload(rfs, "version-1");
    for (const form of ["2031-SD", "2031-bis-SD", "2033-B-SD", "2033-C-SD", "2033-D-SD"] as const) {
      assert.ok(payload.forms.includes(form), `${form} doit rester présent`);
    }
  });
});

describe("describeCerfaPdfErrorBody", () => {
  it("extrait `error` quand présent", () => {
    assert.equal(describeCerfaPdfErrorBody({ error: "rfs requis." }), "rfs requis.");
  });

  it("extrait le message de la première violation quand le moteur a bloqué", () => {
    const body = { status: "blocked", violations: [{ code: "debordement-largeur", message: "trop grand" }] };
    assert.equal(describeCerfaPdfErrorBody(body), "trop grand");
  });

  it("retourne undefined pour un corps vide ou inexploitable — jamais un message inventé", () => {
    assert.equal(describeCerfaPdfErrorBody(undefined), undefined);
    assert.equal(describeCerfaPdfErrorBody(null), undefined);
    assert.equal(describeCerfaPdfErrorBody({}), undefined);
    assert.equal(describeCerfaPdfErrorBody({ error: "" }), undefined);
    assert.equal(describeCerfaPdfErrorBody({ status: "blocked", violations: [] }), undefined);
    assert.equal(describeCerfaPdfErrorBody("texte brut"), undefined);
  });
});
