import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { F012ChargesAssistant } from "./assistant";
import { hasBlockingAnomaly, toF012PersistedState } from "./types";
import type { F012Deps } from "./types";
import type { Anomaly } from "../../contracts/Anomaly";
import { aggregateFiscalInputs } from "../../capabilities/f006/aggregate-inputs";

const ctx = { dossierId: "test", fiscalYear: 2024, route: "/assistants/charges" };
const DEPS: F012Deps = { dateMiseEnService: "2023-01-01" };

const PROFIL_COMPLET = { copropriete: false, agence: false, travaux: false, vacance: false, comptable: false };

/** Parcours "propre" : toutes les catégories attendues renseignées, aucune anomalie de complétude. */
async function buildCleanResult(assistant: F012ChargesAssistant) {
  let turn = await assistant.handle(assistant.start().state, { type: "submit_profilage", ...PROFIL_COMPLET });
  turn = await assistant.handle(turn.state, { type: "submit_taxe_fonciere", montant: 1200 });
  turn = await assistant.handle(turn.state, { type: "submit_assurance_pno", montant: 300 });
  turn = await assistant.handle(turn.state, { type: "skip_category" }); // frais_bancaires
  turn = await assistant.handle(turn.state, { type: "skip_category" }); // divers
  turn = await assistant.handle(turn.state, { type: "confirm_completeness", hasOther: false });
  return turn;
}

