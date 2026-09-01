/**
 * Cycle 4B (F010) — natureBien contextuelle, plus une question obligatoire de
 * collect_bien. Tests 1→8. Les comportements purement UI (le bandeau
 * ancien/neuf s'affiche ou non) sont vérifiés par construction du panel — ce
 * fichier teste le contrat de données que le panel s'appuie dessus : la
 * préservation/propagation de `natureBien` à travers submit_bien/submit_frais
 * et la reprise, exactement comme les autres tests runtime de ce projet.
 * Run: npx tsx --test src/runtime/assistants/f010-logement/assistant-cycle4b.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { suggestFrais } from "../../capabilities/f010/suggest-frais";
import { F010LogementAssistant } from "./assistant";
import type { F010State } from "./types";

const ctx = { dossierId: "test-dossier", fiscalYear: 2024 };

describe("Cycle 4B — 1. parcours normal sans estimation → aucune demande natureBien", () => {
  it("submit_bien puis submit_frais sans jamais fournir natureBien → reste undefined tout du long", async () => {
    const assistant = new F010LogementAssistant(ctx, { dateMiseEnService: "2024-04-15" });
    const start = assistant.start();
    let turn = await assistant.handle(start.state, { type: "select_nature", nature: "achat" });
    turn = await assistant.handle(turn.state, { type: "select_source", source: "manuel" });

    turn = await assistant.handle(turn.state, {
      type: "submit_bien",
      prixAcquisition: 280000,
      typeBien: "appartement",
      dateAcquisition: "2024-03-01",
      // natureBien délibérément omis.
    });
    assert.equal(turn.state.natureBien, undefined);

    turn = await assistant.handle(turn.state, {
      type: "submit_frais",
      fraisNotaire: 19500,
      choixTraitementFrais: "integration",
      // natureBien toujours omis — l'utilisateur a saisi ses frais lui-même.
    });
    assert.equal(turn.state.natureBien, undefined);
  });
});

describe("Cycle 4B — 2. estimation des frais → le chemin de données transmet natureBien une fois répondu", () => {
  it("submit_frais avec natureBien fourni (réponse à la question contextuelle) → natureBien intégré à F010State", async () => {
    const assistant = new F010LogementAssistant(ctx, { dateMiseEnService: "2024-04-15" });
    const start = assistant.start();
    let turn = await assistant.handle(start.state, { type: "select_nature", nature: "achat" });
    turn = await assistant.handle(turn.state, { type: "select_source", source: "manuel" });
    turn = await assistant.handle(turn.state, {
      type: "submit_bien",
      prixAcquisition: 280000,
      typeBien: "appartement",
      dateAcquisition: "2024-03-01",
    });
    assert.equal(turn.state.natureBien, undefined, "pas encore connu avant l'estimation");

    turn = await assistant.handle(turn.state, {
      type: "submit_frais",
      fraisNotaire: 21000,
      choixTraitementFrais: "integration",
      natureBien: "ancien", // répondu au moment de "Estimer pour moi"
    });
    assert.equal(turn.state.natureBien, "ancien");
  });
});

describe("Cycle 4B — 3. fourniture manuelle des frais → natureBien non demandé, jamais rempli d'office", () => {
  it("submit_frais sans natureBien reste undefined (pas de valeur par défaut injectée)", async () => {
    const assistant = new F010LogementAssistant(ctx);
    const state: F010State = {
      step: "collect_frais",
      prixAcquisition: 280000,
      typeBien: "appartement",
      dateAcquisition: "2024-03-01",
      fieldSources: {},
    };
    const turn = await assistant.handle(state, {
      type: "submit_frais",
      fraisNotaire: 19500,
      choixTraitementFrais: "integration",
    });
    assert.equal(turn.state.natureBien, undefined);
  });
});

describe("Cycle 4B — 4. natureBien déjà connu → jamais redemandé, jamais écrasé", () => {
  it("submit_frais sans natureBien préserve la valeur déjà présente dans state", async () => {
    const assistant = new F010LogementAssistant(ctx);
    const state: F010State = {
      step: "collect_frais",
      prixAcquisition: 280000,
      typeBien: "appartement",
      dateAcquisition: "2024-03-01",
      natureBien: "neuf", // déjà connu (dossier repris, ou déjà répondu plus tôt)
      fieldSources: {},
    };
    const turn = await assistant.handle(state, {
      type: "submit_frais",
      fraisNotaire: 8000,
      choixTraitementFrais: "integration",
      // pas fourni ici non plus — le panel ne redemande pas ce qui est déjà connu.
    });
    assert.equal(turn.state.natureBien, "neuf");
  });

  it("submit_bien sans natureBien préserve aussi la valeur déjà présente", async () => {
    const assistant = new F010LogementAssistant(ctx);
    const state: F010State = { step: "collect_bien", natureBien: "ancien", fieldSources: {} };
    const turn = await assistant.handle(state, {
      type: "submit_bien",
      prixAcquisition: 280000,
      typeBien: "appartement",
      dateAcquisition: "2024-03-01",
    });
    assert.equal(turn.state.natureBien, "ancien");
  });
});

describe("Cycle 4B — 5. refresh après la question natureBien → reprise correcte", () => {
  it("resume() restaure natureBien exactement comme les autres champs", async () => {
    const assistant = new F010LogementAssistant(ctx, { dateMiseEnService: "2024-04-15" });
    const start = assistant.start();
    let turn = await assistant.handle(start.state, { type: "select_nature", nature: "achat" });
    turn = await assistant.handle(turn.state, { type: "select_source", source: "manuel" });
    turn = await assistant.handle(turn.state, {
      type: "submit_bien",
      prixAcquisition: 280000,
      typeBien: "appartement",
      dateAcquisition: "2024-03-01",
    });
    turn = await assistant.handle(turn.state, {
      type: "submit_frais",
      fraisNotaire: 21000,
      choixTraitementFrais: "integration",
      natureBien: "ancien",
    });
    assert.equal(turn.state.step, "collect_mobilier");
    assert.equal(turn.state.natureBien, "ancien");

    const resumed = assistant.resume({
      step: turn.state.step,
      prixAcquisition: turn.state.prixAcquisition,
      typeBien: turn.state.typeBien,
      natureBien: turn.state.natureBien,
      dateAcquisition: turn.state.dateAcquisition,
      fraisNotaire: turn.state.fraisNotaire,
      choixTraitementFrais: turn.state.choixTraitementFrais,
      fieldSources: turn.state.fieldSources,
      history: turn.state.history,
      confirmed: turn.state.confirmed,
      updatedAt: "2026-08-27T10:00:00.000Z",
    });
    assert.equal(resumed.state.natureBien, "ancien");
    assert.equal(resumed.state.step, "collect_mobilier");
  });
});

describe("Cycle 4B — 6. aller-retour → valeur conservée", () => {
  it("GO_BACK jusqu'à collect_bien puis resoumission sans natureBien ne l'efface pas", async () => {
    const assistant = new F010LogementAssistant(ctx, { dateMiseEnService: "2024-04-15" });
    const start = assistant.start();
    let turn = await assistant.handle(start.state, { type: "select_nature", nature: "achat" });
    turn = await assistant.handle(turn.state, { type: "select_source", source: "manuel" });
    turn = await assistant.handle(turn.state, {
      type: "submit_bien",
      prixAcquisition: 280000,
      typeBien: "appartement",
      dateAcquisition: "2024-03-01",
    });
    turn = await assistant.handle(turn.state, {
      type: "submit_frais",
      fraisNotaire: 21000,
      choixTraitementFrais: "integration",
      natureBien: "neuf",
    });
    assert.equal(turn.state.natureBien, "neuf");
    assert.equal(turn.state.step, "collect_mobilier");

    // Retour jusqu'à collect_bien (collect_mobilier → collect_frais → collect_bien).
    turn = await assistant.handle(turn.state, { type: "go_back" }); // collect_frais
    turn = await assistant.handle(turn.state, { type: "go_back" }); // collect_bien
    assert.equal(turn.state.step, "collect_bien");
    assert.equal(turn.state.natureBien, "neuf", "GO_BACK seul ne doit rien effacer");

    // Resoumission de collect_bien sans repasser natureBien (le panel ne le redemande pas, test 4).
    turn = await assistant.handle(turn.state, {
      type: "submit_bien",
      prixAcquisition: 300000, // l'utilisateur corrige le prix
      typeBien: "appartement",
      dateAcquisition: "2024-03-01",
    });
    assert.equal(turn.state.natureBien, "neuf", "la correction d'un autre champ ne doit jamais effacer natureBien");
  });
});

describe("Cycle 4B — 7. ancien dossier contenant natureBien → aucune régression", () => {
  it("un état legacy avec natureBien déjà défini traverse tout le flux sans erreur ni perte", async () => {
    const assistant = new F010LogementAssistant(ctx, { dateMiseEnService: "2024-04-15" });
    const legacyState: F010State = {
      step: "collect_mobilier",
      prixAcquisition: 280000,
      typeBien: "appartement",
      natureBien: "ancien",
      dateAcquisition: "2024-03-01",
      fraisNotaire: 21000,
      choixTraitementFrais: "integration",
      fieldSources: {},
    };
    let turn = await assistant.handle(legacyState, { type: "skip_mobilier" });
    turn = await assistant.handle(turn.state, { type: "submit_ventilation", ratioTerrain: 0.15 });
    assert.equal(turn.state.step, "review_plan");
    assert.equal(turn.state.natureBien, "ancien");
    assert.ok(turn.state.result);
  });
});

describe("Cycle 4B — 8. calcul des frais identique pour les cas déjà renseignés", () => {
  it("suggestFrais produit le même résultat qu'avant ce jalon (formule SAV-002 inchangée)", () => {
    const ancien = suggestFrais({ prixAcquisition: 280000, natureBien: "ancien" });
    const neuf = suggestFrais({ prixAcquisition: 280000, natureBien: "neuf" });
    assert.equal(ancien.montantSuggere, 21000); // 7.5 % de 280000
    assert.equal(neuf.montantSuggere, 7000); // 2.5 % de 280000
  });
});
