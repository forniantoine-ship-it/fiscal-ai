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
  gateTotal176Dettes,
  resolveLignePatrimonialeOuverte,
  resolveLignesSimples,
} from "./capabilities/bilan/lignes-simples";
import { resolveSubventionsInvestissement } from "./capabilities/bilan/subventions-investissement";
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
