/**
 * Correctif post-audit P0 — câblage UI de la taxe foncière (Expense, famille
 * "impots" migrée Phase 2). L'audit contradictoire a constaté que le moteur
 * produisait déjà `confirm_taxe_fonciere_expense` / `correct_taxe_fonciere_expense`
 * / `ignore_taxe_fonciere_expense` (assistant.ts) mais que `handleSuggestion`
 * (F012ChargesAssistantPanel.tsx) ne les dispatchait jamais — cliquer les
 * boutons ne faisait rien.
 *
 * Ce fichier traverse le VRAI boundary panel → dispatch → assistant à chaque
 * fois que c'est vérifiable dans ce dépôt :
 *  - `analyzeImpotsDocument` est la fonction RÉELLEMENT appelée par
 *    `analyzePaperFile` du panel (F012ChargesAssistantPanel.tsx) — seul le
 *    boundary réseau (auth/upload/OCR) est mocké via ses `deps` injectables,
 *    jamais un second chemin de test.
 *  - les 3 actions sont vérifiées comme RÉELLEMENT dispatchées par
 *    `handleSuggestion`/`TaxeFonciereReviewForm` via inspection du code
 *    source du panel (même convention que `F012ChargesAssistantPanel.ux.test.ts`
 *    existant dans ce dépôt, qui n'a pas de harnais de rendu React) — le
 *    panel n'exporte pas de fonctions pures pour ces branches (contrairement
 *    à F010) : lire son code réel est le seul moyen disponible ici de
 *    prouver qu'un clic sur `suggestion.id === "confirm_taxe_fonciere_expense"`
 *    ou `"ignore_taxe_fonciere_expense"` dispatche effectivement l'action, et
 *    que `TaxeFonciereReviewForm` est bien monté quand la proposition doit
 *    être actionnable.
 *  - la réaction du moteur à chaque action dispatchée est vérifiée en
 *    appelant `F012ChargesAssistant.handle()` avec exactement les mêmes
 *    actions que celles que le panel dispatche (mêmes types, mêmes payloads).
 *
 * Run: npx tsx --test "src/components/lmnp/assistants/F012ChargesAssistantPanel-taxe-fonciere.test.ts"
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { F012ChargesAssistant } from "@/runtime/assistants/f012-charges/assistant";
import { collectedToChargeRegistry } from "@/runtime/assistants/f012-charges/collected-to-registry";
import { chargeRegistryToComputeInput } from "@/runtime/assistants/f012-charges/registry-to-compute-input";
import { computeChargesExercice } from "@/runtime/capabilities/f012/compute-charges-exercice";
import { toF012PersistedState } from "@/runtime/assistants/f012-charges/types";
import type { F012Deps, F012State } from "@/runtime/assistants/f012-charges/types";
import { analyzeImpotsDocument } from "@/lib/lmnp/services/f012/f012-impots-document-upload";

const here = path.dirname(fileURLToPath(import.meta.url));
const panelSource = readFileSync(path.join(here, "F012ChargesAssistantPanel.tsx"), "utf-8");
const captureSource = readFileSync(path.join(here, "F012FamilyCapture.tsx"), "utf-8");

const YEAR = 2024;
const ctx = { dossierId: "test", fiscalYear: YEAR, route: "/assistants/charges" };
const DEPS: F012Deps = { dateMiseEnService: "2023-01-01" };
const TS = "2024-03-01T10:00:00.000Z";
const PROFIL_SIMPLE = { copropriete: false, agence: false, travaux: false, vacance: false, comptable: false };

async function reachImpots(assistant: F012ChargesAssistant) {
  const turn = await assistant.handle(assistant.start().state, { type: "submit_profilage", ...PROFIL_SIMPLE });
  assert.equal(turn.state.categoryInventory[turn.state.currentCategoryIndex], "taxe_fonciere");
  return turn;
}

/** Même parcours que le panel réel : `open_family_paper` amène `familyPhase` sur "paper" (écran d'upload) avant tout upload. */
async function reachImpotsPaper(assistant: F012ChargesAssistant) {
  const start = await reachImpots(assistant);
  const turn = await assistant.handle(start.state, { type: "open_family_paper" });
  assert.equal(turn.state.familyPhase, "paper");
  return turn;
}

function chargeTotalFor(state: Pick<F012State, "collected" | "categoryInventory" | "fieldSources">) {
  const registry = collectedToChargeRegistry({
    collected: state.collected,
    categoryInventory: state.categoryInventory,
    fieldSources: state.fieldSources,
    exercise: YEAR,
  });
  const input = chargeRegistryToComputeInput(registry, { dateMiseEnService: "2023-01-01" });
  return computeChargesExercice(input);
}

