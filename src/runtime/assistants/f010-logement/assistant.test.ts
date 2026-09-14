import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { F010LogementAssistant } from "./assistant";
import { toF010PersistedState } from "./types";
import type { F010PersistedState, F010State } from "./types";
import { computeAmortizationPlan } from "../../capabilities/f010/compute-amortization-plan";

const ctx = { dossierId: "test-dossier", fiscalYear: 2024 };

describe("F-010 — Assistant Logement (Chemin A)", () => {
  it("parcourt le flux achat standard et produit un plan valide", async () => {
    const assistant = new F010LogementAssistant(ctx, { dateMiseEnService: "2024-04-15" });

    const startTurn = assistant.start();
    assert.equal(startTurn.state.step, "orientation");

    // V2-2 (document-first) : select_nature("achat") mène directement à
    // collect_bien — plus de question préalable "avez-vous l'acte ?".
    let turn = await assistant.handle(startTurn.state, { type: "select_nature", nature: "achat" });
    assert.equal(turn.state.step, "collect_bien");

    turn = await assistant.handle(turn.state, {
      type: "submit_bien",
      prixAcquisition: 280000,
      typeBien: "appartement",
      natureBien: "ancien",
      dateAcquisition: "2024-03-01",
      fieldSources: { prixAcquisition: "manual", typeBien: "manual", dateAcquisition: "manual" },
    });
    assert.equal(turn.state.step, "collect_frais");

    turn = await assistant.handle(turn.state, {
      type: "submit_frais",
      fraisNotaire: 19500,
      choixTraitementFrais: "integration",
    });
    assert.equal(turn.state.step, "collect_mobilier");

    turn = await assistant.handle(turn.state, { type: "skip_mobilier" });
    assert.equal(turn.state.step, "ventilation");

    turn = await assistant.handle(turn.state, { type: "submit_ventilation", ratioTerrain: 0.15 });
    assert.equal(turn.state.step, "review_plan");
    assert.ok(turn.state.result);
    assert.equal(turn.state.result!.prixRevient, 299500);
    assert.equal(turn.state.result!.baseAmortissableBati, 254575);
    assert.equal(turn.state.result!.planValide, true);
    assert.ok(turn.state.result!.explanation.length > 0);
    assert.ok(!/composant|VNC/i.test(turn.state.result!.explanation));

    turn = await assistant.handle(turn.state, { type: "confirm" });
    assert.equal(turn.completed, true);
    assert.equal(turn.state.step, "complete");
  });

  it("n'expose jamais de jargon (composants / VNC) dans les messages", async () => {
    const assistant = new F010LogementAssistant(ctx, { dateMiseEnService: "2024-04-15" });
    const collected: string[] = [];
    const start = assistant.start();
    collected.push(...start.messages.map((m) => m.content));

    let turn = await assistant.handle(start.state, { type: "select_nature", nature: "achat" });
    collected.push(...turn.messages.map((m) => m.content));
    turn = await assistant.handle(turn.state, {
      type: "submit_bien",
      prixAcquisition: 280000,
      typeBien: "appartement",
      natureBien: "ancien",
      dateAcquisition: "2024-03-01",
    });
    collected.push(...turn.messages.map((m) => m.content));
    turn = await assistant.handle(turn.state, {
      type: "submit_frais",
      fraisNotaire: 19500,
      choixTraitementFrais: "integration",
    });
    collected.push(...turn.messages.map((m) => m.content));
    turn = await assistant.handle(turn.state, { type: "skip_mobilier" });
    collected.push(...turn.messages.map((m) => m.content));
    turn = await assistant.handle(turn.state, { type: "submit_ventilation", ratioTerrain: 0.15 });
    collected.push(...turn.messages.map((m) => m.content));

    for (const content of collected) {
      assert.ok(!/composant|VNC/i.test(content), `Jargon détecté : ${content}`);
    }
  });

  it("oriente les natures hors Chemin A vers 'bientôt disponible'", async () => {
    const assistant = new F010LogementAssistant(ctx);
    const start = assistant.start();
    const turn = await assistant.handle(start.state, { type: "select_nature", nature: "heritage_donation" });
    assert.equal(turn.state.step, "coming_soon");
    assert.equal(turn.completed, false);
  });

  it("trace la provenance des Fields", async () => {
    const assistant = new F010LogementAssistant(ctx, { dateMiseEnService: "2024-04-15" });
    const start = assistant.start();
    let turn = await assistant.handle(start.state, { type: "select_nature", nature: "achat" });
    turn = await assistant.handle(turn.state, {
      type: "submit_bien",
      prixAcquisition: 280000,
      typeBien: "appartement",
      natureBien: "ancien",
      dateAcquisition: "2024-03-01",
      fieldSources: { prixAcquisition: "extracted", typeBien: "extracted", dateAcquisition: "manual" },
    });
    const state: F010State = turn.state;
    assert.equal(state.fieldSources.prixAcquisition, "extracted");
    assert.equal(state.fieldSources.typeBien, "extracted");
  });

  it("provenance par champ (Cycle 3) : jamais un flag global — un champ peut être extrait pendant qu'un autre reste manuel", async () => {
    const assistant = new F010LogementAssistant(ctx, { dateMiseEnService: "2024-04-15" });
    const start = assistant.start();
    let turn = await assistant.handle(start.state, { type: "select_nature", nature: "achat" });
    turn = await assistant.handle(turn.state, {
      type: "submit_bien",
      prixAcquisition: 280000,
      typeBien: "appartement",
      natureBien: "ancien",
      dateAcquisition: "2024-03-01",
      fieldSources: { prixAcquisition: "extracted", dateAcquisition: "manual" },
    });
    assert.equal(turn.state.fieldSources.prixAcquisition, "extracted");
    assert.equal(turn.state.fieldSources.dateAcquisition, "manual");
    // typeBien omis du fieldSources fourni → retombe sur "manual", jamais sur la valeur d'un autre champ.
    assert.equal(turn.state.fieldSources.typeBien, "manual");
  });
});

