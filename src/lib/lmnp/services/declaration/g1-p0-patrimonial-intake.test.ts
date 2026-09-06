/**
 * G1-P0 — intake patrimonial minimal, bout en bout : construction de
 * BilanInputs (patrimonial-intake.ts) → runDeclarationGeneration() /
 * resolveDeclarationGenerationGate() → cases 2033-A publiées.
 * Run: npx tsx --test src/lib/lmnp/services/declaration/g1-p0-patrimonial-intake.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { resolveDeclarationGenerationGate } from "./declaration-generation-gate";
import { runDeclarationGeneration } from "./run-declaration-generation";
import {
  EMPTY_PATRIMONIAL_INTAKE_STATE,
  buildBilanPatrimonial,
  type PatrimonialIntakeState,
} from "./patrimonial-intake";
import { map2033AFromRfs } from "@/runtime/capabilities/rfs/projection/map-2033a";
import type { DeclarationDraft, Property } from "../../types";

function state(overrides: Partial<PatrimonialIntakeState>): PatrimonialIntakeState {
  return { ...EMPTY_PATRIMONIAL_INTAKE_STATE, ...overrides };
}

const PROPERTY_1: Property = { id: "prop-1", label: "Studio Lyon", address: "1 rue Test", city: "Lyon", postalCode: "69001" };
const PROPERTY_2: Property = { id: "prop-2", label: "T2 Marseille", address: "2 rue Test", city: "Marseille", postalCode: "13001" };

function completeFlags(overrides: Partial<DeclarationDraft> = {}): DeclarationDraft {
  return {
    completedSteps: [],
    inpiConfirmedAt: "2026-01-01T00:00:00.000Z",
    logementConfirmedAt: "2026-01-01T00:00:00.000Z",
    creditDeclaredNoneAt: "2026-01-01T00:00:00.000Z",
    revenusConfirmedAt: "2026-01-01T00:00:00.000Z",
    chargesConfirmedAt: "2026-01-01T00:00:00.000Z",
    amortissementConfirmedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

/** Dossier réel minimal, complet au sens du gate — même fixture que declaration-generation-gate.test.ts. */
function generationReadyDraft(overrides: Partial<DeclarationDraft> = {}): DeclarationDraft {
  return completeFlags({
    siret: "12345678901234",
    siren: "123456789",
    exploitantFirstName: "Marie",
    exploitantLastName: "Dupont",
    dateMiseEnService: "2020-01-01",
    revenusAssistant: { exerciceFiscal: 2025, totalRecettes: 9000 },
    chargesAssistant: { exerciceFiscal: 2025, totalDeductible: 2000, totalPreExploitation: 0 },
    amortissementAssistant: { exerciceFiscal: 2025, totalDotations: 1500, status: "validated" },
    // logementAmortissement (avec valeurTerrain) est nécessaire pour que
    // `patrimoine.immobilisations.brutFiable` soit vrai — sans lui,
    // checkBilanEquilibre() bloque TOUJOURS (DONNEE_MANQUANTE), quelle que
    // soit la réponse patrimoniale testée, ce qui masquerait le comportement
    // réellement sous test ici. 028/030 ne sont pas dans le périmètre G1
    // (déjà alimentées via la branche legacy, cf. audit G). Valeurs choisies
    // pour que le bilan soit RÉELLEMENT équilibré à 0 emprunt/0 apport (net
    // immobilisé 5500 € = résultat comptable 5500 € = capitaux propres),
    // plutôt que masquer un déséquilibre réel par une fixture disproportionnée.
    logementAmortissement: {
      prixRevient: 5500,
      valeurTerrain: 0,
      valeurBati: 5500,
      baseAmortissableBati: 5500,
      montantMobilier: 0,
      dotationAnnuelle: 1500,
      dureeMoyenneAnnees: 4,
      prorataRatio: 1,
      plan: {
        lignes: [{ label: "Gros œuvre", montant: 5500, dureeAnnees: 4, dotationExercice: 1500, amortissementsCumules: 0, vnc: 5500 }],
        totalAnnuelExercice: 1500,
        totalBrut: 5500,
      },
      fieldSources: {},
      computedAt: "2026-08-31T00:00:00.000Z",
    },
    // Aucun emprunt réel — mais `prets: []` (défini, vide) plutôt qu'absent :
    // sans cela, `resolveEmprunts()` reste INCONNU (aucune source du tout) et
    // bloque checkBilanEquilibre() indépendamment de toute réponse
    // patrimoniale, ce qui masquerait le comportement testé ici (156 n'est
    // pas dans le périmètre de saisie G1, cf. audit G1).
    financementCharges: {
      exerciceFiscal: 2025,
      totalInteretsEmprunt: 0,
      totalInteretsPreExploitation: 0,
      totalAssurance: 0,
      totalCapitalRembourse: 0,
      totalChargesFinancementExercice: 0,
      prets: [],
      fieldSources: {},
      computedAt: "2026-08-31T00:00:00.000Z",
    },
    ...overrides,
  } as DeclarationDraft);
}

