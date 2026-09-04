/**
 * Cycle 31/35 — assemblage additif de la liasse (2031-SD + 2033-A-SD + 2033-B-SD) depuis la RFS.
 * Run: npx tsx --test src/runtime/rfs-assemble-liasse.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

import { assembleLiasseFromRfs } from "./capabilities/rfs/projection/assemble-liasse-from-rfs";
import { map2033AFromRfs } from "./capabilities/rfs/projection/map-2033a";
import { map2033BFromRfs } from "./capabilities/rfs/projection/map-2033b";
import { map2033CFromRfs } from "./capabilities/rfs/projection/map-2033c";
import { produceLiasse } from "./capabilities/f007/produce-liasse";
import type { FiscalResult } from "./capabilities/f006/types";
import type { IdentiteDeclarante } from "./capabilities/f007/types";
import type { FiscalRepresentation } from "./capabilities/rfs/types";

function fiscalResult(overrides: Partial<FiscalResult> = {}): FiscalResult {
  return {
    exercice: 2025,
    recettes: { total: 9000 },
    charges: {
      totalDeductible: 2000,
      chargesExploitation: 2000,
      chargesFinancement: 0,
      chargesPreExploitation: 0,
      totalNonDeductible: 0,
    },
    resultatAvantAmort: 7000,
    amortCalcule: 1500,
    amortDeduct: 1500,
    amortReporte: 0,
    amortReportesUtilises: 0,
    resultatFiscal: 5500,
    deficitNouveau: 0,
    deficitsImputes: 0,
    perteExceptionnelle: 0,
    stocks: { deficits: [], amortissementsReportes: 0, deficitsExpires: [] },
    trace: { ksArtifacts: ["TRF-0032"], computedAt: "2026-08-31T00:00:00.000Z", journal: [] },
    status: "computed",
    anomalies: [],
    ...overrides,
  };
}

const IDENTITE: IdentiteDeclarante = {
  siren: "104545108",
  siret: "10454510800011",
  denomination: "Elsa Bouvard",
  adresseEntreprise: "15 Rue Saint-Germain, 29600 Saint-Martin-Des-Champs",
};

function rfs(fr: FiscalResult): FiscalRepresentation {
  return {
    exercice: fr.exercice,
    identite: IDENTITE,
    fiscalResult: fr,
    trace: {
      ksArtifacts: fr.trace.ksArtifacts,
      assembledAt: "2026-08-31T00:00:00.000Z",
      sourceFiscalResultAt: fr.trace.computedAt,
      sources: { identite: "IdentiteDeclarante (ENT-013)", fiscalResult: "FiscalResult (F-006)" },
    },
  };
}

describe("Cycle 31 — TEST 1 et 2 : assembleLiasseFromRfs() retourne bien un 2031-SD et un 2033-B-SD", () => {
  it("form2031 est bien un Form2031SD avec des cases", () => {
    const liasse = assembleLiasseFromRfs(rfs(fiscalResult()));
    assert.equal(liasse.form2031.formId, "2031-SD");
    assert.ok(liasse.form2031.cases.length > 0);
  });

  it("form2033B est bien un Form2033B avec des cases alimentées et des cases non alimentées", () => {
    const liasse = assembleLiasseFromRfs(rfs(fiscalResult()));
    assert.equal(liasse.form2033B.formId, "2033-B-SD");
    assert.ok(liasse.form2033B.cases.length > 0);
    assert.ok(liasse.form2033B.casesNonAlimentees.length > 0);
  });

  it("formulairesGeneres liste les 5 formulaires ADR-004/SAV-029 (P3-LIASSE-1A : 2033-D-SD rejoint la liste, socle minimal) ; formulairesManquants est vide", () => {
    const liasse = assembleLiasseFromRfs(rfs(fiscalResult()));
    assert.deepEqual(liasse.formulairesGeneres, ["2031-SD", "2033-A-SD", "2033-B-SD", "2033-C-SD", "2033-D-SD"]);
    assert.deepEqual(liasse.formulairesManquants, []);
  });
});

describe("Cycle 55 — 2033-C-SD assemblé sans transformation, cohérent avec le mapper appelé directement", () => {
  it("form2033C est bien un Form2033C avec des cases alimentées et des cases non alimentées", () => {
    const liasse = assembleLiasseFromRfs(rfs(fiscalResult()));
    assert.equal(liasse.form2033C.formId, "2033-C-SD");
    assert.ok(liasse.form2033C.cases.length > 0);
    assert.ok(liasse.form2033C.casesNonAlimentees.length > 0);
  });

  it("liasse.form2033C est structurellement identique à un appel direct de map2033CFromRfs() sur la même RFS", () => {
    const representation = rfs(fiscalResult({ resultatFiscal: 4500 }));
    const liasse = assembleLiasseFromRfs(representation);
    const direct = map2033CFromRfs(representation);
    assert.deepEqual(liasse.form2033C, direct);
  });
});

describe("Cycle 35 — 2033-A-SD assemblé sans transformation, cohérent avec le mapper appelé directement", () => {
  it("form2033A est bien un Form2033A avec des cases alimentées et des cases non alimentées", () => {
    const liasse = assembleLiasseFromRfs(rfs(fiscalResult()));
    assert.equal(liasse.form2033A.formId, "2033-A-SD");
    assert.ok(liasse.form2033A.cases.length > 0);
    assert.ok(liasse.form2033A.casesNonAlimentees.length > 0);
  });

  it("liasse.form2033A est structurellement identique à un appel direct de map2033AFromRfs() sur la même RFS", () => {
    const representation = rfs(fiscalResult({ resultatFiscal: 4500 }));
    const liasse = assembleLiasseFromRfs(representation);
    const direct = map2033AFromRfs(representation);
    assert.deepEqual(liasse.form2033A, direct);
  });
});

describe("Cycle 31 — TEST 3 et 4 : valeurs exactes des cases pass-through", () => {
  it("232 === rfs.fiscalResult.recettes.total", () => {
    const representation = rfs(fiscalResult({ recettes: { total: 12345 } }));
    const liasse = assembleLiasseFromRfs(representation);
    const case232 = liasse.form2033B.cases.find((c) => c.caseId === "232");
    assert.equal(case232?.value, representation.fiscalResult.recettes.total);
  });

  it("294 / 318 correspondent exactement aux champs RFS correspondants", () => {
    const representation = rfs(
      fiscalResult({
        charges: { totalDeductible: 6602, chargesExploitation: 2000, chargesFinancement: 4602, chargesPreExploitation: 0 },
        amortReporte: 3720,
        deficitsImputes: 1500,
      }),
    );
    const liasse = assembleLiasseFromRfs(representation);
    const byId = (id: string) => liasse.form2033B.cases.find((c) => c.caseId === id)?.value;
    assert.equal(byId("294"), representation.fiscalResult.charges.chargesFinancement);
    assert.equal(byId("318"), representation.fiscalResult.amortReporte);
    // Audit fiscal ciblé (déficits LMNP) — 360 est réservée aux entreprises à
    // l'IS (Notice 2033-NOT-SD) : jamais alimentée ici, même avec deficitsImputes > 0.
    assert.equal(byId("360"), undefined);
  });
});

describe("Cycle 31 — TEST 5 : 370 et 372 jamais alimentées simultanément", () => {
  it("bénéfice → 370 seule ; déficit → 372 seule", () => {
    const liasseBenef = assembleLiasseFromRfs(rfs(fiscalResult({ resultatFiscal: 5500, deficitNouveau: 0 })));
    const has = (liasse: ReturnType<typeof assembleLiasseFromRfs>, id: string) =>
      liasse.form2033B.cases.some((c) => c.caseId === id);
    assert.equal(has(liasseBenef, "370"), true);
    assert.equal(has(liasseBenef, "372"), false);

    const liasseDeficit = assembleLiasseFromRfs(rfs(fiscalResult({ resultatFiscal: 0, deficitNouveau: 9862 })));
    assert.equal(has(liasseDeficit, "372"), true);
    assert.equal(has(liasseDeficit, "370"), false);
  });
});

describe("Cycle 31/32 — TEST 6 : cases bloquées jamais inventées, jamais 0 par défaut", () => {
  it("352/354/356 n'apparaissent jamais dans cases, uniquement dans casesNonAlimentees — 264/270/310/312/314 sont désormais alimentées (Cycle 32)", () => {
    const liasse = assembleLiasseFromRfs(rfs(fiscalResult()));
    const blockedIds = ["352", "354", "356"];
    for (const id of blockedIds) {
      assert.equal(
        liasse.form2033B.cases.some((c) => c.caseId === id),
        false,
        `${id} ne doit jamais recevoir de valeur, même via l'assembleur`,
      );
    }
    for (const id of ["264", "270", "310", "312"]) {
      assert.ok(
        liasse.form2033B.cases.some((c) => c.caseId === id),
        `${id} doit être alimentée depuis le Cycle 32 (charges.totalNonDeductible exposé)`,
      );
    }
  });
});

describe("Cycle 31/32 — TEST 7 : 356 correctement catégorisée non_applicable (pas hors_perimetre)", () => {
  it("356 est dans casesNonAlimentees avec categorie 'non_applicable' — mécanisme réservé à l'IS, pas un choix de périmètre Fiscal AI", () => {
    const liasse = assembleLiasseFromRfs(rfs(fiscalResult()));
    const case356 = liasse.form2033B.casesNonAlimentees.find((c) => c.caseId === "356");
    assert.ok(case356);
    assert.equal(case356?.categorie, "non_applicable");
  });
});

describe("Cycle 31 — TEST 8 : CaseTrace pointe vers FiscalResult/IdentiteDeclarante", () => {
  it("chaque case du 2033-B a trace.source === 'FiscalResult'", () => {
    const liasse = assembleLiasseFromRfs(rfs(fiscalResult({ resultatFiscal: 5500 })));
    for (const c of liasse.form2033B.cases) {
      assert.equal(c.trace.source, "FiscalResult");
    }
  });

  it("chaque case du 2031-SD a une trace avec un source connu (FiscalResult, IdentiteDeclarante ou scope)", () => {
    const liasse = assembleLiasseFromRfs(rfs(fiscalResult()));
    for (const c of liasse.form2031.cases) {
      assert.ok(["FiscalResult", "IdentiteDeclarante", "scope"].includes(c.trace.source));
    }
  });
});

describe("Cycle 31 — TEST 9 : le résultat assemblé n'altère pas la sortie du mapper 2033-B", () => {
  it("liasse.form2033B est structurellement identique à un appel direct de map2033BFromRfs() sur la même RFS", () => {
    const representation = rfs(fiscalResult({ resultatFiscal: 4500, deficitsImputes: 1000 }));
    const liasse = assembleLiasseFromRfs(representation);
    const direct = map2033BFromRfs(representation);
    assert.deepEqual(liasse.form2033B, direct);
  });
});

describe("Cycle 31 — TEST 10 : aucun calcul fiscal secondaire (garde d'architecture)", () => {
  it("assemble-liasse-from-rfs.ts et map-2031-from-rfs.ts n'importent, en valeur, aucun moteur de calcul ni assistant", () => {
    const files = [
      "capabilities/rfs/projection/assemble-liasse-from-rfs.ts",
      "capabilities/rfs/projection/map-2031-from-rfs.ts",
      "capabilities/rfs/projection/map-2033a.ts",
      "capabilities/rfs/projection/map-2033b.ts",
      "capabilities/rfs/projection/map-2033c.ts",
    ];
    const forbidden = [
      "produceFiscalResult",
      "applyAmortissementStocks",
      "fiscalResultFromDraft",
      "draft-to-liasse-inputs",
      "FEC",
      "fec-reader",
      "fec-parser",
      "readFileSync",
      "capabilities/f010",
      "capabilities/f011",
      "capabilities/f012",
      "capabilities/f013",
      "capabilities/f014",
      "assistants/f010",
      "assistants/f011",
      "assistants/f012",
      "assistants/f013",
      "assistants/f014",
    ];
    for (const file of files) {
      const source = readFileSync(path.join(__dirname, file), "utf-8");
      const importLines = source
        .split("\n")
        .filter((line) => /^\s*import\b/.test(line))
        .join("\n");
      for (const token of forbidden) {
        assert.equal(importLines.includes(token), false, `${file} ne doit pas importer ${token}`);
      }
    }
  });
});

describe("Cycle 31 — TEST 11 : document client 149 € et liasse RFS ne peuvent pas diverger silencieusement", () => {
  it("recettes (232) et résultat/déficit du document client proviennent de la même RFS, sans écart", async () => {
    const { buildClientSummaryDocument } = await import(
      "@/lib/lmnp/services/declaration/build-client-summary-document"
    );

    const representationBenef = rfs(fiscalResult({ recettes: { total: 8888 }, resultatFiscal: 4500 }));
    const liasseBenef = assembleLiasseFromRfs(representationBenef);
    const clientDocBenef = buildClientSummaryDocument(representationBenef);
    assert.equal(
      liasseBenef.form2033B.cases.find((c) => c.caseId === "232")?.value,
      clientDocBenef.syntheseFiscale.recettes,
    );
    assert.equal(
      liasseBenef.form2033B.cases.find((c) => c.caseId === "370")?.value,
      clientDocBenef.syntheseFiscale.resultatFiscal,
    );

    const representationDeficit = rfs(fiscalResult({ resultatFiscal: 0, deficitNouveau: 9862 }));
    const liasseDeficit = assembleLiasseFromRfs(representationDeficit);
    const clientDocDeficit = buildClientSummaryDocument(representationDeficit);
    assert.equal(
      liasseDeficit.form2033B.cases.find((c) => c.caseId === "372")?.value,
      clientDocDeficit.syntheseFiscale.deficitFiscal,
    );
  });
});

describe("Cycle 31 — TEST 12 : régression du chemin historique produceLiasse()", () => {
  it("produceLiasse() continue de fonctionner exactement comme avant (2031-SD uniquement, non affecté par le nouvel assembleur)", () => {
    const fr = fiscalResult({ resultatFiscal: 5500 });
    const output = produceLiasse({ fiscalResult: fr, identite: IDENTITE });
    assert.ok(output.liasse);
    assert.equal(output.liasse?.formulairesGeneres.length, 1);
    assert.equal(output.liasse?.formulairesGeneres[0].formId, "2031-SD");
    assert.deepEqual(output.liasse?.formulairesManquants, ["2033-A-SD", "2033-B-SD", "2033-C-SD", "2033-D-SD"]);
    assert.equal(output.liasse?.status, "partial");
  });
});
