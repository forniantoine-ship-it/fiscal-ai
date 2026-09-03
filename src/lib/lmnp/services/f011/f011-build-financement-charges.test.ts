/**
 * P0-A — verrouille le transport de `totalAssurancePreExploitation` depuis le
 * moteur F-011 jusqu'à l'objet `financementCharges` reconstruit par le panel
 * conversationnel (Tunnel B) au moment de la persistance.
 *
 * `buildFinancementCharges()` est la fonction pure extraite de
 * `persistCompletion()` (F011FinancementAssistantPanel.tsx) qui portait la
 * perte — testée ici directement, sans rendre le composant React (aucune
 * infrastructure de test React dans ce projet), avec un
 * `ChargesFinancementExercice` produit par le vrai moteur (même scénario de
 * référence que le diagnostic P2, commit 54c7070).
 *
 * Run: npx tsx --test src/lib/lmnp/services/f011/f011-build-financement-charges.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { buildFinancementCharges } from "./f011-build-financement-charges";
import { computeFinancementExercice } from "@/runtime";

describe("buildFinancementCharges() — P0-A, totalAssurancePreExploitation", () => {
  it("assurance annuelle connue + mise en service mi-exercice → la valeur calculée est conservée exactement", () => {
    const { charges } = computeFinancementExercice({
      exerciceFiscal: 2024,
      dateMiseEnService: "2024-07-01",
      prets: [
        {
          pretId: "p1",
          typePret: "amortissable",
          capitalInitial: 150000,
          tauxNominal: 0.02,
          dureeMois: 240,
          datePremiereMensualite: "2024-01-01",
          assuranceAnnuelle: 300,
          assuranceType: "externe",
        },
      ],
    });

    // Valeur de référence du diagnostic P2 (54c7070) — non nulle, réutilisée
    // ici pour verrouiller le point qui restait non corrigé après ce commit.
    assert.equal(charges.totalAssurancePreExploitation, 150, "précondition — le moteur doit produire une valeur non nulle");

    const financementCharges = buildFinancementCharges(charges, {}, "2024-08-01T00:00:00.000Z");

    assert.equal(
      financementCharges.totalAssurancePreExploitation,
      150,
      "la valeur calculée par le moteur doit survivre à la reconstruction du panel — auparavant perdue ici",
    );
    // Non-régression : le champ jumeau, déjà transporté avant ce correctif, reste correct.
    assert.equal(financementCharges.totalInteretsPreExploitation, charges.totalInteretsPreExploitation);
    assert.equal(financementCharges.totalAssurance, charges.totalAssurance);
    assert.equal(financementCharges.totalChargesFinancementExercice, charges.totalChargesFinancementExercice);
  });

  it("aucune assurance pré-exploitation (mise en service avant l'exercice) → 0, rien d'inventé", () => {
    const { charges } = computeFinancementExercice({
      exerciceFiscal: 2022,
      dateMiseEnService: "2021-01-01",
      prets: [
        {
          pretId: "p1",
          typePret: "amortissable",
          capitalInitial: 100000,
          tauxNominal: 0.02,
          dureeMois: 240,
          datePremiereMensualite: "2022-01-01",
          assuranceAnnuelle: 661,
          assuranceType: "bancaire",
        },
      ],
    });

    const financementCharges = buildFinancementCharges(charges, {}, "2022-08-01T00:00:00.000Z");
    assert.equal(financementCharges.totalAssurancePreExploitation, 0);
  });
});
