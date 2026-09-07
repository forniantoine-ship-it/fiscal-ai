/**
 * MICRO-JALON P1-B.2 — lignes patrimoniales simples (014/016, 040/042, 064,
 * 080/082, 092, 174, 175) : représentation typée, résolution d'état, gate
 * des totaux correspondants. Aucune UX / question client.
 * Run: npx tsx --test src/runtime/bilan-lignes-simples.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { assemblePatrimoine } from "./capabilities/bilan/assemble-patrimoine";
import {
  gateTotal044ActifImmobiliseBrut,
  gateTotal096ActifCirculantBrut,
  gateTotal110,
  gateTotal176Dettes,
  gateTotal180,
  resolveLignePatrimonialeOuverte,
  resolveLignesSimples,
} from "./capabilities/bilan/lignes-simples";
import { resolveSubventionsInvestissement } from "./capabilities/bilan/subventions-investissement";
import type { GateTotalComposantesResult } from "./capabilities/bilan/lignes-simples";
import type { TotalCapitauxPropresResolution } from "./capabilities/bilan/total-capitaux-propres";
import type { BilanInputs, LignesSimplesResolution } from "./capabilities/bilan/types";
import type { FiscalResult } from "./capabilities/f006/types";
import type { IdentiteDeclarante } from "./capabilities/f007/types";
import type { FiscalRepresentation } from "./capabilities/rfs/types";

function toutesConnues(overrides: Partial<LignesSimplesResolution> = {}): LignesSimplesResolution {
  const nul: LignesSimplesResolution[keyof LignesSimplesResolution] = {
    status: "NUL_CONFIRME",
    montant: 0,
    raison: "confirmé nul",
  };
  return {
    autresImmobilisationsIncorporellesBrut: nul,
    autresImmobilisationsIncorporellesNet: nul,
    immobilisationsFinancieresBrut: nul,
    immobilisationsFinancieresNet: nul,
    avancesAcomptesVerses: nul,
    avancesAcomptesVersesAmort: nul,
    clientsAmortissementsProvisions: nul,
    autresCreancesAmortissementsProvisions: nul,
    valeursMobilieresPlacementBrut: nul,
    valeursMobilieresPlacementNet: nul,
    chargesConstateesAvance: nul,
    chargesConstateesAvanceAmort: nul,
    produitsConstatesAvance: nul,
    autresDettes: nul,
    ...overrides,
  };
}

describe("resolveLignePatrimonialeOuverte — P1-B.2, NO SILENT ZERO", () => {
  it("1 — DECLARE conserve la valeur", () => {
    const res = resolveLignePatrimonialeOuverte({ status: "DECLARE", montant: 1234.5 }, "Test 080");
    assert.equal(res.status, "DECLARE");
    assert.equal((res as { montant: number }).montant, 1234.5);
  });

  it("2 — NUL_CONFIRME ne devient pas un faux INCONNU", () => {
    const res = resolveLignePatrimonialeOuverte({ status: "NUL_CONFIRME" }, "Test 064");
    assert.equal(res.status, "NUL_CONFIRME");
    assert.equal((res as { montant: number }).montant, 0);
  });

  it("3 — INCONNU (absent ou explicite) ne devient jamais 0", () => {
    const a = resolveLignePatrimonialeOuverte(undefined, "Test 092");
    const b = resolveLignePatrimonialeOuverte({ status: "INCONNU" }, "Test 092");
    assert.equal(a.status, "INCONNU");
    assert.equal(b.status, "INCONNU");
    assert.equal("montant" in a, false);
    assert.equal("montant" in b, false);
  });

  it("4 — NON_APPLICABLE n'est pas autorisé sur une ligne ouverte LMNP → INCONNU (pas de 0 publiable)", () => {
    const res = resolveLignePatrimonialeOuverte({ status: "NON_APPLICABLE" }, "VMP (case 080)");
    assert.equal(res.status, "INCONNU");
    assert.ok(res.raison.includes("NON_APPLICABLE refusé"));
    assert.equal("montant" in res, false);
  });
});

describe("resolveLignesSimples — familles P1-B.2", () => {
  it("inputs absents → toutes les lignes INCONNU (pas de faux zéro)", () => {
    const res = resolveLignesSimples(undefined);
    for (const [key, ligne] of Object.entries(res)) {
      assert.equal(ligne.status, "INCONNU", `${key} doit rester INCONNU`);
    }
  });

  it("DECLARE / NUL_CONFIRME / INCONNU coexistent sans fusion", () => {
    const res = resolveLignesSimples({
      avancesAcomptesVerses: { status: "DECLARE", montant: 500 },
      valeursMobilieresPlacementBrut: { status: "NUL_CONFIRME" },
      // 092 volontairement omis → INCONNU
    });
    assert.equal(res.avancesAcomptesVerses.status, "DECLARE");
    assert.equal((res.avancesAcomptesVerses as { montant: number }).montant, 500);
    assert.equal(res.valeursMobilieresPlacementBrut.status, "NUL_CONFIRME");
    assert.equal(res.chargesConstateesAvance.status, "INCONNU");
    assert.equal(res.autresDettes.status, "INCONNU");
  });

  it("chaque résolution cite sa case Cerfa dans la raison", () => {
    const res = resolveLignesSimples(undefined);
    assert.ok(res.autresImmobilisationsIncorporellesBrut.raison.includes("014"));
    assert.ok(res.autresImmobilisationsIncorporellesNet.raison.includes("016"));
    assert.ok(res.immobilisationsFinancieresBrut.raison.includes("040"));
    assert.ok(res.immobilisationsFinancieresNet.raison.includes("042"));
    assert.ok(res.avancesAcomptesVerses.raison.includes("064"));
    assert.ok(res.avancesAcomptesVersesAmort.raison.includes("066"));
    assert.ok(res.clientsAmortissementsProvisions.raison.includes("070"));
    assert.ok(res.autresCreancesAmortissementsProvisions.raison.includes("074"));
    assert.ok(res.valeursMobilieresPlacementBrut.raison.includes("080"));
    assert.ok(res.valeursMobilieresPlacementNet.raison.includes("082"));
    assert.ok(res.chargesConstateesAvance.raison.includes("092"));
    assert.ok(res.chargesConstateesAvanceAmort.raison.includes("094"));
    assert.ok(res.produitsConstatesAvance.raison.includes("174"));
    assert.ok(res.autresDettes.raison.includes("175"));
  });
});

describe("gate totaux — une ligne INCONNU bloque le total correspondant", () => {
  it("5a — 014 INCONNU bloque 044 même si 040 est connue", () => {
    const lignes = toutesConnues({
      autresImmobilisationsIncorporellesBrut: { status: "INCONNU", raison: "inconnu" },
    });
    const gate = gateTotal044ActifImmobiliseBrut(lignes);
    assert.equal(gate.status, "BLOQUE");
    assert.ok(gate.status === "BLOQUE" && gate.casesInconnues.includes("014"));
  });

  it("5b — 064/080/092 toutes connues → composantes P1-B.2 de 096 OK (ne publie pas le total Cerfa)", () => {
    const gate = gateTotal096ActifCirculantBrut(toutesConnues());
    assert.equal(gate.status, "COMPOSANTES_CONNUES");
  });

  it("5c — 080 INCONNU bloque 096", () => {
    const lignes = toutesConnues({
      valeursMobilieresPlacementBrut: { status: "INCONNU", raison: "inconnu" },
    });
    const gate = gateTotal096ActifCirculantBrut(lignes);
    assert.equal(gate.status, "BLOQUE");
    assert.ok(gate.status === "BLOQUE" && gate.casesInconnues.includes("080"));
  });

  it("5d — 174 ou 175 INCONNU bloque 176", () => {
    const a = gateTotal176Dettes(
      toutesConnues({ produitsConstatesAvance: { status: "INCONNU", raison: "inconnu" } }),
    );
    const b = gateTotal176Dettes(toutesConnues({ autresDettes: { status: "INCONNU", raison: "inconnu" } }));
    assert.equal(a.status, "BLOQUE");
    assert.equal(b.status, "BLOQUE");
  });

  it("5e — NUL_CONFIRME sur 174/175 ne bloque PAS 176 côté composantes P1-B.2", () => {
    const gate = gateTotal176Dettes(toutesConnues());
    assert.equal(gate.status, "COMPOSANTES_CONNUES");
  });
});

describe("Chantier 2C — gateTotal044ActifImmobiliseBrut corrigée (composante 028)", () => {
  it("A — 014/040 connues ET 028 publiée → COMPOSANTES_CONNUES", () => {
    const gate = gateTotal044ActifImmobiliseBrut(toutesConnues(), true);
    assert.equal(gate.status, "COMPOSANTES_CONNUES");
  });

  it("B — 014/040 connues MAIS 028 non publiable → BLOQUE (jamais une somme partielle)", () => {
    const gate = gateTotal044ActifImmobiliseBrut(toutesConnues(), false, "divergence F-010/F-014");
    assert.equal(gate.status, "BLOQUE");
    assert.ok(gate.status === "BLOQUE" && gate.casesInconnues.includes("028"));
    assert.match(gate.status === "BLOQUE" ? gate.raison : "", /028 non publiable.*divergence F-010\/F-014/);
  });

  it("C — 014 INCONNU bloque 044 même si 028 est publiée (la composante lignesSimples prime, testée avant 028)", () => {
    const lignes = toutesConnues({ autresImmobilisationsIncorporellesBrut: { status: "INCONNU", raison: "inconnu" } });
    const gate = gateTotal044ActifImmobiliseBrut(lignes, true);
    assert.equal(gate.status, "BLOQUE");
    assert.ok(gate.status === "BLOQUE" && gate.casesInconnues.includes("014"));
  });

  it("D — 014/040 NUL_CONFIRME (zéro explicite) + 028 publiée → COMPOSANTES_CONNUES, distinct d'une absence de 028", () => {
    const connu = gateTotal044ActifImmobiliseBrut(toutesConnues(), true);
    const sans028 = gateTotal044ActifImmobiliseBrut(toutesConnues(), false);
    assert.equal(connu.status, "COMPOSANTES_CONNUES");
    assert.equal(sans028.status, "BLOQUE");
  });
});

const GATE_CONNUE: GateTotalComposantesResult = { status: "COMPOSANTES_CONNUES" };
function gateBloquee(raison: string, casesInconnues: string[]): GateTotalComposantesResult {
  return { status: "BLOQUE", raison, casesInconnues };
}

describe("Chantier 2D-E1 — gateTotal110 (110 = 044 + 096, colonne Brut)", () => {
  it("A — 044 et 096 publiées → COMPOSANTES_CONNUES", () => {
    const gate = gateTotal110(GATE_CONNUE, GATE_CONNUE, true, true);
    assert.equal(gate.status, "COMPOSANTES_CONNUES");
  });

  it("B — 044 bloquée (gate BLOQUE) → 110 bloqué en mentionnant 044", () => {
    const gate = gateTotal110(gateBloquee("014 INCONNU", ["014"]), GATE_CONNUE, false, true);
    assert.equal(gate.status, "BLOQUE");
    assert.ok(gate.status === "BLOQUE" && gate.casesInconnues.includes("044"));
    assert.match(gate.status === "BLOQUE" ? gate.raison : "", /composante 044 non publiable.*014 INCONNU/);
  });

  it("C — 096 bloquée (gate BLOQUE) → 110 bloqué en mentionnant 096", () => {
    const gate = gateTotal110(GATE_CONNUE, gateBloquee("084 non publiable", ["084"]), true, false);
    assert.equal(gate.status, "BLOQUE");
    assert.ok(gate.status === "BLOQUE" && gate.casesInconnues.includes("096"));
    assert.match(gate.status === "BLOQUE" ? gate.raison : "", /composante 096 non publiable.*084 non publiable/);
  });

  it("D — 044 ET 096 bloquées → 110 bloqué en mentionnant les deux, raison cohérente", () => {
    const gate = gateTotal110(gateBloquee("014 INCONNU", ["014"]), gateBloquee("084 non publiable", ["084"]), false, false);
    assert.equal(gate.status, "BLOQUE");
    assert.ok(gate.status === "BLOQUE" && gate.casesInconnues.includes("044") && gate.casesInconnues.includes("096"));
    assert.match(gate.status === "BLOQUE" ? gate.raison : "", /composantes 044 et 096 non publiables/);
  });

  it("Divergence gate/publication — gate044 COMPOSANTES_CONNUES mais case044Published=false → 110 bloqué (une gate seule ne suffit jamais)", () => {
    const gate = gateTotal110(GATE_CONNUE, GATE_CONNUE, false, true);
    assert.equal(gate.status, "BLOQUE");
    assert.ok(gate.status === "BLOQUE" && gate.casesInconnues.includes("044"));
    assert.match(gate.status === "BLOQUE" ? gate.raison : "", /044 non publiée par le mapper/);
  });
});

describe("Chantier 2D-E1 — gateTotal180 (180 = 142 + 176, 154 non_applicable, colonne NET Passif)", () => {
  const CAPITAUX_DISPONIBLE: TotalCapitauxPropresResolution = { status: "DISPONIBLE", montant: 41500 };
  const CAPITAUX_BLOQUE: TotalCapitauxPropresResolution = { status: "BLOQUE", raison: "137 INCONNU" };

  it("A — 142 et 176 publiées → COMPOSANTES_CONNUES", () => {
    const gate = gateTotal180(CAPITAUX_DISPONIBLE, GATE_CONNUE, true, true);
    assert.equal(gate.status, "COMPOSANTES_CONNUES");
  });

  it("B — 142 bloquée (totalCapitauxPropres BLOQUE) → 180 bloqué en mentionnant 142", () => {
    const gate = gateTotal180(CAPITAUX_BLOQUE, GATE_CONNUE, false, true);
    assert.equal(gate.status, "BLOQUE");
    assert.ok(gate.status === "BLOQUE" && gate.casesInconnues.includes("142"));
    assert.match(gate.status === "BLOQUE" ? gate.raison : "", /composante 142 non publiable.*137 INCONNU/);
  });

  it("C — 176 bloquée (gate BLOQUE) → 180 bloqué en mentionnant 176", () => {
    const gate = gateTotal180(CAPITAUX_DISPONIBLE, gateBloquee("156 non publiable", ["156"]), true, false);
    assert.equal(gate.status, "BLOQUE");
    assert.ok(gate.status === "BLOQUE" && gate.casesInconnues.includes("176"));
    assert.match(gate.status === "BLOQUE" ? gate.raison : "", /composante 176 non publiable.*156 non publiable/);
  });

  it("D — 142 ET 176 bloquées → 180 bloqué en mentionnant les deux", () => {
    const gate = gateTotal180(CAPITAUX_BLOQUE, gateBloquee("156 non publiable", ["156"]), false, false);
    assert.equal(gate.status, "BLOQUE");
    assert.ok(gate.status === "BLOQUE" && gate.casesInconnues.includes("142") && gate.casesInconnues.includes("176"));
    assert.match(gate.status === "BLOQUE" ? gate.raison : "", /composantes 142 et 176 non publiables/);
  });

  it("Divergence gate/publication — 142 DISPONIBLE mais case142Published=false → 180 bloqué (une résolution seule ne suffit jamais)", () => {
    const gate = gateTotal180(CAPITAUX_DISPONIBLE, GATE_CONNUE, false, true);
    assert.equal(gate.status, "BLOQUE");
    assert.ok(gate.status === "BLOQUE" && gate.casesInconnues.includes("142"));
    assert.match(gate.status === "BLOQUE" ? gate.raison : "", /142 non publiée par le mapper/);
  });

  it("154 n'est jamais une composante vérifiée — un total 176 seul, sans aucune référence à 154, suffit à publier 180", () => {
    const gate = gateTotal180(CAPITAUX_DISPONIBLE, GATE_CONNUE, true, true);
    assert.equal(gate.status, "COMPOSANTES_CONNUES");
    // Aucune trace de "154" dans un éventuel blocage : le forcer bloqué le prouverait déjà,
    // mais on vérifie ici l'absence de toute dépendance à 154 dans le cas nominal.
  });
});

describe("assemblePatrimoine — intégration minimale P1-B.2 sans perturber P1-A", () => {
  const FISCAL_RESULT: FiscalResult = {
    exercice: 2025,
    recettes: { total: 0 },
    charges: { totalDeductible: 0, chargesExploitation: 0, chargesFinancement: 0, chargesPreExploitation: 0, totalNonDeductible: 0 },
    resultatAvantAmort: 0,
    amortCalcule: 0,
    amortDeduct: 0,
    amortReporte: 0,
    amortReportesUtilises: 0,
    resultatFiscal: 0,
    deficitNouveau: 0,
    deficitsImputes: 0,
    perteExceptionnelle: 0,
    stocks: { deficits: [], amortissementsReportes: 0, deficitsExpires: [] },
    trace: { ksArtifacts: [], computedAt: "2026-09-06T00:00:00.000Z", journal: [] },
    status: "computed",
    anomalies: [],
  };
  const IDENTITE: IdentiteDeclarante = { siren: "104545108", siret: "10454510800011", denomination: "P1-B.2" };
  const BASE_INPUTS: BilanInputs = {
    tresorerie: { bankMode: "DEDIE", closingCash: 1000 },
    compteExploitant: { ouverture: 0, apports: 0, prelevements: 0 },
    ran: { situation: "NATIF" },
    tiers: { creances: { status: "NUL_CONFIRME" }, dettes: { status: "NUL_CONFIRME" } },
    subventionsInvestissement: { status: "NUL_CONFIRME" },
  };

  function rfs(): FiscalRepresentation {
    return {
      exercice: 2025,
      identite: IDENTITE,
      fiscalResult: FISCAL_RESULT,
      emprunts: [
        {
          pretId: "p",
          typePret: "amortissable",
          interetsEmpruntExercice: 0,
          interetsPreExploitation: 0,
          assuranceEmpruntExercice: 0,
          assurancePreExploitation: 0,
          capitalRembourseExercice: 0,
          capitalRestantDu31_12: 0,
          fraisDossierDeductibles: 0,
          garantieDeductible: 0,
          iraDeductible: 0,
        },
      ],
      trace: {
        ksArtifacts: [],
        assembledAt: "2026-09-06T00:00:00.000Z",
        sourceFiscalResultAt: FISCAL_RESULT.trace.computedAt,
        sources: { identite: "test", fiscalResult: "test" },
      },
    };
  }

  it("6 — sans lignesSimples : patrimoine.lignesSimples toutes INCONNU ; 137 P1-A inchangé", () => {
    const patrimoine = assemblePatrimoine(rfs(), BASE_INPUTS);
    assert.equal(patrimoine.lignesSimples.avancesAcomptesVerses.status, "INCONNU");
    assert.equal(patrimoine.lignesSimples.valeursMobilieresPlacementBrut.status, "INCONNU");
    assert.equal(patrimoine.subventionsInvestissement.status, "NUL_CONFIRME");
    assert.equal((patrimoine.subventionsInvestissement as { montant: number }).montant, 0);
  });

  it("6b — DECLARE sur 175 propagé ; ne mute pas 137", () => {
    const patrimoine = assemblePatrimoine(rfs(), {
      ...BASE_INPUTS,
      lignesSimples: { autresDettes: { status: "DECLARE", montant: 1500 } },
    });
    assert.equal(patrimoine.lignesSimples.autresDettes.status, "DECLARE");
    assert.equal((patrimoine.lignesSimples.autresDettes as { montant: number }).montant, 1500);
    assert.equal(patrimoine.subventionsInvestissement.status, "NUL_CONFIRME");
  });

  it("7 — resolveSubventionsInvestissement (P1-A) reste indépendant de lignesSimples", () => {
    const sub = resolveSubventionsInvestissement({ status: "DECLARE", montant: 2500 });
    assert.equal(sub.status, "DECLARE");
    assert.equal((sub as { montant: number }).montant, 2500);
    // Une ligne simple NON_APPLICABLE reste refusée, sans toucher 137.
    const vmp = resolveLignePatrimonialeOuverte({ status: "NON_APPLICABLE" }, "VMP");
    assert.equal(vmp.status, "INCONNU");
  });
});
