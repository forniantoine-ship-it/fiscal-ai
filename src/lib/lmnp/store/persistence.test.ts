/**
 * P0.1 — durcissement de la frontière Runtime ↔ Persistence.
 *
 * Deux tests distincts, volontairement indépendants des 3 pertes P0 déjà
 * connues (assurancePreExploitation/F011, revenuTheorique/F013 reprise,
 * indemnitesAssurance/fiscalResultFromDraft) — ces trois bugs sont hors
 * scope ici et ne doivent PAS être considérés comme couverts par ce fichier.
 *
 * 1. Round-trip structuredClone() — démontre que, lorsqu'un PersistedWorkspace
 *    correctement construit est remis à la persistance, sa structure est
 *    conservée par le clonage structuré (même algorithme qu'IndexedDB utilise
 *    en interne — déjà précédenté dans f010-b1-persistence-race.test.ts).
 *
 * 2. isValidWorkspace() — documente le comportement RÉEL de la fonction
 *    actuelle (persistence.ts:96), sans la modifier. `isValidWorkspace`
 *    n'étant pas exportée, ce fichier en garde une COPIE LOCALE fidèle
 *    (même pattern déjà utilisé dans f010-b1-persistence-race.test.ts pour
 *    scheduleSaveWorkspace) : si la fonction réelle change, cette copie doit
 *    être resynchronisée manuellement — ce test ne peut pas détecter une
 *    dérive entre les deux, seulement documenter le comportement actuel.
 *
 * Run: npx tsx --test src/lib/lmnp/store/persistence.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import type {
  AmortissementAssistantOutput,
  ChargesAssistantOutput,
  DeclarationDraft,
  FinancementChargesOutput,
  FiscalYear,
  Property,
  RevenusAssistantOutput,
} from "../types";
import type { PersistedWorkspace } from "./persistence";
import { runDeclarationGeneration } from "../services/declaration/run-declaration-generation";

// ---------------------------------------------------------------------------
// Fixture — un PersistedWorkspace réel, conforme aux types actuels.
// ---------------------------------------------------------------------------

const FISCAL_YEAR = 2025;

function buildFixture(): PersistedWorkspace {
  const fiscalYear: FiscalYear = {
    id: "fy-001",
    year: FISCAL_YEAR,
    status: "ready_to_close",
    regime: "reel",
    regimeConfirmedAt: "2025-01-05T09:00:00.000Z",
    declarationGeneratedAt: "2025-03-10T14:22:00.000Z",
    propertyIds: ["prop-001", "prop-002"],
    createdAt: "2025-01-01T00:00:00.000Z",
    updatedAt: "2025-03-10T14:22:00.000Z",
  };

  const properties: Property[] = [
    {
      id: "prop-001",
      label: "Studio Bellecour",
      address: "12 rue de la République",
      addressLine2: "Bât. A, 3e étage",
      city: "Lyon",
      postalCode: "69002",
      propertyType: "appartement",
      coproperty: true,
      surface: 24,
      acquisitionDate: "2019-06-15",
      status: "loue",
      notaryDocumentId: "doc-notaire-001",
    },
    {
      id: "prop-002",
      label: "T2 Croix-Rousse",
      address: "5 montée de la Grande-Côte",
      city: "Lyon",
      postalCode: "69001",
    },
  ];

  // Représentation persistée réelle de F-011 — 9 champs, conforme au type
  // FinancementChargesOutput actuel (domain.ts). `totalAssurancePreExploitation`
  // ne peut PAS être ajouté ici : ce champ n'a aucune représentation sur ce
  // type aujourd'hui (c'est exactement P0-A, hors scope de ce fichier — voir
  // en-tête). Seul `totalInteretsPreExploitation` (champ jumeau, lui bien
  // présent sur le type) est utilisé comme sonde de fidélité.
  const financementCharges: FinancementChargesOutput = {
    exerciceFiscal: FISCAL_YEAR,
    totalInteretsEmprunt: 2800,
    totalInteretsPreExploitation: 450,
    totalAssurance: 600,
    totalCapitalRembourse: 5200,
    totalChargesFinancementExercice: 3400,
    prets: [],
    fieldSources: {},
    computedAt: "2025-02-01T00:00:00.000Z",
  };

  const revenusAssistant: RevenusAssistantOutput = {
    exerciceFiscal: FISCAL_YEAR,
    totalRecettes: 12000,
    loyersEncaisses: 11000,
    // Seul endroit où ce champ existe réellement dans la structure persistée
    // actuelle (RevenusAssistantOutput.indemnitesAssurance, requis) — ne pas
    // le tester ailleurs (ex. fiscalResult), où il n'a pas de représentation.
    indemnitesAssurance: 300,
    recettesPlateforme: 700,
    ajustementsJanDec: 0,
    moisLocationEffectifs: 12,
    revenuTheorique: 11500,
    fieldSources: {},
    computedAt: "2025-02-01T00:00:00.000Z",
  };

  const chargesAssistant: ChargesAssistantOutput = {
    exerciceFiscal: FISCAL_YEAR,
    totalDeductible: 3000,
    totalNonDeductible: 100,
    totalAmortissable: 500,
    totalPreExploitation: 0,
    parCategorie: { "taxe-fonciere": 900, assurance: 250 },
    composantsNouveaux: [],
    fieldSources: {},
    computedAt: "2025-02-01T00:00:00.000Z",
  };

  const amortissementAssistant: AmortissementAssistantOutput = {
    exerciceFiscal: FISCAL_YEAR,
    totalDotations: 1800,
    status: "validated",
    planVersion: "v1",
    profil: "PROF-001",
    validatedAt: "2025-02-15T00:00:00.000Z",
  };

  const draftBeforeGeneration: DeclarationDraft = {
    completedSteps: ["activite", "revenus", "charges", "financement", "amortissements"],
    siret: "12345678901234",
    siren: "123456789",
    exploitantFirstName: "Marie",
    exploitantLastName: "Dupont",
    exploitantEmail: "marie.dupont@example.com",
    exploitantTelephone: "0601020304",
    personalAddress: "12 rue de la République",
    personalCity: "Lyon",
    personalPostalCode: "69002",
    establishmentAddress: "12 rue de la République",
    establishmentCity: "Lyon",
    establishmentPostalCode: "69002",
    dateMiseEnService: "2019-07-01",
    activityType: "LMNP",
    inpiConfirmedAt: "2025-01-03T00:00:00.000Z",
    logementConfirmedAt: "2025-01-04T00:00:00.000Z",
    creditDeclaredNoneAt: "2025-01-04T00:00:00.000Z",
    revenusConfirmedAt: "2025-01-10T00:00:00.000Z",
    chargesConfirmedAt: "2025-01-12T00:00:00.000Z",
    amortissementConfirmedAt: "2025-01-14T00:00:00.000Z",
    financementCharges,
    revenusAssistant,
    chargesAssistant,
    amortissementAssistant,
  };

  // fiscalResult/liasseResult/rfs/liasseRfs sont produits par le VRAI moteur
  // (même fonction que ValidationDocumentStep.tsx en production), pas
  // reconstruits à la main — évite d'inventer une forme de RFS/Liasse par
  // hypothèse (ADR-004 / Form2031SD / Form2033A-C sont trop profonds pour
  // être fidèlement écrits à la main dans un fixture de test).
  const generation = runDeclarationGeneration(draftBeforeGeneration, FISCAL_YEAR);
  assert.equal(
    generation.status,
    "generated",
    "le fixture doit être un dossier générable — sinon le round-trip ne porte sur rien",
  );
  if (generation.status !== "generated") throw new Error("unreachable");

  const declarationDraft: DeclarationDraft = {
    ...draftBeforeGeneration,
    fiscalResult: generation.fiscalResult,
    fiscalResultConfirmedAt: "2025-03-10T14:20:00.000Z",
    liasseResult: generation.liasseResult,
    liasseGeneratedAt: "2025-03-10T14:22:00.000Z",
    rfs: generation.rfs,
    liasseRfs: generation.liasseRfs,
  };

  return {
    fiscalYear,
    properties,
    documents: [],
    extractions: [],
    validationItems: [],
    ledgerEntries: [],
    declarationDraft,
  };
}

// ---------------------------------------------------------------------------
// 1. Round-trip structuredClone()
// ---------------------------------------------------------------------------

describe("Round-trip structuredClone() — PersistedWorkspace", () => {
  it("un workspace correctement construit est conservé intégralement (deepStrictEqual)", () => {
    const workspace = buildFixture();
    const recovered = structuredClone(workspace);

    assert.deepStrictEqual(recovered, workspace);
  });

  it("champs ciblés — sondes de fidélité nommées, lisibles indépendamment du deepStrictEqual", () => {
    const workspace = buildFixture();
    const recovered = structuredClone(workspace);
    const draft = recovered.declarationDraft!;

    assert.equal(
      draft.financementCharges?.totalInteretsPreExploitation,
      450,
      "totalInteretsPreExploitation doit survivre au clonage structuré",
    );
    assert.equal(
      draft.revenusAssistant?.revenuTheorique,
      11500,
      "revenuTheorique doit survivre au clonage structuré",
    );
    assert.equal(
      draft.revenusAssistant?.indemnitesAssurance,
      300,
      "indemnitesAssurance (RevenusAssistantOutput) doit survivre au clonage structuré — " +
        "seul endroit où ce champ existe réellement dans la structure persistée aujourd'hui",
    );
  });

  it("le fixture n'a pas de représentation de totalAssurancePreExploitation (P0-A, hors scope)", () => {
    const workspace = buildFixture();
    // Vérifie que la structure persistée réelle ne porte pas ce champ —
    // documente l'absence, ne la corrige pas. Si ce test échoue un jour
    // (le champ apparaît), c'est un signal que P0-A a été traité ailleurs.
    assert.equal(
      Object.prototype.hasOwnProperty.call(workspace.declarationDraft?.financementCharges ?? {}, "totalAssurancePreExploitation"),
      false,
    );
  });
});

// ---------------------------------------------------------------------------
// 2. isValidWorkspace() — copie locale fidèle, persistence.ts non modifié.
// ---------------------------------------------------------------------------

/**
 * Copie locale de isValidWorkspace() (persistence.ts:96-107) — la fonction
 * réelle n'est pas exportée et ne doit pas être modifiée dans cette passe.
 * Reproduction ligne pour ligne au moment de l'écriture de ce test ; à
 * resynchroniser manuellement si persistence.ts change. Ne PAS utiliser
 * cette copie comme garde de production — elle documente un comportement,
 * elle ne le garantit pas.
 */
