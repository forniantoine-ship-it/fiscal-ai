import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { computeCoproDeductible } from "./capabilities/f012/compute-copro-deductible";
import { computeChargesExercice } from "./capabilities/f012/compute-charges-exercice";
import { computeTaxeFonciereDeductible } from "./capabilities/f012/compute-taxe-fonciere-deductible";
import { detectFinancementOverlap } from "./capabilities/f012/detect-financement-overlap";
import { isolatePreExploitationCharge } from "./capabilities/f012/isolate-pre-exploitation-charge";
import { qualifyTravail, splitMixteTravaux } from "./capabilities/f012/qualify-travail";
import { explainCharges } from "./presentation/explain-charges";
import { F012ChargesAssistant } from "./assistants/f012-charges/assistant";

describe("F-012 — TRF-0026 qualification travaux", () => {
  it("qualifie une réparation identique en charge (AX-013)", () => {
    const result = qualifyTravail({
      description: "Remplacement chauffe-eau équivalent",
      montant: 1800,
      natureIntervention: "entretien",
    });
    assert.equal(result.qualification, "charge");
    assert.equal(result.destinationFlux, "charges");
  });

  it("qualifie une amélioration en immobilisation (AX-014)", () => {
    const result = qualifyTravail({
      description: "Douche italienne",
      montant: 8000,
      natureIntervention: "amélioration",
    });
    assert.equal(result.qualification, "immobilisation");
    assert.equal(result.destinationFlux, "amortissements");
  });
});

describe("F-012 — cas nominal copropriété + gestion", () => {
  it("totalise €4 640 (cas nominal F-012)", () => {
    const copro = computeCoproDeductible({
      lignes: [
        { type: "provisions", montant: 1800 },
        { type: "regularisation", montant: -120 },
        { type: "fonds_travaux", montant: 120 },
        { type: "appel_gros_travaux", montant: 800, grosTravauxDeductible: true },
      ],
    });
    assert.equal(copro.coproprieteDeductible, 2480);
    assert.equal(copro.fondsTravauxNonDeductible, 120);

    const result = computeChargesExercice({
      exerciceFiscal: 2024,
      dateMiseEnService: "2023-01-01",
      taxeFonciere: 1200,
      coproLignes: [
        { type: "provisions", montant: 1800 },
        { type: "regularisation", montant: -120 },
        { type: "fonds_travaux", montant: 120 },
        { type: "appel_gros_travaux", montant: 800, grosTravauxDeductible: true },
      ],
      honorairesGestion: 780,
      fraisEtatDesLieux: 180,
      assurancePno: 0,
    });

    assert.equal(result.charges.totalDeductible, 4640);
    assert.equal(result.charges.totalNonDeductible, 120);
  });
});

describe("F-012 — cas travaux complexe", () => {
  it("scinde une facture mixte €12 000", () => {
    const split = splitMixteTravaux(12000, 4000);
    assert.equal(split.charge, 4000);
    assert.equal(split.immobilisation, 8000);

    const result = computeChargesExercice({
      exerciceFiscal: 2024,
      dateMiseEnService: "2023-01-01",
      travaux: [
        {
          id: "sdb",
          description: "Rénovation salle de bain",
          montant: 12000,
          natureIntervention: "entretien",
          montantReparation: 4000,
          // TRF-0028 — date propre au composant (fin des travaux), jamais
          // celle du bien (`dateMiseEnService` ci-dessus, 2023-01-01).
          dateDebut: "2024-06-01",
        },
      ],
    });

    assert.equal(result.charges.parCategorie.travaux, 4000);
    assert.equal(result.charges.totalAmortissable, 8000);
    assert.equal(result.charges.composantsNouveaux.length, 1);
    assert.equal(result.charges.composantsNouveaux[0]?.montant, 8000);
    assert.equal(result.charges.composantsNouveaux[0]?.dateDebut, "2024-06-01");
    assert.equal(result.anomalies.length, 0);
  });
});