describe("F-010 — P0-3 : la Capacité refuse de confirmer un plan invalide, quel que soit l'appelant", () => {
  async function reachVentilation(ratioTerrain: number) {
    const assistant = new F010LogementAssistant(ctx, { dateMiseEnService: "2024-04-15" });
    const start = assistant.start();
    let turn = await assistant.handle(start.state, { type: "select_nature", nature: "achat" });
    turn = await assistant.handle(turn.state, {
      type: "submit_bien",
      prixAcquisition: 280000,
      typeBien: "appartement",
      natureBien: "ancien",
      dateAcquisition: "2024-03-01",
    });
    turn = await assistant.handle(turn.state, {
      type: "submit_frais",
      fraisNotaire: 19500,
      choixTraitementFrais: "integration",
    });
    turn = await assistant.handle(turn.state, { type: "skip_mobilier" });
    turn = await assistant.handle(turn.state, { type: "submit_ventilation", ratioTerrain });
    return { assistant, turn };
  }

  it("ratio terrain = 0 : review_plan affiche planValide=false et confirm est refusé (pas de transition vers complete)", async () => {
    const { assistant, turn } = await reachVentilation(0);
    assert.equal(turn.state.step, "review_plan");
    assert.equal(turn.state.result!.planValide, false);

    const confirmTurn = await assistant.handle(turn.state, { type: "confirm" });
    assert.equal(confirmTurn.completed, false);
    assert.equal(confirmTurn.state.step, "review_plan");
    assert.ok(!confirmTurn.messages.some((m) => /enregistré/i.test(m.content)));
  });

  it("appel direct de confirm sur un state.result invalide construit à la main : refusé également (garde côté Capacité, pas seulement côté flux)", async () => {
    const { assistant, turn } = await reachVentilation(0.15);
    const tampered: F010State = {
      ...turn.state,
      result: { ...turn.state.result!, planValide: false },
    };
    const confirmTurn = await assistant.handle(tampered, { type: "confirm" });
    assert.equal(confirmTurn.completed, false);
    assert.equal(confirmTurn.state.step, "review_plan");
  });

  it("plan nominal valide : confirm complète normalement (non-régression)", async () => {
    const { assistant, turn } = await reachVentilation(0.15);
    assert.equal(turn.state.result!.planValide, true);
    const confirmTurn = await assistant.handle(turn.state, { type: "confirm" });
    assert.equal(confirmTurn.completed, true);
    assert.equal(confirmTurn.state.step, "complete");
  });
});

