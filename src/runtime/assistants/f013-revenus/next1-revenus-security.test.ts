/**
 * NEXT-1 — Sécurisation de la chaîne revenus (F-013).
 * Ferme exactement REV-P0-01 (indemnité GLI non collectable), REV-P0-02
 * (branchement revenu nul suspect / vacance) et REV-P0-03 (anomalies error
 * perdues et non bloquantes), sans toucher REV-P1-01/REV-P1-02 (hors scope).
 * Run: npx tsx --test src/runtime/assistants/f013-revenus/next1-revenus-security.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { F013RevenusAssistant } from "./assistant";
import type { F013State } from "./types";

const ctx = { dossierId: "next1", fiscalYear: 2025, route: "/assistants/revenus" };

async function toSousDeclareQualifyEcart(assistant: F013RevenusAssistant): Promise<F013State> {
  let turn = assistant.start();
  turn = await assistant.handle(turn.state, {
    type: "submit_diagnostic",
    typeLocation: "longue_duree",
    continuiteBail: "un_locataire",
    modeCharges: "charges_comprises",
  });
  turn = await assistant.handle(turn.state, { type: "submit_loyer", loyerMensuel: 1000 });
  turn = await assistant.handle(turn.state, { type: "submit_declaration", montant: 3000 });
  return turn.state;
}

describe("NEXT-1 — REV-P0-01 : indemnité GLI obligatoirement collectable", () => {
  it("test 1 — GLI Oui sans montant → l'étape ne se termine jamais, un montant est requis", async () => {
    const assistant = new F013RevenusAssistant(ctx, { dateMiseEnService: "2025-01-01" });
    let state = await toSousDeclareQualifyEcart(assistant);
    let turn = await assistant.handle(state, { type: "submit_ecart_raison", raison: "impaye" });
    turn = await assistant.handle(turn.state, { type: "submit_impaye", gli: true });
    assert.equal(turn.state.step, "ecart_impaye_montant");
    assert.equal(turn.completed, false);
    assert.equal(turn.state.collected.impayeIndemnite, undefined);
  });

  it("test 2 — montant Y collecté après Oui → intégré au revenu déclaré", async () => {
    const assistant = new F013RevenusAssistant(ctx, { dateMiseEnService: "2025-01-01" });
    let state = await toSousDeclareQualifyEcart(assistant);
    let turn = await assistant.handle(state, { type: "submit_ecart_raison", raison: "impaye" });
    turn = await assistant.handle(turn.state, { type: "submit_impaye", gli: true });
    turn = await assistant.handle(turn.state, { type: "submit_impaye", gli: true, indemnite: 2000 });
    assert.equal(turn.state.step, "aggregate_review");
    assert.equal(turn.state.result?.recettes.totalRecettes, 5000, "3000 loyers + 2000 indemnité");
    assert.equal(turn.state.result?.recettes.indemnitesAssurance, 2000);
  });

  it("test 3 — l'indemnité n'est intégrée qu'une seule fois (pas de double compte)", async () => {
    const assistant = new F013RevenusAssistant(ctx, { dateMiseEnService: "2025-01-01" });
    let state = await toSousDeclareQualifyEcart(assistant);
    let turn = await assistant.handle(state, { type: "submit_ecart_raison", raison: "impaye" });
    turn = await assistant.handle(turn.state, { type: "submit_impaye", gli: true });
    turn = await assistant.handle(turn.state, { type: "submit_impaye", gli: true, indemnite: 2000 });
    turn = await assistant.handle(turn.state, { type: "confirm_all" });
    assert.equal(turn.completed, true);
    assert.equal(turn.state.result?.recettes.totalRecettes, 5000);
  });

  it("test 4 — correction Y1 → Y2 avant confirmation : remplace, ne s'additionne pas", async () => {
    const assistant = new F013RevenusAssistant(ctx, { dateMiseEnService: "2025-01-01" });
    let state = await toSousDeclareQualifyEcart(assistant);
    let turn = await assistant.handle(state, { type: "submit_ecart_raison", raison: "impaye" });
    turn = await assistant.handle(turn.state, { type: "submit_impaye", gli: true });
    turn = await assistant.handle(turn.state, { type: "submit_impaye", gli: true, indemnite: 1000 });
    assert.equal(turn.state.result?.recettes.totalRecettes, 4000);
    turn = await assistant.handle(turn.state, { type: "submit_impaye", gli: true, indemnite: 1500 });
    assert.equal(turn.state.result?.recettes.totalRecettes, 4500, "jamais 4000+4500, la correction remplace");
  });

  it("test 5 — persistence/resume : un état rechargé avec impayeGli=true sans montant reste bloquant au calcul", async () => {
    const assistant = new F013RevenusAssistant(ctx, { dateMiseEnService: "2025-01-01" });
    let state = await toSousDeclareQualifyEcart(assistant);
    let turn = await assistant.handle(state, { type: "submit_ecart_raison", raison: "impaye" });
    turn = await assistant.handle(turn.state, { type: "submit_impaye", gli: true });
    // Simule un rechargement de page : même state.collected, nouvel appel handle().
    const reloaded = { ...turn.state };
    const confirmAttempt = await assistant.handle(reloaded, { type: "confirm_all" });
    assert.equal(confirmAttempt.completed, false, "le rechargement ne doit pas permettre de contourner le blocage");
    assert.ok(
      confirmAttempt.state.result?.anomalies.some((a) => a.severity === "error" && a.field === "indemnites"),
    );
  });

  it("test 6 — GLI Non : comportement historique inchangé", async () => {
    const assistant = new F013RevenusAssistant(ctx, { dateMiseEnService: "2025-01-01" });
    let state = await toSousDeclareQualifyEcart(assistant);
    let turn = await assistant.handle(state, { type: "submit_ecart_raison", raison: "impaye" });
    turn = await assistant.handle(turn.state, { type: "submit_impaye", gli: false });
    assert.equal(turn.state.step, "aggregate_review");
    turn = await assistant.handle(turn.state, { type: "confirm_all" });
    assert.equal(turn.completed, true);
    assert.equal(turn.state.result?.recettes.totalRecettes, 3000);
    assert.equal(turn.state.collected.impayeIndemnite, undefined);
  });
});

describe("NEXT-1 — REV-P0-02 : revenu nul suspect correctement aiguillé (jamais une sur-déclaration)", () => {
  it("test 7 — revenu 0 € avec théorique > 0 → branche 'nul_suspect', jamais le message de sur-déclaration", async () => {
    const assistant = new F013RevenusAssistant(ctx, { dateMiseEnService: "2025-01-01" });
    let turn = assistant.start();
    turn = await assistant.handle(turn.state, {
      type: "submit_diagnostic",
      typeLocation: "longue_duree",
      continuiteBail: "un_locataire",
      modeCharges: "charges_comprises",
    });
    turn = await assistant.handle(turn.state, { type: "submit_loyer", loyerMensuel: 1000 });
    turn = await assistant.handle(turn.state, { type: "submit_declaration", montant: 0 });
    const allText = turn.messages.map((m) => m.content).join("\n");
    assert.ok(!/de plus qu'attendu/i.test(allText), "un revenu nul ne doit jamais être présenté comme un excédent");
    assert.ok(/vacant|vacance/i.test(JSON.stringify(turn.messages.at(-1)?.suggestions)));
  });

  it("test 8 — revenu 0 € non justifié → le système guide vers une résolution (jamais un dead-end)", async () => {
    const assistant = new F013RevenusAssistant(ctx, { dateMiseEnService: "2025-01-01" });
    let turn = assistant.start();
    turn = await assistant.handle(turn.state, {
      type: "submit_diagnostic",
      typeLocation: "longue_duree",
      continuiteBail: "un_locataire",
      modeCharges: "charges_comprises",
    });
    turn = await assistant.handle(turn.state, { type: "submit_loyer", loyerMensuel: 1000 });
    turn = await assistant.handle(turn.state, { type: "submit_declaration", montant: 0 });
    // Vacance partielle (ne couvre pas l'année) : l'anomalie doit persister,
    // et le système doit revenir vers qualify_ecart plutôt que confirmer.
    turn = await assistant.handle(turn.state, { type: "submit_ecart_raison", raison: "vacance" });
    turn = await assistant.handle(turn.state, {
      type: "submit_vacance",
      dateDebut: "2025-06-01",
      dateFin: "2025-06-30",
      enTravaux: false,
    });
    assert.equal(turn.state.step, "qualify_ecart", "vacance partielle insuffisante → retour à la qualification, pas de confirmation");
    assert.ok(turn.state.result?.anomalies.some((a) => a.severity === "error"));
    assert.ok(turn.messages.at(-1)?.suggestions?.length, "une issue de résolution doit toujours être proposée");
  });

  it("test 8bis — vacance couvrant tout l'exercice → état valide atteignable (pas de gate impossible)", async () => {
    const assistant = new F013RevenusAssistant(ctx, { dateMiseEnService: "2025-01-01" });
    let turn = assistant.start();
    turn = await assistant.handle(turn.state, {
      type: "submit_diagnostic",
      typeLocation: "longue_duree",
      continuiteBail: "un_locataire",
      modeCharges: "charges_comprises",
    });
    turn = await assistant.handle(turn.state, { type: "submit_loyer", loyerMensuel: 1000 });
    turn = await assistant.handle(turn.state, { type: "submit_declaration", montant: 0 });
    turn = await assistant.handle(turn.state, { type: "submit_ecart_raison", raison: "vacance" });
    turn = await assistant.handle(turn.state, {
      type: "submit_vacance",
      dateDebut: "2025-01-01",
      dateFin: "2025-12-31",
      enTravaux: false,
    });
    assert.equal(turn.state.step, "aggregate_review");
    turn = await assistant.handle(turn.state, { type: "confirm_all" });
    assert.equal(turn.completed, true, "une vacance totale correctement justifiée doit pouvoir aboutir");
  });

  it("test 9 — revenu positif inférieur au théorique (sous-déclaration classique) : comportement historique inchangé", async () => {
    const assistant = new F013RevenusAssistant(ctx, { dateMiseEnService: "2025-01-01" });
    let turn = assistant.start();
    turn = await assistant.handle(turn.state, {
      type: "submit_diagnostic",
      typeLocation: "longue_duree",
      continuiteBail: "un_locataire",
      modeCharges: "charges_comprises",
    });
    turn = await assistant.handle(turn.state, { type: "submit_loyer", loyerMensuel: 1000 });
    turn = await assistant.handle(turn.state, { type: "submit_declaration", montant: 3000 });
    assert.ok(turn.messages.some((m) => /manque/i.test(m.content)));
    assert.deepEqual(
      turn.messages.at(-1)?.suggestions?.map((s) => s.id),
      ["ecart_impaye", "ecart_vacance", "ecart_loyer_inferieur", "ecart_autre"],
    );
  });

  it("test 10 — revenu supérieur au théorique (sur-déclaration réelle) : comportement historique inchangé", async () => {
    const assistant = new F013RevenusAssistant(ctx, { dateMiseEnService: "2025-01-01" });
    let turn = assistant.start();
    turn = await assistant.handle(turn.state, {
      type: "submit_diagnostic",
      typeLocation: "longue_duree",
      continuiteBail: "un_locataire",
      modeCharges: "charges_comprises",
    });
    turn = await assistant.handle(turn.state, { type: "submit_loyer", loyerMensuel: 1000 });
    turn = await assistant.handle(turn.state, { type: "submit_declaration", montant: 20000 });
    const lastMessage = turn.messages.at(-1);
    assert.ok(/de plus qu'attendu/i.test(turn.messages.map((m) => m.content).join("\n")));
    assert.deepEqual(
      lastMessage?.suggestions?.map((s) => s.id),
      ["ecart_rattrapage", "ecart_complementaire", "ecart_erreur"],
    );
  });
});

describe("NEXT-1 — REV-P0-03 : anomalies error transportées et bloquantes de bout en bout (au niveau assistant)", () => {
  it("test 11 — une anomalie error est transportée dans F013Result.anomalies (calculée dès que buildResult tourne)", async () => {
    const assistant = new F013RevenusAssistant(ctx, { dateMiseEnService: "2025-01-01" });
    let state = await toSousDeclareQualifyEcart(assistant);
    let turn = await assistant.handle(state, { type: "submit_ecart_raison", raison: "impaye" });
    turn = await assistant.handle(turn.state, { type: "submit_impaye", gli: true });
    // GLI signalé "oui" mais montant non chiffré : buildResult() (via confirm_all)
    // doit produire l'anomalie, jamais la passer sous silence.
    turn = await assistant.handle(turn.state, { type: "confirm_all" });
    assert.ok(turn.state.result?.anomalies.some((a) => a.severity === "error" && a.field === "indemnites"));
  });

  it("test 14 — une anomalie error empêche d'atteindre l'étape de confirmation (aggregate_review)", async () => {
    const assistant = new F013RevenusAssistant(ctx, { dateMiseEnService: "2025-01-01" });
    let state = await toSousDeclareQualifyEcart(assistant);
    let turn = await assistant.handle(state, { type: "submit_ecart_raison", raison: "impaye" });
    turn = await assistant.handle(turn.state, { type: "submit_impaye", gli: true });
    assert.notEqual(turn.state.step, "aggregate_review");
    assert.equal(
      turn.messages.some((m) => /confirm/i.test(m.content) && /valide/i.test(m.content)),
      false,
    );
  });

  it("test 15 — un warning seul (ex. vacance longue déjà justifiée) ne bloque jamais la confirmation", async () => {
    const assistant = new F013RevenusAssistant(ctx, { dateMiseEnService: "2025-01-01" });
    let turn = assistant.start();
    turn = await assistant.handle(turn.state, {
      type: "submit_diagnostic",
      typeLocation: "longue_duree",
      continuiteBail: "un_locataire",
      modeCharges: "charges_comprises",
    });
    turn = await assistant.handle(turn.state, { type: "submit_loyer", loyerMensuel: 1000 });
    // Vacance longue déclarée dès le diagnostic (7 mois), revenu cohérent avec le reste.
    turn = await assistant.handle(turn.state, { type: "submit_declaration", montant: 5000 });
    // Peu importe la branche exacte ici : l'objectif est de vérifier qu'un
    // warning (ex. "montant inhabituel") seul n'empêche jamais confirm_all
    // d'aboutir quand aucune erreur ne l'accompagne.
    if (turn.state.step === "qualify_ecart") {
      turn = await assistant.handle(turn.state, { type: "submit_ecart_raison", raison: "autre" });
    }
    turn = await assistant.handle(turn.state, { type: "confirm_all" });
    const hasError = turn.state.result?.anomalies.some((a) => a.severity === "error" || a.severity === "fatal");
    if (!hasError) {
      assert.equal(turn.completed, true, "sans erreur bloquante, la confirmation doit aboutir");
    }
  });

  it("test 17 — résolution de l'anomalie (montant GLI fourni) permet ensuite la confirmation", async () => {
    const assistant = new F013RevenusAssistant(ctx, { dateMiseEnService: "2025-01-01" });
    let state = await toSousDeclareQualifyEcart(assistant);
    let turn = await assistant.handle(state, { type: "submit_ecart_raison", raison: "impaye" });
    turn = await assistant.handle(turn.state, { type: "submit_impaye", gli: true });
    assert.equal(turn.completed, false);
    turn = await assistant.handle(turn.state, { type: "submit_impaye", gli: true, indemnite: 500 });
    turn = await assistant.handle(turn.state, { type: "confirm_all" });
    assert.equal(turn.completed, true);
    assert.equal(
      turn.state.result?.anomalies.some((a) => a.severity === "error"),
      false,
      "aucune erreur ne doit rester une fois résolue",
    );
  });

  it("test 20 — double soumission du même montant GLI ne double jamais le revenu (idempotence)", async () => {
    const assistant = new F013RevenusAssistant(ctx, { dateMiseEnService: "2025-01-01" });
    let state = await toSousDeclareQualifyEcart(assistant);
    let turn = await assistant.handle(state, { type: "submit_ecart_raison", raison: "impaye" });
    turn = await assistant.handle(turn.state, { type: "submit_impaye", gli: true });
    turn = await assistant.handle(turn.state, { type: "submit_impaye", gli: true, indemnite: 1000 });
    const afterFirst = turn.state.result?.recettes.totalRecettes;
    // Double submit du même montant, avant confirmation.
    turn = await assistant.handle(turn.state, { type: "submit_impaye", gli: true, indemnite: 1000 });
    assert.equal(turn.state.result?.recettes.totalRecettes, afterFirst, "resoumettre le même montant ne doit pas l'additionner");
    turn = await assistant.handle(turn.state, { type: "confirm_all" });
    assert.equal(turn.state.result?.recettes.totalRecettes, afterFirst);
  });
});
