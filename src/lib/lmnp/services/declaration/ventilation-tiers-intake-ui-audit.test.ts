/**
 * B-FAMILY-5 — audit UI/parcours utilisateur de la ventilation tiers.
 *
 * Ce fichier ferme UN écart précis non couvert par les suites existantes
 * (`ventilation-tiers-intake.test.ts` : add/remove/modify au niveau des
 * tableaux ; `ventilation-tiers-intake-mapping.test.ts` : mapping UI →
 * BilanInputs pour les scénarios A-O de B-FAMILY-3) : la suppression d'un
 * poste ne doit laisser AUCUNE trace fiscale — ni poste fantôme, ni 0
 * inventé — vérifié ici bout en bout via `buildVentilationTiersInputs`,
 * jamais seulement au niveau du tableau `PosteIntakeRow[]`.
 *
 * LIMITE ASSUMÉE — ce projet n'a aucune infrastructure de test de rendu
 * React (ni jsdom, ni @testing-library, confirmé par grep sur package.json
 * lors de l'audit B-FAMILY-2). `VentilationTiersIntakeCard.tsx` et
 * `PatrimonialIntakeCard.tsx` ne sont donc PAS exercés ici par un test de
 * composant — ce serait fabriquer un faux test sur une infrastructure
 * inexistante. À la place, ce fichier couvre la logique PURE que ces
 * composants délèguent intégralement (`ajouterPoste`/`retirerPoste`/
 * `modifierPoste`/`buildVentilationTiersInputs`) : les composants eux-mêmes
 * ne contiennent aucune branche de décision qui échapperait à cette
 * couverture (vérifié par relecture : chaque gestionnaire d'événement du
 * composant appelle une seule fonction pure, sans logique intermédiaire).
 *
 * Run: npx tsx --test src/lib/lmnp/services/declaration/ventilation-tiers-intake-ui-audit.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  ajouterPoste,
  buildVentilationTiersInputs,
  EMPTY_VENTILATION_TIERS_INTAKE_STATE,
  modifierPoste,
  retirerPoste,
  type VentilationTiersIntakeState,
} from "./ventilation-tiers-intake";

function etat(overrides: Partial<VentilationTiersIntakeState>): VentilationTiersIntakeState {
  return { ...EMPTY_VENTILATION_TIERS_INTAKE_STATE, ...overrides };
}

describe("D (complément) — suppression : aucun poste fantôme, aucun 0 fiscal implicite, bout en bout", () => {
  it("ajouter puis supprimer un poste 068 → buildVentilationTiersInputs ne produit RIEN pour cette nature (ni 0, ni absence de clé qui la confondrait avec une autre)", () => {
    const id = crypto.randomUUID();
    let postesRecevoir = ajouterPoste([], "LOYER_DU_PAR_LOCATAIRE", id);
    postesRecevoir = modifierPoste(postesRecevoir, id, { montantRaw: "500" });
    // Précondition : le poste existe bien et produirait un DECLARE=500 s'il n'était pas supprimé.
    assert.deepEqual(buildVentilationTiersInputs(etat({ postesRecevoir })), {
      postes: [{ id, nature: "LOYER_DU_PAR_LOCATAIRE", montant: 500, libelle: undefined }],
    });

    postesRecevoir = retirerPoste(postesRecevoir, id);
    assert.equal(postesRecevoir.length, 0, "le tableau ne doit plus contenir le poste supprimé");
    assert.equal(
      buildVentilationTiersInputs(etat({ postesRecevoir })),
      undefined,
      "aucune trace fiscale ne doit subsister après suppression (jamais un objet {postes:[]} ni une nature à 0 non confirmée)",
    );
  });

  it("supprimer une ligne ne détruit pas les autres : deux postes 068 différents, un seul supprimé", () => {
    const idASupprimer = crypto.randomUUID();
    const idConserve = crypto.randomUUID();
    let postesRecevoir = ajouterPoste([], "LOYER_DU_PAR_LOCATAIRE", idASupprimer);
    postesRecevoir = ajouterPoste(postesRecevoir, "LOYER_DU_PAR_LOCATAIRE", idConserve);
    postesRecevoir = modifierPoste(postesRecevoir, idASupprimer, { montantRaw: "500" });
    postesRecevoir = modifierPoste(postesRecevoir, idConserve, { montantRaw: "300" });

    postesRecevoir = retirerPoste(postesRecevoir, idASupprimer);
    assert.equal(postesRecevoir.length, 1);
    assert.equal(postesRecevoir[0].id, idConserve);

    const inputs = buildVentilationTiersInputs(etat({ postesRecevoir }));
    assert.equal(inputs?.postes?.length, 1);
    assert.equal(inputs?.postes?.[0].montant, 300, "le poste conservé doit garder son montant exact, jamais recalculé à partir du poste supprimé");
  });

  it("supprimer un poste alors que la confirmation de la liste est cochée : la nature redevient éligible à NUL_CONFIRME (comportement attendu, pas un poste fantôme à 0 masqué)", () => {
    const id = crypto.randomUUID();
    let postesRecevoir = ajouterPoste([], "LOYER_DU_PAR_LOCATAIRE", id);
    postesRecevoir = modifierPoste(postesRecevoir, id, { montantRaw: "500" });
    const avantSuppression = buildVentilationTiersInputs(etat({ postesRecevoir, confirmationRecevoirVide: true }));
    assert.deepEqual(avantSuppression?.postes?.[0], { id, nature: "LOYER_DU_PAR_LOCATAIRE", montant: 500, libelle: undefined });
    assert.deepEqual(
      avantSuppression?.naturesConfirmeesVides,
      ["AUTRE_CREANCE_ACTIVITE"],
      "068 a un poste réel : jamais dans naturesConfirmeesVides tant qu'il existe ; 072 (sans poste) l'est déjà, la confirmation étant cochée",
    );

    postesRecevoir = retirerPoste(postesRecevoir, id);
    const apresSuppression = buildVentilationTiersInputs(etat({ postesRecevoir, confirmationRecevoirVide: true }));
    assert.equal(apresSuppression?.postes, undefined, "plus aucun poste réel");
    assert.deepEqual(
      apresSuppression?.naturesConfirmeesVides,
      ["LOYER_DU_PAR_LOCATAIRE", "AUTRE_CREANCE_ACTIVITE"],
      "la confirmation déjà cochée s'applique désormais aux deux natures de la liste, explicitement — jamais un 0 implicite avant ce recalcul",
    );
  });
});
