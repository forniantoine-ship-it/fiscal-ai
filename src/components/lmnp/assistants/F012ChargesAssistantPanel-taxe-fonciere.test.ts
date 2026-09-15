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

/** 10 prélèvements de 150,00 € — cas nominal de l'audit P0 (perte silencieuse de 1350€ avant correctif). */
const AVIS_10_PRELEVEMENTS = `
Avis de taxe foncière — Année 2024
${Array.from({ length: 10 }, (_, i) => `Prélèvement ${i + 1} : 150,00`).join("\n")}
Payé le 12/03/2024
`;

/** Montant annuel 1500€ vs 2×150€ (300€) — divergence réelle, Blocker #1 (re-audit). */
const AVIS_1500_ET_2_PRELEVEMENTS = `
Avis de taxe foncière — Année 2024
Net à payer : 1 500,00 EUR
Prélèvement 1 : 150,00
Prélèvement 2 : 150,00
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

  it("TAXE MULTI PRELEVEMENTS (régression P0) — 10×150€ mensualisés → UNE Expense agrégée (1500€), jamais 'dernier prélèvement gagne'", async () => {
    const assistant = new F012ChargesAssistant(ctx, DEPS);
    const start = await reachImpotsPaper(assistant);
    const file = new File([AVIS_10_PRELEVEMENTS], "avis-10x150.txt", { type: "text/plain" });
    const result = await analyzeImpotsDocument(file, YEAR, mockUploadDeps("doc-real-p0-10x150", AVIS_10_PRELEVEMENTS));
    assert.equal(result.status, "success");
    if (result.status !== "success") return;

    // Même contrat que `expensesFromTaxeFonciereCorpus` : une seule Expense
    // candidate pour un document mensualisé, jamais N.
    assert.equal(result.expenses.length, 1, "une seule Expense — jamais une par prélèvement");

    // Même boucle que le panel réel (F012ChargesAssistantPanel.tsx) : si le
    // moteur recevait encore N Expense, ce dispatch séquentiel écraserait
    // silencieusement les précédentes (last-write-wins, défaut de l'audit).
    let turn = start;
    for (const expense of result.expenses) {
      turn = await assistant.handle(turn.state, { type: "receive_taxe_fonciere_expense", expense });
    }

    assert.equal(turn.state.pendingTaxeFonciereExpense?.montantExtrait, 1500, "montant annuel reconstitué, jamais un seul prélèvement tronqué");

    turn = await assistant.handle(turn.state, { type: "confirm_taxe_fonciere_expense" });
    assert.equal(turn.state.collected.taxeFonciereExpense?.decision, "confirmed");
    assert.equal(turn.state.collected.taxeFonciereExpense?.montant, 1500);
    assert.equal(chargeTotalFor(turn.state).charges.totalDeductible, 1500, "Charge Registry : montant correct, aucune perte, aucun double comptage");

    // Recommit idempotent — ré-extraire le même document doit reproduire
    // exactement la même Expense candidate (même id, même montant), jamais
    // un doublement ni un retour à un seul prélèvement.
    const resultAgain = await analyzeImpotsDocument(
      file,
      YEAR,
      mockUploadDeps("doc-real-p0-10x150", AVIS_10_PRELEVEMENTS),
    );
    assert.equal(resultAgain.status, "success");
    if (resultAgain.status !== "success") return;
    assert.equal(resultAgain.expenses.length, 1);
    assert.equal(resultAgain.expenses[0]!.id, result.expenses[0]!.id);
    assert.equal(resultAgain.expenses[0]!.montant, 1500);
  });

  it("TAXE DIVERGENCE (Blocker #1, re-audit) — montant annuel 1500 vs 2×150 détectés : jamais un montant choisi silencieusement, confirm bloqué tant que non résolu, correct débloque", async () => {
    const assistant = new F012ChargesAssistant(ctx, DEPS);
    const start = await reachImpotsPaper(assistant);
    const file = new File([AVIS_1500_ET_2_PRELEVEMENTS], "avis-divergent.txt", { type: "text/plain" });
    const result = await analyzeImpotsDocument(
      file,
      YEAR,
      mockUploadDeps("doc-real-p0-divergent", AVIS_1500_ET_2_PRELEVEMENTS),
    );
    assert.equal(result.status, "success");
    if (result.status !== "success") return;
    assert.equal(result.expenses.length, 1);

    let turn = await assistant.handle(start.state, {
      type: "receive_taxe_fonciere_expense",
      expense: result.expenses[0]!,
    });

    // Aucune valeur choisie silencieusement entre les deux sources.
    assert.equal(turn.state.pendingTaxeFonciereExpense?.montantExtrait, undefined);
    assert.deepEqual(turn.state.pendingTaxeFonciereExpense?.montantConflict, {
      montantIndique: 1500,
      sommePrelevements: 300,
    });

    // Le message de reprise montre EXPLICITEMENT les deux montants — jamais
    // l'un présenté comme certain (mission §6).
    const receivedMessage = turn.messages.at(-1);
    assert.match(receivedMessage?.content ?? "", /1\s?500/);
    assert.match(receivedMessage?.content ?? "", /300/);

    // Tenter de confirmer sans corriger est bloqué (même garde que "montant non lu").
    const blocked = await assistant.handle(turn.state, { type: "confirm_taxe_fonciere_expense" });
    assert.equal(blocked.state.pendingTaxeFonciereExpense?.montantExtrait, undefined, "toujours pending, rien confirmé automatiquement");
    assert.equal(blocked.state.collected.taxeFonciereExpense, undefined);
    const blockedMessage = blocked.messages.at(-1);
    assert.match(blockedMessage?.content ?? "", /1\s?500/);
    assert.match(blockedMessage?.content ?? "", /300/);

    // Correction explicite de l'utilisateur → seule voie de sortie.
    turn = await assistant.handle(turn.state, { type: "correct_taxe_fonciere_expense", montant: 1500 });
    assert.equal(turn.state.collected.taxeFonciereExpense?.decision, "modified");
    assert.equal(turn.state.collected.taxeFonciereExpense?.montant, 1500);
    assert.equal(chargeTotalFor(turn.state).charges.totalDeductible, 1500, "Charge Registry : montant correct après résolution explicite du conflit");

    // Recommit idempotent — ré-extraire reproduit le même conflit, jamais un montant auto-résolu au second passage.
    const resultAgain = await analyzeImpotsDocument(
      file,
      YEAR,
      mockUploadDeps("doc-real-p0-divergent", AVIS_1500_ET_2_PRELEVEMENTS),
    );
    assert.equal(resultAgain.status, "success");
    if (resultAgain.status !== "success") return;
    assert.equal(resultAgain.expenses.length, 1);
    assert.equal(resultAgain.expenses[0]!.montantExtrait, undefined);
    assert.deepEqual(resultAgain.expenses[0]!.montantConflict, { montantIndique: 1500, sommePrelevements: 300 });
  });
});

/**
 * Blocker #2 — câblage UI réel du conflit de remplacement (`TaxeFonciereReplaceForm`,
 * `pendingTaxeFonciereReplace`). Même méthode que la describe ci-dessus :
 * `analyzeImpotsDocument` réel (boundary réseau mocké), assertions sur le
 * VRAI code source du panel/capture pour prouver que les clics dispatchent
 * réellement `confirm_taxe_fonciere_replace`/`decline_taxe_fonciere_replace`,
 * et vérification du comportement moteur via `F012ChargesAssistant.handle()`
 * avec exactement les mêmes actions.
 */
describe("Blocker #2 — câblage UI réel du conflit de remplacement (panel → handleSuggestion → assistant)", () => {
  const AVIS_A_1500 = `