describe("F-012 — Cycle 4D : anomalies et validation finale", () => {
  it("A — validation normale : chargesCoherentes vrai, warnings de couverture non bloquants", async () => {
    const assistant = new F012ChargesAssistant(ctx, DEPS);
    const reviewed = await buildCleanResult(assistant);
    assert.equal(reviewed.state.result?.chargesCoherentes, true);
    assert.equal(
      hasBlockingAnomaly(reviewed.state.result?.anomalies ?? []),
      false,
      "aucun warning de couverture n'est bloquant",
    );

    const turn = await assistant.handle(reviewed.state, { type: "confirm_all" });
    assert.equal(turn.completed, true);
    assert.equal(turn.event, "CHARGES_TERMINE");
  });

  it("B — warning (catégorie attendue manquante) : présent dans les anomalies, jamais bloquant", async () => {
    const assistant = new F012ChargesAssistant(ctx, DEPS);
    let turn = await assistant.handle(assistant.start().state, { type: "submit_profilage", ...PROFIL_COMPLET });
    turn = await assistant.handle(turn.state, { type: "skip_category" }); // taxe_fonciere jamais renseignée
    turn = await assistant.handle(turn.state, { type: "submit_assurance_pno", montant: 300 });
    turn = await assistant.handle(turn.state, { type: "skip_category" }); // frais_bancaires
    turn = await assistant.handle(turn.state, { type: "skip_category" }); // divers
    turn = await assistant.handle(turn.state, { type: "confirm_completeness", hasOther: false });

    const anomaly = turn.state.result?.anomalies.find((a) => a.field === "taxe_fonciere");
    assert.ok(anomaly, "l'anomalie de complétude est bien présente dans le résultat");
    assert.equal(anomaly?.severity, "warning");
    assert.equal(turn.state.result?.chargesCoherentes, true, "un warning ne rend jamais l'état incohérent");

    const confirmed = await assistant.handle(turn.state, { type: "confirm_all" });
    assert.equal(confirmed.completed, true, "un warning ne bloque jamais la validation (KS : informé, pas bloqué)");
  });

  it("C — anomalie bloquante (fatal/error) : le mécanisme de refus fonctionne (prouvé en pur — aucune règle KS actuelle n'en produit)", () => {
    // Aucune règle métier actuelle ne produit encore fatal/error
    // (validateCharges/computeChargesExercice ne produisent que des
    // warning) — tester ce mécanisme de bout en bout via le state machine
    // inventerait une règle fiscale, ce que ce cycle interdit. Le
    // mécanisme partagé par `buildResult`/`confirm_all` est donc prouvé ici,
    // en pur, avec des anomalies construites à la main.
    const onlyWarnings: Anomaly[] = [{ severity: "warning", message: "À vérifier" }];
    assert.equal(hasBlockingAnomaly(onlyWarnings), false);

    const withFatal: Anomaly[] = [
      { severity: "warning", message: "À vérifier" },
      { severity: "fatal", message: "Erreur bloquante" },
    ];
    assert.equal(hasBlockingAnomaly(withFatal), true);

    const withError: Anomaly[] = [{ severity: "error", message: "Erreur" }];
    assert.equal(hasBlockingAnomaly(withError), true);
  });

  it("D — le message est bien présent dans les données que le panel affiche (rendu React non testable ici — cf. Cycle 4A/4B)", async () => {
    const assistant = new F012ChargesAssistant(ctx, DEPS);
    let turn = await assistant.handle(assistant.start().state, { type: "submit_profilage", ...PROFIL_COMPLET });
    turn = await assistant.handle(turn.state, { type: "skip_category" }); // taxe_fonciere
    turn = await assistant.handle(turn.state, { type: "skip_category" }); // assurance_pno
    turn = await assistant.handle(turn.state, { type: "skip_category" }); // frais_bancaires
    turn = await assistant.handle(turn.state, { type: "skip_category" }); // divers
    turn = await assistant.handle(turn.state, { type: "confirm_completeness", hasOther: false });

    // C'est exactement `result.anomalies` que `<AnomalyList>` (panel) parcourt pour l'affichage.
    const messages = turn.state.result?.anomalies.map((a) => a.message) ?? [];
    assert.ok(messages.some((m) => m.includes("taxe foncière")));
    assert.ok(messages.some((m) => m.includes("assurance PNO")));
  });

  it("E — travaux >5000€ sans facture : anomalie warning conforme au KS, jamais bloquante", async () => {
    const profilTravaux = { ...PROFIL_COMPLET, travaux: true };
    const assistant = new F012ChargesAssistant(ctx, DEPS);
    let turn = await assistant.handle(assistant.start().state, { type: "submit_profilage", ...profilTravaux });
    turn = await assistant.handle(turn.state, { type: "submit_taxe_fonciere", montant: 1200 });
    turn = await assistant.handle(turn.state, { type: "submit_assurance_pno", montant: 300 });
    turn = await assistant.handle(turn.state, {
      type: "submit_travaux_description",
      description: "Ravalement complet",
      montant: 8000,
    });
    turn = await assistant.handle(turn.state, { type: "submit_travaux_qualification", choix: "reparation_identique" });
    turn = await assistant.handle(turn.state, { type: "skip_category" }); // frais_bancaires
    turn = await assistant.handle(turn.state, { type: "skip_category" }); // divers
    turn = await assistant.handle(turn.state, { type: "confirm_completeness", hasOther: false });

    const anomaly = turn.state.result?.anomalies.find((a) => a.message.includes("mérite confirmation"));
    assert.ok(anomaly, "l'alerte >5000€ calculée par computeChargesExercice est désormais visible dans le résultat");
    assert.equal(anomaly?.severity, "warning");

    const confirmed = await assistant.handle(turn.state, { type: "confirm_all" });
    assert.equal(confirmed.completed, true, "un warning travaux >5000€ n'empêche jamais de valider (KS : alerte douce)");
  });

  it("F — plusieurs anomalies simultanées : toutes présentes, aucune écrasée", async () => {
    const assistant = new F012ChargesAssistant(ctx, DEPS);
    let turn = await assistant.handle(assistant.start().state, { type: "submit_profilage", ...PROFIL_COMPLET });
    turn = await assistant.handle(turn.state, { type: "skip_category" }); // taxe_fonciere manquante
    turn = await assistant.handle(turn.state, { type: "skip_category" }); // assurance_pno manquante
    turn = await assistant.handle(turn.state, { type: "skip_category" }); // frais_bancaires
    turn = await assistant.handle(turn.state, { type: "skip_category" }); // divers
    turn = await assistant.handle(turn.state, { type: "confirm_completeness", hasOther: false });

    const fields = turn.state.result?.anomalies.map((a) => a.field);
    assert.ok(fields?.includes("taxe_fonciere"));
    assert.ok(fields?.includes("assurance_pno"));
    assert.ok(
      (turn.state.result?.anomalies.length ?? 0) >= 2,
      "les warnings validateCharges restent présents, sans écraser les autres",
    );
  });

  it("G — refresh à aggregate_review : les anomalies sont recalculées, pas rejouées depuis un blob figé", async () => {
    const before = new F012ChargesAssistant(ctx, DEPS);
    let turn = await before.handle(before.start().state, { type: "submit_profilage", ...PROFIL_COMPLET });
    turn = await before.handle(turn.state, { type: "skip_category" }); // taxe_fonciere manquante
    turn = await before.handle(turn.state, { type: "submit_assurance_pno", montant: 300 });
    turn = await before.handle(turn.state, { type: "skip_category" }); // frais_bancaires
    turn = await before.handle(turn.state, { type: "skip_category" }); // divers
    turn = await before.handle(turn.state, { type: "confirm_completeness", hasOther: false });
    const liveAnomalies = turn.state.result?.anomalies;
    assert.ok((liveAnomalies?.length ?? 0) >= 1);
    assert.ok(liveAnomalies?.some((anomaly) => anomaly.field === "taxe_fonciere"));

    const persisted = toF012PersistedState(turn.state, "2024-03-01T10:00:00.000Z");
    assert.equal("result" in persisted, false, "aucune anomalie n'est jamais persistée telle quelle (Cycle 2)");

    const after = new F012ChargesAssistant(ctx, DEPS);
    const resumed = after.resume(persisted);
    assert.deepEqual(resumed.state.result?.anomalies, liveAnomalies, "recalcul identique au tour vivant");
  });

  it("H — aucune anomalie fictive après refresh d'un dossier complet", async () => {
    const before = new F012ChargesAssistant(ctx, DEPS);
    const turn = await buildCleanResult(before);
    const persisted = toF012PersistedState(turn.state, "2024-03-01T10:00:00.000Z");

    const after = new F012ChargesAssistant(ctx, DEPS);
    const resumed = after.resume(persisted);
    assert.deepEqual(
      resumed.state.result?.anomalies,
      turn.state.result?.anomalies,
      "reprise : mêmes anomalies recalculées, rien d'inventé",
    );
  });

  it("J — F-006 ne reçoit que le total d'un état validé, les anomalies n'atteignent jamais son contrat d'entrée", async () => {
    const assistant = new F012ChargesAssistant(ctx, DEPS);
    let turn = await assistant.handle(assistant.start().state, { type: "submit_profilage", ...PROFIL_COMPLET });
    turn = await assistant.handle(turn.state, { type: "skip_category" }); // taxe_fonciere manquante → warning
    turn = await assistant.handle(turn.state, { type: "submit_assurance_pno", montant: 300 });
    turn = await assistant.handle(turn.state, { type: "skip_category" });
    turn = await assistant.handle(turn.state, { type: "skip_category" });
    turn = await assistant.handle(turn.state, { type: "confirm_completeness", hasOther: false });
    turn = await assistant.handle(turn.state, { type: "confirm_all" });
    assert.equal(turn.completed, true, "un warning n'empêche pas d'atteindre CHARGES_TERMINE");

    const charges = turn.state.result!.charges;
    const aggregated = aggregateFiscalInputs({
      exerciceFiscal: 2024,
      activite: { dateMiseEnService: "2023-01-01" },
      revenusAssistant: { exerciceFiscal: 2024, totalRecettes: 9000 },
      chargesAssistant: {
        exerciceFiscal: 2024,
        totalDeductible: charges.totalDeductible,
        totalPreExploitation: charges.totalPreExploitation,
        parCategorie: charges.parCategorie,
      },
      amortissementAssistant: { exerciceFiscal: 2024, totalDotations: 0, status: "validated" },
    });
    assert.equal(aggregated.data?.totalChargesDeductibles, 300, "F-006 reçoit exactement le total, rien de plus");
  });

  it("K — montant 0 (Cycle 4B1) inchangé", async () => {
    const profilTravaux = { ...PROFIL_COMPLET, travaux: true };
    const assistant = new F012ChargesAssistant(ctx, DEPS);
    let turn = await assistant.handle(assistant.start().state, { type: "submit_profilage", ...profilTravaux });
    turn = await assistant.handle(turn.state, { type: "skip_category" });
    turn = await assistant.handle(turn.state, { type: "skip_category" });
    turn = await assistant.handle(turn.state, {
      type: "submit_travaux_description",
      description: "Réparation gratuite",
      montant: 0,
    });
    turn = await assistant.handle(turn.state, { type: "submit_travaux_qualification", choix: "reparation_identique" });
    assert.equal(turn.state.collected.travaux.length, 1, "toujours qualifiable, comme depuis le Cycle 4B1");
  });

  it("L — anti-doublon F-011 (Cycle 3) inchangé", async () => {
    const depsWithF011: F012Deps = { ...DEPS, financementCharges: { totalAssurance: 300, totalCapitalRembourse: 0 } };
    const assistant = new F012ChargesAssistant(ctx, depsWithF011);
    let turn = await assistant.handle(assistant.start().state, { type: "submit_profilage", ...PROFIL_COMPLET });
    turn = await assistant.handle(turn.state, { type: "skip_category" });
    turn = await assistant.handle(turn.state, { type: "skip_category" });
    turn = await assistant.handle(turn.state, { type: "skip_category" });
    turn = await assistant.handle(turn.state, {
      type: "submit_divers",
      description: "Assurance emprunteur",
      montant: 300,
    });
    const item = turn.state.collected.divers.find((d) => d.description === "Assurance emprunteur");
    assert.equal(item?.financementOverlap, "assurance_emprunteur", "toujours protégée, comme depuis le Cycle 3");
  });

  it("M — charges diverses (Cycle 4A/4C) inchangées", async () => {
    const assistant = new F012ChargesAssistant(ctx, DEPS);
    let turn = await assistant.handle(assistant.start().state, { type: "submit_profilage", ...PROFIL_COMPLET });
    turn = await assistant.handle(turn.state, { type: "skip_category" });
    turn = await assistant.handle(turn.state, { type: "skip_category" });
    turn = await assistant.handle(turn.state, {
      type: "submit_divers",
      description: "Frais de déplacement",
      montant: 80,
    });
    assert.deepEqual(
      turn.state.collected.divers.map((d) => ({ description: d.description, montant: d.montant })),
      [{ description: "Frais de déplacement", montant: 80 }],
    );
  });
});
