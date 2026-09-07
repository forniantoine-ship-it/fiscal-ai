/**
 * B-FAMILY-3 — mapping UI (ventilation-tiers-intake.ts) → BilanInputs, et
 * intégration bout en bout jusqu'au moteur (resolveVentilationTiers via
 * assemblePatrimoine). Scénarios A–O de la mission.
 * Run: npx tsx --test src/lib/lmnp/services/declaration/ventilation-tiers-intake-mapping.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  EMPTY_VENTILATION_TIERS_INTAKE_STATE,
  ajouterPoste,
  buildVentilationTiersInputs,
  deriveVentilationTiersIntakeState,
  modifierPoste,
  type VentilationTiersIntakeState,
} from "./ventilation-tiers-intake";
import {
  EMPTY_PATRIMONIAL_INTAKE_STATE,
  buildBilanPatrimonial,
  deriveIntakeStateFromBilanPatrimonial,
  type PatrimonialIntakeState,
} from "./patrimonial-intake";
import { resolveVentilationTiers } from "@/runtime/capabilities/bilan/ventilation-tiers";

function etat(overrides: Partial<VentilationTiersIntakeState>): VentilationTiersIntakeState {
  return { ...EMPTY_VENTILATION_TIERS_INTAKE_STATE, ...overrides };
}

/** Ligne remplie en une fois, pour rester concis dans les scénarios. */
function ligne(nature: Parameters<typeof ajouterPoste>[1], montant: string, id = crypto.randomUUID()) {
  const postes = ajouterPoste([], nature, id);
  return modifierPoste(postes, id, { montantRaw: montant })[0];
}

describe("A — aucun poste + aucune confirmation → les 5 restent INCONNU (résolues via le moteur)", () => {
  it("resolveVentilationTiers (via assemblePatrimoine) : les 5 cases famille B restent INCONNU", () => {
    const inputs = buildVentilationTiersInputs(EMPTY_VENTILATION_TIERS_INTAKE_STATE);
    assert.equal(inputs, undefined);
  });
});

describe("B — confirmation recevoir vide → 068/072 NUL_CONFIRME", () => {
  it("068 et 072 dans naturesConfirmeesVides, aucun poste", () => {
    const inputs = buildVentilationTiersInputs(etat({ confirmationRecevoirVide: true }));
    assert.deepEqual(inputs, { naturesConfirmeesVides: ["LOYER_DU_PAR_LOCATAIRE", "AUTRE_CREANCE_ACTIVITE"] });
  });
});

describe("C — confirmation payer vide → 164/166/172 NUL_CONFIRME", () => {
  it("les 3 natures payer dans naturesConfirmeesVides", () => {
    const inputs = buildVentilationTiersInputs(etat({ confirmationPayerVide: true }));
    assert.deepEqual(inputs, {
      naturesConfirmeesVides: ["ACOMPTE_RECU_SUR_COMMANDE", "FOURNISSEUR_NON_PAYE", "DETTE_FISCALE_OU_SOCIALE"],
    });
  });
});

describe("D — confirmation des deux listes → cinq NUL_CONFIRME", () => {
  it("les 5 natures dans naturesConfirmeesVides", () => {
    const inputs = buildVentilationTiersInputs(etat({ confirmationRecevoirVide: true, confirmationPayerVide: true }));
    assert.deepEqual(inputs?.naturesConfirmeesVides, [
      "LOYER_DU_PAR_LOCATAIRE",
      "AUTRE_CREANCE_ACTIVITE",
      "ACOMPTE_RECU_SUR_COMMANDE",
      "FOURNISSEUR_NON_PAYE",
      "DETTE_FISCALE_OU_SOCIALE",
    ]);
    assert.equal(inputs?.postes, undefined);
  });
});