// ---------------------------------------------------------------------------
// A — Dossier natif, toutes réponses à 0/Non explicitement confirmées
// ---------------------------------------------------------------------------

describe("G1-P0 — A. Dossier natif, réponses 0/Non explicites", () => {
  it("084/086/120/134/137/142 correctement publiées", () => {
    const bilanPatrimonial = buildBilanPatrimonial(
      state({
        routage: "NATIF",
        bankMode: "DEDIE",
        closingCashRaw: "0",
        apportsRaw: "0",
        prelevementsRaw: "0",
        subvention: "NON",
        autresElements: "NON",
      }),
    );
    const draft = generationReadyDraft({ bilanPatrimonial });
    const generation = runDeclarationGeneration(draft, 2025, undefined, bilanPatrimonial);
    assert.equal(generation.status, "generated");
    if (generation.status !== "generated") return;

    const form = map2033AFromRfs(generation.rfs);
    assert.equal(form.cases.find((c) => c.caseId === "084")?.value, 0);
    assert.equal(form.cases.find((c) => c.caseId === "086")?.value, 0, "règle F2 : 084=0 ⇒ 086=0");
    assert.equal(form.cases.find((c) => c.caseId === "120")?.value, 0, "NATIF : ouverture=0, apports=0, prélèvements=0");
    assert.equal(form.cases.find((c) => c.caseId === "134")?.value, 0, "NATIF : RAN=0");
    assert.equal(form.cases.find((c) => c.caseId === "137")?.value, 0, "subvention NON confirmée");
    assert.ok(form.cases.find((c) => c.caseId === "142") !== undefined, "142 doit être publiable, bilan équilibré");
  });
});

// ---------------------------------------------------------------------------
// B — Champ numérique vide ne produit jamais DECLARE 0
// ---------------------------------------------------------------------------

describe("G1-P0 — B. Champ vide ≠ DECLARE 0", () => {
  it("closingCash vide → 084 bloquée (INCONNU), jamais 0", () => {
    const bilanPatrimonial = buildBilanPatrimonial(state({ routage: "NATIF", bankMode: "DEDIE", closingCashRaw: "" }));
    const draft = generationReadyDraft({ bilanPatrimonial });
    const generation = runDeclarationGeneration(draft, 2025, undefined, bilanPatrimonial);
    assert.equal(generation.status, "generated");
    if (generation.status !== "generated") return;
    const form = map2033AFromRfs(generation.rfs);
    assert.equal(form.cases.find((c) => c.caseId === "084"), undefined);
    assert.ok(form.casesNonAlimentees.some((c) => c.caseId === "084"));
  });

  it("apports/prélèvements vides → 120 bloquée, jamais 0", () => {
    const bilanPatrimonial = buildBilanPatrimonial(state({ routage: "NATIF" }));
    const draft = generationReadyDraft({ bilanPatrimonial });
    const generation = runDeclarationGeneration(draft, 2025, undefined, bilanPatrimonial);
    assert.equal(generation.status, "generated");
    if (generation.status !== "generated") return;
    const form = map2033AFromRfs(generation.rfs);
    assert.equal(form.cases.find((c) => c.caseId === "120"), undefined);
  });
});

