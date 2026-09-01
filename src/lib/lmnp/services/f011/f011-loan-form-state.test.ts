import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { DEFAULT_LOAN_FORM_VALUES, resolveLoanFormAction, type LoanIdentity } from "./f011-loan-form-state";

/**
 * Correctif Cycle 10 — ces tests couvrent uniquement la décision pure
 * d'affichage du formulaire (le bug rapporté : le Prêt 2 réaffichait les
 * valeurs du Prêt 1, puis un edge case où changer le nombre de prêts après
 * un retour en arrière réaffichait une tentative abandonnée). Le composant
 * `F011FinancementAssistantPanel` lui-même n'a pas d'infrastructure de test
 * React dans ce projet (pas de `@testing-library/react` ni de DOM simulé
 * dans les `devDependencies` — seul `node:test` est disponible) : impossible
 * de monter le composant et de vérifier le rendu réel des `<input>`.
 * `resolveLoanFormAction` est donc conçue pour porter toute la logique de
 * décision hors React, dans le plus petit périmètre testable ; le câblage
 * React restant dans le panel (`applyLoanFormAction`) est un simple relais
 * sans branchement propre — vérifié uniquement par lecture de code et par le
 * QA navigateur manuel.
 *
 * E/F (aucun impact sur `pendingLoan`/`fieldSources`) : par construction,
 * cette fonction ne reçoit jamais `fieldSources` et ne fait que lire
 * `pendingLoan` sans jamais le modifier — voir aussi les tests d'isolation
 * multi-prêts déjà existants au niveau runtime (assistant-cycle6.test.ts
 * "U", assistant-cycle9.test.ts "M"), inchangés par ce correctif.
 */

const LOAN_1_VALUES = {
  capitalInitial: 100000,
  tauxNominal: 0.03,
  dureeMois: 120,
  datePremiereMensualite: "2024-01-15",
};

function identity(loanIndex: number, generation = 0): LoanIdentity {
  return { loanIndex, generation };
}

describe("F-011 — correctif formulaire prêt (resolveLoanFormAction)", () => {
  it("A — nouveau prêt vide après un prêt précédent : réinitialise aux valeurs de départ", () => {
    const decision = resolveLoanFormAction(undefined, identity(1), identity(0));
    assert.equal(decision.kind, "reset");
    assert.deepEqual((decision as { values: unknown }).values, DEFAULT_LOAN_FORM_VALUES);
  });

  it("A bis — nouveau prêt vide ({} sans capitalInitial) : même résultat qu'undefined", () => {
    const decision = resolveLoanFormAction({}, identity(1), identity(0));
    assert.equal(decision.kind, "reset");
  });

  it("B — aucune valeur du prêt précédent ne survit dans le résultat de réinitialisation", () => {
    const decision = resolveLoanFormAction(undefined, identity(1), identity(0));
    assert.equal(decision.kind, "reset");
    const values = (decision as { values: typeof DEFAULT_LOAN_FORM_VALUES }).values;
    assert.notEqual(values.capital, String(LOAN_1_VALUES.capitalInitial));
    assert.notEqual(values.rate, String(LOAN_1_VALUES.tauxNominal * 100));
    assert.notEqual(values.duration, String(LOAN_1_VALUES.dureeMois));
    assert.notEqual(values.firstPayment, LOAN_1_VALUES.datePremiereMensualite);
  });

  it("C — edit_loan (prêt déjà connu) : préremplit depuis les valeurs réelles, quelle que soit l'identité", () => {
    const sameIdentity = resolveLoanFormAction(LOAN_1_VALUES, identity(1), identity(1));
    const differentIdentity = resolveLoanFormAction(LOAN_1_VALUES, identity(1, 2), identity(0, 0));
    for (const decision of [sameIdentity, differentIdentity]) {
      assert.equal(decision.kind, "seed");
      assert.deepEqual((decision as { values: typeof DEFAULT_LOAN_FORM_VALUES }).values, {
        capital: "100000",
        rate: "3",
        duration: "120",
        firstPayment: "2024-01-15",
      });
    }
  });

  it("C bis — préremplissage partiel (document partiel) : champs manquants en chaîne vide, jamais inventés", () => {
    const decision = resolveLoanFormAction({ capitalInitial: 90000 }, identity(0), identity(0));
    assert.equal(decision.kind, "seed");
    assert.deepEqual((decision as { values: typeof DEFAULT_LOAN_FORM_VALUES }).values, {
      capital: "90000",
      rate: "0",
      duration: "",
      firstPayment: "",
    });
  });

  it("D — go_back puis retour sur le même prêt (pas encore soumis) : conserve, ne réinitialise jamais", () => {
    const decision = resolveLoanFormAction(undefined, identity(1), identity(1));
    assert.equal(decision.kind, "keep");
  });

  it("H — reprise après refresh sur un prêt vide déjà en cours : équivalent à 'garder' (cohérent avec le fallback de montage)", () => {
    // Au montage, l'état initial du formulaire est déjà calculé par les
    // `useState` du panel (inchangés par ce correctif) ; la ref de suivi est
    // initialisée sur l'identité du prêt repris, donc un premier retour
    // GO_BACK sur ce même prêt ne doit pas réinitialiser ce qui a déjà été
    // résolu au montage.
    const resumed = identity(0, 3);
    const decision = resolveLoanFormAction(undefined, resumed, resumed);
    assert.equal(decision.kind, "keep");
  });

  it("ne modifie jamais l'objet pendingLoan reçu (aucun effet de bord)", () => {
    const pending = { ...LOAN_1_VALUES };
    const frozen = Object.freeze({ ...pending });
    assert.doesNotThrow(() => resolveLoanFormAction(frozen, identity(0), identity(0)));
    assert.deepEqual(frozen, pending, "l'entrée n'est jamais mutée");
  });

  describe("I — même index de prêt, génération différente (changement du nombre de prêts)", () => {
    it("index identique mais génération différente : jamais 'keep', toujours réinitialisé", () => {
      // C'est exactement le bug rapporté : `set_nombre_prets` remet
      // `currentLoanIndex` à 0, donc un retour en arrière jusqu'à "Combien
      // de prêts" suivi d'un nouveau choix retombe sur le même index (0)
      // qu'une tentative de prêt 1 déjà abandonnée. Sans la génération, la
      // fonction répondrait à tort "keep".
      const decision = resolveLoanFormAction(undefined, identity(0, 1), identity(0, 0));
      assert.equal(decision.kind, "reset");
    });

    it("index ET génération identiques : conserve (vrai retour sur le même prêt)", () => {
      const decision = resolveLoanFormAction(undefined, identity(0, 1), identity(0, 1));
      assert.equal(decision.kind, "keep");
    });

    it("génération identique mais index différent (prêt suivant) : réinitialise", () => {
      const decision = resolveLoanFormAction(undefined, identity(1, 0), identity(0, 0));
      assert.equal(decision.kind, "reset");
    });
  });
});