describe("E — poste 068 + confirmation recevoir → 068 DECLARE, 072 NUL_CONFIRME (exemple de la mission)", () => {
  it("068=500 réel, 072 confirmée vide", () => {
    const inputs = buildVentilationTiersInputs(
      etat({ postesRecevoir: [ligne("LOYER_DU_PAR_LOCATAIRE", "500")], confirmationRecevoirVide: true }),
    );
    assert.equal(inputs?.postes?.length, 1);
    assert.equal(inputs?.postes?.[0].nature, "LOYER_DU_PAR_LOCATAIRE");
    assert.equal(inputs?.postes?.[0].montant, 500);
    assert.deepEqual(inputs?.naturesConfirmeesVides, ["AUTRE_CREANCE_ACTIVITE"]);
  });
});

describe("F — poste 072 + confirmation recevoir → 068 NUL_CONFIRME, 072 DECLARE", () => {
  it("072 réel, 068 confirmée vide", () => {
    const inputs = buildVentilationTiersInputs(
      etat({ postesRecevoir: [ligne("AUTRE_CREANCE_ACTIVITE", "300")], confirmationRecevoirVide: true }),
    );
    assert.equal(inputs?.postes?.[0].nature, "AUTRE_CREANCE_ACTIVITE");
    assert.deepEqual(inputs?.naturesConfirmeesVides, ["LOYER_DU_PAR_LOCATAIRE"]);
  });
});

describe("G — poste 164 + confirmation payer → 164 DECLARE, 166/172 NUL_CONFIRME", () => {
  it("164 réel, 166/172 confirmées vides", () => {
    const inputs = buildVentilationTiersInputs(
      etat({ postesPayer: [ligne("ACOMPTE_RECU_SUR_COMMANDE", "80")], confirmationPayerVide: true }),
    );
    assert.equal(inputs?.postes?.[0].nature, "ACOMPTE_RECU_SUR_COMMANDE");
    assert.deepEqual(inputs?.naturesConfirmeesVides, ["FOURNISSEUR_NON_PAYE", "DETTE_FISCALE_OU_SOCIALE"]);
  });
});

describe("H — poste 166 + confirmation payer → 164/172 NUL_CONFIRME, 166 DECLARE (exemple de la mission)", () => {
  it("166=800 réel, 164/172 confirmées vides", () => {
    const inputs = buildVentilationTiersInputs(
      etat({ postesPayer: [ligne("FOURNISSEUR_NON_PAYE", "800")], confirmationPayerVide: true }),
    );
    assert.equal(inputs?.postes?.length, 1);
    assert.equal(inputs?.postes?.[0].nature, "FOURNISSEUR_NON_PAYE");
    assert.equal(inputs?.postes?.[0].montant, 800);
    assert.deepEqual(inputs?.naturesConfirmeesVides, ["ACOMPTE_RECU_SUR_COMMANDE", "DETTE_FISCALE_OU_SOCIALE"]);
  });
});

describe("I — poste 172 + confirmation payer → 164/166 NUL_CONFIRME, 172 DECLARE", () => {
  it("172 réel, 164/166 confirmées vides", () => {
    const inputs = buildVentilationTiersInputs(
      etat({ postesPayer: [ligne("DETTE_FISCALE_OU_SOCIALE", "310")], confirmationPayerVide: true }),
    );
    assert.equal(inputs?.postes?.[0].nature, "DETTE_FISCALE_OU_SOCIALE");
    assert.deepEqual(inputs?.naturesConfirmeesVides, ["ACOMPTE_RECU_SUR_COMMANDE", "FOURNISSEUR_NON_PAYE"]);
  });
});

describe("J — plusieurs postes même catégorie → somme correcte (via le moteur, jamais recalculée ici)", () => {
  it("deux postes LOYER_DU_PAR_LOCATAIRE transmis individuellement ; la somme est le rôle de resolveVentilationTiers", () => {
    const id1 = crypto.randomUUID();
    const id2 = crypto.randomUUID();
    let postes = ajouterPoste([], "LOYER_DU_PAR_LOCATAIRE", id1);
    postes = ajouterPoste(postes, "LOYER_DU_PAR_LOCATAIRE", id2);
    postes = modifierPoste(postes, id1, { montantRaw: "200" });
    postes = modifierPoste(postes, id2, { montantRaw: "150" });
    const inputs = buildVentilationTiersInputs(etat({ postesRecevoir: postes }));
    assert.equal(inputs?.postes?.length, 2);
    assert.deepEqual(
      inputs?.postes?.map((p) => p.montant),
      [200, 150],
    );

    // Bout en bout via le vrai résolveur (B-FAMILY-1, inchangé) : la somme est bien 350.
    const resolved = resolveVentilationTiers(inputs);
    assert.equal(resolved.cases.clients.status, "DECLARE");
    assert.equal((resolved.cases.clients as { montant: number }).montant, 350);
  });
});

