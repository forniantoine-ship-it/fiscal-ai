/**
 * G1-P0 — construction pure de BilanInputs depuis l'intake patrimonial.
 * Run: npx tsx --test src/lib/lmnp/services/declaration/patrimonial-intake.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  EMPTY_PATRIMONIAL_INTAKE_STATE,
  buildBilanPatrimonial,
  deriveIntakeStateFromBilanPatrimonial,
  parseMontantSaisi,
  type PatrimonialIntakeState,
} from "./patrimonial-intake";

function state(overrides: Partial<PatrimonialIntakeState>): PatrimonialIntakeState {
  return { ...EMPTY_PATRIMONIAL_INTAKE_STATE, ...overrides };
}

describe("parseMontantSaisi — anti-footgun Number('') === 0", () => {
  it("chaîne vide → undefined (INCONNU), jamais 0", () => {
    assert.equal(parseMontantSaisi(""), undefined);
  });

  it("espaces seuls → undefined", () => {
    assert.equal(parseMontantSaisi("   "), undefined);
  });

  it("'0' → 0 (déclaration explicite de zéro)", () => {
    assert.equal(parseMontantSaisi("0"), 0);
  });

  it("montant positif → nombre", () => {
    assert.equal(parseMontantSaisi("1234.56"), 1234.56);
  });

  it("saisie non numérique → undefined, jamais NaN propagé", () => {
    assert.equal(parseMontantSaisi("abc"), undefined);
  });
});

describe("buildBilanPatrimonial — routage non répondu", () => {
  it("routage undefined → undefined (rien construit, équivalent à l'état pré-G1)", () => {
    assert.equal(buildBilanPatrimonial(EMPTY_PATRIMONIAL_INTAKE_STATE), undefined);
    assert.equal(
      buildBilanPatrimonial(state({ closingCashRaw: "500", apportsRaw: "100" })),
      undefined,
      "aucune réponse ponctuelle ne doit contourner le routage obligatoire",
    );
  });
});

describe("buildBilanPatrimonial — dossier NATIF", () => {
  it("NATIF seul (aucune autre réponse) → ran NATIF, ouverture=0, tout le reste INCONNU", () => {
    const result = buildBilanPatrimonial(state({ routage: "NATIF" }));
    assert.deepEqual(result, {
      tresorerie: { bankMode: "INCONNU" },
      compteExploitant: { ouverture: 0, apports: undefined, prelevements: undefined },
      ran: { situation: "NATIF" },
      subventionsInvestissement: undefined,
      lignesSimples: undefined,
      tiers: undefined,
    });
  });

  it("trésorerie DEDIE avec solde 0 explicite → DECLARE 0, jamais absent", () => {
    const result = buildBilanPatrimonial(state({ routage: "NATIF", bankMode: "DEDIE", closingCashRaw: "0" }));
    assert.deepEqual(result?.tresorerie, { bankMode: "DEDIE", closingCash: 0 });
  });

  it("trésorerie DEDIE avec champ vide → closingCash undefined (bloque 084), jamais 0", () => {
    const result = buildBilanPatrimonial(state({ routage: "NATIF", bankMode: "DEDIE", closingCashRaw: "" }));
    assert.deepEqual(result?.tresorerie, { bankMode: "DEDIE", closingCash: undefined });
  });

  it("trésorerie MIXTE, aucune trésorerie identifiable confirmée (0) → declaredProfessionalCash=0", () => {
    const result = buildBilanPatrimonial(
      state({ routage: "NATIF", bankMode: "MIXTE", declaredProfessionalCashRaw: "0" }),
    );
    assert.deepEqual(result?.tresorerie, { bankMode: "MIXTE", declaredProfessionalCash: 0 });
  });

  it("apports/prélèvements 0 explicites → publiés comme 0, jamais absents", () => {
    const result = buildBilanPatrimonial(state({ routage: "NATIF", apportsRaw: "0", prelevementsRaw: "0" }));
    assert.deepEqual(result?.compteExploitant, { ouverture: 0, apports: 0, prelevements: 0 });
  });

  it("apports/prélèvements réels", () => {
    const result = buildBilanPatrimonial(state({ routage: "NATIF", apportsRaw: "1500", prelevementsRaw: "300" }));
    assert.deepEqual(result?.compteExploitant, { ouverture: 0, apports: 1500, prelevements: 300 });
  });

  it("subvention NON confirmée → NUL_CONFIRME", () => {
    const result = buildBilanPatrimonial(state({ routage: "NATIF", subvention: "NON" }));
    assert.deepEqual(result?.subventionsInvestissement, { status: "NUL_CONFIRME" });
  });

  it("subvention OUI mais montant pas encore saisi → undefined (INCONNU), jamais inventé", () => {
    const result = buildBilanPatrimonial(state({ routage: "NATIF", subvention: "OUI", subventionMontantRaw: "" }));
    assert.equal(result?.subventionsInvestissement, undefined);
  });

  it("subvention OUI avec montant → DECLARE", () => {
    const result = buildBilanPatrimonial(
      state({ routage: "NATIF", subvention: "OUI", subventionMontantRaw: "2500" }),
    );
    assert.deepEqual(result?.subventionsInvestissement, { status: "DECLARE", montant: 2500 });
  });

  it("Q4 NON confirmé → cascade NUL_CONFIRME sur les 7 postes Amort.-Prov. (016/042/066/070/074/082/094)", () => {
    const result = buildBilanPatrimonial(state({ routage: "NATIF", autresElements: "NON" }));
    assert.deepEqual(result?.lignesSimples, {
      autresImmobilisationsIncorporellesNet: { status: "NUL_CONFIRME" },
      immobilisationsFinancieresNet: { status: "NUL_CONFIRME" },
      avancesAcomptesVersesAmort: { status: "NUL_CONFIRME" },
      clientsAmortissementsProvisions: { status: "NUL_CONFIRME" },
      autresCreancesAmortissementsProvisions: { status: "NUL_CONFIRME" },
      valeursMobilieresPlacementNet: { status: "NUL_CONFIRME" },
      chargesConstateesAvanceAmort: { status: "NUL_CONFIRME" },
    });
  });

  it("Q4 NON confirmé → cascade ÉGALEMENT le bucket tiers (P0), requis séparément par checkBilanEquilibre()", () => {
    const result = buildBilanPatrimonial(state({ routage: "NATIF", autresElements: "NON" }));
    assert.deepEqual(result?.tiers, { creances: { status: "NUL_CONFIRME" }, dettes: { status: "NUL_CONFIRME" } });
  });

  it("Q4 OUI → lignesSimples ET tiers absents (INCONNU), aucun montant inventé", () => {
    const result = buildBilanPatrimonial(state({ routage: "NATIF", autresElements: "OUI" }));
    assert.equal(result?.lignesSimples, undefined);
    assert.equal(result?.tiers, undefined);
  });

  it("Q4 jamais répondu → lignesSimples absent (INCONNU), identique à OUI non détaillé", () => {
    const result = buildBilanPatrimonial(state({ routage: "NATIF" }));
    assert.equal(result?.lignesSimples, undefined);
  });
});

describe("buildBilanPatrimonial — dossier REPRISE", () => {
  it("REPRISE sans Q_OUV → ouverture/importedRAN undefined, jamais 0 silencieux", () => {
    const result = buildBilanPatrimonial(state({ routage: "REPRISE" }));
    assert.deepEqual(result?.compteExploitant, { ouverture: undefined, apports: undefined, prelevements: undefined });
    assert.deepEqual(result?.ran, { situation: "IMPORTE", importedRAN: undefined });
  });

  it("REPRISE avec Q_OUV renseignée", () => {
    const result = buildBilanPatrimonial(
      state({ routage: "REPRISE", ouvertureRepriseRaw: "42000", ranRepriseRaw: "1200", apportsRaw: "0", prelevementsRaw: "0" }),
    );
    assert.deepEqual(result?.compteExploitant, { ouverture: 42000, apports: 0, prelevements: 0 });
    assert.deepEqual(result?.ran, { situation: "IMPORTE", importedRAN: 1200 });
  });

  it("REPRISE : ouverture jamais forcée à 0 (contrairement à NATIF)", () => {
    const result = buildBilanPatrimonial(state({ routage: "REPRISE", ouvertureRepriseRaw: "" }));
    assert.equal(result?.compteExploitant.ouverture, undefined);
  });
});

describe("deriveIntakeStateFromBilanPatrimonial — réhydratation", () => {
  it("undefined → état vide", () => {
    assert.deepEqual(deriveIntakeStateFromBilanPatrimonial(undefined), EMPTY_PATRIMONIAL_INTAKE_STATE);
  });

  it("aller-retour NATIF complet", () => {
    const built = buildBilanPatrimonial(
      state({
        routage: "NATIF",
        bankMode: "DEDIE",
        closingCashRaw: "1200",
        apportsRaw: "500",
        prelevementsRaw: "100",
        subvention: "OUI",
        subventionMontantRaw: "300",
        autresElements: "NON",
      }),
    );
    const derived = deriveIntakeStateFromBilanPatrimonial(built);
    assert.equal(derived.routage, "NATIF");
    assert.equal(derived.bankMode, "DEDIE");
    assert.equal(derived.closingCashRaw, "1200");
    assert.equal(derived.apportsRaw, "500");
    assert.equal(derived.prelevementsRaw, "100");
    assert.equal(derived.subvention, "OUI");
    assert.equal(derived.subventionMontantRaw, "300");
    assert.equal(derived.autresElements, "NON");
  });

  it("aller-retour REPRISE complet", () => {
    const built = buildBilanPatrimonial(
      state({ routage: "REPRISE", ouvertureRepriseRaw: "42000", ranRepriseRaw: "1200", bankMode: "MIXTE", declaredProfessionalCashRaw: "0" }),
    );
    const derived = deriveIntakeStateFromBilanPatrimonial(built);
    assert.equal(derived.routage, "REPRISE");
    assert.equal(derived.ouvertureRepriseRaw, "42000");
    assert.equal(derived.ranRepriseRaw, "1200");
    assert.equal(derived.bankMode, "MIXTE");
    assert.equal(derived.declaredProfessionalCashRaw, "0");
  });

  it("re-construction depuis l'état dérivé produit le même objet (idempotence)", () => {
    const original = buildBilanPatrimonial(
      state({ routage: "NATIF", bankMode: "DEDIE", closingCashRaw: "777", autresElements: "NON" }),
    );
    const roundTripped = buildBilanPatrimonial(deriveIntakeStateFromBilanPatrimonial(original));
    assert.deepEqual(roundTripped, original);
  });
});