describe("P0-A copro — appel gros travaux : date propre au composant, jamais celle du bien", () => {
  // Bien mis en service en 2023 ; appel de fonds gros travaux copropriété
  // achevé/mis en service en 2025 seulement — même anti-pattern que pour les
  // travaux F-012 "classiques", même correctif attendu.
  it("bloque sans date propre — jamais une date héritée du bien", () => {
    const result = computeChargesExercice({
      exerciceFiscal: 2024,
      dateMiseEnService: "2023-01-01",
      coproLignes: [
        { id: "copro-1", type: "appel_gros_travaux", montant: 12000, grosTravauxDeductible: false },
      ],
    });
    assert.equal(result.charges.composantsNouveaux.length, 0, "aucun composant créé sans date propre");
    assert.equal(result.charges.totalAmortissable, 0);
    assert.ok(
      result.anomalies.some((a) => a.severity === "error" && a.field === "copro-1"),
      "l'absence de date propre doit bloquer, jamais être invisible",
    );
  });

  it("aucune dotation avant l'année de la date propre du composant (2023, 2024), première dotation en 2025", () => {
    const withDate = (exerciceFiscal: number) =>
      computeChargesExercice({
        exerciceFiscal,
        dateMiseEnService: "2023-01-01",
        coproLignes: [
          {
            id: "copro-1",
            type: "appel_gros_travaux",
            montant: 12000,
            grosTravauxDeductible: false,
            dateDebut: "2025-09-01",
          },
        ],
      });

    for (const exerciceFiscal of [2023, 2024]) {
      const result = withDate(exerciceFiscal);
      // Le composant est créé (base connue) mais sans dotation avant sa
      // propre date de mise en service — vérifié ici au niveau F-012 ; la
      // dotation par exercice elle-même est calculée par F-014 (voir
      // f014.test.ts, même principe déjà validé pour les travaux).
      assert.equal(result.charges.composantsNouveaux[0]?.dateDebut, "2025-09-01");
      assert.equal(result.anomalies.length, 0);
    }

    const result2025 = withDate(2025);
    assert.equal(result2025.charges.composantsNouveaux.length, 1);
    assert.equal(result2025.charges.composantsNouveaux[0]?.montant, 12000);
    assert.equal(result2025.charges.composantsNouveaux[0]?.origin, "f012_copro");
    assert.equal(result2025.charges.totalAmortissable, 12000);
  });

  it("identité stable dérivée de l'id de la ligne copro, jamais d'un index régénéré", () => {
    const result = computeChargesExercice({
      exerciceFiscal: 2025,
      dateMiseEnService: "2023-01-01",
      coproLignes: [
        {
          id: "copro-gros-travaux-toiture",
          type: "appel_gros_travaux",
          montant: 9000,
          grosTravauxDeductible: false,
          dateDebut: "2025-01-01",
        },
      ],
    });
    assert.equal(result.charges.composantsNouveaux[0]?.id, "copro-gros-travaux-toiture");
  });
});

describe("F-012 — pré-exploitation taxe foncière", () => {
  it("isole la part avant mise en service dans l'exercice", () => {
    const isolated = isolatePreExploitationCharge({
      montant: 1200,
      exerciceFiscal: 2024,
      dateMiseEnService: "2024-08-01",
    });
    assert.equal(isolated.montantDeductible, 500);
    assert.equal(isolated.montantPreExploitation, 700);

    const tf = computeTaxeFonciereDeductible({
      montant: 1200,
      exerciceFiscal: 2024,
      dateMiseEnService: "2024-08-01",
    });
    assert.equal(tf.taxeFonciereDeductible, 500);
    assert.equal(tf.montantPreExploitation, 700);
  });
});