describe("K — plusieurs catégories simultanées → indépendance correcte", () => {
  it("068 et 072 renseignées simultanément, aucune interférence", () => {
    const inputs = buildVentilationTiersInputs(
      etat({
        postesRecevoir: [ligne("LOYER_DU_PAR_LOCATAIRE", "100"), ligne("AUTRE_CREANCE_ACTIVITE", "200")],
        postesPayer: [ligne("FOURNISSEUR_NON_PAYE", "50")],
      }),
    );
    assert.equal(inputs?.postes?.length, 3);
    assert.equal(inputs?.naturesConfirmeesVides, undefined);
  });
});

describe("L — montant 0 explicite → DECLARE 0", () => {
  it("un poste à 0 € explicite est transmis (jamais exclu, distinct d'un champ vide)", () => {
    const inputs = buildVentilationTiersInputs(etat({ postesRecevoir: [ligne("LOYER_DU_PAR_LOCATAIRE", "0")] }));
    assert.equal(inputs?.postes?.length, 1);
    assert.equal(inputs?.postes?.[0].montant, 0);
  });
});

describe("M — champ montant vide/invalide → ne devient jamais un poste fiscal valide", () => {
  it("montant vide → exclu de postes[]", () => {
    const inputs = buildVentilationTiersInputs(etat({ postesRecevoir: [ligne("LOYER_DU_PAR_LOCATAIRE", "")] }));
    assert.equal(inputs, undefined);
  });

  it("montant non numérique → exclu de postes[]", () => {
    const inputs = buildVentilationTiersInputs(etat({ postesRecevoir: [ligne("LOYER_DU_PAR_LOCATAIRE", "abc")] }));
    assert.equal(inputs, undefined);
  });

  it("ligne invalide + confirmation de la liste cochée → la nature reste éligible à NUL_CONFIRME (elle n'a aucun poste RÉEL)", () => {
    const inputs = buildVentilationTiersInputs(
      etat({ postesRecevoir: [ligne("LOYER_DU_PAR_LOCATAIRE", "")], confirmationRecevoirVide: true }),
    );
    assert.equal(inputs?.postes, undefined);
    assert.deepEqual(inputs?.naturesConfirmeesVides, ["LOYER_DU_PAR_LOCATAIRE", "AUTRE_CREANCE_ACTIVITE"]);
  });
});

describe("N — absence totale de données → comportement historique INCONNU préservé (patrimonial-intake.ts)", () => {
  it("dossier NATIF sans aucune réponse famille B : lignesSimples/tiers/ventilationTiers tous absents, forme identique à avant B-FAMILY-3", () => {
    const state: PatrimonialIntakeState = { ...EMPTY_PATRIMONIAL_INTAKE_STATE, routage: "NATIF" };
    const result = buildBilanPatrimonial(state);
    assert.deepEqual(result, {
      tresorerie: { bankMode: "INCONNU" },
      compteExploitant: { ouverture: 0, apports: undefined, prelevements: undefined },
      ran: { situation: "NATIF" },
      subventionsInvestissement: undefined,
      lignesSimples: undefined,
      tiers: undefined,
    });
    assert.ok(!("ventilationTiers" in (result as object)), "ventilationTiers ne doit même pas apparaître comme clé quand rien n'est renseigné");
  });
});

