/**
 * Correctif post-audit P1 — clé d'item stable pour une ligne syndic.
 *
 * Défaut constaté par l'audit contradictoire : `proposalsFromCoproCorpus`
 * (proposals-from-copro.ts) construisait `ChargeProposal.id` à partir de
 * l'INDEX de la ligne dans `normalized.transactions`
 * (`${documentId}:copro:${index+1}`) — recomposé à chaque extraction. Un
 * réordonnancement OCR entre deux passes du même document (mêmes lignes)
 * faisait donc changer l'id, puis l'`Expense.id` dérivé
 * (`deriveExpenseIdFromDocument`, expense-from-document-review.ts) →
 * Expense orpheline + doublon possible au recommit.
 *
 * Ce fichier :
 *  1. reproduit le défaut INDÉPENDAMMENT, avec le VRAI parseur mais
 *     l'ANCIENNE formule d'id (repliquée explicitement, jamais réimportée du
 *     code de production — le code de production a déjà été corrigé) ;
 *  2. prouve que la nouvelle clé (`stableCoproItemKey`, label+amount, seuls
 *     champs réellement stables exposés par le parseur à ce stade — voir le
 *     commentaire de `stableCoproItemKey`) reste stable au reorder ;
 *  3. couvre reorder / collision / correction+reorder / recommit /
 *     REMOVE_DOCUMENT au niveau `F012ChargesAssistant`, le même chemin que
 *     le panel réel (`receive_document_proposals` → `confirm_proposal` /
 *     `modify_proposal` → `commit_document_review`).
 *
 * Run: npx tsx --test "src/runtime/assistants/f012-charges/proposals-from-copro-item-key.test.ts"
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { normalizeChargeTransactions, rawTransactionsFromCopro } from "@/lib/lmnp/services/charges/normalize-charge-transactions";
import { parseCoproprieteDocument } from "@/lib/lmnp/services/charges/parse-copropriete-document";
import { F012ChargesAssistant } from "./assistant";
import { applyDocumentReviewAsExpenses } from "./expense-from-document-review";
import { ChargeRegistryCollisionError, collectedToChargeRegistry } from "./collected-to-registry";
import { chargeRegistryToComputeInput } from "./registry-to-compute-input";
import { computeChargesExercice } from "../../capabilities/f012/compute-charges-exercice";
import { createInitialF012State } from "./types";
import { proposalsFromCoproCorpus } from "./proposals-from-copro";
import { invalidateExpensesForDocument, isExpenseRecordable, type Expense } from "../../capabilities/f012/expense";
import type { F012CollectedData, F012Deps, F012State } from "./types";
import type { ChargeProposal, F012DocumentReview } from "./charge-proposal";

const YEAR = 2024;
const ctx = { dossierId: "test", fiscalYear: YEAR, route: "/assistants/charges" };
const DEPS: F012Deps = { dateMiseEnService: "2023-01-01" };

const PROFIL_COPRO = { copropriete: true, agence: false, travaux: false, vacance: false, comptable: false };

async function startSyndic() {
  const assistant = new F012ChargesAssistant(ctx, DEPS);
  let turn = await assistant.handle(assistant.start().state, { type: "submit_profilage", ...PROFIL_COPRO });
  while (turn.state.familyInventory?.[turn.state.currentFamilyIndex ?? 0] !== "syndic") {
    turn = await assistant.handle(turn.state, { type: "none_family" });
  }
  return { assistant, turn };
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

// Deux lignes syndic réelles, économiquement distinctes (libellé ET montant
// différents) — ordre A puis B.
const DECOMPTE_AB = `
Syndic — Décompte annuel 2024
CHARGES COMMUNES GENERALES          245,60 €
CHARGES BATIMENT                    128,40 €
`;

// Mêmes deux lignes, ordre inversé (B puis A) — simule un réordonnancement
// OCR entre deux passes du même document.
const DECOMPTE_BA = `
Syndic — Décompte annuel 2024
CHARGES BATIMENT                    128,40 €
CHARGES COMMUNES GENERALES          245,60 €
`;

// Deux lignes de libellés différents mais de MÊME montant — la clé doit les
// distinguer puisque le parseur expose un discriminant réel (le libellé).
const DECOMPTE_SAME_AMOUNT_DIFFERENT_LABEL = `
Syndic — Décompte annuel 2024
CHARGES COMMUNES GENERALES          200,00 €
CHARGES BATIMENT                    200,00 €
`;

// Deux lignes STRICTEMENT identiques (même libellé, même montant) — cas
// produit légitime (deux charges réellement distinctes portant le même
// libellé et le même montant sur le même document). Correctif P1-bis :
// `withOccurrenceDiscriminatedIds` (proposals-from-copro.ts) leur attribue
// désormais des ids distincts (discriminant d'occurrence), elles ne
// collisionnent plus.
const DECOMPTE_TRUE_DUPLICATE = `
Syndic — Décompte annuel 2024
CHARGES COMMUNES GENERALES          200,00 €
CHARGES COMMUNES GENERALES          200,00 €
`;

// Même paire de lignes STRICTEMENT identiques, avec une troisième ligne
// économiquement DIFFÉRENTE ("CHARGES BATIMENT") déplacée autour d'elles —
// simule un réordonnancement OCR qui ne change PAS l'ordre relatif des deux
// occurrences colliding entre elles (la seule chose qui a un sens : deux
// lignes de texte strictement identiques ne peuvent pas être "réordonnées"
// l'une par rapport à l'autre de façon observable).
const DECOMPTE_COLLISION_REORDER_1 = `
Syndic — Décompte annuel 2024
CHARGES COMMUNES GENERALES          200,00 €
CHARGES COMMUNES GENERALES          200,00 €
CHARGES BATIMENT                    128,40 €
`;

const DECOMPTE_COLLISION_REORDER_2 = `
Syndic — Décompte annuel 2024
CHARGES BATIMENT                    128,40 €
CHARGES COMMUNES GENERALES          200,00 €
CHARGES COMMUNES GENERALES          200,00 €
`;

/**
 * Applique une revue syndic directement via `applyDocumentReviewAsExpenses`
 * — le VRAI point d'écriture unique déjà utilisé par
 * `commit_document_review` pour syndic/assurances/gestion (assistant.ts).
 * On pilote ce niveau plutôt que `F012ChargesAssistant.handle()` en boucle
 * pour un second passage sur le MÊME documentId : `receive_document_proposals`
 * porte une garde anti-double-analyse par session interactive
 * (`isDocumentAlreadyAnalyzed`, apply-document-review.ts) orthogonale à la
 * stabilité de l'itemKey — sans cette étape, une deuxième réception pour le
 * même documentId serait no-opée par cette garde et le test ne prouverait
 * rien. `applyDocumentReviewAsExpenses` (appelé par `commit_document_review`)
 * n'a pas cette garde : c'est le niveau réellement concerné par la clé
 * d'item stable, et le seul valide pour reproduire un recommit du même
 * document (reprocessing) indépendamment de la garde de session.
 */