describe("F-012 — correction doublon totalPreExploitation (taxe foncière)", () => {
  it("A. sans pré-exploitation, la taxe foncière reste inchangée", () => {
    const result = computeChargesExercice({
      exerciceFiscal: 2024,
      dateMiseEnService: "2023-01-01",
      taxeFonciere: 1200,
    });
    assert.equal(result.charges.totalDeductible, 1200);
    assert.equal(result.charges.totalPreExploitation, 0);
  });

  it("B. avec pré-exploitation, totalPreExploitation ne compte le montant qu'une seule fois", () => {
    const result = computeChargesExercice({
      exerciceFiscal: 2024,
      dateMiseEnService: "2024-08-01",
      taxeFonciere: 1200,
    });
    assert.equal(result.charges.totalDeductible, 500);
    assert.equal(result.charges.totalPreExploitation, 700);
    assert.notEqual(result.charges.totalPreExploitation, 1400);
    // P0-3a.1 (AX-011/RAI-011/TRF-0025) — la part pré-exploitation de la taxe
    // foncière est une charge déductible, jamais "non_deductible" : elle ne
    // doit plus jamais apparaître dans totalNonDeductible.
    assert.equal(result.charges.totalNonDeductible, 0);
  });

  it("E. plusieurs catégories : une seule part pré-exploitation par catégorie", () => {
    const result = computeChargesExercice({
      exerciceFiscal: 2024,
      dateMiseEnService: "2024-08-01",
      taxeFonciere: 1200,
      assurancePno: 600,
    });
    // taxe foncière : 700 pré-exploitation ; assurance PNO : 350 pré-exploitation
    assert.equal(result.charges.totalPreExploitation, 1050);
  });

  it("F. montant 0 : aucune ligne, aucune duplication", () => {
    const result = computeChargesExercice({
      exerciceFiscal: 2024,
      dateMiseEnService: "2024-08-01",
      taxeFonciere: 0,
    });
    assert.equal(result.charges.totalDeductible, 0);
    assert.equal(result.charges.totalPreExploitation, 0);
    assert.equal(result.charges.lignes.length, 0);
  });

  it("G. non-régression du cas nominal copropriété + gestion (€4 640)", () => {
    const result = computeChargesExercice({
      exerciceFiscal: 2024,
      dateMiseEnService: "2023-01-01",
      taxeFonciere: 1200,
      coproLignes: [
        { type: "provisions", montant: 1800 },
        { type: "regularisation", montant: -120 },
        { type: "fonds_travaux", montant: 120 },
        { type: "appel_gros_travaux", montant: 800, grosTravauxDeductible: true },
      ],
      honorairesGestion: 780,
      fraisEtatDesLieux: 180,
      assurancePno: 0,
    });
    assert.equal(result.charges.totalDeductible, 4640);
    assert.equal(result.charges.totalNonDeductible, 120);
    assert.equal(result.charges.totalPreExploitation, 0);
  });
});

/**
 * P0-3a.1 — mini-audit read-only validé : la taxe foncière pré-exploitation
 * est une charge déductible d'exploitation (AX-011, RAI-011 ; TRF-0025 ne
 * prévoit que 3 destinations — charges/immobilisation/travaux — jamais
 * "non_deductible"). Avant ce correctif, `compute-charges-exercice.ts`
 * taguait cette ligne "non_deductible", faisant apparaître le même montant
 * à la fois dans `totalNonDeductible` et `totalPreExploitation`.
 */
describe("P0-3a.1 — taxe foncière pré-exploitation qualifiée déductible (plus jamais non_deductible)", () => {
  it("600 € de taxe foncière, 300 € pré-exploitation : totalPreExploitation=300, totalNonDeductible=0", () => {
    const result = computeChargesExercice({
      exerciceFiscal: 2024,
      dateMiseEnService: "2024-07-01",
      taxeFonciere: 600,
    });
    const ligneTaxeFonciere = result.charges.lignes.find((l) => l.id === "taxe-fonciere");
    const lignePreExploitation = result.charges.lignes.find((l) => l.id === "taxe-fonciere-pre-exploitation");

    assert.equal(lignePreExploitation?.montantPreExploitation, 300, "le prorata pré-exploitation lui-même est inchangé");
    assert.equal(
      lignePreExploitation?.deductibilite,
      "deductible",
      "la ligne pré-exploitation doit désormais être qualifiée déductible, jamais non_deductible",
    );
    assert.equal(
      result.charges.totalDeductible,
      ligneTaxeFonciere?.montantDeductible,
      "totalDeductible reste conforme au comportement existant de computeTaxeFonciereDeductible — inchangé par ce correctif",
    );
    assert.equal(result.charges.totalPreExploitation, 300, "totalPreExploitation n'a pas été modifié par ce correctif");
    assert.equal(result.charges.totalNonDeductible, 0, "la part pré-exploitation ne doit plus jamais figurer dans totalNonDeductible");
  });

  it("non-régression : le fonds de travaux ALUR reste non_deductible (seule la taxe foncière change)", () => {
    const result = computeChargesExercice({
      exerciceFiscal: 2024,
      dateMiseEnService: "2024-07-01",
      taxeFonciere: 600,
      coproLignes: [{ type: "fonds_travaux", montant: 120, description: "Fonds de travaux ALUR" }],
    });
    const ligneFonds = result.charges.lignes.find((l) => l.categorie === "copropriete");

    assert.equal(ligneFonds?.deductibilite, "non_deductible", "le fonds de travaux ALUR reste non déductible — non concerné par ce correctif");
    assert.equal(
      result.charges.totalNonDeductible,
      120,
      "seule la part non_deductible du fonds de travaux reste dans totalNonDeductible — la taxe foncière pré-exploitation (300) n'y est plus",
    );
    assert.equal(result.charges.totalPreExploitation, 300, "la part pré-exploitation de la taxe foncière reste intégralement portée par totalPreExploitation");
  });
});

