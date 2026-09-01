import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { applyDecalageJanDec } from "./capabilities/f013/apply-decalage-jan-dec";
import { computeMoisLocation } from "./capabilities/f013/compute-mois-location";
import { computeRecettesExercice } from "./capabilities/f013/compute-recettes-exercice";
import { computeRevenuTheorique } from "./capabilities/f013/compute-revenu-theorique";
import { reconcileRevenus } from "./capabilities/f013/reconcile-revenus";
import { explainRevenus } from "./presentation/explain-revenus";
import { F013RevenusAssistant } from "./assistants/f013-revenus/assistant";

describe("F-013 — TRF-REV-01 revenu théorique", () => {
  it("calcule loyer × 12 pour un bail annuel complet (cas nominal)", () => {
    const result = computeRevenuTheorique({
      exerciceFiscal: 2024,
      dateMiseEnService: "2023-01-01",
      loyerMensuel: 1000,
    });
    assert.equal(result.revenuTheorique.montantAttendu, 12000);
    assert.equal(result.revenuTheorique.moisLocationEffectifs, 12);
  });

  it("applique le prorata SAV-009 si mise en service en cours d'année", () => {
    const mois = computeMoisLocation({
      exerciceFiscal: 2024,
      dateMiseEnService: "2024-07-01",
    });
    assert.equal(mois.moisLocationEffectifs, 6);

    const result = computeRevenuTheorique({
      exerciceFiscal: 2024,
      dateMiseEnService: "2024-07-01",
      loyerMensuel: 1000,
    });
    assert.equal(result.revenuTheorique.montantAttendu, 6000);
  });

  it("déduit les mois de vacance déclarés", () => {
    const result = computeRevenuTheorique({
      exerciceFiscal: 2024,
      dateMiseEnService: "2023-01-01",
      loyerMensuel: 1000,
      vacances: [{ dateDebut: "2024-06-01", dateFin: "2024-08-31" }],
    });
    assert.equal(result.revenuTheorique.moisVacance, 3);
    assert.equal(result.revenuTheorique.montantAttendu, 9000);
  });
});

describe("F-013 — TRF-REV-02 réconciliation", () => {
  it("considère cohérent un écart < 5 %", () => {
    const result = reconcileRevenus({ revenuTheorique: 12000, revenuDeclare: 11800 });
    assert.equal(result.niveau, "coherent");
    assert.equal(result.nature, "coherent");
  });

  it("qualifie un sous-déclaration ≥ 5 %", () => {
    const result = reconcileRevenus({ revenuTheorique: 12000, revenuDeclare: 10000 });
    assert.equal(result.niveau, "modere");
    assert.equal(result.nature, "sous_declare");
    assert.equal(result.ecart, -2000);
  });

  it("bloque un revenu nul suspect", () => {
    const result = reconcileRevenus({ revenuTheorique: 12000, revenuDeclare: 0 });
    assert.equal(result.nature, "nul_suspect");
    assert.ok(result.anomalies.some((a) => a.severity === "error"));
  });
});

describe("F-013 — SAV-028 décalage janvier/décembre", () => {
  it("ajoute le loyer si décembre N-1 encaissé en janvier N", () => {
    const result = applyDecalageJanDec({
      montantDeclare: 11000,
      loyerMensuel: 1000,
      janvierEncaisseDecPrecedent: true,
    });
    assert.equal(result.montantAjuste, 12000);
    assert.equal(result.ajustement, 1000);
  });

  it("retire le loyer si décembre N encaissé en janvier N+1", () => {
    const result = applyDecalageJanDec({
      montantDeclare: 12000,
      loyerMensuel: 1000,
      decembreEncaisseJanvierSuivant: true,
    });
    assert.equal(result.montantAjuste, 11000);
    assert.equal(result.ajustement, -1000);
  });
});

describe("F-013 — composition recettes exercice", () => {
  it("totalise loyers + indemnités + plateforme", () => {
    const result = computeRecettesExercice({
      exerciceFiscal: 2024,
      dateMiseEnService: "2023-01-01",
      loyerMensuel: 1000,
      montantDeclare: 11800,
      janvierEncaisseDecPrecedent: true,
      indemnitesAssurance: 500,
      recettesPlateforme: 2000,
    });
    assert.equal(result.recettes.loyersEncaisses, 12800);
    assert.equal(result.recettes.totalRecettes, 15300);
    assert.equal(result.recettes.ajustementsJanDec, 1000);
  });
});

describe("F-013 — Explanation Engine", () => {
  it("n'expose pas de jargon fiscal", () => {
    const result = computeRecettesExercice({
      exerciceFiscal: 2024,
      dateMiseEnService: "2023-01-01",
      loyerMensuel: 1000,
      montantDeclare: 12000,
    });
    const explain = explainRevenus({ recettes: result.recettes, exerciceFiscal: 2024 });
    assert.match(explain.explanation, /recettes déclarables/i);
    assert.doesNotMatch(explain.explanation, /SAV-|CGI|encaissement/i);
  });
});

describe("F-013 — Assistant Revenus", () => {
  const ctx = {
    dossierId: "test",
    fiscalYear: 2024,
    route: "/assistants/revenus",
  };

  it("démarre sur le diagnostic", () => {
    const assistant = new F013RevenusAssistant(ctx);
    const start = assistant.start();
    assert.equal(start.state.step, "diagnostic");
    assert.match(start.messages[0]?.content ?? "", /location/i);
  });

  it("parcours nominal longue durée cohérent", async () => {
    const assistant = new F013RevenusAssistant(ctx, {
      dateMiseEnService: "2023-01-01",
      loyerMensuel: 1000,
    });
    let state = assistant.start().state;

    let turn = await assistant.handle(state, {
      type: "submit_diagnostic",
      typeLocation: "longue_duree",
      continuiteBail: "un_locataire",
      modeCharges: "charges_comprises",
    });
    state = turn.state;
    assert.equal(state.step, "declaration");

    turn = await assistant.handle(state, {
      type: "submit_declaration",
      montant: 12000,
    });
    state = turn.state;
    assert.equal(state.step, "decalage_jan_dec");

    turn = await assistant.handle(state, {
      type: "submit_decalage",
      janvierOui: false,
      decembreOui: false,
    });
    state = turn.state;
    assert.equal(state.step, "aggregate_review");

    turn = await assistant.handle(state, { type: "confirm_all" });
    assert.equal(turn.completed, true);
    assert.equal(turn.event, "REVENUS_TERMINE");
    assert.equal(turn.state.result?.recettes.totalRecettes, 12000);
  });

  it("bascule en mode collecte pour plateforme pure", async () => {
    const assistant = new F013RevenusAssistant(ctx, { dateMiseEnService: "2023-01-01" });
    const state = assistant.start().state;

    const turn = await assistant.handle(state, {
      type: "submit_diagnostic",
      typeLocation: "plateforme",
      continuiteBail: "un_locataire",
      modeCharges: "charges_comprises",
    });
    assert.equal(turn.state.modeCollecte, true);
    assert.equal(turn.state.step, "sources_plateforme");
  });
});