function decide(
  proposals: ChargeProposal[],
  decisions: Record<string, { decision: "confirmed" | "modified" | "ignored"; amount?: number }>,
): ChargeProposal[] {
  return proposals.map((p) => {
    const d = decisions[p.id];
    if (!d) return p;
    return { ...p, decision: d.decision, ...(d.amount !== undefined ? { modifiedAmount: d.amount } : {}) };
  });
}

function commitSyndicReview(collected: F012CollectedData, proposals: ChargeProposal[], documentId: string) {
  const review: F012DocumentReview = { documentId, familyId: "syndic", proposals };
  const applied = applyDocumentReviewAsExpenses({ collected, review, fiscalYear: YEAR });
  assert.equal(applied.outcome, "wrote", `commit syndic attendu réussi (outcome=${applied.outcome})`);
  return applied.collected;
}

/** Réplique EXPLICITE de l'ancienne formule bugguée — jamais réimportée du code de production (déjà corrigé) — uniquement pour reproduire le défaut de façon indépendante avec le VRAI parseur. */
function legacyIndexBasedProposals(documentId: string, corpus: string): ChargeProposal[] {
  const parsed = parseCoproprieteDocument(corpus, { logTraces: false });
  const normalized = normalizeChargeTransactions(rawTransactionsFromCopro(parsed.transactions), { logTraces: false });
  return normalized.transactions.map((tx, index) => ({
    id: `${documentId}:copro:${index + 1}`,
    documentId,
    familyId: "syndic" as const,
    description: tx.label ?? tx.category,
    amount: tx.amount,
    exercise: YEAR,
    missingFields: [] as ChargeProposal["missingFields"],
    decision: "pending" as const,
  }));
}