describe("F-010 — P2-1 : une adresse déjà connue n'est jamais effacée par un resubmit de submit_bien", () => {
  async function reachCollectBienWithConfirmedAdresse(assistant: F010LogementAssistant) {
    let turn = assistant.start();
    turn = await assistant.handle(turn.state, { type: "select_nature", nature: "achat" });
    turn = await assistant.handle(turn.state, {
      type: "analysis_success",
      documentId: "doc-1",
      proposal: {
        prixAcquisition: 280000,
        typeBien: "appartement",
        dateAcquisition: "2024-03-01",
        surface: 45,
        adresse: "12 rue des Lilas, 75011 Paris",
      },
    });
    for (const field of ["prixAcquisition", "typeBien", "dateAcquisition", "surface", "adresse"] as const) {
      turn = await assistant.handle(turn.state, { type: "confirm_extracted_field", field });
    }
    assert.equal(turn.state.adresse, "12 rue des Lilas, 75011 Paris");
    // Revenir jusqu'à collect_bien : review_extraction -> collect_bien (2 go_back
    // depuis collect_frais, où leaveReviewIfComplete a atterri une fois la review close).
    assert.equal(turn.state.step, "collect_frais");
    turn = await assistant.handle(turn.state, { type: "go_back" });
    turn = await assistant.handle(turn.state, { type: "go_back" });
    assert.equal(turn.state.step, "collect_bien");
    assert.equal(turn.state.adresse, "12 rue des Lilas, 75011 Paris");
    return turn;
  }

  it("adresse confirmée via document, puis resubmit de collect_bien sans adresse (formulaire manuel réel) : adresse conservée", async () => {
    const assistant = new F010LogementAssistant(ctx, { dateMiseEnService: "2024-04-15" });
    const atCollectBien = await reachCollectBienWithConfirmedAdresse(assistant);

    // Reproduit exactement le dispatch du formulaire manuel (panel.tsx) : jamais `adresse`.
    const resubmitted = await assistant.handle(atCollectBien.state, {
      type: "submit_bien",
      prixAcquisition: 285000,
      typeBien: "appartement",
      dateAcquisition: "2024-03-01",
      surface: 45,
      fieldSources: { prixAcquisition: "manual", typeBien: "manual", dateAcquisition: "manual", surface: "manual" },
    });

    assert.equal(resubmitted.state.adresse, "12 rue des Lilas, 75011 Paris");
    assert.equal(resubmitted.state.prixAcquisition, 285000, "le champ réellement resoumis change bien");
  });

  it("adresse corrigée (pas seulement confirmée) via document, puis même cycle : adresse corrigée conservée", async () => {
    const assistant = new F010LogementAssistant(ctx, { dateMiseEnService: "2024-04-15" });
    let turn = assistant.start();
    turn = await assistant.handle(turn.state, { type: "select_nature", nature: "achat" });
    turn = await assistant.handle(turn.state, {
      type: "analysis_success",
      documentId: "doc-1",
      proposal: {
        prixAcquisition: 280000,
        typeBien: "appartement",
        dateAcquisition: "2024-03-01",
        surface: 45,
        adresse: "12 rue des Lilas, 75011 Paris",
      },
    });
    for (const field of ["prixAcquisition", "typeBien", "dateAcquisition", "surface"] as const) {
      turn = await assistant.handle(turn.state, { type: "confirm_extracted_field", field });
    }
    turn = await assistant.handle(turn.state, {
      type: "correct_extracted_field",
      field: "adresse",
      value: "3 avenue de la République, 75011 Paris",
    });
    assert.equal(turn.state.adresse, "3 avenue de la République, 75011 Paris");

    turn = await assistant.handle(turn.state, { type: "go_back" });
    turn = await assistant.handle(turn.state, { type: "go_back" });
    assert.equal(turn.state.step, "collect_bien");

    const resubmitted = await assistant.handle(turn.state, {
      type: "submit_bien",
      prixAcquisition: 280000,
      typeBien: "appartement",
      dateAcquisition: "2024-03-01",
      surface: 45,
      fieldSources: { prixAcquisition: "manual", typeBien: "manual", dateAcquisition: "manual", surface: "manual" },
    });
    assert.equal(resubmitted.state.adresse, "3 avenue de la République, 75011 Paris");
  });

  it("survit à un cycle persistence/reload complet : adresse toujours présente après resume()", async () => {
    const assistant = new F010LogementAssistant(ctx, { dateMiseEnService: "2024-04-15" });
    const atCollectBien = await reachCollectBienWithConfirmedAdresse(assistant);
    const resubmitted = await assistant.handle(atCollectBien.state, {
      type: "submit_bien",
      prixAcquisition: 285000,
      typeBien: "appartement",
      dateAcquisition: "2024-03-01",
      surface: 45,
      fieldSources: { prixAcquisition: "manual", typeBien: "manual", dateAcquisition: "manual", surface: "manual" },
    });

    const persisted = toF010PersistedState(resubmitted.state, "2026-09-13T10:00:00.000Z");
    assert.equal(persisted.adresse, "12 rue des Lilas, 75011 Paris");

    const resumed = new F010LogementAssistant(ctx, { dateMiseEnService: "2024-04-15" }).resume(persisted);
    assert.equal(resumed.state.adresse, "12 rue des Lilas, 75011 Paris");
  });

  it("submit_bien avec une adresse explicite écrase bien l'ancienne (jamais un blocage permanent)", async () => {
    const assistant = new F010LogementAssistant(ctx, { dateMiseEnService: "2024-04-15" });
    const atCollectBien = await reachCollectBienWithConfirmedAdresse(assistant);
    const resubmitted = await assistant.handle(atCollectBien.state, {
      type: "submit_bien",
      prixAcquisition: 285000,
      typeBien: "appartement",
      dateAcquisition: "2024-03-01",
      surface: 45,
      adresse: "9 boulevard Voltaire, 75011 Paris",
      fieldSources: { prixAcquisition: "manual", typeBien: "manual", dateAcquisition: "manual", surface: "manual" },
    });
    assert.equal(resubmitted.state.adresse, "9 boulevard Voltaire, 75011 Paris");
  });
});