describe("F-012 — Cycle 3 : détection doublon financement (RAI-000, AX-009)", () => {
  it("A — assurance emprunteur identique au montant F-011 : détectée, montant identique reconnu", () => {
    const result = detectFinancementOverlap({
      description: "Assurance emprunteur",
      montant: 300,
      financementCharges: { totalAssurance: 300, totalCapitalRembourse: 0 },
    });
    assert.equal(result.kind, "assurance_emprunteur");
    assert.equal(result.kind === "assurance_emprunteur" && result.sameAmount, true);
  });

  it("B — assurance emprunteur détectée même avec un montant différent de F-011 (jamais un doublon partiel)", () => {
    const result = detectFinancementOverlap({
      description: "Assurance de prêt immobilier",
      montant: 450,
      financementCharges: { totalAssurance: 300, totalCapitalRembourse: 0 },
    });
    assert.equal(result.kind, "assurance_emprunteur");
    assert.equal(result.kind === "assurance_emprunteur" && result.sameAmount, false);
  });

  it("C — assurance emprunteur détectée même sans aucune donnée F-011 (la règle ne dépend pas d'un montant connu)", () => {
    const result = detectFinancementOverlap({ description: "Assurance emprunteur", montant: 300 });
    assert.equal(result.kind, "assurance_emprunteur");
    assert.equal(result.kind === "assurance_emprunteur" && result.sameAmount, false);

    const zeroKnown = detectFinancementOverlap({
      description: "Assurance de crédit",
      montant: 300,
      financementCharges: { totalAssurance: 0, totalCapitalRembourse: 0 },
    });
    assert.equal(zeroKnown.kind, "assurance_emprunteur");
  });

  it("D — capital de prêt : détecté et bloquant, quelle que soit la présence de données F-011 (AX-009, inconditionnel)", () => {
    assert.equal(
      detectFinancementOverlap({ description: "Remboursement du capital du prêt", montant: 1000 }).kind,
      "capital_pret",
    );
    assert.equal(
      detectFinancementOverlap({
        description: "Part de capital de l'emprunt",
        montant: 1000,
        financementCharges: { totalAssurance: 0, totalCapitalRembourse: 0 },
      }).kind,
      "capital_pret",
    );
  });

  it("E — charges normales proches sans mot-clé de financement : aucun faux positif", () => {
    assert.equal(detectFinancementOverlap({ description: "Assurance habitation du bien", montant: 200 }).kind, "none");
    assert.equal(detectFinancementOverlap({ description: "assurance logement", montant: 300 }).kind, "none");
    assert.equal(
      detectFinancementOverlap({ description: "assurance liée au financement", montant: 661 }).kind,
      "assurance_emprunteur",
    );
    assert.equal(detectFinancementOverlap({ description: "assurance du prêt", montant: 661 }).kind, "assurance_emprunteur");
    assert.equal(detectFinancementOverlap({ description: "assurance crédit", montant: 661 }).kind, "assurance_emprunteur");
    assert.equal(detectFinancementOverlap({ description: "Frais de garantie bancaire", montant: 50 }).kind, "none");
    assert.equal(detectFinancementOverlap({ description: "Abonnement logiciel de gestion", montant: 120 }).kind, "none");
  });

  it("F — multi-prêts : le total F-011 déjà agrégé par prêt est utilisé tel quel", () => {
    // financementCharges.totalAssurance agrège déjà 2 prêts (200 + 300) côté F-011 —
    // F-012 ne recalcule jamais cette agrégation (RAI-000), il la consomme telle quelle.
    const result = detectFinancementOverlap({
      description: "Assurance emprunteur",
      montant: 500,
      financementCharges: { totalAssurance: 500, totalCapitalRembourse: 0 },
    });
    assert.equal(result.kind, "assurance_emprunteur");
    assert.equal(result.kind === "assurance_emprunteur" && result.sameAmount, true);
  });

  it("insensible à la casse et aux accents", () => {
    assert.equal(detectFinancementOverlap({ description: "ASSURANCE DE PRÊT", montant: 100 }).kind, "assurance_emprunteur");
    assert.equal(detectFinancementOverlap({ description: "remboursement du capital", montant: 100 }).kind, "capital_pret");
  });
});

