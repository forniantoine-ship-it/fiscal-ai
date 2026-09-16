/**
 * N1-A / N1-B — correctifs suite à l'audit contradictoire indépendant de NEXT-1.
 * Convention du projet : pas de RTL — logique de décision extraite en
 * fonctions pures exportées par le panel, testée directement, combinée au
 * runtime réel (F013RevenusAssistant.handle) pour le contrat bout en bout.
 * Run: npx tsx --test src/components/lmnp/assistants/F013RevenusAssistantPanel-n1-fix.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { F013RevenusAssistant, type F013Result } from "@/runtime";
import {
  computeF013AmountSubmission,
  computeF013CompletionBlocked,
} from "./F013RevenusAssistantPanel";

const ctx = { dossierId: "n1-fix", fiscalYear: 2025, route: "/assistants/revenus" };

function resultWith(anomalies: F013Result["anomalies"]): F013Result {
  return {
    recettes: {
      exerciceFiscal: 2025,
      totalRecettes: 1000,
      loyersEncaisses: 1000,
      indemnitesAssurance: 0,
      recettesPlateforme: 0,
      ajustementsJanDec: 0,
      moisLocationEffectifs: 12,
      lignes: [],
      deltaExplique: 0,
    },
    explanation: "",
    anomalies,
  };
}

describe("N1-A — computeF013AmountSubmission (parsing réel du AmountForm)", () => {
  it('"" → BLOCK (null)', () => {
    assert.equal(computeF013AmountSubmission(""), null);
  });
  it('" " → BLOCK (null)', () => {
    assert.equal(computeF013AmountSubmission(" "), null);
  });
  it('"   " → BLOCK (null)', () => {
    assert.equal(computeF013AmountSubmission("   "), null);
  });
  it('"0" → 0 (zéro explicite accepté, comportement métier inchangé)', () => {
    assert.equal(computeF013AmountSubmission("0"), 0);
  });
  it('"0,00" → 0 (format français déjà supporté)', () => {
    assert.equal(computeF013AmountSubmission("0,00"), 0);
  });
  it('"1000" → 1000', () => {
    assert.equal(computeF013AmountSubmission("1000"), 1000);
  });
  it('"1000,50" → 1000.5', () => {
    assert.equal(computeF013AmountSubmission("1000,50"), 1000.5);
  });
  it('"-1" → BLOCK (null)', () => {
    assert.equal(computeF013AmountSubmission("-1"), null);
  });
  it('"abc" → BLOCK (null)', () => {
    assert.equal(computeF013AmountSubmission("abc"), null);
  });
});

describe("N1-A — parcours GLI réel : champ vide ne persiste jamais 0 implicite", () => {
  async function toGliMontantStep() {
    const a = new F013RevenusAssistant(ctx, { dateMiseEnService: "2025-01-01" });
    let t = a.start();
    t = await a.handle(t.state, {
      type: "submit_diagnostic",
      typeLocation: "longue_duree",
      continuiteBail: "un_locataire",
      modeCharges: "charges_comprises",
    });
    t = await a.handle(t.state, { type: "submit_loyer", loyerMensuel: 1000 });
    t = await a.handle(t.state, { type: "submit_declaration", montant: 3000 });
    t = await a.handle(t.state, { type: "submit_ecart_raison", raison: "impaye" });
    t = await a.handle(t.state, { type: "submit_impaye", gli: true });
    return { a, state: t.state };
  }

  it("champ vide → aucune action dispatchée (computeF013AmountSubmission bloque en amont), état inchangé", async () => {
    const { state } = await toGliMontantStep();
    assert.equal(state.step, "ecart_impaye_montant");
    // Le formulaire réel n'appelle onSubmit que si computeF013AmountSubmission
    // ne renvoie pas null — pour "" il ne le fait jamais, donc aucune action
    // F013Action n'est produite : le state F013 reste strictement identique.
    const submission = computeF013AmountSubmission("");
    assert.equal(submission, null, "le formulaire ne doit dispatcher aucune action pour un champ vide");
  });

  it("montant valide (1500) après un champ vide raté → exactement 1500, jamais 0 ni cumulé", async () => {
    const { a, state } = await toGliMontantStep();
    // Simule : l'utilisateur a d'abord tenté de valider un champ vide
    // (aucune action produite, cf. test ci-dessus), puis saisit réellement 1500.
    const montant = computeF013AmountSubmission("1500");
    assert.equal(montant, 1500);
    const t = await a.handle(state, { type: "submit_impaye", gli: true, indemnite: montant! });
    assert.equal(t.state.result?.recettes.totalRecettes, 4500, "3000 loyers + 1500 indemnité, jamais 3000 seul ni 3000+0");
    assert.equal(t.state.result?.recettes.indemnitesAssurance, 1500);
  });
});

describe("N1-B — computeF013CompletionBlocked (même définition que le gate de génération)", () => {
  it("result undefined (jamais atteint en pratique) → non bloqué", () => {
    assert.equal(computeF013CompletionBlocked(undefined), false);
  });
  it("anomalies vides → non bloqué", () => {
    assert.equal(computeF013CompletionBlocked(resultWith([])), false);
  });
  it("warning seul → non bloqué (ne doit jamais être promu en blocker)", () => {
    assert.equal(computeF013CompletionBlocked(resultWith([{ severity: "warning", message: "x" }])), false);
  });
  it("error → bloqué", () => {
    assert.equal(computeF013CompletionBlocked(resultWith([{ severity: "error", message: "x" }])), true);
  });
  it("fatal → bloqué", () => {
    assert.equal(computeF013CompletionBlocked(resultWith([{ severity: "fatal", message: "x" }])), true);
  });
  it("warning + error ensemble → bloqué (l'error domine)", () => {
    assert.equal(
      computeF013CompletionBlocked(
        resultWith([
          { severity: "warning", message: "w" },
          { severity: "error", message: "e" },
        ]),
      ),
      true,
    );
  });
});
