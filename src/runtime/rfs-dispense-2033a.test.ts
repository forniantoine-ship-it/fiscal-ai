/**
 * Dispense de bilan 2033-A (CGI, art. 302 septies A bis, VI) — module pur
 * `capabilities/rfs/dispense-2033a.ts`, source unique de la règle de seuil,
 * de la résolution du chiffre d'affaires de référence N-1 et de la
 * condition "dispense en effet" partagée par le client et le serveur.
 *
 * Run: npx tsx --test src/runtime/rfs-dispense-2033a.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  isDispense2033AEnEffet,
  resolveCaReferenceN1Fact,
  resolveDispense2033AEligibilite,
  resolveSeuilDispense2033A,
} from "./capabilities/rfs/dispense-2033a";

describe("resolveSeuilDispense2033A — versionnement du seuil par triennium", () => {
  it("2023-2025 → 61 000 € HT", () => {
    assert.equal(resolveSeuilDispense2033A(2024)?.seuilAutresEntreprisesHT, 61_000);
    assert.equal(resolveSeuilDispense2033A(2024)?.triennium, "2023-2025");
  });

  it("Case M — 2026-2028 → 66 000 € HT", () => {
    assert.equal(resolveSeuilDispense2033A(2026)?.seuilAutresEntreprisesHT, 66_000);
    assert.equal(resolveSeuilDispense2033A(2027)?.seuilAutresEntreprisesHT, 66_000);
    assert.equal(resolveSeuilDispense2033A(2028)?.seuilAutresEntreprisesHT, 66_000);
  });

  it("Case N — exercice hors triennium connu (2029) → undefined, jamais une réutilisation silencieuse de 66 000", () => {
    assert.equal(resolveSeuilDispense2033A(2029), undefined);
  });
});

describe("resolveCaReferenceN1Fact — correction audit contradictoire : AUCUNE dérivation automatique", () => {
  it("aucune déclaration → INCONNU, jamais 0 par défaut, jamais une dérivation depuis une autre donnée", () => {
    const fact = resolveCaReferenceN1Fact({});
    assert.equal(fact.status, "INCONNU");
  });

  it("valeur déclarée valide → DECLARE, transportée telle quelle", () => {
    const fact = resolveCaReferenceN1Fact({ caReferenceN1Declaree: 50_000 });
    assert.deepEqual(fact, { status: "DECLARE", montant: 50_000 });
  });

  it("Régression contre-exemple audit — aucun paramètre dateMiseEnService n'existe dans la signature : ce module ne peut plus dériver quoi que ce soit d'une date de mise en service de bien", () => {
    // Un exploitant ayant déjà une activité LMNP (autre bien, bien remplacé
    // en cours d'année) aurait `dateMiseEnService` dans l'exercice courant
    // pour CE bien tout en ayant un chiffre d'affaires N-1 réel non nul —
    // la dérivation automatique aurait accepté ceci comme paramètre : elle
    // n'existe plus du tout. Ce test documente cette absence, pas seulement
    // son comportement pour une valeur particulière.
    const fact = resolveCaReferenceN1Fact({} as { caReferenceN1Declaree?: number });
    assert.equal(fact.status, "INCONNU");
    assert.doesNotMatch(fact.status === "INCONNU" ? fact.raison : "", /mise en service|dateMiseEnService/i);
  });

  it("Zéro € HT → valeur valide, DECLARE, jamais rejeté", () => {
    const fact = resolveCaReferenceN1Fact({ caReferenceN1Declaree: 0 });
    assert.deepEqual(fact, { status: "DECLARE", montant: 0 });
  });

  it("CA = -1 → INCONNU, jamais DECLARE ni un bypass vers ELIGIBLE", () => {
    const fact = resolveCaReferenceN1Fact({ caReferenceN1Declaree: -1 });
    assert.equal(fact.status, "INCONNU");
  });

  it("CA = NaN → INCONNU, jamais DECLARE", () => {
    const fact = resolveCaReferenceN1Fact({ caReferenceN1Declaree: NaN });
    assert.equal(fact.status, "INCONNU");
  });

  it("CA = Infinity → INCONNU, jamais DECLARE", () => {
    const fact = resolveCaReferenceN1Fact({ caReferenceN1Declaree: Infinity });
    assert.equal(fact.status, "INCONNU");
  });

  it("CA = -Infinity → INCONNU, jamais DECLARE", () => {
    const fact = resolveCaReferenceN1Fact({ caReferenceN1Declaree: -Infinity });
    assert.equal(fact.status, "INCONNU");
  });

  it("raison d'une valeur invalide ne contient jamais 'NaN' ni une valeur brute affichée telle quelle", () => {
    const fact = resolveCaReferenceN1Fact({ caReferenceN1Declaree: NaN });
    assert.equal(fact.status, "INCONNU");
    if (fact.status === "INCONNU") {
      assert.doesNotMatch(fact.raison, /NaN|Infinity/);
    }
  });
});

describe("resolveDispense2033AEligibilite — cases A/B/C/D du plan de test", () => {
  it("CA = 0 € → valide, ELIGIBLE", () => {
    const eligibilite = resolveDispense2033AEligibilite({
      exercice: 2026,
      caReferenceN1: resolveCaReferenceN1Fact({ caReferenceN1Declaree: 0 }),
    });
    assert.equal(eligibilite.etat, "ELIGIBLE");
    assert.equal(eligibilite.etat === "ELIGIBLE" ? eligibilite.caReferenceN1 : undefined, 0);
  });

  it("CA invalide (négatif/NaN/Infinity) → UNKNOWN de bout en bout, jamais ELIGIBLE ni NOT_ELIGIBLE", () => {
    for (const invalide of [-1, NaN, Infinity, -Infinity]) {
      const eligibilite = resolveDispense2033AEligibilite({
        exercice: 2026,
        caReferenceN1: resolveCaReferenceN1Fact({ caReferenceN1Declaree: invalide }),
      });
      assert.equal(eligibilite.etat, "UNKNOWN", `CA=${invalide} doit rester UNKNOWN`);
    }
  });

  it("Case A — 65 999 € (< seuil 2026-2028) → ELIGIBLE", () => {
    const eligibilite = resolveDispense2033AEligibilite({
      exercice: 2026,
      caReferenceN1: { status: "DECLARE", montant: 65_999 },
    });
    assert.equal(eligibilite.etat, "ELIGIBLE");
  });

  it("Case B — 66 000 € (= seuil, inclusif) → ELIGIBLE", () => {
    const eligibilite = resolveDispense2033AEligibilite({
      exercice: 2026,
      caReferenceN1: { status: "DECLARE", montant: 66_000 },
    });
    assert.equal(eligibilite.etat, "ELIGIBLE");
  });

  it("Case C — 66 001 € (> seuil) → NOT_ELIGIBLE", () => {
    const eligibilite = resolveDispense2033AEligibilite({
      exercice: 2026,
      caReferenceN1: { status: "DECLARE", montant: 66_001 },
    });
    assert.equal(eligibilite.etat, "NOT_ELIGIBLE");
  });

  it("Case D — N-1 INCONNU → UNKNOWN, jamais un bypass ni une valeur par défaut", () => {
    const eligibilite = resolveDispense2033AEligibilite({
      exercice: 2026,
      caReferenceN1: { status: "INCONNU", raison: "test" },
    });
    assert.equal(eligibilite.etat, "UNKNOWN");
  });

  it("Case N (via éligibilité) — exercice hors triennium connu → UNKNOWN, jamais 66 000 réutilisé silencieusement", () => {
    const eligibilite = resolveDispense2033AEligibilite({
      exercice: 2029,
      caReferenceN1: { status: "DECLARE", montant: 10_000 },
    });
    assert.equal(eligibilite.etat, "UNKNOWN");
  });
});

describe("isDispense2033AEnEffet — la dispense reste une faculté, jamais une obligation d'omettre le 2033-A", () => {
  it("ELIGIBLE + USE_DISPENSE → dispense en effet", () => {
    assert.equal(
      isDispense2033AEnEffet({
        eligibilite: { etat: "ELIGIBLE", seuil: { triennium: "2026-2028", seuilAutresEntreprisesHT: 66_000, source: "test" }, caReferenceN1: 0, raison: "test" },
        decision: "USE_DISPENSE",
      }),
      true,
    );
  });

  it("Case F — ELIGIBLE + FILE_2033A (le client choisit quand même de déposer) → dispense PAS en effet", () => {
    assert.equal(
      isDispense2033AEnEffet({
        eligibilite: { etat: "ELIGIBLE", seuil: { triennium: "2026-2028", seuilAutresEntreprisesHT: 66_000, source: "test" }, caReferenceN1: 0, raison: "test" },
        decision: "FILE_2033A",
      }),
      false,
    );
  });

  it("ELIGIBLE sans décision encore prise → dispense PAS en effet (jamais un choix silencieux à la place du client)", () => {
    assert.equal(
      isDispense2033AEnEffet({
        eligibilite: { etat: "ELIGIBLE", seuil: { triennium: "2026-2028", seuilAutresEntreprisesHT: 66_000, source: "test" }, caReferenceN1: 0, raison: "test" },
      }),
      false,
    );
  });

  it("Case G — NOT_ELIGIBLE + decision USE_DISPENSE (état incohérent, ne devrait jamais être construit par l'UI) → dispense PAS en effet quand même", () => {
    assert.equal(
      isDispense2033AEnEffet({
        eligibilite: { etat: "NOT_ELIGIBLE", seuil: { triennium: "2026-2028", seuilAutresEntreprisesHT: 66_000, source: "test" }, caReferenceN1: 70_000, raison: "test" },
        decision: "USE_DISPENSE",
      }),
      false,
    );
  });

  it("Case H — UNKNOWN + decision USE_DISPENSE (état incohérent) → dispense PAS en effet, UNKNOWN ne peut jamais être traité comme dispensé", () => {
    assert.equal(
      isDispense2033AEnEffet({
        eligibilite: { etat: "UNKNOWN", raison: "test" },
        decision: "USE_DISPENSE",
      }),
      false,
    );
  });

  it("dispense2033A absent → dispense PAS en effet (non-régression : dossiers/fixtures antérieurs à ce champ)", () => {
    assert.equal(isDispense2033AEnEffet(undefined), false);
  });
});