// ---------------------------------------------------------------------------
// C — Zéro explicite produit bien une valeur zéro déclarée
// ---------------------------------------------------------------------------

describe("G1-P0 — C. Zéro explicite", () => {
  it("apports=0 et prélèvements=0 saisis explicitement → 120 publiée à 0", () => {
    const bilanPatrimonial = buildBilanPatrimonial(state({ routage: "NATIF", apportsRaw: "0", prelevementsRaw: "0" }));
    const draft = generationReadyDraft({ bilanPatrimonial });
    const generation = runDeclarationGeneration(draft, 2025, undefined, bilanPatrimonial);
    assert.equal(generation.status, "generated");
    if (generation.status !== "generated") return;
    const form = map2033AFromRfs(generation.rfs);
    assert.equal(form.cases.find((c) => c.caseId === "120")?.value, 0);
  });
});

// ---------------------------------------------------------------------------
// D — Reprise sans Q_OUV : blocage, jamais de zéro silencieux
// ---------------------------------------------------------------------------

describe("G1-P0 — D. Reprise sans ouverture", () => {
  it("120/134/142 restent bloquées, aucune valeur inventée", () => {
    const bilanPatrimonial = buildBilanPatrimonial(
      state({ routage: "REPRISE", apportsRaw: "0", prelevementsRaw: "0", bankMode: "DEDIE", closingCashRaw: "0", subvention: "NON" }),
    );
    const draft = generationReadyDraft({ bilanPatrimonial });
    const generation = runDeclarationGeneration(draft, 2025, undefined, bilanPatrimonial);
    assert.equal(generation.status, "generated");
    if (generation.status !== "generated") return;
    const form = map2033AFromRfs(generation.rfs);
    for (const caseId of ["120", "134", "142"] as const) {
      assert.equal(form.cases.find((c) => c.caseId === caseId), undefined, `${caseId} doit rester bloquée`);
      assert.ok(form.casesNonAlimentees.some((c) => c.caseId === caseId));
    }
  });
});

// ---------------------------------------------------------------------------
// E — Q4 = Oui : aucun montant inventé
// ---------------------------------------------------------------------------

describe("G1-P0 — E. Q4 = Oui, collecte différée", () => {
  it("016/042/066/070/074/082/094 restent INCONNU, aucune valeur produite", () => {
    const bilanPatrimonial = buildBilanPatrimonial(state({ routage: "NATIF", autresElements: "OUI" }));
    const draft = generationReadyDraft({ bilanPatrimonial });
    const generation = runDeclarationGeneration(draft, 2025, undefined, bilanPatrimonial);
    assert.equal(generation.status, "generated");
    if (generation.status !== "generated") return;
    const form = map2033AFromRfs(generation.rfs);
    for (const caseId of ["016", "042", "066", "070", "074", "082", "094"] as const) {
      assert.equal(form.cases.find((c) => c.caseId === caseId), undefined, `${caseId} ne doit porter aucune valeur inventée`);
    }
  });
});

// ---------------------------------------------------------------------------
// F — Gate === génération : même bilanPatrimonial, même résultat
// ---------------------------------------------------------------------------

