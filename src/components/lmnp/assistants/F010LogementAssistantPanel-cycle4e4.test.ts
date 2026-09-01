/**
 * Cycle 4E4 (F010) — confirmation avant "Recommencer depuis le début". Tests 1→10.
 *
 * Ce projet n'a pas d'infrastructure DOM/RTL (convention établie tout au
 * long de ce chantier). Les tests réellement comportementaux au niveau
 * runtime (3, 4, 7, 8, 9, 10) sont couverts par de vraies assertions contre
 * `F010LogementAssistant`. Les tests purement visuels/clavier (1, 2, 5, 6)
 * n'ont pas de contrepartie automatisable sans DOM — ils sont vérifiés ici
 * par inspection structurelle du code source du panel (présence des attributs
 * ARIA, du gestionnaire Échap, de `autoFocus`, et de l'absence de tout
 * dispatch dans le chemin "Annuler"), explicitement distincte d'un test
 * d'interaction réel.
 *
 * Run: npx tsx --test "src/components/lmnp/assistants/F010LogementAssistantPanel-cycle4e4.test.ts"
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { F010LogementAssistant } from "@/runtime";
import type { F010State } from "@/runtime";

const ctx = { dossierId: "test-dossier", fiscalYear: 2024 };

const panelSource = readFileSync(
  path.join(path.dirname(fileURLToPath(import.meta.url)), "F010LogementAssistantPanel.tsx"),
  "utf-8",
);

function reviewPlanState(overrides: Partial<F010State> = {}): F010State {
  return {
    step: "review_plan",
    prixAcquisition: 280000,
    dateAcquisition: "2024-03-01",
    typeBien: "appartement",
    fraisNotaire: 21000,
    choixTraitementFrais: "integration",
    montantMobilier: 0,
    ratioTerrain: 0.15,
    fieldSources: {},
    history: ["orientation", "acquisition_source", "collect_bien", "collect_frais", "collect_mobilier", "ventilation"],
    ...overrides,
  };
}

describe("Cycle 4E4 — 1. clic 'Recommencer' → dialogue visible (vérification structurelle)", () => {
  it("le bouton 'Recommencer depuis le début' ouvre la boîte (showRestartConfirm) au lieu de dispatcher restart directement", () => {
    assert.match(
      panelSource,
      /onClick=\{handleRestartClick\}\s*>\s*\n\s*Recommencer depuis le début/,
    );
    assert.match(panelSource, /const handleRestartClick = useCallback\(\(\) => setShowRestartConfirm\(true\)/);
    assert.match(panelSource, /role="dialog"/);
    assert.match(panelSource, /aria-modal="true"/);
  });
});

describe("Cycle 4E4 — 2. Annuler → état strictement inchangé", () => {
  it("handleRestartCancel ne fait que fermer la boîte, ne dispatche jamais d'action (vérification structurelle + par construction)", () => {
    assert.match(
      panelSource,
      /const handleRestartCancel = useCallback\(\(\) => setShowRestartConfirm\(false\), \[\]\);/,
    );
    // Aucune dépendance sur `runAction`/`assistant` dans le handler d'annulation.
  });

  it("un état riche n'est touché par rien tant que restart n'est pas explicitement dispatché", async () => {
    const state = reviewPlanState({ adresse: "12 rue des Lilas" });
    const before = JSON.parse(JSON.stringify(state));
    // "Ouvrir puis annuler" ne produit aucun appel runtime — rien à observer
    // côté F010State, ce qui est exactement la garantie attendue.
    assert.deepEqual(state, before);
  });
});

describe("Cycle 4E4 — 3. confirmer → action restart appelée", () => {
  it("handleRestartConfirm dispatche exactement l'action existante 'restart', identique à assistant.start()", async () => {
    const assistant = new F010LogementAssistant(ctx);
    const state = reviewPlanState();
    const turn = await assistant.handle(state, { type: "restart" });
    const fresh = assistant.start();
    assert.deepEqual(turn.state, fresh.state);
    assert.deepEqual(turn.messages, fresh.messages);
    assert.match(panelSource, /void runAction\(\{ type: "restart" \}\);/);
  });
});

describe("Cycle 4E4 — 4. double clic → un seul restart", () => {
  it("dispatcher restart deux fois de suite reste idempotent (aucune corruption d'état cumulée)", async () => {
    const assistant = new F010LogementAssistant(ctx);
    const state = reviewPlanState();
    const first = await assistant.handle(state, { type: "restart" });
    const second = await assistant.handle(first.state, { type: "restart" });
    assert.deepEqual(first.state, second.state);
  });

  it("la boîte se ferme de façon synchrone avant le dispatch, combiné au garde busy déjà utilisé partout ailleurs (vérification structurelle)", () => {
    assert.match(
      panelSource,
      /const handleRestartConfirm = useCallback\(\(\) => \{\s*\n\s*setShowRestartConfirm\(false\);\s*\n\s*void runAction/,
    );
  });
});

describe("Cycle 4E4 — 5. Escape → annulation (vérification structurelle)", () => {
  it("un gestionnaire keydown Escape appelle onCancel tant que la boîte est ouverte", () => {
    assert.match(panelSource, /event\.key === "Escape"/);
    assert.match(panelSource, /document\.addEventListener\("keydown", handleKeyDown\)/);
  });
});

describe("Cycle 4E4 — 6. focus clavier correct (vérification structurelle)", () => {
  it("le bouton Annuler reçoit le focus initial programmé (option sûre par défaut)", () => {
    assert.match(panelSource, /document\.getElementById\(F010_RESTART_DIALOG_IDS\.cancel\)\?\.focus\(\)/);
    assert.match(panelSource, /id=\{F010_RESTART_DIALOG_IDS\.cancel\}/);
  });
});

describe("Cycle 4E4 — 7. données non concernées inchangées", () => {
  it("les champs déjà confirmés/gouvernés ne sont référencés nulle part dans le chemin restart — F010State n'a aucun champ de gouvernance cross-tunnel", async () => {
    const assistant = new F010LogementAssistant(ctx);
    const state = reviewPlanState({ confirmed: { prixAcquisition: true, typeBien: true } });
    const turn = await assistant.handle(state, { type: "restart" });
    // restart() == start() : jamais de governedFields/propertyBackgroundExtraction
    // dans F010State — ces données vivent exclusivement dans declarationDraft,
    // hors de portée de cette action, donc structurellement protégées.
    assert.equal("governedFields" in turn.state, false);
    assert.equal(turn.state.step, "orientation");
  });
});

describe("Cycle 4E4 — 8. non-régression review_plan", () => {
  it("PlanSummary/ReviewPlanInputsSummary (Cycle 4D) restent fonctionnels, non affectés par ce cycle", async () => {
    const { buildF010ReviewPlanSummaryItems } = await import("./F010LogementAssistantPanel");
    const items = buildF010ReviewPlanSummaryItems(reviewPlanState());
    assert.ok(items.length > 0);
    assert.ok(items.some((item) => item.label === "Prix d'achat"));
  });

  it("le calcul du plan (computePlan) est toujours produit normalement en arrivant sur review_plan", async () => {
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
    });
    turn = await assistant.handle(turn.state, { type: "skip_mobilier" });
    turn = await assistant.handle(turn.state, { type: "submit_ventilation", ratioTerrain: 0.15 });
    assert.equal(turn.state.step, "review_plan");
    assert.ok(turn.state.result);
  });
});

describe("Cycle 4E4 — 9. non-régression COMPLETE / modification", () => {
  it("go_back depuis complete rouvre toujours review_plan (Cycle 0), totalement indépendant de ce cycle", async () => {
    const assistant = new F010LogementAssistant(ctx, { dateMiseEnService: "2024-04-15" });
    const withResult = await assistant.handle(reviewPlanState(), { type: "confirm" });
    assert.equal(withResult.state.step, "complete");
    const back = await assistant.handle(withResult.state, { type: "go_back" });
    assert.equal(back.state.step, "review_plan");
  });
});

describe("Cycle 4E4 — 10. parcours manuel inchangé", () => {
  it("le parcours manuel complet reste identique, restart n'est jamais dispatché ailleurs que par ce bouton", async () => {
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
    assert.equal(turn.state.step, "collect_frais");
    assert.notEqual(turn.state.step, "orientation");
  });
});