describe("P1 post-audit — itemKey syndic stable (reorder OCR)", () => {
  it("SYNDIC OLD ID FAILURE — reproduction indépendante : l'ancienne formule (index) change d'id au reorder", () => {
    const oldAB = legacyIndexBasedProposals("copro-legacy", DECOMPTE_AB);
    const oldBA = legacyIndexBasedProposals("copro-legacy", DECOMPTE_BA);

    const oldChargesCommunesAB = oldAB.find((p) => p.description.includes("CHARGES COMMUNES"));
    const oldChargesCommunesBA = oldBA.find((p) => p.description.includes("CHARGES COMMUNES"));
    assert.ok(oldChargesCommunesAB && oldChargesCommunesBA);
    assert.notEqual(
      oldChargesCommunesAB!.id,
      oldChargesCommunesBA!.id,
      "défaut reproduit : l'ancienne clé (index) change pour la même ligne économique selon l'ordre d'extraction",
    );
    // Pire : l'ancienne formule fait porter le MÊME id à deux lignes
    // économiquement différentes selon l'ordre — la ligne "CHARGES BATIMENT"
    // récupère l'id qu'avait "CHARGES COMMUNES" dans l'autre passe.
    const oldChargesBatimentBA = oldBA.find((p) => p.description.includes("CHARGES BATIMENT"));
    assert.equal(
      oldChargesCommunesAB!.id,
      oldChargesBatimentBA!.id,
      "défaut reproduit : deux lignes économiquement différentes finissent par partager le même id selon l'ordre",
    );
  });

  it("SYNDIC NEW ITEM KEY — la nouvelle clé (label+amount) reste identique pour la même ligne, quel que soit l'ordre", () => {
    const newAB = proposalsFromCoproCorpus({ corpus: DECOMPTE_AB, documentId: "copro-new", fiscalYear: YEAR });
    const newBA = proposalsFromCoproCorpus({ corpus: DECOMPTE_BA, documentId: "copro-new", fiscalYear: YEAR });

    const communesAB = newAB.find((p) => p.description.includes("CHARGES COMMUNES"));
    const communesBA = newBA.find((p) => p.description.includes("CHARGES COMMUNES"));
    const batimentAB = newAB.find((p) => p.description.includes("CHARGES BATIMENT"));
    const batimentBA = newBA.find((p) => p.description.includes("CHARGES BATIMENT"));
    assert.ok(communesAB && communesBA && batimentAB && batimentBA);

    assert.equal(communesAB!.id, communesBA!.id, "même ligne économique → même id, quel que soit l'ordre");
    assert.equal(batimentAB!.id, batimentBA!.id, "même ligne économique → même id, quel que soit l'ordre");
    assert.notEqual(communesAB!.id, batimentAB!.id, "deux lignes économiquement différentes gardent des id différents");
    assert.doesNotMatch(communesAB!.id, /:copro:\d+$/, "n'utilise plus l'index de position");
  });

  it("SYNDIC COLLISION — deux lignes distinctes (même montant, libellé différent) restent deux propositions distinctes", () => {
    const proposals = proposalsFromCoproCorpus({
      corpus: DECOMPTE_SAME_AMOUNT_DIFFERENT_LABEL,
      documentId: "copro-collision-ok",
      fiscalYear: YEAR,
    });
    const communes = proposals.find((p) => p.description.includes("CHARGES COMMUNES"));
    const batiment = proposals.find((p) => p.description.includes("CHARGES BATIMENT"));
    assert.ok(communes && batiment);
    assert.equal(communes!.amount, 200);
    assert.equal(batiment!.amount, 200);
    assert.notEqual(communes!.id, batiment!.id, "même montant mais libellés différents → id distincts (discriminant réellement disponible)");
  });

  // --- P1-bis : discriminant d'occurrence pour une VRAIE collision ---------

  it("A. SYNDIC COLLISION — deux lignes STRICTEMENT identiques (même libellé, même montant) obtiennent des ids distincts", () => {
    const proposals = proposalsFromCoproCorpus({
      corpus: DECOMPTE_TRUE_DUPLICATE,
      documentId: "copro-collision-true",
      fiscalYear: YEAR,
    });
    assert.equal(proposals.length, 2, "deux lignes économiquement distinctes (cas produit légitime)");
    const ids = proposals.map((p) => p.id);
    assert.equal(new Set(ids).size, 2, "les deux occurrences ont désormais des ids distincts");
    assert.ok(ids[0]!.endsWith("--occ1"), `id[0] doit porter le suffixe d'occurrence 1 : ${ids[0]}`);
    assert.ok(ids[1]!.endsWith("--occ2"), `id[1] doit porter le suffixe d'occurrence 2 : ${ids[1]}`);
    // Les propositions non colliding (P1, DECOMPTE_SAME_AMOUNT_DIFFERENT_LABEL)
    // ne portent elles jamais de suffixe d'occurrence — non-régression.
    const nonColliding = proposalsFromCoproCorpus({
      corpus: DECOMPTE_SAME_AMOUNT_DIFFERENT_LABEL,
      documentId: "copro-collision-ok-2",
      fiscalYear: YEAR,
    });
    assert.ok(nonColliding.every((p) => !p.id.includes("--occ")), "clés non colliding : comportement P1 inchangé");
  });

  it("B. SYNDIC COLLISION — décisions indépendantes entre les deux occurrences", () => {
    const proposals = proposalsFromCoproCorpus({
      corpus: DECOMPTE_TRUE_DUPLICATE,
      documentId: "copro-collision-indep",
      fiscalYear: YEAR,
    });
    const [occ1, occ2] = proposals;
    assert.ok(occ1 && occ2 && occ1.id !== occ2.id);

    // Confirmer occ1 seul → occ2 reste pending.
    let decided = decide(proposals, { [occ1!.id]: { decision: "confirmed" } });
    assert.equal(decided.find((p) => p.id === occ1!.id)!.decision, "confirmed");
    assert.equal(decided.find((p) => p.id === occ2!.id)!.decision, "pending");

    // Corriger occ1 → occ2 garde son montant original (200).
    decided = decide(proposals, { [occ1!.id]: { decision: "modified", amount: 260 } });
    assert.equal(decided.find((p) => p.id === occ1!.id)!.modifiedAmount, 260);
    assert.equal(decided.find((p) => p.id === occ2!.id)!.amount, 200);
    assert.equal(decided.find((p) => p.id === occ2!.id)!.decision, "pending", "occ2 non affectée par la correction d'occ1");

    // Ignorer occ2 → occ1 non modifiée.
    decided = decide(proposals, {
      [occ1!.id]: { decision: "confirmed" },
      [occ2!.id]: { decision: "ignored" },
    });
    assert.equal(decided.find((p) => p.id === occ1!.id)!.decision, "confirmed");
    assert.equal(decided.find((p) => p.id === occ1!.id)!.amount, 200, "occ1 jamais touchée par la décision sur occ2");
    assert.equal(decided.find((p) => p.id === occ2!.id)!.decision, "ignored");
  });

  it("C. SYNDIC COLLISION — reload (sérialisation/reload) : mêmes ids, décisions toujours attachées à la bonne occurrence", () => {
    const proposals = proposalsFromCoproCorpus({
      corpus: DECOMPTE_TRUE_DUPLICATE,
      documentId: "copro-collision-reload",
      fiscalYear: YEAR,
    });
    const [occ1, occ2] = proposals;
    const decided = decide(proposals, {
      [occ1!.id]: { decision: "confirmed" },
      [occ2!.id]: { decision: "modified", amount: 210 },
    });
    const reloaded: ChargeProposal[] = JSON.parse(JSON.stringify(decided));
    assert.deepEqual(reloaded, decided, "round-trip de sérialisation strictement identique");
    assert.notEqual(reloaded[0]!.id, reloaded[1]!.id, "toujours deux occurrences indépendamment adressables après reload");
    assert.equal(reloaded.find((p) => p.id === occ1!.id)!.decision, "confirmed");
    assert.equal(reloaded.find((p) => p.id === occ2!.id)!.modifiedAmount, 210);
  });

  it("D. SYNDIC COLLISION REORDER — même paire d'occurrences, mêmes ids, quand une AUTRE ligne se déplace autour d'elles", () => {
    const proposals1 = proposalsFromCoproCorpus({
      corpus: DECOMPTE_COLLISION_REORDER_1,
      documentId: "copro-coll-reorder",
      fiscalYear: YEAR,
    });
    const proposals2 = proposalsFromCoproCorpus({
      corpus: DECOMPTE_COLLISION_REORDER_2,
      documentId: "copro-coll-reorder",
      fiscalYear: YEAR,
    });
    const communesIds1 = proposals1
      .filter((p) => p.description.includes("CHARGES COMMUNES"))
      .map((p) => p.id)
      .sort();
    const communesIds2 = proposals2
      .filter((p) => p.description.includes("CHARGES COMMUNES"))
      .map((p) => p.id)
      .sort();
    assert.equal(communesIds1.length, 2);
    assert.deepEqual(
      communesIds1,
      communesIds2,
      "l'ordre relatif des deux occurrences colliding est inchangé malgré le déplacement de CHARGES BATIMENT autour d'elles",
    );
    const batimentId1 = proposals1.find((p) => p.description.includes("CHARGES BATIMENT"))!.id;
    const batimentId2 = proposals2.find((p) => p.description.includes("CHARGES BATIMENT"))!.id;
    assert.equal(batimentId1, batimentId2, "ligne non colliding : id stable également (comportement P1 déjà validé)");
  });

  it("E. SYNDIC COLLISION COMMIT — les deux occurrences confirmées puis commit : aucune collision Charge Registry, deux charges distinctes", () => {
    const initial = createInitialF012State().collected;
    const proposals = proposalsFromCoproCorpus({
      corpus: DECOMPTE_TRUE_DUPLICATE,
      documentId: "copro-collision-commit",
      fiscalYear: YEAR,
    });
    const decided = decide(
      proposals,
      Object.fromEntries(proposals.map((p) => [p.id, { decision: "confirmed" as const }])),
    );
    const collected = commitSyndicReview(initial, decided, "copro-collision-commit");
    const expenses = collected.documentExpenses ?? [];
    assert.equal(expenses.length, 2, "deux Expenses distinctes persistées");
    assert.equal(new Set(expenses.map((e) => e.id)).size, 2, "aucune collision d'id d'Expense");

    // Le Charge Registry ne doit jamais lever ChargeRegistryCollisionError
    // pour ce cas — la projection fiscale doit refléter les DEUX charges.
    const registry = collectedToChargeRegistry({
      collected,
      categoryInventory: ["syndic"],
      fieldSources: {},
      exercise: YEAR,
    });
    const syndicCharges = registry.charges.filter((c) => c.familyId === "syndic");
    assert.equal(syndicCharges.length, 2, "deux Charges syndic distinctes, jamais fusionnées");
    const total = syndicCharges.reduce((sum, c) => sum + c.amount, 0);
    assert.equal(total, 400, "200 + 200, aucune perte ni fusion silencieuse");
  });

  it("F. SYNDIC COLLISION RECOMMIT — recommit du même document (même corpus) : idempotent, pas de duplication, pas de collision", () => {
    const initial = createInitialF012State().collected;
    const proposals1 = proposalsFromCoproCorpus({
      corpus: DECOMPTE_TRUE_DUPLICATE,
      documentId: "copro-collision-recommit",
      fiscalYear: YEAR,
    });
    const decided1 = decide(
      proposals1,
      Object.fromEntries(proposals1.map((p) => [p.id, { decision: "confirmed" as const }])),
    );
    const collectedPass1 = commitSyndicReview(initial, decided1, "copro-collision-recommit");
    const first = [...(collectedPass1.documentExpenses ?? [])].sort((a, b) => a.id.localeCompare(b.id));
    assert.equal(first.length, 2);

    const proposals2 = proposalsFromCoproCorpus({
      corpus: DECOMPTE_TRUE_DUPLICATE,
      documentId: "copro-collision-recommit",
      fiscalYear: YEAR,
    });
    const decided2 = decide(
      proposals2,
      Object.fromEntries(proposals2.map((p) => [p.id, { decision: "confirmed" as const }])),
    );
    const collectedPass2 = commitSyndicReview(collectedPass1, decided2, "copro-collision-recommit");
    const second = [...(collectedPass2.documentExpenses ?? [])].sort((a, b) => a.id.localeCompare(b.id));

    assert.equal(second.length, 2, "recommit identique n'ajoute aucune Expense supplémentaire");
    assert.deepEqual(second.map((e) => e.id), first.map((e) => e.id));
    assert.deepEqual(second.map((e) => e.montant), first.map((e) => e.montant));

    const registry = collectedToChargeRegistry({
      collected: collectedPass2,
      categoryInventory: ["syndic"],
      fieldSources: {},
      exercise: YEAR,
    });
    assert.equal(registry.charges.filter((c) => c.familyId === "syndic").length, 2, "recommit sans collision");
  });

  it("SYNDIC REORDER — recommit du même document en ordre inversé : mêmes Expense ids, pas d'orpheline, pas de doublon, même total", () => {
    const initial = createInitialF012State().collected;

    // Passe 1 — ordre A, B, toutes lignes confirmées telles quelles.
    const proposalsAB = proposalsFromCoproCorpus({ corpus: DECOMPTE_AB, documentId: "copro-reorder", fiscalYear: YEAR });
    const decidedAB = decide(
      proposalsAB,
      Object.fromEntries(proposalsAB.map((p) => [p.id, { decision: "confirmed" as const }])),
    );
    const collectedPass1 = commitSyndicReview(initial, decidedAB, "copro-reorder");
    const expensesPass1 = [...(collectedPass1.documentExpenses ?? [])];
    assert.equal(expensesPass1.length, 2);
    const idsPass1 = new Set(expensesPass1.map((e) => e.id));
    const totalPass1 = chargeTotalFor({
      collected: collectedPass1,
      categoryInventory: ["syndic"],
      fieldSources: {},
    }).charges.totalDeductible;
    assert.equal(totalPass1, 245.6 + 128.4);

    // Passe 2 — même documentId, ordre inversé (réordonnancement OCR entre
    // deux passes du même document), toutes lignes reconfirmées.
    const proposalsBA = proposalsFromCoproCorpus({ corpus: DECOMPTE_BA, documentId: "copro-reorder", fiscalYear: YEAR });
    const decidedBA = decide(
      proposalsBA,
      Object.fromEntries(proposalsBA.map((p) => [p.id, { decision: "confirmed" as const }])),
    );
    const collectedPass2 = commitSyndicReview(collectedPass1, decidedBA, "copro-reorder");
    const expensesPass2 = [...(collectedPass2.documentExpenses ?? [])];

    assert.equal(expensesPass2.length, 2, "pas de doublon après recommit en ordre inversé");
    const idsPass2 = new Set(expensesPass2.map((e) => e.id));
    assert.deepEqual(idsPass2, idsPass1, "mêmes Expense ids après reorder — aucune orpheline");
    const totalPass2 = chargeTotalFor({
      collected: collectedPass2,
      categoryInventory: ["syndic"],
      fieldSources: {},
    }).charges.totalDeductible;
    assert.equal(totalPass2, totalPass1, "même total fiscal après reorder");
  });

  it("SYNDIC CORRECTION REORDER — une correction appliquée par contenu (pas par position) ne migre jamais vers la mauvaise ligne", () => {
    const initial = createInitialF012State().collected;

    // Passe 1 (ordre A, B) — A corrigée à 260, B confirmée telle quelle.
    const proposalsAB = proposalsFromCoproCorpus({ corpus: DECOMPTE_AB, documentId: "copro-corr-reorder", fiscalYear: YEAR });
    const lineA1 = proposalsAB.find((p) => p.description.includes("CHARGES COMMUNES"))!;
    const lineB1 = proposalsAB.find((p) => p.description.includes("CHARGES BATIMENT"))!;
    const decidedAB = decide(proposalsAB, {
      [lineA1.id]: { decision: "modified", amount: 260 },
      [lineB1.id]: { decision: "confirmed" },
    });
    const collectedPass1 = commitSyndicReview(initial, decidedAB, "copro-corr-reorder");
    const expenseAId = collectedPass1.documentExpenses!.find((e) => e.montant === 260)!.id;
    const expenseBId = collectedPass1.documentExpenses!.find((e) => e.montant === 128.4)!.id;
    assert.notEqual(expenseAId, expenseBId);

    // Passe 2 (ordre B, A inversé) — cette fois B corrigée à 130, A
    // simplement confirmée. On sélectionne les propositions PAR CONTENU
    // (comme le fait réellement `DocumentReviewForm`, jamais par position).
    const proposalsBA = proposalsFromCoproCorpus({ corpus: DECOMPTE_BA, documentId: "copro-corr-reorder", fiscalYear: YEAR });
    const lineA2 = proposalsBA.find((p) => p.description.includes("CHARGES COMMUNES"))!;
    const lineB2 = proposalsBA.find((p) => p.description.includes("CHARGES BATIMENT"))!;
    // Même id de PROPOSITION (`ChargeProposal.id`) entre les deux passes —
    // la clé dérive du contenu (label+amount), pas de la position.
    assert.equal(lineA2.id, lineA1.id, "id de proposition de la ligne A stable entre les deux passes malgré le reorder");
    assert.equal(lineB2.id, lineB1.id, "id de proposition de la ligne B stable entre les deux passes malgré le reorder");
    // ... et donc le même id d'Expense persistée (dérivé du même itemKey).
    assert.ok(lineA2.id.endsWith(expenseAId.replace(/^expense-doc-copro-corr-reorder-/, "")));
    assert.ok(lineB2.id.endsWith(expenseBId.replace(/^expense-doc-copro-corr-reorder-/, "")));
    const decidedBA = decide(proposalsBA, {
      [lineA2.id]: { decision: "confirmed" },
      [lineB2.id]: { decision: "modified", amount: 130 },
    });
    const collectedPass2 = commitSyndicReview(collectedPass1, decidedBA, "copro-corr-reorder");

    const finalExpenses = collectedPass2.documentExpenses!;
    assert.equal(finalExpenses.length, 2, "toujours deux Expenses, pas de doublon silencieux");
    const finalA = finalExpenses.find((e) => e.id === expenseAId)!;
    const finalB = finalExpenses.find((e) => e.id === expenseBId)!;
    assert.equal(finalA.montant, 245.6, "la ligne A (confirmée telle quelle en passe 2) n'a jamais hérité de la correction de B");
    assert.equal(finalB.montant, 130, "la correction de B est bien rattachée à l'Expense de B, jamais à celle de A");
  });

  it("SYNDIC RECOMMIT — recommit du même document, même ordre : idempotent, pas de doublon ni de drift", () => {
    const initial = createInitialF012State().collected;
    const proposals1 = proposalsFromCoproCorpus({ corpus: DECOMPTE_AB, documentId: "copro-recommit", fiscalYear: YEAR });
    const decided1 = decide(
      proposals1,
      Object.fromEntries(proposals1.map((p) => [p.id, { decision: "confirmed" as const }])),
    );
    const collectedPass1 = commitSyndicReview(initial, decided1, "copro-recommit");
    const first = [...(collectedPass1.documentExpenses ?? [])].sort((a, b) => a.id.localeCompare(b.id));

    const proposals2 = proposalsFromCoproCorpus({ corpus: DECOMPTE_AB, documentId: "copro-recommit", fiscalYear: YEAR });
    const decided2 = decide(
      proposals2,
      Object.fromEntries(proposals2.map((p) => [p.id, { decision: "confirmed" as const }])),
    );
    const collectedPass2 = commitSyndicReview(collectedPass1, decided2, "copro-recommit");
    const second = [...(collectedPass2.documentExpenses ?? [])].sort((a, b) => a.id.localeCompare(b.id));

    assert.equal(second.length, first.length, "recommit identique n'ajoute aucune Expense supplémentaire");
    assert.deepEqual(second.map((e) => e.id), first.map((e) => e.id));
    assert.deepEqual(second.map((e) => e.montant), first.map((e) => e.montant));
  });

  it("SYNDIC REMOVE DOCUMENT — après le changement d'identité, REMOVE_DOCUMENT invalide toujours toutes les Expenses du document, aucune réactivation au reload", async () => {
    const { assistant, turn: start } = await startSyndic();
    const proposals = proposalsFromCoproCorpus({ corpus: DECOMPTE_AB, documentId: "copro-remove", fiscalYear: YEAR });
    let turn = await assistant.handle(start.state, {
      type: "receive_document_proposals",
      documentId: "copro-remove",
      familyId: "syndic",
      proposals,
    });
    for (const proposal of turn.state.documentReview?.proposals ?? []) {
      turn = await assistant.handle(turn.state, { type: "confirm_proposal", proposalId: proposal.id });
    }
    turn = await assistant.handle(turn.state, { type: "commit_document_review" });
    assert.equal(turn.state.collected.documentExpenses?.length, 2);
    assert.ok(turn.state.collected.documentExpenses!.every((e) => isExpenseRecordable(e)));
    const totalBefore = chargeTotalFor(turn.state).charges.totalDeductible;
    assert.equal(totalBefore, 245.6 + 128.4);

    // Même mécanisme que le reducer store (`REMOVE_DOCUMENT`,
    // src/lib/lmnp/store/reducer.ts) : `invalidateExpensesForDocument`,
    // seul point d'invalidation partagé — jamais une seconde règle ici.
    const invalidatedExpenses = invalidateExpensesForDocument(turn.state.collected.documentExpenses ?? [], "copro-remove");
    const afterRemoval: F012State = {
      ...turn.state,
      collected: { ...turn.state.collected, documentExpenses: invalidatedExpenses },
    };
    assert.ok(afterRemoval.collected.documentExpenses!.every((e) => !isExpenseRecordable(e)), "toutes non recordable");
    const totalAfterRemoval = chargeTotalFor(afterRemoval).charges.totalDeductible;
    assert.equal(totalAfterRemoval, 0, "aucune Charge après suppression du document — total fiscal diminué");

    // Reload : le state invalidé persiste tel quel, aucune réactivation.
    const persisted = { ...afterRemoval, history: [] };
    const totalAfterReload = chargeTotalFor(persisted).charges.totalDeductible;
    assert.equal(totalAfterReload, 0, "reload sans réactivation : toujours aucune Charge");
  });

  it("SYNDIC COLLISION END-TO-END — parcours réel F012ChargesAssistant : réception, décisions indépendantes, commit, sans crash", async () => {
    const { assistant, turn: start } = await startSyndic();
    const proposals = proposalsFromCoproCorpus({
      corpus: DECOMPTE_TRUE_DUPLICATE,
      documentId: "copro-collision-e2e",
      fiscalYear: YEAR,
    });
    let turn = await assistant.handle(start.state, {
      type: "receive_document_proposals",
      documentId: "copro-collision-e2e",
      familyId: "syndic",
      proposals,
    });
    const [occ1, occ2] = turn.state.documentReview!.proposals;
    assert.ok(occ1 && occ2 && occ1.id !== occ2.id, "les deux occurrences restent individuellement adressables dans l'état réel de l'assistant");

    // Décisions indépendantes via le VRAI chemin `confirm_proposal`/`modify_proposal`
    // (`decideProposal`, apply-document-review.ts — matche par id).
    turn = await assistant.handle(turn.state, { type: "confirm_proposal", proposalId: occ1.id });
    turn = await assistant.handle(turn.state, { type: "modify_proposal", proposalId: occ2.id, amount: 210 });
    const decidedOcc1 = turn.state.documentReview!.proposals.find((p) => p.id === occ1.id)!;
    const decidedOcc2 = turn.state.documentReview!.proposals.find((p) => p.id === occ2.id)!;
    assert.equal(decidedOcc1.decision, "confirmed");
    assert.equal(decidedOcc1.amount, 200, "occ1 non affectée par la correction d'occ2");
    assert.equal(decidedOcc2.decision, "modified");
    assert.equal(decidedOcc2.modifiedAmount, 210);

    turn = await assistant.handle(turn.state, { type: "commit_document_review" });
    assert.equal(turn.state.collected.documentExpenses?.length, 2, "commit sans crash, deux Expenses distinctes");
    assert.equal(
      new Set(turn.state.collected.documentExpenses!.map((e) => e.id)).size,
      2,
      "aucune collision d'id au commit",
    );
    const totalAfterCommit = chargeTotalFor(turn.state).charges.totalDeductible;
    assert.equal(totalAfterCommit, 200 + 210, "les deux montants (dont la correction) sont bien pris en compte");
  });
});

