/**
 * MICRO-JALON P1-A — resolveTotalCapitauxPropres() (case 142) : correction
 * de l'asymétrie 142/137 identifiée en réception du socle P0.
 * Run: npx tsx --test src/runtime/bilan-total-capitaux-propres.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { resolveTotalCapitauxPropres } from "./capabilities/bilan/total-capitaux-propres";
import type { PatrimonialState } from "./capabilities/bilan/types";

function patrimoineBase(overrides: Partial<PatrimonialState> = {}): PatrimonialState {
  return {
    exercice: 2025,
    resultatComptable: 5400,
    immobilisations: { actifs: [], brutTotal: 60000, cumuleTotal: 1500, netTotal: 58500, brutFiable: true, netFiable: true, raisons: [] },
    tresorerie: { etat: "TRESORERIE_COMPLETE", clotureRetenue: 3000, ecart: 0, raison: "ok" },
    compteExploitant: { disponible: true, clotureN: 36100, ouvertureManquante: false, raison: "ok" },
    ran: { disponible: true, valeur: 0, raison: "ok" },
    emprunts: { etat: "DISPONIBLE", totalCRD: 20000, source: "F-011" },
    tiers: {
      creances: { status: "NUL_CONFIRME", montant: 0, raison: "ok" },
      dettes: { status: "NUL_CONFIRME", montant: 0, raison: "ok" },
    },
    subventionsInvestissement: { status: "INCONNU", raison: "aucune information" },
    // P1-B.2 : champs obligatoires sur PatrimonialState — hors périmètre de 142.
    lignesSimples: {
      autresImmobilisationsIncorporellesBrut: { status: "INCONNU", raison: "fixture" },
      autresImmobilisationsIncorporellesNet: { status: "INCONNU", raison: "fixture" },
      immobilisationsFinancieresBrut: { status: "INCONNU", raison: "fixture" },
      immobilisationsFinancieresNet: { status: "INCONNU", raison: "fixture" },
      avancesAcomptesVerses: { status: "INCONNU", raison: "fixture" },
      valeursMobilieresPlacementBrut: { status: "INCONNU", raison: "fixture" },
      valeursMobilieresPlacementNet: { status: "INCONNU", raison: "fixture" },
      chargesConstateesAvance: { status: "INCONNU", raison: "fixture" },
      produitsConstatesAvance: { status: "INCONNU", raison: "fixture" },
      autresDettes: { status: "INCONNU", raison: "fixture" },
    },
    // P1-B.3 : hors périmètre de 142 — fixture de complétude uniquement.
    ventilationTiers: {
      cases: {
        avancesAcomptesVerses: { status: "INCONNU", raison: "fixture" },
        clients: { status: "INCONNU", raison: "fixture" },
        autresCreances: { status: "INCONNU", raison: "fixture" },
        chargesConstateesAvance: { status: "INCONNU", raison: "fixture" },
        avancesAcomptesRecus: { status: "INCONNU", raison: "fixture" },
        fournisseurs: { status: "INCONNU", raison: "fixture" },
        dettesFiscalesSociales: { status: "INCONNU", raison: "fixture" },
        comptesCourantsAssocies: { status: "NON_APPLICABLE", montant: 0, raison: "EI" },
        produitsConstatesAvance: { status: "INCONNU", raison: "fixture" },
        autresDettes: { status: "INCONNU", raison: "fixture" },
      },
      montantsNonVentiles: [],
      conflits: [],
      projectionFiable: true,
    },
    reconciliationEmpruntsTiers: {
      etat: "EMPRUNT_SEPARE_ET_EXCLU_DU_BUCKET",
      contributionEmpruntEquilibre: 20000,
      raison: "fixture",
      bloquant: false,
    },
    reconciliationDecouvertTiers: {
      etat: "AUCUN_DECOUVERT_CANONIQUE",
      contributionDecouvertEquilibre: 0,
      raison: "fixture",
      bloquant: false,
    },
    ...overrides,
  };
}

describe("resolveTotalCapitauxPropres — correction P1-A", () => {
  it("D — 137 INCONNU alors même que le sous-modèle est EQUILIBRE : 142 reste BLOQUE", () => {
    const patrimoine = patrimoineBase({ subventionsInvestissement: { status: "INCONNU", raison: "aucune information" } });
    const res = resolveTotalCapitauxPropres(patrimoine, "EQUILIBRE", []);
    assert.equal(res.status, "BLOQUE");
  });

  it("E — 137 NUL_CONFIRME et sous-modèle EQUILIBRE : 142 calculable, 137 contribue 0", () => {
    const patrimoine = patrimoineBase({ subventionsInvestissement: { status: "NUL_CONFIRME", montant: 0, raison: "confirmé nul" } });
    const res = resolveTotalCapitauxPropres(patrimoine, "EQUILIBRE", []);
    assert.equal(res.status, "DISPONIBLE");
    assert.equal((res as { montant: number }).montant, 36100 + 0 + 5400, "142 = 120 + 134 + 136, 137 = 0");
  });

  it("F — 137 DECLARE 2500 et sous-modèle EQUILIBRE (fourni) : 142 intègre exactement le montant — cohérent avec montantCapitauxPropresPatrimoniaux", () => {
    const patrimoine = patrimoineBase({ subventionsInvestissement: { status: "DECLARE", montant: 2500, raison: "déclaré" } });
    const res = resolveTotalCapitauxPropres(patrimoine, "EQUILIBRE", []);
    assert.equal(res.status, "DISPONIBLE");
    assert.equal((res as { montant: number }).montant, 36100 + 0 + 5400 + 2500, "142 = 120 + 134 + 136 + 137(2500)");
  });

  it("G1 — sous-modèle NON équilibré (DESEQUILIBRE_REEL) : 142 reste BLOQUE même si 137 est DECLARE — jamais deviné depuis l'écart", () => {
    const patrimoine = patrimoineBase({ subventionsInvestissement: { status: "DECLARE", montant: 2500, raison: "déclaré" } });
    const res = resolveTotalCapitauxPropres(patrimoine, "DESEQUILIBRE_REEL", ["écart réel constaté"]);
    assert.equal(res.status, "BLOQUE", "un 137 déclaré ne doit jamais lever le blocage dû à un déséquilibre du reste du sous-modèle");
  });

  it("G2 — le montant retenu pour 137 ne dépend jamais de l'écart actif/passif : deux résolutions avec le même 137 mais des composantes 120/136 différentes ne 'réconcilient' jamais artificiellement 137", () => {
    const patrimoineA = patrimoineBase({
      compteExploitant: { disponible: true, clotureN: 10000, ouvertureManquante: false, raison: "ok" },
      resultatComptable: 1000,
      subventionsInvestissement: { status: "DECLARE", montant: 500, raison: "déclaré" },
    });
    const patrimoineB = patrimoineBase({
      compteExploitant: { disponible: true, clotureN: 99999, ouvertureManquante: false, raison: "ok" },
      resultatComptable: -4000,
      subventionsInvestissement: { status: "DECLARE", montant: 500, raison: "déclaré" },
    });
    const resA = resolveTotalCapitauxPropres(patrimoineA, "EQUILIBRE", []);
    const resB = resolveTotalCapitauxPropres(patrimoineB, "EQUILIBRE", []);
    // La contribution de 137 (500) est identique dans les deux cas, quelle
    // que soit la valeur des autres composantes — jamais recalculée pour
    // "faire coller" un total attendu.
    assert.equal((resA as { montant: number }).montant - (10000 + 0 + 1000), 500);
    assert.equal((resB as { montant: number }).montant - (99999 + 0 + (-4000)), 500);
  });

});