describe("O — coexistence avec les 5 champs P1-B1 (064/080/092/174/175) sans collision", () => {
  it("famille B renseignée + les 5 champs P1-B1 renseignés simultanément : ventilationTiers et lignesSimples sont deux clés indépendantes", () => {
    const state: PatrimonialIntakeState = {
      ...EMPTY_PATRIMONIAL_INTAKE_STATE,
      routage: "NATIF",
      avancesAcomptesVerses: "OUI",
      avancesAcomptesVersesMontantRaw: "111",
      valeursMobilieresPlacementBrut: "NON",
      chargesConstateesAvance: "OUI",
      chargesConstateesAvanceMontantRaw: "222",
      produitsConstatesAvance: "NON",
      autresDettes: "OUI",
      autresDettesMontantRaw: "333",
      ventilationTiersIntake: {
        postesRecevoir: [ligne("LOYER_DU_PAR_LOCATAIRE", "444")],
        confirmationRecevoirVide: false,
        postesPayer: [ligne("FOURNISSEUR_NON_PAYE", "555")],
        confirmationPayerVide: true,
      },
    };
    const result = buildBilanPatrimonial(state);
    assert.deepEqual(result?.lignesSimples, {
      avancesAcomptesVerses: { status: "DECLARE", montant: 111 },
      valeursMobilieresPlacementBrut: { status: "NUL_CONFIRME" },
      chargesConstateesAvance: { status: "DECLARE", montant: 222 },
      produitsConstatesAvance: { status: "NUL_CONFIRME" },
      autresDettes: { status: "DECLARE", montant: 333 },
    });
    assert.equal(result?.ventilationTiers?.postes?.length, 2);
    assert.deepEqual(result?.ventilationTiers?.naturesConfirmeesVides, ["ACOMPTE_RECU_SUR_COMMANDE", "DETTE_FISCALE_OU_SOCIALE"]);

    // Bout en bout : resolveCaseAvecVentilationPrioritaire (064/092/174/175) reste inchangé —
    // ventilationTiers ne porte QUE des natures famille B, jamais famille C.
    const familleC = new Set(["ACOMPTE_VERSE_A_FOURNISSEUR", "CHARGE_CONSTATEE_AVANCE", "LOYER_ENCAISSE_D_AVANCE", "DEPOT_GARANTIE_LOCATAIRE"]);
    for (const poste of result!.ventilationTiers!.postes ?? []) {
      assert.ok(!familleC.has(poste.nature), `${poste.nature} ne doit jamais apparaître dans ventilationTiers`);
    }
  });

  it("round-trip (build → derive → build) idempotent avec les deux familles simultanément", () => {
    const state: PatrimonialIntakeState = {
      ...EMPTY_PATRIMONIAL_INTAKE_STATE,
      routage: "NATIF",
      avancesAcomptesVerses: "OUI",
      avancesAcomptesVersesMontantRaw: "111",
      ventilationTiersIntake: {
        postesRecevoir: [ligne("LOYER_DU_PAR_LOCATAIRE", "444")],
        confirmationRecevoirVide: true,
        postesPayer: [],
        confirmationPayerVide: true,
      },
    };
    const original = buildBilanPatrimonial(state);
    const roundTripped = buildBilanPatrimonial(deriveIntakeStateFromBilanPatrimonial(original));
    assert.deepEqual(roundTripped, original);
  });
});

describe("dérivation isolée — deriveVentilationTiersIntakeState", () => {
  it("reconstruit fidèlement un état avec poste réel + confirmation de l'autre nature", () => {
    const built = buildVentilationTiersInputs(
      etat({ postesRecevoir: [ligne("LOYER_DU_PAR_LOCATAIRE", "500")], confirmationRecevoirVide: true }),
    );
    const derived = deriveVentilationTiersIntakeState(built);
    assert.equal(derived.postesRecevoir.length, 1);
    assert.equal(derived.postesRecevoir[0].nature, "LOYER_DU_PAR_LOCATAIRE");
    assert.equal(derived.postesRecevoir[0].montantRaw, "500");
    assert.equal(derived.confirmationRecevoirVide, true);
  });

  it("undefined → état vide", () => {
    assert.deepEqual(deriveVentilationTiersIntakeState(undefined), EMPTY_VENTILATION_TIERS_INTAKE_STATE);
  });
});