Avis de taxe foncière — Année 2024
Net à payer : 1 500,00 EUR
Payé le 12/03/2024
`;
  const AVIS_B_1600 = `
Avis de taxe foncière — Année 2024
Net à payer : 1 600,00 EUR
Payé le 15/03/2024
`;

  async function confirmDocumentA(assistant: F012ChargesAssistant) {
    const start = await reachImpotsPaper(assistant);
    const file = new File([AVIS_A_1500], "avis-A.txt", { type: "text/plain" });
    const result = await analyzeImpotsDocument(file, YEAR, mockUploadDeps("doc-blocker2-A", AVIS_A_1500));
    assert.equal(result.status, "success");
    if (result.status !== "success") throw new Error("unreachable");
    let turn = await assistant.handle(start.state, {
      type: "receive_taxe_fonciere_expense",
      expense: result.expenses[0]!,
    });
    turn = await assistant.handle(turn.state, { type: "confirm_taxe_fonciere_expense" });
    assert.equal(turn.state.collected.taxeFonciereExpense?.documentId, "doc-blocker2-A");
    return turn;
  }

  it("PANEL RENDER — le conflit de remplacement rend TaxeFonciereReplaceForm avec les deux montants, jamais l'écran d'upload générique", async () => {
    // Preuve boundary panel : le gate de rendu dérive uniquement de
    // `state.pendingTaxeFonciereReplace` (jamais d'un message transitoire),
    // exclut `showPaper` (même défaut déjà corrigé pour showTaxeFonciereReview),
    // et monte réellement `TaxeFonciereReplaceForm`.
    assert.match(panelSource, /const showTaxeFonciereReplace = Boolean\(state\.pendingTaxeFonciereReplace\)/);
    assert.match(panelSource, /!showTaxeFonciereReview &&\s*\n\s*!showTaxeFonciereReplace/);
    assert.match(
      panelSource,
      /showTaxeFonciereReplace && state\.pendingTaxeFonciereReplace \?[\s\S]{0,120}<TaxeFonciereReplaceForm/,
    );
    assert.match(captureSource, /export function TaxeFonciereReplaceForm/);

    const assistant = new F012ChargesAssistant(ctx, DEPS);
    let turn = await confirmDocumentA(assistant);

    const file = new File([AVIS_B_1600], "avis-B.txt", { type: "text/plain" });
    const result = await analyzeImpotsDocument(file, YEAR, mockUploadDeps("doc-blocker2-B", AVIS_B_1600));
    assert.equal(result.status, "success");
    if (result.status !== "success") return;
    turn = await assistant.handle(turn.state, {
      type: "receive_taxe_fonciere_expense",
      expense: result.expenses[0]!,
    });
    turn = await assistant.handle(turn.state, { type: "confirm_taxe_fonciere_expense" });

    assert.ok(turn.state.pendingTaxeFonciereReplace, "conflit créé");
    assert.equal(turn.state.pendingTaxeFonciereReplace?.existing.montant, 1500);
    assert.equal(turn.state.pendingTaxeFonciereReplace?.candidate.montant, 1600);
    assert.equal(turn.state.collected.taxeFonciereExpense?.montant, 1500, "registry inchangé tant que non résolu");

    // Le message associé montre les deux montants et les deux suggestions.
    const message = turn.messages.at(-1);
    assert.match(message?.content ?? "", /1\s?500/);
    assert.match(message?.content ?? "", /1\s?600/);
    assert.ok(message?.suggestions?.some((s) => s.id === "confirm_taxe_fonciere_replace"));
    assert.ok(message?.suggestions?.some((s) => s.id === "decline_taxe_fonciere_replace"));
  });

  it("PANEL DISPATCH REPLACE — clic 'Remplacer' dispatche confirm_taxe_fonciere_replace (suggestion-chip ET TaxeFonciereReplaceForm), moteur remplace atomiquement", async () => {
    assert.match(
      panelSource,
      /suggestionId === "confirm_taxe_fonciere_replace"\) \{\s*\n\s*void runAction\(\{ type: "confirm_taxe_fonciere_replace" \}\);/,
    );
    assert.match(captureSource, /onClick=\{\(\) => onAction\(\{ type: "confirm_taxe_fonciere_replace" \}\)\}/);

    const assistant = new F012ChargesAssistant(ctx, DEPS);
    let turn = await confirmDocumentA(assistant);
    const file = new File([AVIS_B_1600], "avis-B.txt", { type: "text/plain" });
    const result = await analyzeImpotsDocument(file, YEAR, mockUploadDeps("doc-blocker2-B-confirm", AVIS_B_1600));
    assert.equal(result.status, "success");
    if (result.status !== "success") return;
    turn = await assistant.handle(turn.state, {
      type: "receive_taxe_fonciere_expense",
      expense: result.expenses[0]!,
    });
    turn = await assistant.handle(turn.state, { type: "confirm_taxe_fonciere_expense" });
    assert.ok(turn.state.pendingTaxeFonciereReplace);

    // Même action que celle dispatchée par le bouton "Remplacer par le nouveau montant".
    turn = await assistant.handle(turn.state, { type: "confirm_taxe_fonciere_replace" });

    assert.equal(turn.state.pendingTaxeFonciereReplace, undefined);
    assert.equal(turn.state.collected.taxeFonciereExpense?.documentId, "doc-blocker2-B-confirm");
    assert.equal(turn.state.collected.taxeFonciereExpense?.montant, 1600);
    assert.equal(chargeTotalFor(turn.state).charges.totalDeductible, 1600);
  });

  it("PANEL DISPATCH DECLINE — clic 'Conserver l'existant' dispatche decline_taxe_fonciere_replace (suggestion-chip ET TaxeFonciereReplaceForm), ancienne préservée", async () => {
    assert.match(
      panelSource,
      /suggestionId === "decline_taxe_fonciere_replace"\) \{\s*\n\s*void runAction\(\{ type: "decline_taxe_fonciere_replace" \}\);/,
    );
    assert.match(captureSource, /onClick=\{\(\) => onAction\(\{ type: "decline_taxe_fonciere_replace" \}\)\}/);

    const assistant = new F012ChargesAssistant(ctx, DEPS);
    let turn = await confirmDocumentA(assistant);
    const beforeExpense = turn.state.collected.taxeFonciereExpense;
    const file = new File([AVIS_B_1600], "avis-B.txt", { type: "text/plain" });
    const result = await analyzeImpotsDocument(file, YEAR, mockUploadDeps("doc-blocker2-B-decline", AVIS_B_1600));
    assert.equal(result.status, "success");
    if (result.status !== "success") return;
    turn = await assistant.handle(turn.state, {
      type: "receive_taxe_fonciere_expense",
      expense: result.expenses[0]!,
    });
    turn = await assistant.handle(turn.state, { type: "confirm_taxe_fonciere_expense" });
    assert.ok(turn.state.pendingTaxeFonciereReplace);

    // Même action que celle dispatchée par le bouton "Conserver l'avis existant".
    turn = await assistant.handle(turn.state, { type: "decline_taxe_fonciere_replace" });

    assert.equal(turn.state.pendingTaxeFonciereReplace, undefined);
    assert.deepEqual(turn.state.collected.taxeFonciereExpense, beforeExpense, "ancienne dépense intégralement préservée");
    assert.equal(chargeTotalFor(turn.state).charges.totalDeductible, 1500);
  });

  it("PANEL RELOAD — reload PENDANT un conflit de remplacement non résolu : state ET message de reprise restent actionnables", async () => {
    const before = new F012ChargesAssistant(ctx, DEPS);
    let turn = await confirmDocumentA(before);
    const file = new File([AVIS_B_1600], "avis-B.txt", { type: "text/plain" });
    const result = await analyzeImpotsDocument(file, YEAR, mockUploadDeps("doc-blocker2-B-reload", AVIS_B_1600));
    assert.equal(result.status, "success");
    if (result.status !== "success") return;
    turn = await before.handle(turn.state, {
      type: "receive_taxe_fonciere_expense",
      expense: result.expenses[0]!,
    });
    turn = await before.handle(turn.state, { type: "confirm_taxe_fonciere_expense" });
    assert.ok(turn.state.pendingTaxeFonciereReplace);

    const persisted = toF012PersistedState(turn.state, TS);
    const after = new F012ChargesAssistant(ctx, DEPS);
    const resumed = after.resume(persisted);

    // 1) STATE RESTORED
    assert.ok(resumed.state.pendingTaxeFonciereReplace, "conflit restauré dans le state");
    assert.equal(resumed.state.pendingTaxeFonciereReplace?.existing.montant, 1500);
    assert.equal(resumed.state.pendingTaxeFonciereReplace?.candidate.montant, 1600);
    assert.equal(resumed.state.collected.taxeFonciereExpense?.documentId, "doc-blocker2-A", "toujours l'ancienne, non résolu");

    // 2) MESSAGE RESTORED/ACTIONABLE — jamais l'invite d'upload générique.
    const resumeMessage = resumed.messages.at(-1);
    assert.ok(resumeMessage?.suggestions?.some((s) => s.id === "confirm_taxe_fonciere_replace"));
    assert.ok(resumeMessage?.suggestions?.some((s) => s.id === "decline_taxe_fonciere_replace"));
    assert.doesNotMatch(
      resumeMessage?.content ?? "",
      /vous pouvez aussi indiquer le montant sans document/i,
      "ne doit jamais retomber sur l'invite d'upload générique",
    );

    // Puis clic Remplacer → remplacement atomique après reload.
    const replaced = await after.handle(resumed.state, { type: "confirm_taxe_fonciere_replace" });
    assert.equal(replaced.state.collected.taxeFonciereExpense?.documentId, "doc-blocker2-B-reload");
    assert.equal(chargeTotalFor(replaced.state).charges.totalDeductible, 1600);
  });
});