/**
 * Boundary réseau mocké — même contrat que `AnalyzeImpotsDocumentDeps`
 * (f012-impots-document-upload.ts) : auth + upload Storage + OCR sont les
 * SEULS points remplacés ; `analyzeImpotsDocument` (le code réellement
 * utilisé par le panel) reste inchangé et produit un `documentId` réel
 * (jamais l'id synthétique `f012-doc-*` de l'ancien chemin).
 */
function mockUploadDeps(documentId: string, extractedText: string) {
  return {
    getAuthenticatedUserId: async () => "user-1",
    uploadFiles: async (files: File[]) => ({ files, documentIds: [documentId] }),
    extractText: async () => extractedText,
  };
}

const AVIS_1000 = `
Avis de taxe foncière — Année 2024
Net à payer : 1 000,00 EUR
Payé le 12/03/2024
`;

describe("P0 post-audit — taxe foncière : câblage UI réel (panel → handleSuggestion → assistant)", () => {
  it("TAXE INITIAL UI — après upload réel (boundary réseau mocké), la proposition est actionnable, pas seulement dans le state", async () => {
    const assistant = new F012ChargesAssistant(ctx, DEPS);
    const start = await reachImpotsPaper(assistant);

    const file = new File([AVIS_1000], "avis-1000.txt", { type: "text/plain" });
    const result = await analyzeImpotsDocument(file, YEAR, mockUploadDeps("doc-real-p0-1", AVIS_1000));
    assert.equal(result.status, "success");
    if (result.status !== "success") return;
    assert.equal(result.documentId, "doc-real-p0-1", "id de document réel, jamais un id synthétique f012-doc-*");

    let turn = await assistant.handle(start.state, {
      type: "receive_taxe_fonciere_expense",
      expense: result.expenses[0]!,
    });
    assert.equal(turn.state.pendingTaxeFonciereExpense?.montantExtrait, 1000);
    const message = turn.messages.at(-1);
    assert.ok(message?.suggestions?.some((s) => s.id === "confirm_taxe_fonciere_expense"));
    assert.ok(message?.suggestions?.some((s) => s.id === "ignore_taxe_fonciere_expense"));

    // Preuve d'actionabilité côté panel : `showTaxeFonciereReview` dérive
    // uniquement de `state.pendingTaxeFonciereExpense` (jamais d'un message
    // transitoire) et exclut explicitement l'écran d'upload (`showPaper`),
    // qui masquait auparavant tout bouton pendant que la proposition était
    // en attente.
    assert.match(panelSource, /const showTaxeFonciereReview = Boolean\(state\.pendingTaxeFonciereExpense\)/);
    assert.match(panelSource, /isDocumentaryFamily\(currentFamily\) &&\s*\n\s*!showTaxeFonciereReview/);
    assert.match(
      panelSource,
      /showTaxeFonciereReview && state\.pendingTaxeFonciereExpense \?[\s\S]{0,80}<TaxeFonciereReviewForm/,
    );
  });

  it("TAXE CONFIRM — clic 'Oui, ce montant est correct' dispatche confirm_taxe_fonciere_expense → Expense confirmed → Charge", async () => {
    // Le panel dispatche cette action depuis deux points réels : la
    // suggestion-chip (`handleSuggestion`) ET `TaxeFonciereReviewForm`
    // (bouton principal). Les deux DOIVENT exister dans le code source.
    assert.match(
      panelSource,
      /suggestionId === "confirm_taxe_fonciere_expense"\) \{\s*\n\s*void runAction\(\{ type: "confirm_taxe_fonciere_expense" \}\);/,
    );
    assert.match(captureSource, /onClick=\{\(\) => onAction\(\{ type: "confirm_taxe_fonciere_expense" \}\)\}/);

    const assistant = new F012ChargesAssistant(ctx, DEPS);
    const start = await reachImpotsPaper(assistant);
    const file = new File([AVIS_1000], "avis-1000.txt", { type: "text/plain" });
    const result = await analyzeImpotsDocument(file, YEAR, mockUploadDeps("doc-real-p0-confirm", AVIS_1000));
    assert.equal(result.status, "success");
    if (result.status !== "success") return;

    let turn = await assistant.handle(start.state, {
      type: "receive_taxe_fonciere_expense",
      expense: result.expenses[0]!,
    });
    // Même action, même payload que celle que `handleSuggestion` dispatche.
    turn = await assistant.handle(turn.state, { type: "confirm_taxe_fonciere_expense" });

    assert.equal(turn.state.pendingTaxeFonciereExpense, undefined);
    assert.equal(turn.state.collected.taxeFonciereExpense?.decision, "confirmed");
    assert.equal(turn.state.collected.taxeFonciereExpense?.montant, 1000);
    assert.equal(chargeTotalFor(turn.state).charges.totalDeductible, 1000);
  });

  it("TAXE CORRECT — TaxeFonciereReviewForm permet de saisir un montant corrigé puis de le confirmer (montantExtrait=1000 → montant=1100)", async () => {
    // Preuve UI réelle : le formulaire de correction existe, réutilise le
    // même pattern que `DocumentReviewForm` (input contrôlé + bascule
    // Corriger/Enregistrer la correction), et dispatche
    // `correct_taxe_fonciere_expense` avec le montant saisi — jamais une
    // simple suggestion-chip (elle ne peut pas porter de montant).
    assert.match(captureSource, /export function TaxeFonciereReviewForm/);
    assert.match(captureSource, /onAction\(\{ type: "correct_taxe_fonciere_expense", montant: parsed \}\)/);
    assert.match(captureSource, /Enregistrer la correction/);

    const assistant = new F012ChargesAssistant(ctx, DEPS);
    const start = await reachImpotsPaper(assistant);
    const file = new File([AVIS_1000], "avis-1000.txt", { type: "text/plain" });
    const result = await analyzeImpotsDocument(file, YEAR, mockUploadDeps("doc-real-p0-correct", AVIS_1000));
    assert.equal(result.status, "success");
    if (result.status !== "success") return;

    let turn = await assistant.handle(start.state, {
      type: "receive_taxe_fonciere_expense",
      expense: result.expenses[0]!,
    });
    assert.equal(turn.state.pendingTaxeFonciereExpense?.montantExtrait, 1000);

    // Même action que celle dispatchée par le bouton "Enregistrer la
    // correction" de `TaxeFonciereReviewForm` une fois l'utilisateur a
    // saisi 1100 dans le champ.
    turn = await assistant.handle(turn.state, { type: "correct_taxe_fonciere_expense", montant: 1100 });

    const stored = turn.state.collected.taxeFonciereExpense!;
    assert.equal(stored.montantExtrait, 1000, "la valeur extraite reste tracée après correction");
    assert.equal(stored.montant, 1100, "la valeur corrigée devient la valeur courante");
    assert.equal(stored.decision, "modified");
    assert.equal(chargeTotalFor(turn.state).charges.totalDeductible, 1100);
  });

  it("TAXE IGNORE — clic 'Ignorer ce document' dispatche ignore_taxe_fonciere_expense → decision=ignored → aucune Charge", async () => {
    assert.match(
      panelSource,
      /suggestionId === "ignore_taxe_fonciere_expense"\) \{\s*\n\s*void runAction\(\{ type: "ignore_taxe_fonciere_expense" \}\);/,
    );
    assert.match(captureSource, /onClick=\{\(\) => onAction\(\{ type: "ignore_taxe_fonciere_expense" \}\)\}/);

    const assistant = new F012ChargesAssistant(ctx, DEPS);
    const start = await reachImpotsPaper(assistant);
    const file = new File([AVIS_1000], "avis-1000.txt", { type: "text/plain" });
    const result = await analyzeImpotsDocument(file, YEAR, mockUploadDeps("doc-real-p0-ignore", AVIS_1000));
    assert.equal(result.status, "success");
    if (result.status !== "success") return;

    let turn = await assistant.handle(start.state, {
      type: "receive_taxe_fonciere_expense",
      expense: result.expenses[0]!,
    });
    turn = await assistant.handle(turn.state, { type: "ignore_taxe_fonciere_expense" });

    assert.equal(turn.state.collected.taxeFonciereExpense?.decision, "ignored");
    assert.equal(turn.state.pendingTaxeFonciereExpense, undefined);
    assert.equal(chargeTotalFor(turn.state).charges.totalDeductible, 0, "une dépense ignorée ne devient jamais une Charge");
  });

  it("TAXE PENDING RELOAD — reload AVANT décision : le state ET le message de reprise portent une proposition réellement actionnable", async () => {
    const before = new F012ChargesAssistant(ctx, DEPS);
    const start = await reachImpotsPaper(before);
    const file = new File([AVIS_1000], "avis-1000.txt", { type: "text/plain" });
    const result = await analyzeImpotsDocument(file, YEAR, mockUploadDeps("doc-real-p0-reload-pending", AVIS_1000));
    assert.equal(result.status, "success");
    if (result.status !== "success") return;

    const uploaded = await before.handle(start.state, {
      type: "receive_taxe_fonciere_expense",
      expense: result.expenses[0]!,
    });
    assert.equal(uploaded.state.familyPhase, "paper", "familyPhase reste 'paper' après réception — condition du défaut P0");

    const persisted = toF012PersistedState(uploaded.state, TS);
    const after = new F012ChargesAssistant(ctx, DEPS);
    const resumed = after.resume(persisted);

    // 1) STATE RESTORED — la proposition est bien dans le state repris.
    assert.equal(resumed.state.pendingTaxeFonciereExpense?.montantExtrait, 1000, "state restored");

    // 2) UI RESTORED/ACTIONABLE — distinct de (1) : avant le correctif,
    // `buildReentryTurn` ne testait jamais `pendingTaxeFonciereExpense` et
    // retombait sur la branche `familyPhase === "paper"`, réémettant
    // l'invite d'upload générique au lieu du message de confirmation/
    // correction. Ici on vérifie le VRAI message de reprise retourné par le
    // moteur (celui que `stateRef.current`/`lastAssistant` du panel
    // utilisent réellement pour choisir quoi afficher).
    const resumeMessage = resumed.messages.at(-1);
    assert.ok(
      resumeMessage?.suggestions?.some((s) => s.id === "confirm_taxe_fonciere_expense"),
      "UI restored/actionable : le message de reprise porte la suggestion de confirmation, pas l'invite d'upload générique",
    );
    assert.ok(resumeMessage?.suggestions?.some((s) => s.id === "ignore_taxe_fonciere_expense"));
    assert.doesNotMatch(
      resumeMessage?.content ?? "",
      /vous pouvez aussi indiquer le montant sans document/i,
      "ne doit plus être l'invite d'upload générique (ancien défaut)",
    );

    // 3) Le gate de rendu panel ne dépend QUE du state (jamais du message),
    // donc les boutons sont actionnables même indépendamment du fix (2) —
    // preuve indépendante de "actionable", pas une simple relecture du (1).
    assert.match(panelSource, /const showTaxeFonciereReview = Boolean\(state\.pendingTaxeFonciereExpense\)/);

    // Puis clic Confirmer → Expense confirmed → Charge.
    const confirmed = await after.handle(resumed.state, { type: "confirm_taxe_fonciere_expense" });
    assert.equal(confirmed.state.collected.taxeFonciereExpense?.decision, "confirmed");
    assert.equal(chargeTotalFor(confirmed.state).charges.totalDeductible, 1000);
  });

  it("TAXE CONFIRMED RELOAD — reload après confirm/correct : même documentId, montant, montantExtrait, decision, Charge", async () => {
    const before = new F012ChargesAssistant(ctx, DEPS);
    const start = await reachImpotsPaper(before);
    const file = new File([AVIS_1000], "avis-1000.txt", { type: "text/plain" });
    const result = await analyzeImpotsDocument(file, YEAR, mockUploadDeps("doc-real-p0-reload-confirmed", AVIS_1000));
    assert.equal(result.status, "success");
    if (result.status !== "success") return;

    let turn = await before.handle(start.state, {
      type: "receive_taxe_fonciere_expense",
      expense: result.expenses[0]!,
    });
    turn = await before.handle(turn.state, { type: "correct_taxe_fonciere_expense", montant: 1234 });

    const persisted = toF012PersistedState(turn.state, TS);
    const after = new F012ChargesAssistant(ctx, DEPS);
    const resumed = after.resume(persisted);

    const before_ = turn.state.collected.taxeFonciereExpense!;
    const after_ = resumed.state.collected.taxeFonciereExpense!;
    assert.equal(after_.documentId, before_.documentId);
    assert.equal(after_.documentId, "doc-real-p0-reload-confirmed");
    assert.equal(after_.montant, 1234);
    assert.equal(after_.montantExtrait, 1000);
    assert.equal(after_.decision, "modified");
    assert.equal(chargeTotalFor(resumed.state).charges.totalDeductible, chargeTotalFor(turn.state).charges.totalDeductible);
    assert.equal(chargeTotalFor(resumed.state).charges.totalDeductible, 1234);
  });
});