describe("F-010 — dateMiseEnService (Option B) : jamais de fallback fiscal, jamais de plan sans la vraie date", () => {
  async function reachVentilationManual(assistant: F010LogementAssistant, ratioTerrain = 0.15) {
    let turn = assistant.start();
    turn = await assistant.handle(turn.state, { type: "select_nature", nature: "achat" });
    turn = await assistant.handle(turn.state, {
      type: "submit_bien",
      prixAcquisition: 200_000,
      typeBien: "appartement",
      dateAcquisition: "2024-03-01",
    });
    turn = await assistant.handle(turn.state, {
      type: "submit_frais",
      fraisNotaire: 15_000,
      choixTraitementFrais: "integration",
    });
    turn = await assistant.handle(turn.state, { type: "skip_mobilier" });
    turn = await assistant.handle(turn.state, { type: "submit_ventilation", ratioTerrain });
    return turn;
  }

  it("CAS 1 — date présente : comportement nominal inchangé, le plan est calculé avec cette date exacte", async () => {
    const assistant = new F010LogementAssistant(ctx, { dateMiseEnService: "2024-07-01" });
    const turn = await reachVentilationManual(assistant);
    assert.equal(turn.state.step, "review_plan");
    assert.ok(turn.state.result);
    assert.equal(turn.state.result!.planValide, true);
    assert.equal(turn.state.result!.prorataRatio, 0.5);
  });

  it("CAS 2 — date absente : la collecte F010 reste possible jusqu'au bout, aucun fallback, blocked_missing_date avant tout plan final", async () => {
    const assistant = new F010LogementAssistant(ctx); // aucune dep dateMiseEnService
    const turn = await reachVentilationManual(assistant);
    assert.equal(turn.state.step, "blocked_missing_date");
    assert.equal(turn.state.result, undefined, "jamais de plan calculé avec une date inventée");
    // Toutes les réponses déjà saisies restent connues — aucune perte, aucune re-demande.
    assert.equal(turn.state.prixAcquisition, 200_000);
    assert.equal(turn.state.fraisNotaire, 15_000);
    assert.equal(turn.state.ratioTerrain, 0.15);
    assert.ok(turn.messages.some((m) => /mise en service/i.test(m.content) && /Activité/i.test(m.content)));
    assert.ok(!turn.messages.some((m) => /01\/01|convention|estimation/i.test(m.content)), "jamais de mention d'une convention ou d'une estimation de date");
  });

  it("CAS 3 — date absente : impossible de confirmer/compléter F010 (confirm refusé, jamais de complete)", async () => {
    const assistant = new F010LogementAssistant(ctx);
    const blocked = await reachVentilationManual(assistant);
    assert.equal(blocked.state.step, "blocked_missing_date");
    const confirmAttempt = await assistant.handle(blocked.state, { type: "confirm" });
    assert.equal(confirmAttempt.completed, false);
    assert.notEqual(confirmAttempt.state.step, "complete");
  });

  it("CAS 4 — F-009 se complète pendant que F010 est bloqué : resume() débloque automatiquement, calcule avec la vraie date, sans perdre les réponses F010", async () => {
    const blockedAssistant = new F010LogementAssistant(ctx); // F-009 pas encore complété
    const blocked = await reachVentilationManual(blockedAssistant, 0.2);
    assert.equal(blocked.state.step, "blocked_missing_date");

    const persisted = toF010PersistedState(blocked.state, "2026-09-14T10:00:00.000Z");
    assert.equal(persisted.step, "blocked_missing_date");

    // F-009 se termine entretemps : declarationDraft.dateMiseEnService existe désormais,
    // donc la dep F010 (dérivée du draft par le panel) est maintenant fournie au resume().
    const unblockedAssistant = new F010LogementAssistant(ctx, { dateMiseEnService: "2024-07-01" });
    const resumed = unblockedAssistant.resume(persisted);

    assert.equal(resumed.state.step, "review_plan");
    assert.ok(resumed.state.result, "le plan doit être calculé automatiquement au déblocage");
    assert.equal(resumed.state.result!.planValide, true);
    // Réponses F010 déjà saisies : conservées, jamais redemandées.
    assert.equal(resumed.state.prixAcquisition, 200_000);
    assert.equal(resumed.state.fraisNotaire, 15_000);
    assert.equal(resumed.state.ratioTerrain, 0.2);
  });

  it("CAS 4bis — resume() sur blocked_missing_date SANS que F-009 se soit complété entretemps : reste bloqué, jamais de plan fictif", async () => {
    const assistant = new F010LogementAssistant(ctx);
    const blocked = await reachVentilationManual(assistant);
    const persisted = toF010PersistedState(blocked.state, "2026-09-14T10:00:00.000Z");

    // Toujours pas de dateMiseEnService disponible.
    const stillBlockedAssistant = new F010LogementAssistant(ctx);
    const resumed = stillBlockedAssistant.resume(persisted);

    assert.equal(resumed.state.step, "blocked_missing_date");
    assert.equal(resumed.state.result, undefined);
  });

  it("CAS 5 — ancien F010PersistedState complet sans dateMiseEnService disponible : aucune date inventée, jamais de plan", () => {
    const persisted: F010PersistedState = {
      step: "review_plan",
      fieldSources: {},
      updatedAt: "2020-01-01T00:00:00.000Z",
      prixAcquisition: 150_000,
      fraisNotaire: 12_000,
      choixTraitementFrais: "integration",
      typeBien: "appartement",
      ratioTerrain: 0.18,
    };
    // Ancien dossier : F-009 jamais complété pour ce fiscalYear (ou avant que
    // dateMiseEnService existe dans le produit) — aucune dep fournie.
    const assistant = new F010LogementAssistant(ctx);
    const resumed = assistant.resume(persisted);
    assert.equal(resumed.state.result, undefined, "aucune date inventée, donc aucun plan calculé");
    // Les données F010 déjà connues restent intactes — aucune perte, aucune destruction.
    assert.equal(resumed.state.prixAcquisition, 150_000);
    assert.equal(resumed.state.ratioTerrain, 0.18);
  });

  it("CAS 6 — date réelle 01/07 : le calcul utilise bien 01/07, jamais 01/01 (oracle indépendant, moteur appelé directement)", async () => {
    const assistant0101 = new F010LogementAssistant(ctx, { dateMiseEnService: "2024-01-01" });
    const assistant0701 = new F010LogementAssistant(ctx, { dateMiseEnService: "2024-07-01" });

    const turn0101 = await reachVentilationManual(assistant0101);
    const turn0701 = await reachVentilationManual(assistant0701);

    // Oracle indépendant : mêmes entrées métier, appelées directement contre le
    // moteur (`computeAmortizationPlan`), en dehors de toute orchestration
    // `F010LogementAssistant` — prouve que l'assistant transmet réellement la
    // date fournie au moteur, pas une valeur fixe ni une recopie de sa propre
    // logique interne.
    const oracleInput = {
      prixAcquisition: 200_000,
      mobilierInclus: false,
      fraisNotaire: 15_000,
      choixTraitementFrais: "integration" as const,
      typeBien: "appartement" as const,
      ratioTerrain: 0.15,
      exerciceFiscal: 2024,
    };
    const oracle0101 = computeAmortizationPlan({ ...oracleInput, dateMiseEnService: "2024-01-01" });
    const oracle0701 = computeAmortizationPlan({ ...oracleInput, dateMiseEnService: "2024-07-01" });

    assert.equal(turn0101.state.result!.prorataRatio, oracle0101.prorataRatio);
    assert.equal(turn0701.state.result!.prorataRatio, oracle0701.prorataRatio);

    // Le contrat central : les deux dates produisent bien des résultats
    // différents (jamais la même valeur quelle que soit la date fournie), et
    // 01/07 (mi-année) couvre nettement moins que 01/01 (quasi année pleine).
    assert.notEqual(turn0701.state.result!.prorataRatio, turn0101.state.result!.prorataRatio);
    assert.ok(turn0701.state.result!.prorataRatio < turn0101.state.result!.prorataRatio * 0.6);

    // La dotation transmise au moteur diverge donc réellement.
    assert.notEqual(turn0701.state.result!.plan.totalAnnuelExercice, turn0101.state.result!.plan.totalAnnuelExercice);
    assert.equal(turn0701.state.result!.plan.totalAnnuelExercice, oracle0701.plan.totalAnnuelExercice);
  });

  it("CAS 7 — date modifiée après F010 (01/01 → 01/07) : le prochain resume()/recalcul utilise la nouvelle date, jamais l'ancienne", async () => {
    const firstAssistant = new F010LogementAssistant(ctx, { dateMiseEnService: "2024-01-01" });
    const completedTurn = await reachVentilationManual(firstAssistant);
    const confirmed = await firstAssistant.handle(completedTurn.state, { type: "confirm" });
    assert.equal(confirmed.state.step, "complete");
    const firstRatio = confirmed.state.result!.prorataRatio;

    const persisted = toF010PersistedState(confirmed.state, "2026-09-14T10:00:00.000Z");

    // La date de mise en service est corrigée dans F-009 après coup.
    const secondAssistant = new F010LogementAssistant(ctx, { dateMiseEnService: "2024-07-01" });
    const resumed = secondAssistant.resume(persisted);

    assert.equal(resumed.state.step, "complete");
    assert.ok(resumed.state.result);
    assert.notEqual(resumed.state.result!.prorataRatio, firstRatio, "le recalcul doit refléter la nouvelle date, jamais l'ancienne mise en cache");
  });

  it("RÉSERVE 1 — F010PersistedState 'review_plan' legacy sans dateMiseEnService : resume() bloque explicitement, aucun écran vide, aucune donnée F010 perdue", () => {
    const legacyPersisted: F010PersistedState = {
      step: "review_plan",
      fieldSources: {},
      updatedAt: "2020-01-01T00:00:00.000Z",
      prixAcquisition: 200_000,
      fraisNotaire: 15_000,
      choixTraitementFrais: "integration",
      typeBien: "appartement",
      ratioTerrain: 0.2,
    };

    // Toujours pas de dateMiseEnService disponible.
    const blockedResume = new F010LogementAssistant(ctx).resume(legacyPersisted);
    assert.equal(blockedResume.state.step, "blocked_missing_date", "jamais un écran review_plan vide");
    assert.equal(blockedResume.state.result, undefined, "aucun plan fictif");
    assert.ok(blockedResume.messages.some((m) => /mise en service/i.test(m.content) && /Activité/i.test(m.content)));
    // Toutes les réponses déjà connues restent intactes.
    assert.equal(blockedResume.state.prixAcquisition, 200_000);
    assert.equal(blockedResume.state.fraisNotaire, 15_000);
    assert.equal(blockedResume.state.choixTraitementFrais, "integration");
    assert.equal(blockedResume.state.typeBien, "appartement");
    assert.equal(blockedResume.state.ratioTerrain, 0.2);

    // Même persisted, mais la dep dateMiseEnService est désormais disponible.
    const unblockedResume = new F010LogementAssistant(ctx, { dateMiseEnService: "2024-07-01" }).resume(
      legacyPersisted,
    );
    assert.equal(unblockedResume.state.step, "review_plan");
    assert.ok(unblockedResume.state.result, "le vrai plan doit être calculé dès que la précondition est satisfaite");
    assert.equal(unblockedResume.state.result!.planValide, true);
    assert.equal(unblockedResume.state.prixAcquisition, 200_000);
    assert.equal(unblockedResume.state.ratioTerrain, 0.2);
  });

  it("RÉSERVE 1 — 'complete' legacy sans dateMiseEnService : reste sur 'complete' (jamais renvoyé vers blocked_missing_date, résultat déjà confirmé jamais détruit)", () => {
    const legacyCompletedPersisted: F010PersistedState = {
      step: "complete",
      fieldSources: {},
      updatedAt: "2020-01-01T00:00:00.000Z",
      prixAcquisition: 200_000,
      fraisNotaire: 15_000,
      choixTraitementFrais: "integration",
      typeBien: "appartement",
      ratioTerrain: 0.2,
      history: ["review_plan"],
    };

    const resumed = new F010LogementAssistant(ctx).resume(legacyCompletedPersisted);
    // Contrat inchangé pour "complete" : jamais renvoyé vers blocked_missing_date
    // (le résultat métier a déjà été confirmé et persisté ailleurs par
    // persistCompletion — le renvoyer casserait un état déjà validé).
    assert.equal(resumed.state.step, "complete");
    assert.equal(resumed.state.result, undefined, "pas de date disponible : pas de plan recalculé, mais pas de destruction non plus");
    assert.equal(resumed.state.prixAcquisition, 200_000);
  });
});