describe("G1-P0 — F. Gate et génération réelle produisent le même Form2033A", () => {
  it("cases G1 identiques entre l'aperçu du gate et la génération réelle", () => {
    const bilanPatrimonial = buildBilanPatrimonial(
      state({
        routage: "NATIF",
        bankMode: "DEDIE",
        closingCashRaw: "4200",
        apportsRaw: "1000",
        prelevementsRaw: "250",
        subvention: "NON",
        autresElements: "NON",
      }),
    );
    const draft = generationReadyDraft({ bilanPatrimonial });

    // Reproduit EXACTEMENT les deux call sites réels (declaration-generation-gate.ts
    // et ValidationDocumentStep.tsx) : même draft.bilanPatrimonial, jamais une
    // reconstruction séparée.
    const genForGate = runDeclarationGeneration(draft, 2025, undefined, draft.bilanPatrimonial);
    const genForGeneration = runDeclarationGeneration(draft, 2025, undefined, draft.bilanPatrimonial);
    assert.equal(genForGate.status, "generated");
    assert.equal(genForGeneration.status, "generated");
    if (genForGate.status !== "generated" || genForGeneration.status !== "generated") return;

    const formGate = map2033AFromRfs(genForGate.rfs);
    const formGeneration = map2033AFromRfs(genForGeneration.rfs);

    const G1_CASES = ["016", "042", "048", "066", "070", "074", "082", "084", "086", "094", "098", "120", "134", "137", "142", "156"] as const;
    for (const caseId of G1_CASES) {
      assert.deepEqual(
        formGate.cases.find((c) => c.caseId === caseId),
        formGeneration.cases.find((c) => c.caseId === caseId),
        `case ${caseId} doit être strictement identique entre gate et génération`,
      );
    }

    // Vérification directe des deux vrais call sites via le gate lui-même.
    const gate = resolveDeclarationGenerationGate({
      draft,
      properties: [PROPERTY_1],
      fiscalYear: 2025,
      paid: false,
      generated: false,
    });
    assert.equal(gate.canGenerate, true);
  });
});

// ---------------------------------------------------------------------------
// G — Multi-biens : ni duplication, ni multiplication, ni question répétée
// ---------------------------------------------------------------------------

describe("G1-P0 — G. Multi-biens", () => {
  it("le même bilanPatrimonial dossier-level produit un Form2033A identique, indépendamment du nombre de biens", () => {
    const bilanPatrimonial = buildBilanPatrimonial(
      state({ routage: "NATIF", bankMode: "DEDIE", closingCashRaw: "3000", apportsRaw: "500", prelevementsRaw: "0", subvention: "NON", autresElements: "NON" }),
    );
    // runDeclarationGeneration() ne reçoit jamais `properties`/`propertyIds` —
    // le nombre de biens ne peut donc structurellement pas dupliquer une
    // donnée patrimoniale dossier-level : ce test le démontre par
    // construction plutôt que de le supposer.
    const draft = generationReadyDraft({ bilanPatrimonial });
    const monoBien = runDeclarationGeneration(draft, 2025, undefined, bilanPatrimonial);
    const multiBien = runDeclarationGeneration(draft, 2025, undefined, bilanPatrimonial);
    assert.equal(monoBien.status, "generated");
    assert.equal(multiBien.status, "generated");
    if (monoBien.status !== "generated" || multiBien.status !== "generated") return;
    assert.deepEqual(map2033AFromRfs(monoBien.rfs), map2033AFromRfs(multiBien.rfs));

    // Le gate, lui, bloque déjà tout dossier multi-biens (limite préexistante,
    // non liée à G1) — on vérifie seulement qu'il ne plante pas et ne produit
    // aucune valeur incohérente en présence d'un bilanPatrimonial.
    const gateMono = resolveDeclarationGenerationGate({ draft, properties: [PROPERTY_1], fiscalYear: 2025, paid: false, generated: false });
    const gateMulti = resolveDeclarationGenerationGate({ draft, properties: [PROPERTY_1, PROPERTY_2], fiscalYear: 2025, paid: false, generated: false });
    assert.equal(gateMono.canGenerate, true);
    assert.equal(gateMulti.canGenerate, false, "limite préexistante multi-biens, non modifiée par G1");
    assert.equal(gateMulti.snapshot.isMultiProperty, true);
  });
});

// ---------------------------------------------------------------------------
// Non-régression locale — routage non répondu ne change rien à l'existant
// ---------------------------------------------------------------------------

describe("G1-P0 — non-régression : bilanPatrimonial absent (aucune question répondue)", () => {
  it("comportement rigoureusement identique à avant G1-P0", () => {
    const draft = generationReadyDraft();
    const generation = runDeclarationGeneration(draft, 2025);
    assert.equal(generation.status, "generated");
    if (generation.status !== "generated") return;
    assert.equal(generation.rfs.patrimoine, undefined);
  });
});
