/**
 * Fix 7 (Blocker #2 — F012 V2, taxe foncière) — dernier gap résiduel signalé
 * par un gate final indépendant, après Fix 1-6 (tous verts et inchangés —
 * ce fichier construit PAR-DESSUS, sans les toucher).
 *
 * Fix 1-6 gataient exhaustivement les interactions impliquant AU MOINS un
 * writer "document"/Expense (`receive_taxe_fonciere_expense`,
 * `receive_document_proposals`, `commit_document_review`) contre un autre
 * writer quelconque. Aucun d'eux ne couvrait l'interaction entre DEUX
 * writers purement SCALAIRES (pas de document, pas d'Expense) :
 * `submit_taxe_fonciere` (chemin manuel/legacy par catégorie) et
 * `submit_family_impots` (chemin famille, `commitFamilyExpenses` →
 * `applyFamilyExpenses` → `applyOne`, family-expense-apply.ts).
 *
 * Bug prouvé (gate final) :
 *
 *   submit_family_impots({taxeFonciere: 1000}) → collected.taxeFonciere = 1000
 *   submit_family_impots({taxeFonciere: 1500}) → collected.taxeFonciere reste 1000
 *                                                  + familyLines += {category:"divers", montant:1500}
 *   Registry : 1000 + 1500 = 2500€ (double comptage silencieux)
 *
 * Cause : `applyOne` (family-expense-apply.ts, cas "taxe_fonciere") gérait
 * bien "Expense active" (bloque, Fix 2) et "même montant" (idempotent),
 * mais retombait dans le comportement générique des family expenses (conçu
 * pour des familles où plusieurs lignes légitimes coexistent, ex. plusieurs
 * assurances) pour "scalaire déjà défini avec un montant DIFFÉRENT" —
 * créant une `familyLine` "divers" au lieu de router vers
 * `pendingTaxeFonciereReplace`.
 *
 * Variante asymétrique : `submit_taxe_fonciere(A)` puis
 * `submit_family_impots(B≠A)` inversé → `submit_taxe_fonciere(B≠A)` après un
 * `submit_family_impots(A)` — pas de double comptage, mais écrasement
 * silencieux SANS conflit explicite (`afterCategoryInput` fait une
 * affectation directe).
 *
 * Fix 7 — `applyOne` (taxe_fonciere, scalaire divergent) et
 * `submit_taxe_fonciere` (scalaire divergent, sens family→manuel) routent
 * désormais vers le MÊME mécanisme `pendingTaxeFonciereReplace` que Fix 1-6,
 * via `buildTaxeFonciereReplaceCandidate` (origin "manual") — jamais une
 * seconde architecture de conflit.
 *
 * Run: npx tsx --test "src/runtime/assistants/f012-charges/assistant-fix7-scalar-scalar-conflict.test.ts"
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { F012ChargesAssistant } from "./assistant";
import { collectedToChargeRegistry } from "./collected-to-registry";
import { chargeRegistryToComputeInput } from "./registry-to-compute-input";
import { computeChargesExercice } from "../../capabilities/f012/compute-charges-exercice";
import { toF012PersistedState } from "./types";
import type { F012Deps, F012State } from "./types";

const YEAR = 2024;
const ctx = { dossierId: "test", fiscalYear: YEAR, route: "/assistants/charges" };
const DEPS: F012Deps = { dateMiseEnService: "2023-01-01" };
const TS = "2024-03-01T10:00:00.000Z";

function newAssistant() {
  return new F012ChargesAssistant(ctx, DEPS);
}

function chargeTotalFor(state: Pick<F012State, "collected" | "categoryInventory" | "fieldSources">) {
  const registry = collectedToChargeRegistry({
    collected: state.collected,
    categoryInventory: state.categoryInventory,
    fieldSources: state.fieldSources,
    exercise: YEAR,
  });
  const input = chargeRegistryToComputeInput(registry, { dateMiseEnService: "2023-01-01" });
  return { result: computeChargesExercice(input), registry };
}

function totalOf(state: Pick<F012State, "collected" | "categoryInventory" | "fieldSources">) {
  return chargeTotalFor(state).result.charges.totalDeductible;
}

async function submitFamilyTaxe(assistant: F012ChargesAssistant, state: F012State, montant: number) {
  return assistant.handle(state, { type: "submit_family_impots", taxeFonciere: montant });
}

async function submitManualTaxe(assistant: F012ChargesAssistant, state: F012State, montant: number) {
  return assistant.handle(state, { type: "submit_taxe_fonciere", montant });
}

// ---------------------------------------------------------------------------
// 1/2 — family → family
// ---------------------------------------------------------------------------

describe("Fix 7A — family(1000) → family(1500) : jamais de familyLine 'divers', jamais d'addition", () => {
  it("ouvre un conflit de remplacement explicite ; 1000 reste seul actif avant décision", async () => {
    const assistant = newAssistant();
    let turn = await submitFamilyTaxe(assistant, assistant.start().state, 1000);
    assert.equal(turn.state.collected.taxeFonciere, 1000);
    assert.equal(totalOf(turn.state), 1000);

    const before = turn.state;
    turn = await submitFamilyTaxe(assistant, turn.state, 1500);

    assert.equal(turn.state.collected.taxeFonciere, 1000, "1000 reste le scalaire actif, jamais écrasé");
    assert.deepEqual(turn.state.collected.familyLines ?? [], [], "jamais de familyLine 'divers' parasite");
    assert.ok(turn.state.pendingTaxeFonciereReplace, "conflit de remplacement explicite ouvert");
    assert.equal(turn.state.pendingTaxeFonciereReplace?.existing.montant, 1000);
    assert.equal(turn.state.pendingTaxeFonciereReplace?.candidate.montant, 1500);
    assert.equal(totalOf(turn.state), 1000, "jamais 2500 (double comptage), jamais 1500 avant décision");

    const message = turn.messages.at(-1);
    assert.match(message?.content ?? "", /remplacer|conserver/i);
    void before;
  });
});

describe("Fix 7B — family(1000) → family(1000) : strictement idempotent", () => {
  it("aucune ligne supplémentaire, aucun pending, Registry=1000", async () => {
    const assistant = newAssistant();
    let turn = await submitFamilyTaxe(assistant, assistant.start().state, 1000);
    turn = await submitFamilyTaxe(assistant, turn.state, 1000);

    assert.equal(turn.state.collected.taxeFonciere, 1000);
    assert.deepEqual(turn.state.collected.familyLines ?? [], []);
    assert.equal(turn.state.pendingTaxeFonciereReplace, undefined, "même montant : jamais de pending inutile");
    assert.equal(totalOf(turn.state), 1000);
  });
});

// ---------------------------------------------------------------------------
// 3/4 — manuel ↔ family, montants différents
// ---------------------------------------------------------------------------

describe("Fix 7C — manuel(1000) → family(1500) : aucune bascule silencieuse", () => {
  it("1000 reste actif avant décision, 1500 devient candidate explicite", async () => {
    const assistant = newAssistant();
    let turn = await submitManualTaxe(assistant, assistant.start().state, 1000);
    assert.equal(turn.state.collected.taxeFonciere, 1000);

    turn = await submitFamilyTaxe(assistant, turn.state, 1500);

    assert.equal(turn.state.collected.taxeFonciere, 1000, "1000 reste actif, jamais écrasé");
    assert.deepEqual(turn.state.collected.familyLines ?? [], []);
    assert.ok(turn.state.pendingTaxeFonciereReplace, "candidate 1500 explicite");
    assert.equal(turn.state.pendingTaxeFonciereReplace?.existing.montant, 1000);
    assert.equal(turn.state.pendingTaxeFonciereReplace?.candidate.montant, 1500);
    assert.equal(totalOf(turn.state), 1000, "Registry = 1000 avant acceptation");
  });
});

describe("Fix 7D — family(1000) → manuel(1500) : sens inverse, même invariant", () => {
  it("aucun écrasement silencieux via afterCategoryInput", async () => {
    const assistant = newAssistant();
    let turn = await submitFamilyTaxe(assistant, assistant.start().state, 1000);
    assert.equal(turn.state.collected.taxeFonciere, 1000);

    turn = await submitManualTaxe(assistant, turn.state, 1500);

    assert.equal(turn.state.collected.taxeFonciere, 1000, "1000 reste actif, jamais écrasé silencieusement");
    assert.ok(turn.state.pendingTaxeFonciereReplace, "candidate 1500 explicite");
    assert.equal(turn.state.pendingTaxeFonciereReplace?.existing.montant, 1000);
    assert.equal(turn.state.pendingTaxeFonciereReplace?.candidate.montant, 1500);
    assert.equal(totalOf(turn.state), 1000);
  });
});

// ---------------------------------------------------------------------------
// 5/6 — mêmes montants croisés (Fix 7E)
// ---------------------------------------------------------------------------

describe("Fix 7E — mêmes montants croisés : idempotence attendue", () => {
  it("manuel(1000) → family(1000) : une seule taxe foncière, aucun pending, aucune familyLine", async () => {
    const assistant = newAssistant();
    let turn = await submitManualTaxe(assistant, assistant.start().state, 1000);
    turn = await submitFamilyTaxe(assistant, turn.state, 1000);

    assert.equal(turn.state.collected.taxeFonciere, 1000);
    assert.deepEqual(turn.state.collected.familyLines ?? [], []);
    assert.equal(turn.state.pendingTaxeFonciereReplace, undefined);
    assert.equal(totalOf(turn.state), 1000);
  });

  it("family(1000) → manuel(1000) : une seule taxe foncière, aucun pending, aucune familyLine", async () => {
    const assistant = newAssistant();
    let turn = await submitFamilyTaxe(assistant, assistant.start().state, 1000);
    turn = await submitManualTaxe(assistant, turn.state, 1000);

    assert.equal(turn.state.collected.taxeFonciere, 1000);
    assert.deepEqual(turn.state.collected.familyLines ?? [], []);
    assert.equal(turn.state.pendingTaxeFonciereReplace, undefined);
    assert.equal(totalOf(turn.state), 1000);
  });
});

// ---------------------------------------------------------------------------
// 7/8 — accept / decline
// ---------------------------------------------------------------------------

describe("Fix 7 — accept/decline du conflit scalaire↔scalaire", () => {
  it("accept laisse EXACTEMENT la nouvelle valeur (1500), l'ancienne (1000) n'est plus comptée", async () => {
    const assistant = newAssistant();
    let turn = await submitFamilyTaxe(assistant, assistant.start().state, 1000);
    turn = await submitFamilyTaxe(assistant, turn.state, 1500);
    assert.ok(turn.state.pendingTaxeFonciereReplace);

    turn = await assistant.handle(turn.state, { type: "confirm_taxe_fonciere_replace" });

    assert.equal(turn.state.pendingTaxeFonciereReplace, undefined);
    assert.equal(turn.state.collected.taxeFonciereExpense?.montant, 1500, "valeur active = 1500");
    assert.equal(totalOf(turn.state), 1500, "Registry = 1500 exactement, jamais 2500");
  });

  it("decline laisse EXACTEMENT l'ancienne valeur (1000), 1500 est jeté", async () => {
    const assistant = newAssistant();
    let turn = await submitFamilyTaxe(assistant, assistant.start().state, 1000);
    turn = await submitFamilyTaxe(assistant, turn.state, 1500);
    assert.ok(turn.state.pendingTaxeFonciereReplace);

    turn = await assistant.handle(turn.state, { type: "decline_taxe_fonciere_replace" });

    assert.equal(turn.state.pendingTaxeFonciereReplace, undefined);
    assert.equal(turn.state.collected.taxeFonciereExpense, undefined, "1500 jamais écrit nulle part");
    assert.equal(turn.state.collected.taxeFonciere, 1000, "valeur active = 1000");
    assert.equal(totalOf(turn.state), 1000, "Registry = 1000 exactement");
  });

  it("accept/decline symétriques pour le cas manuel(1000)→manuel(1500) (Fix 7D)", async () => {
    const assistantAccept = newAssistant();
    let acceptTurn = await submitManualTaxe(assistantAccept, assistantAccept.start().state, 1000);
    acceptTurn = await submitManualTaxe(assistantAccept, acceptTurn.state, 1500);
    acceptTurn = await assistantAccept.handle(acceptTurn.state, { type: "confirm_taxe_fonciere_replace" });
    assert.equal(totalOf(acceptTurn.state), 1500);

    const assistantDecline = newAssistant();
    let declineTurn = await submitManualTaxe(assistantDecline, assistantDecline.start().state, 1000);
    declineTurn = await submitManualTaxe(assistantDecline, declineTurn.state, 1500);
    declineTurn = await assistantDecline.handle(declineTurn.state, { type: "decline_taxe_fonciere_replace" });
    assert.equal(totalOf(declineTurn.state), 1000);
  });
});

// ---------------------------------------------------------------------------
// 9/10/11 — reload avant décision / après accept / après decline
// ---------------------------------------------------------------------------

describe("Fix 7 — reload/re-entry", () => {
  it("reload avant décision : pendingTaxeFonciereReplace restauré, Registry reste sur l'ancienne valeur", async () => {
    const assistant = newAssistant();
    let turn = await submitFamilyTaxe(assistant, assistant.start().state, 1000);
    turn = await submitFamilyTaxe(assistant, turn.state, 1500);
    assert.ok(turn.state.pendingTaxeFonciereReplace);

    const persisted = toF012PersistedState(turn.state, TS);
    const resumed = newAssistant().resume(persisted);

    assert.deepEqual(resumed.state.pendingTaxeFonciereReplace, turn.state.pendingTaxeFonciereReplace);
    assert.equal(totalOf(resumed.state), 1000, "toujours 1000 après reload, jamais 2500");
  });

  it("reload après accept : Registry reste à 1500", async () => {
    const assistant = newAssistant();
    let turn = await submitFamilyTaxe(assistant, assistant.start().state, 1000);
    turn = await submitFamilyTaxe(assistant, turn.state, 1500);
    turn = await assistant.handle(turn.state, { type: "confirm_taxe_fonciere_replace" });

    const persisted = toF012PersistedState(turn.state, TS);
    const resumed = newAssistant().resume(persisted);

    assert.equal(resumed.state.collected.taxeFonciereExpense?.montant, 1500);
    assert.equal(totalOf(resumed.state), 1500);
  });

  it("reload après decline : Registry reste à 1000", async () => {
    const assistant = newAssistant();
    let turn = await submitFamilyTaxe(assistant, assistant.start().state, 1000);
    turn = await submitFamilyTaxe(assistant, turn.state, 1500);
    turn = await assistant.handle(turn.state, { type: "decline_taxe_fonciere_replace" });

    const persisted = toF012PersistedState(turn.state, TS);
    const resumed = newAssistant().resume(persisted);

    assert.equal(resumed.state.collected.taxeFonciere, 1000);
    assert.equal(totalOf(resumed.state), 1000);
  });
});

// ---------------------------------------------------------------------------
// 12 — troisième writer C pendant replacement pending
// ---------------------------------------------------------------------------

describe("Fix 7 — troisième writer C pendant un remplacement scalaire↔scalaire pending", () => {
  it("submit_family_impots(C) pendant A→B pending (scalaire) est gaté, jamais absorbé", async () => {
    const assistant = newAssistant();
    let turn = await submitFamilyTaxe(assistant, assistant.start().state, 1000);
    turn = await submitFamilyTaxe(assistant, turn.state, 1500);
    const conflictBefore = turn.state.pendingTaxeFonciereReplace;

    turn = await submitFamilyTaxe(assistant, turn.state, 1700);

    assert.deepEqual(turn.state.pendingTaxeFonciereReplace, conflictBefore, "conflit A→B inchangé, C jamais absorbé");
    assert.equal(totalOf(turn.state), 1000);
  });

  it("submit_taxe_fonciere(C) pendant A→B pending (scalaire, origine family) est gaté", async () => {
    const assistant = newAssistant();
    let turn = await submitFamilyTaxe(assistant, assistant.start().state, 1000);
    turn = await submitFamilyTaxe(assistant, turn.state, 1500);
    const conflictBefore = turn.state.pendingTaxeFonciereReplace;

    turn = await submitManualTaxe(assistant, turn.state, 1700);

    assert.deepEqual(turn.state.pendingTaxeFonciereReplace, conflictBefore, "conflit A→B inchangé, C jamais absorbé (garde Fix 1/6 préexistante)");
    assert.equal(totalOf(turn.state), 1000);
  });
});

// ---------------------------------------------------------------------------
// 13 — replay/recommit
// ---------------------------------------------------------------------------

describe("Fix 7 — replay/recommit", () => {
  it("recommit du même montant après resolution (accept) : pas de nouvelle addition", async () => {
    const assistant = newAssistant();
    let turn = await submitFamilyTaxe(assistant, assistant.start().state, 1000);
    turn = await submitFamilyTaxe(assistant, turn.state, 1500);
    turn = await assistant.handle(turn.state, { type: "confirm_taxe_fonciere_replace" });
    assert.equal(totalOf(turn.state), 1500);

    // Re-soumission de la même famille avec le même montant que l'actif :
    // l'actif est désormais une Expense (via le remplacement accepté), donc
    // gouvernée par le garde-fou Fix 2 préexistant (Expense active bloque
    // tout scalaire concurrent) — jamais une addition silencieuse.
    turn = await submitFamilyTaxe(assistant, turn.state, 1500);
    assert.equal(totalOf(turn.state), 1500, "jamais 3000 (pas d'addition)");
  });
});

// ---------------------------------------------------------------------------
// 14/15 — Registry / total fiscal à chaque étape (vérifiés inline ci-dessus) ;
// contrôle explicite supplémentaire des champs séparés du Registry.
// ---------------------------------------------------------------------------

describe("Fix 7 — Registry séparé à chaque étape (collected.* / pending* distincts)", () => {
  it("avant décision : taxeFonciereExpense=undefined, taxeFonciere=A, pendingTaxeFonciereReplace={A,B}", async () => {
    const assistant = newAssistant();
    let turn = await submitFamilyTaxe(assistant, assistant.start().state, 1000);
    turn = await submitFamilyTaxe(assistant, turn.state, 1500);

    assert.equal(turn.state.collected.taxeFonciereExpense, undefined);
    assert.equal(turn.state.collected.taxeFonciere, 1000);
    assert.equal(turn.state.pendingTaxeFonciereReplace?.existing.montant, 1000);
    assert.equal(turn.state.pendingTaxeFonciereReplace?.candidate.montant, 1500);
    assert.deepEqual(turn.state.collected.familyLines ?? [], []);
    assert.equal(turn.state.pendingTaxeFonciereExpense, undefined);
    assert.equal(turn.state.documentReview, undefined);
    assert.equal(turn.state.analyzedDocumentIds ?? undefined, undefined);
  });

  it("après accept : taxeFonciereExpense=B (confirmed), pendingTaxeFonciereReplace=undefined", async () => {
    const assistant = newAssistant();
    let turn = await submitFamilyTaxe(assistant, assistant.start().state, 1000);
    turn = await submitFamilyTaxe(assistant, turn.state, 1500);
    turn = await assistant.handle(turn.state, { type: "confirm_taxe_fonciere_replace" });

    assert.equal(turn.state.collected.taxeFonciereExpense?.montant, 1500);
    assert.equal(turn.state.collected.taxeFonciereExpense?.decision, "confirmed");
    assert.equal(turn.state.pendingTaxeFonciereReplace, undefined);
    assert.equal(chargeTotalFor(turn.state).registry.charges.filter((c) => c.category === "taxe_fonciere").length, 1, "une seule Charge taxe_fonciere dans le Registry");
  });

  it("après decline : taxeFonciereExpense=undefined, taxeFonciere=A inchangé", async () => {
    const assistant = newAssistant();
    let turn = await submitFamilyTaxe(assistant, assistant.start().state, 1000);
    turn = await submitFamilyTaxe(assistant, turn.state, 1500);
    turn = await assistant.handle(turn.state, { type: "decline_taxe_fonciere_replace" });

    assert.equal(turn.state.collected.taxeFonciereExpense, undefined);
    assert.equal(turn.state.collected.taxeFonciere, 1000);
    assert.equal(chargeTotalFor(turn.state).registry.charges.filter((c) => c.category === "taxe_fonciere").length, 1);
  });
});

// ---------------------------------------------------------------------------
// Fix 7F — familyLines historiques (dette pré-Fix 7)
// ---------------------------------------------------------------------------

describe("Fix 7F — état historique corrompu (familyLine 'divers' pré-Fix 7)", () => {
  it("un nouvel input ne peut plus CRÉER une telle familyLine (comportement buggé retiré)", async () => {
    const assistant = newAssistant();
    let turn = await submitFamilyTaxe(assistant, assistant.start().state, 1000);
    turn = await submitFamilyTaxe(assistant, turn.state, 1500);
    assert.equal(
      (turn.state.collected.familyLines ?? []).filter((l) => l.id.startsWith("taxe-fonciere:")).length,
      0,
      "plus aucune familyLine 'taxe-fonciere:*' n'est jamais créée par ce chemin",
    );
  });

  it("défense Registry : un état persisté antérieur portant déjà une telle familyLine ne double-compte plus", async () => {
    const assistant = newAssistant();
    let turn = await submitFamilyTaxe(assistant, assistant.start().state, 1000);
    // Simule un état persisté produit par l'ANCIEN comportement buggé
    // (avant Fix 7) : familyLine parasite "divers" en plus du scalaire actif.
    const corrupted: F012State = {
      ...turn.state,
      collected: {
        ...turn.state.collected,
        familyLines: [
          {
            id: "taxe-fonciere:taxe-fonciere:2024",
            familyId: "impots",
            category: "divers",
            description: "Taxe foncière",
            montant: 1500,
          },
        ],
      },
    };
    const total = totalOf(corrupted);
    assert.equal(total, 1000, "la familyLine parasite historique n'est plus comptée (1000, jamais 2500)");

    // Une NOUVELLE saisie sur cet état corrompu ne doit pas non plus
    // permettre un contournement du gating de remplacement : le scalaire
    // actif (1000) reste seul jusqu'à décision explicite.
    const after = await submitFamilyTaxe(assistant, corrupted, 1800);
    assert.ok(after.state.pendingTaxeFonciereReplace, "le gating de remplacement s'applique toujours sur un état corrompu");
    assert.equal(after.state.collected.taxeFonciere, 1000, "1000 reste actif, la ligne parasite n'a pas été utilisée comme source");
    assert.equal(totalOf(after.state), 1000);
  });
});

// ---------------------------------------------------------------------------
// Non-régression ciblée : les gardes Fix 1-6 (Expense/documentReview) restent
// prioritaires sur le nouveau gating scalaire↔scalaire.
// ---------------------------------------------------------------------------

describe("Fix 7 — non-régression : priorité des gardes Fix 1-6 (Expense/documentReview) inchangée", () => {
  it("aucune Expense active, aucun pending Fix1-6 : comportement Fix 7 s'applique normalement (pas de régression du chemin nu)", async () => {
    const assistant = newAssistant();
    const turn = await submitFamilyTaxe(assistant, assistant.start().state, 1000);
    assert.equal(turn.state.collected.taxeFonciere, 1000);
    assert.equal(turn.state.pendingTaxeFonciereReplace, undefined);
    assert.equal(totalOf(turn.state), 1000);
  });
});