describe("P1-bis durcissement défensif — collision résiduelle jamais un crash brut", () => {
  /** Construit une Expense directement (bypass du pipeline syndic) pour forcer une collision résiduelle artificielle. */
  function collidingExpensePair(id: string): [Expense, Expense] {
    const base: Omit<Expense, "id" | "description"> = {
      exerciceFiscal: YEAR,
      montant: 200,
      origin: "document",
      documentId: "copro-forced-collision",
      fieldSources: { montant: "extracted" },
      category: "copropriete",
      decision: "confirmed",
      coproType: "provisions",
    };
    return [
      { ...base, id, description: "Ligne A" },
      { ...base, id, description: "Ligne B" },
    ];
  }

  it("collectedToChargeRegistry lève une ChargeRegistryCollisionError NOMMÉE (jamais une Error générique, jamais silencieuse)", () => {
    const initial = createInitialF012State().collected;
    const [expenseA, expenseB] = collidingExpensePair("expense-doc-copro-forced-collision-forced-dup");
    const collected: F012CollectedData = {
      ...initial,
      documentExpenses: [expenseA, expenseB],
    };
    assert.throws(
      () =>
        collectedToChargeRegistry({
          collected,
          categoryInventory: ["syndic"],
          fieldSources: {},
          exercise: YEAR,
        }),
      (error: unknown) => {
        assert.ok(error instanceof ChargeRegistryCollisionError, "doit être une ChargeRegistryCollisionError distinguable par instanceof");
        assert.ok(
          (error as ChargeRegistryCollisionError).collidingIds.includes("expense-doc-copro-forced-collision-forced-dup"),
          "l'id en collision doit être diagnosticable dans l'erreur",
        );
        return true;
      },
    );
  });

  it("F012ChargesAssistant.handle() catche la collision résiduelle : jamais un throw non catché jusqu'à l'utilisateur", async () => {
    const { assistant, turn: start } = await startSyndic();
    const [expenseA, expenseB] = collidingExpensePair("expense-doc-copro-forced-collision-handle-dup");
    const seededState: F012State = {
      ...start.state,
      collected: {
        ...start.state.collected,
        documentExpenses: [expenseA, expenseB],
      },
    };

    // `none_family` déclenche `advancePastCurrentFamily` → `collectedToChargeRegistry`
    // (assistant.ts) — c'est le chemin réel qui remontait jusqu'ici avant durcissement.
    const turn = await assistant.handle(seededState, { type: "none_family" });

    assert.equal(turn.state, seededState, "aucune donnée modifiée : l'état renvoyé est celui reçu, inchangé");
    assert.equal(turn.completed, false);
    assert.ok(
      turn.messages.some((m) => /incohérence|collision/i.test(m.content)),
      "un message utilisateur clair et diagnosticable remplace le crash brut",
    );
  });
});