describe("F-012 — explanation", () => {
  it("produit une synthèse lisible", () => {
    const result = computeChargesExercice({
      exerciceFiscal: 2024,
      dateMiseEnService: "2023-01-01",
      taxeFonciere: 1200,
      assurancePno: 300,
    });
    const explain = explainCharges({ charges: result.charges });
    assert.match(explain.explanation, /charges déductibles/);
  });
});

describe("F-012 — Assistant", () => {
  it("termine le parcours profilage → validation", async () => {
    const assistant = new F012ChargesAssistant(
      { dossierId: "test", fiscalYear: 2024, route: "/assistants/charges" },
      { dateMiseEnService: "2023-01-01" },
    );

    let state = assistant.start().state;
    let turn = await assistant.handle(state, {
      type: "submit_profilage",
      copropriete: true,
      agence: true,
      travaux: false,
      vacance: false,
      comptable: false,
    });
    state = turn.state;

    turn = await assistant.handle(state, {
      type: "submit_taxe_fonciere",
      montant: 1200,
    });
    state = turn.state;

    turn = await assistant.handle(state, {
      type: "submit_assurance_pno",
      montant: 250,
    });
    state = turn.state;

    while (state.step === "category_collect" && state.categoryInventory[state.currentCategoryIndex] !== "copropriete") {
      turn = await assistant.handle(state, { type: "skip_category" });
      state = turn.state;
    }

    turn = await assistant.handle(state, {
      type: "submit_copro",
      lignes: [
        { type: "provisions", montant: 1800 },
        { type: "regularisation", montant: -120 },
        { type: "fonds_travaux", montant: 120 },
      ],
    });
    state = turn.state;

    while (state.step === "category_collect") {
      turn = await assistant.handle(state, { type: "skip_category" });
      state = turn.state;
    }

    if (state.step === "completeness") {
      turn = await assistant.handle(state, { type: "confirm_completeness", hasOther: false });
      state = turn.state;
    }

    turn = await assistant.handle(state, { type: "confirm_all" });
    assert.equal(turn.completed, true);
    assert.equal(turn.event, "CHARGES_TERMINE");
    assert.ok(turn.state.result?.charges.totalDeductible);
  });
});

/**
 * Cycle 20 (audit de clôture) — même défaut que F-011/F-013 : `new
 * Date("YYYY-MM-DD")` (minuit UTC) relu via `.getMonth()` (local) ET comparé,
 * de façon incohérente, à des bornes d'année construites en local. Démontré
 * par la suite complète F-012 échouant sous TZ=America/New_York avant
 * correctif.
 */
describe("Cycle 20 — F-012 isolatePreExploitationCharge invariant au fuseau horaire", () => {
  const TIMEZONES = ["UTC", "Europe/Paris", "America/New_York", "Pacific/Auckland"];

  it("le prorata mensuel (mise en service 01/07) reste identique sous les 4 fuseaux testés", () => {
    const results = TIMEZONES.map((tz) => {
      const previous = process.env.TZ;
      process.env.TZ = tz;
      try {
        return isolatePreExploitationCharge({
          montant: 1200,
          exerciceFiscal: 2024,
          dateMiseEnService: "2024-07-01",
        });
      } finally {
        process.env.TZ = previous;
      }
    });
    const [reference, ...rest] = results;
    assert.equal(reference!.montantDeductible, 600, "6 mois déductibles sur 12 (juillet à décembre)");
    for (const [i, result] of rest.entries()) {
      assert.equal(result.montantDeductible, reference!.montantDeductible, `sous TZ=${TIMEZONES[i + 1]}`);
    }
  });
});
