/**
 * P1-B1/P1-B2 — collecte UI des 7 postes patrimoniaux Brut
 * (014/040/064/080/092/174/175).
 * Run: npx tsx --test src/lib/lmnp/services/declaration/patrimonial-intake-p1b1.test.ts
 *
 * Fichier dédié (voir mission P1-B1) : `patrimonial-intake.test.ts` existant
 * n'est pas modifié, pour ne courir aucun risque sur ses assertions
 * `deepEqual` exactes déjà en place.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  EMPTY_PATRIMONIAL_INTAKE_STATE,
  buildBilanPatrimonial,
  deriveIntakeStateFromBilanPatrimonial,
  type PatrimonialIntakeState,
} from "./patrimonial-intake";

function state(overrides: Partial<PatrimonialIntakeState>): PatrimonialIntakeState {
  return { ...EMPTY_PATRIMONIAL_INTAKE_STATE, ...overrides };
}

type Champ = {
  readonly caseId: string;
  readonly reponseKey: keyof PatrimonialIntakeState;
  readonly montantRawKey: keyof PatrimonialIntakeState;
  readonly lignesSimplesKey: string;
};

const CHAMPS: readonly Champ[] = [
  { caseId: "064", reponseKey: "avancesAcomptesVerses", montantRawKey: "avancesAcomptesVersesMontantRaw", lignesSimplesKey: "avancesAcomptesVerses" },
  {
    caseId: "014",
    reponseKey: "autresImmobilisationsIncorporellesBrut",
    montantRawKey: "autresImmobilisationsIncorporellesBrutMontantRaw",
    lignesSimplesKey: "autresImmobilisationsIncorporellesBrut",
  },
  {
    caseId: "040",
    reponseKey: "immobilisationsFinancieresBrut",
    montantRawKey: "immobilisationsFinancieresBrutMontantRaw",
    lignesSimplesKey: "immobilisationsFinancieresBrut",
  },
  {
    caseId: "080",
    reponseKey: "valeursMobilieresPlacementBrut",
    montantRawKey: "valeursMobilieresPlacementBrutMontantRaw",
    lignesSimplesKey: "valeursMobilieresPlacementBrut",
  },
  { caseId: "092", reponseKey: "chargesConstateesAvance", montantRawKey: "chargesConstateesAvanceMontantRaw", lignesSimplesKey: "chargesConstateesAvance" },
  { caseId: "174", reponseKey: "produitsConstatesAvance", montantRawKey: "produitsConstatesAvanceMontantRaw", lignesSimplesKey: "produitsConstatesAvance" },
  { caseId: "175", reponseKey: "autresDettes", montantRawKey: "autresDettesMontantRaw", lignesSimplesKey: "autresDettes" },
];

for (const champ of CHAMPS) {
  describe(`case ${champ.caseId} — lignesSimples.${champ.lignesSimplesKey}`, () => {
    it("A — aucune réponse → lignesSimples absent (INCONNU), jamais 0", () => {
      const result = buildBilanPatrimonial(state({ routage: "NATIF" }));
      assert.equal(result?.lignesSimples, undefined);
    });

    it("B — Non → NUL_CONFIRME", () => {
      const result = buildBilanPatrimonial(state({ routage: "NATIF", [champ.reponseKey]: "NON" }));
      assert.deepEqual(result?.lignesSimples, { [champ.lignesSimplesKey]: { status: "NUL_CONFIRME" } });
    });

    it("C — Oui + montant → DECLARE avec le montant exact", () => {
      const result = buildBilanPatrimonial(
        state({ routage: "NATIF", [champ.reponseKey]: "OUI", [champ.montantRawKey]: "1234.56" }),
      );
      assert.deepEqual(result?.lignesSimples, { [champ.lignesSimplesKey]: { status: "DECLARE", montant: 1234.56 } });
    });

    it("Oui sans montant encore saisi → reste absent (INCONNU), jamais un montant inventé", () => {
      const result = buildBilanPatrimonial(state({ routage: "NATIF", [champ.reponseKey]: "OUI", [champ.montantRawKey]: "" }));
      assert.equal(result?.lignesSimples, undefined);
    });

    it("Oui + montant 0 explicite → DECLARE 0, jamais absent", () => {
      const result = buildBilanPatrimonial(state({ routage: "NATIF", [champ.reponseKey]: "OUI", [champ.montantRawKey]: "0" }));
      assert.deepEqual(result?.lignesSimples, { [champ.lignesSimplesKey]: { status: "DECLARE", montant: 0 } });
    });

    it("D — reconstruction de l'état UI depuis BilanPatrimonial (Non)", () => {
      const built = buildBilanPatrimonial(state({ routage: "NATIF", [champ.reponseKey]: "NON" }));
      const derived = deriveIntakeStateFromBilanPatrimonial(built);
      assert.equal(derived[champ.reponseKey], "NON");
      assert.equal(derived[champ.montantRawKey], "");
    });

    it("D — reconstruction de l'état UI depuis BilanPatrimonial (Oui + montant)", () => {
      const built = buildBilanPatrimonial(state({ routage: "NATIF", [champ.reponseKey]: "OUI", [champ.montantRawKey]: "777" }));
      const derived = deriveIntakeStateFromBilanPatrimonial(built);
      assert.equal(derived[champ.reponseKey], "OUI");
      assert.equal(derived[champ.montantRawKey], "777");
    });

    it("D — round-trip idempotent (build → derive → build produit le même objet)", () => {
      const original = buildBilanPatrimonial(state({ routage: "NATIF", [champ.reponseKey]: "OUI", [champ.montantRawKey]: "42" }));
      const roundTripped = buildBilanPatrimonial(deriveIntakeStateFromBilanPatrimonial(original));
      assert.deepEqual(roundTripped, original);
    });
  });
}

describe("P1-B1/P1-B2 — les 7 champs sont indépendants les uns des autres", () => {
  it("E — renseigner 064 seul ne modifie ni 014, ni 040, ni 080, ni 092, ni 174, ni 175", () => {
    const result = buildBilanPatrimonial(
      state({ routage: "NATIF", avancesAcomptesVerses: "OUI", avancesAcomptesVersesMontantRaw: "500" }),
    );
    assert.deepEqual(result?.lignesSimples, { avancesAcomptesVerses: { status: "DECLARE", montant: 500 } });
  });

  it("E — les 7 réponses simultanément produisent les 7 clés, sans interférence", () => {
    const result = buildBilanPatrimonial(
      state({
        routage: "NATIF",
        avancesAcomptesVerses: "OUI",
        avancesAcomptesVersesMontantRaw: "100",
        autresImmobilisationsIncorporellesBrut: "OUI",
        autresImmobilisationsIncorporellesBrutMontantRaw: "150",
        immobilisationsFinancieresBrut: "NON",
        valeursMobilieresPlacementBrut: "NON",
        chargesConstateesAvance: "OUI",
        chargesConstateesAvanceMontantRaw: "200",
        produitsConstatesAvance: "NON",
        autresDettes: "OUI",
        autresDettesMontantRaw: "300",
      }),
    );
    assert.deepEqual(result?.lignesSimples, {
      avancesAcomptesVerses: { status: "DECLARE", montant: 100 },
      autresImmobilisationsIncorporellesBrut: { status: "DECLARE", montant: 150 },
      immobilisationsFinancieresBrut: { status: "NUL_CONFIRME" },
      valeursMobilieresPlacementBrut: { status: "NUL_CONFIRME" },
      chargesConstateesAvance: { status: "DECLARE", montant: 200 },
      produitsConstatesAvance: { status: "NUL_CONFIRME" },
      autresDettes: { status: "DECLARE", montant: 300 },
    });
  });
});

describe("P1-B1 — cas particulier 175 (autresDettes)", () => {
  it("F — 175 reste porté par lignesSimples.autresDettes, aucun champ dépôt de garantie séparé n'existe dans l'état", () => {
    const keys = Object.keys(EMPTY_PATRIMONIAL_INTAKE_STATE);
    assert.ok(keys.includes("autresDettesMontantRaw"), "le champ dédié à la case 175 doit exister");
    assert.ok(
      !keys.some((k) => /depot|garantie|caution/i.test(k)),
      "aucun champ dédié dépôt de garantie ne doit exister — le dépôt de garantie est un cas d'usage de autresDettes, pas un champ à part",
    );
    // `autresDettes` (la réponse Oui/Non) est optionnelle et absente de l'état
    // vide tant qu'aucune réponse n'a été donnée — vérifié directement via le
    // résultat de build/derive plutôt que via Object.keys sur l'état vide.
    const built = buildBilanPatrimonial(state({ routage: "NATIF", autresDettes: "OUI", autresDettesMontantRaw: "1" }));
    assert.ok("autresDettes" in (built?.lignesSimples ?? {}), "la réponse doit atterrir exactement sur la clé lignesSimples.autresDettes");
  });

  it("F — un dépôt de garantie se déclare via la même question Oui/Non/montant que n'importe quelle autre dette (175)", () => {
    const result = buildBilanPatrimonial(state({ routage: "NATIF", autresDettes: "OUI", autresDettesMontantRaw: "1500" }));
    assert.deepEqual(result?.lignesSimples, { autresDettes: { status: "DECLARE", montant: 1500 } });
  });
});

describe("P1-B1 — non-régression Q1/Q2/Q3/Q4", () => {
  it("G — dossier NATIF sans aucune des 5 nouvelles réponses reproduit exactement le comportement pré-P1-B1", () => {
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

  it("G — Q4 NON confirmé reste inchangé (7 postes Amort.-Prov., aucune des 5 nouvelles clés) quand aucune des 5 questions n'est répondue", () => {
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

  it("G — Q4 NON confirmé ET 064 répondu séparément coexistent sans collision de clé (Amort. vs Brut, noms distincts)", () => {
    const result = buildBilanPatrimonial(
      state({ routage: "NATIF", autresElements: "NON", avancesAcomptesVerses: "OUI", avancesAcomptesVersesMontantRaw: "900" }),
    );
    assert.deepEqual(result?.lignesSimples, {
      autresImmobilisationsIncorporellesNet: { status: "NUL_CONFIRME" },
      immobilisationsFinancieresNet: { status: "NUL_CONFIRME" },
      avancesAcomptesVersesAmort: { status: "NUL_CONFIRME" },
      clientsAmortissementsProvisions: { status: "NUL_CONFIRME" },
      autresCreancesAmortissementsProvisions: { status: "NUL_CONFIRME" },
      valeursMobilieresPlacementNet: { status: "NUL_CONFIRME" },
      chargesConstateesAvanceAmort: { status: "NUL_CONFIRME" },
      avancesAcomptesVerses: { status: "DECLARE", montant: 900 },
    });
  });

  it("G — tiers (bucket P0) reste piloté uniquement par Q4, jamais par les 5 nouvelles questions", () => {
    const result = buildBilanPatrimonial(
      state({ routage: "NATIF", avancesAcomptesVerses: "OUI", avancesAcomptesVersesMontantRaw: "900" }),
    );
    assert.equal(result?.tiers, undefined);
  });
});
