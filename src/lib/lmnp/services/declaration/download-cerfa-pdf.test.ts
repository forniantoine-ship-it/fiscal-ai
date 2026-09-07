/**
 * P1-2 — pont client vers la route P1-1. Ce fichier teste uniquement les
 * fonctions PURES (payload, nom de fichier, extraction de message d'erreur)
 * — ce projet n'a aucune infrastructure de test de composant React (aucun
 * jsdom/@testing-library), donc `downloadOfficialCerfaPdf()` elle-même
 * (fetch + DOM) n'est pas exercée ici : ce serait fabriquer un faux test sur
 * une infrastructure inexistante. Les comportements UI (bouton disponible/
 * absent selon la fraîcheur, double-clic, affichage d'erreur) sont vérifiés
 * par relecture du composant (DeclarationReadyView.tsx) — voir la
 * restitution du chantier.
 * Run: npx tsx --test src/lib/lmnp/services/declaration/download-cerfa-pdf.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  CERFA_PDF_FORMS,
  buildCerfaPdfRequestPayload,
  cerfaPdfFileName,
  describeCerfaPdfErrorBody,
} from "./download-cerfa-pdf";
import type { FiscalRepresentation } from "@/runtime/capabilities/rfs/types";

const FAKE_RFS = { fiscalResult: { exercice: 2025 } } as unknown as FiscalRepresentation;

describe("buildCerfaPdfRequestPayload", () => {
  it("transporte la RFS et le declarationVersionId tels quels, jamais transformés", () => {
    const payload = buildCerfaPdfRequestPayload(FAKE_RFS, "version-1");
    assert.equal(payload.rfs, FAKE_RFS, "la RFS doit être la MÊME référence, jamais reconstruite");
    assert.equal(payload.declarationVersionId, "version-1");
  });

  it("forms est toujours exactement 2033-A-SD + 2033-B-SD — 2033-C hors périmètre P1-2", () => {
    const payload = buildCerfaPdfRequestPayload(FAKE_RFS, "version-1");
    assert.deepEqual(payload.forms, ["2033-A-SD", "2033-B-SD"]);
    assert.deepEqual(CERFA_PDF_FORMS, ["2033-A-SD", "2033-B-SD"]);
  });
});

describe("cerfaPdfFileName", () => {
  it("inclut l'exercice fiscal, extension .pdf", () => {
    assert.equal(cerfaPdfFileName(2025), "liasse-lmnp-cerfa-officiel-2025.pdf");
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