function isValidWorkspaceCopy(data: unknown): data is PersistedWorkspace {
  if (!data || typeof data !== "object") return false;
  const w = data as PersistedWorkspace;
  return (
    Boolean(w.fiscalYear?.id) &&
    Array.isArray(w.properties) &&
    Array.isArray(w.documents) &&
    Array.isArray(w.extractions) &&
    Array.isArray(w.validationItems) &&
    Array.isArray(w.ledgerEntries)
  );
}

function minimalValidWorkspace(): PersistedWorkspace {
  return {
    fiscalYear: {
      id: "fy-min",
      year: FISCAL_YEAR,
      status: "draft",
      regime: "reel",
      propertyIds: [],
      createdAt: "2025-01-01T00:00:00.000Z",
      updatedAt: "2025-01-01T00:00:00.000Z",
    },
    properties: [],
    documents: [],
    extractions: [],
    validationItems: [],
    ledgerEntries: [],
  };
}

describe("isValidWorkspace() — documentation du comportement actuel (persistence.ts:96)", () => {
  it("cas valide — un workspace minimal satisfaisant les 6 conditions retourne true", () => {
    assert.equal(isValidWorkspaceCopy(minimalValidWorkspace()), true);
  });

  it("null retourne false", () => {
    assert.equal(isValidWorkspaceCopy(null), false);
  });

  it("une valeur primitive retourne false", () => {
    assert.equal(isValidWorkspaceCopy(42), false);
    assert.equal(isValidWorkspaceCopy("workspace"), false);
  });

  it("fiscalYear.id absent retourne false", () => {
    const w = minimalValidWorkspace();
    // @ts-expect-error — id volontairement absent pour ce cas de test
    w.fiscalYear.id = undefined;
    assert.equal(isValidWorkspaceCopy(w), false);
  });

  it("properties non-array retourne false", () => {
    const w = minimalValidWorkspace();
    // @ts-expect-error — forme volontairement invalide pour ce cas de test
    w.properties = "not-an-array";
    assert.equal(isValidWorkspaceCopy(w), false);
  });

  it("documents non-array retourne false", () => {
    const w = minimalValidWorkspace();
    // @ts-expect-error — forme volontairement invalide pour ce cas de test
    w.documents = {};
    assert.equal(isValidWorkspaceCopy(w), false);
  });

  it("extractions non-array retourne false", () => {
    const w = minimalValidWorkspace();
    // @ts-expect-error — forme volontairement invalide pour ce cas de test
    w.extractions = null;
    assert.equal(isValidWorkspaceCopy(w), false);
  });

  it("validationItems non-array retourne false", () => {
    const w = minimalValidWorkspace();
    // @ts-expect-error — forme volontairement invalide pour ce cas de test
    w.validationItems = 0;
    assert.equal(isValidWorkspaceCopy(w), false);
  });

  it("ledgerEntries non-array retourne false", () => {
    const w = minimalValidWorkspace();
    // @ts-expect-error — forme volontairement invalide pour ce cas de test
    w.ledgerEntries = undefined;
    assert.equal(isValidWorkspaceCopy(w), false);
  });

  it("cas important — declarationDraft absent ou structurellement absurde : la fonction retourne quand même true", () => {
    const withoutDraft = minimalValidWorkspace();
    assert.equal(
      isValidWorkspaceCopy(withoutDraft),
      true,
      "documente le comportement actuel : declarationDraft n'est jamais vérifié",
    );

    const withAbsurdDraft: PersistedWorkspace = {
      ...minimalValidWorkspace(),
      // @ts-expect-error — forme volontairement absurde pour documenter l'absence de vérification
      declarationDraft: "ceci n'est pas un DeclarationDraft",
    };
    assert.equal(
      isValidWorkspaceCopy(withAbsurdDraft),
      true,
      "documente le comportement actuel : un declarationDraft de forme absurde n'est jamais détecté",
    );
  });
});
