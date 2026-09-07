/**
 * B-FAMILY-1 — distinction NUL_CONFIRME / INCONNU dans `resolveVentilationTiers`
 * pour les 5 cases famille B (068/072/164/166/172), via `naturesConfirmeesVides`.
 * Run: npx tsx --test src/runtime/bilan-ventilation-tiers-nul-confirme.test.ts
 *
 * Fichier dédié : `bilan-ventilation-tiers.test.ts` existant n'est pas modifié
 * (même principe que P1-B1 pour `patrimonial-intake.test.ts`).
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { resolveVentilationTiers } from "./capabilities/bilan/ventilation-tiers";
import type { NatureEconomique, PosteEconomiqueInput } from "./capabilities/bilan/types";

const FAMILLE_B: ReadonlyArray<{ nature: NatureEconomique; caseKey: string; caseId: string }> = [
  { nature: "LOYER_DU_PAR_LOCATAIRE", caseKey: "clients", caseId: "068" },
  { nature: "AUTRE_CREANCE_ACTIVITE", caseKey: "autresCreances", caseId: "072" },
  { nature: "ACOMPTE_RECU_SUR_COMMANDE", caseKey: "avancesAcomptesRecus", caseId: "164" },
  { nature: "FOURNISSEUR_NON_PAYE", caseKey: "fournisseurs", caseId: "166" },
  { nature: "DETTE_FISCALE_OU_SOCIALE", caseKey: "dettesFiscalesSociales", caseId: "172" },
];

function poste(nature: NatureEconomique, montant: number, libelle?: string): PosteEconomiqueInput {
  return { montant, nature, libelle };
}

describe("B-FAMILY-1 — les 5 natures famille B : INCONNU / NUL_CONFIRME / DECLARE", () => {
  for (const { nature, caseKey } of FAMILLE_B) {
    describe(`nature ${nature} (case ${caseKey === "clients" ? "068" : caseKey === "autresCreances" ? "072" : caseKey === "avancesAcomptesRecus" ? "164" : caseKey === "fournisseurs" ? "166" : "172"})`, () => {
      it("sans poste et sans confirmation → INCONNU (comportement historique)", () => {
        const result = resolveVentilationTiers({});
        assert.equal((result.cases as any)[caseKey].status, "INCONNU");
      });

      it("sans poste, avec confirmation vide → NUL_CONFIRME, montant 0", () => {
        const result = resolveVentilationTiers({ naturesConfirmeesVides: [nature] });
        const c = (result.cases as any)[caseKey];
        assert.equal(c.status, "NUL_CONFIRME");
        assert.equal(c.montant, 0);
      });

      it("avec un poste → DECLARE, montant exact", () => {
        const result = resolveVentilationTiers({ postes: [poste(nature, 750)] });
        const c = (result.cases as any)[caseKey];
        assert.equal(c.status, "DECLARE");
        assert.equal(c.montant, 750);
      });

      it("poste réel + confirmation vide pour la MÊME nature → DECLARE (le poste prime)", () => {
        const result = resolveVentilationTiers({
          postes: [poste(nature, 300)],
          naturesConfirmeesVides: [nature],
        });
        const c = (result.cases as any)[caseKey];
        assert.equal(c.status, "DECLARE");
        assert.equal(c.montant, 300);
      });
    });
  }

  it("confirmer une nature sans poste n'affecte aucune des 4 autres natures", () => {
    const result = resolveVentilationTiers({ naturesConfirmeesVides: ["LOYER_DU_PAR_LOCATAIRE"] });
    assert.equal(result.cases.clients.status, "NUL_CONFIRME");
    assert.equal(result.cases.autresCreances.status, "INCONNU");
    assert.equal(result.cases.avancesAcomptesRecus.status, "INCONNU");
    assert.equal(result.cases.fournisseurs.status, "INCONNU");
    assert.equal(result.cases.dettesFiscalesSociales.status, "INCONNU");
  });

  it("les 5 confirmations vides simultanément → les 5 cases NUL_CONFIRME", () => {
    const result = resolveVentilationTiers({
      naturesConfirmeesVides: FAMILLE_B.map((f) => f.nature),
    });
    for (const { caseKey } of FAMILLE_B) {
      assert.equal((result.cases as any)[caseKey].status, "NUL_CONFIRME", `${caseKey} doit être NUL_CONFIRME`);
      assert.equal((result.cases as any)[caseKey].montant, 0);
    }
  });

  it("aucune confirmation + aucun poste → comportement historique strictement inchangé (les 7 cases ventilables restent INCONNU, sauf 173 NON_APPLICABLE)", () => {
    const result = resolveVentilationTiers();
    assert.equal(result.cases.avancesAcomptesVerses.status, "INCONNU");
    assert.equal(result.cases.clients.status, "INCONNU");
    assert.equal(result.cases.autresCreances.status, "INCONNU");
    assert.equal(result.cases.chargesConstateesAvance.status, "INCONNU");
    assert.equal(result.cases.avancesAcomptesRecus.status, "INCONNU");
    assert.equal(result.cases.fournisseurs.status, "INCONNU");
    assert.equal(result.cases.dettesFiscalesSociales.status, "INCONNU");
    assert.equal(result.cases.comptesCourantsAssocies.status, "NON_APPLICABLE");
    assert.equal(result.cases.produitsConstatesAvance.status, "INCONNU");
    assert.equal(result.cases.autresDettes.status, "INCONNU");
    assert.equal(result.projectionFiable, true);
  });

  it("NATURE_INCONNUE reste bloquante même si listée dans naturesConfirmeesVides (ignorée, jamais transformée en confirmation d'une case)", () => {
    const result = resolveVentilationTiers({
      postes: [poste("NATURE_INCONNUE", 500, "Montant non classé")],
      naturesConfirmeesVides: ["NATURE_INCONNUE"],
    });
    assert.equal(result.montantsNonVentiles.length, 1);
    assert.equal(result.montantsNonVentiles[0].montant, 500);
    assert.ok(result.conflits.some((c) => c.code === "NATURE_INCONNUE_NON_VENTILEE"));
    assert.equal(result.projectionFiable, false);
    // Aucune case famille B n'est devenue NUL_CONFIRME à cause de cette entrée.
    for (const { caseKey } of FAMILLE_B) {
      assert.equal((result.cases as any)[caseKey].status, "INCONNU");
    }
  });

  it("EMPRUNT / DECOUVERT_BANCAIRE restent interdits et inchangés, y compris listés dans naturesConfirmeesVides (ignorés, aucune case affectée)", () => {
    const result = resolveVentilationTiers({
      postes: [{ montant: 1000, nature: "EMPRUNT" as NatureEconomique }],
      naturesConfirmeesVides: ["EMPRUNT" as NatureEconomique, "DECOUVERT_BANCAIRE" as NatureEconomique],
    });
    assert.ok(result.conflits.some((c) => c.code === "NATURE_INTERDITE"));
    for (const { caseKey } of FAMILLE_B) {
      assert.equal((result.cases as any)[caseKey].status, "INCONNU");
    }
  });

  it("173 (comptes courants d'associés) reste NON_APPLICABLE quelle que soit naturesConfirmeesVides — jamais affectée par cette extension", () => {
    const result = resolveVentilationTiers({ naturesConfirmeesVides: FAMILLE_B.map((f) => f.nature) });
    assert.equal(result.cases.comptesCourantsAssocies.status, "NON_APPLICABLE");
  });
});
