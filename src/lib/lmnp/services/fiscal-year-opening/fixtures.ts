/**
 * Fixtures Lot 1 — reprise comptable (parité adaptateur / invariants OpeningFact).
 */

import type { PersistedWorkspace } from "@/lib/lmnp/store/persistence";
import type { FiscalYear, FiscalEngineOutput } from "@/lib/lmnp/types/domain";
import type { FiscalYearClosure } from "@/lib/lmnp/types/dossier";
import { available, unavailable } from "./opening-fact";
import type { FiscalYearOpening } from "./types";

const STOCKS_EMPTY: FiscalEngineOutput["stocks"] = {
  deficits: [],
  amortissementsReportes: 0,
  deficitsExpires: [],
};

export function fixtureClosedFiscalYear(overrides: Partial<FiscalYear> = {}): FiscalYear {
  return {
    id: "fy-2025",
    year: 2025,
    status: "closed",
    regime: "reel",
    propertyIds: ["prop-1"],
    createdAt: "2025-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    dossierId: "dossier-1",
    previousFiscalYearId: null,
    declarationGeneratedAt: "2026-01-01T00:00:00.000Z",
    closures: [],
    ...overrides,
  };
}

export function fixtureClosure(overrides: Partial<FiscalYearClosure> = {}): FiscalYearClosure {
  return {
    id: "closure-2025",
    fiscalYearId: "fy-2025",
    dossierId: "dossier-1",
    stocks: STOCKS_EMPTY,
    computedAt: "2026-01-01T00:00:00.000Z",
    closedAt: "2026-01-02T00:00:00.000Z",
    ...overrides,
  };
}

/** Fixture 1 — simple : déficits confirmés vides, stock amort = 0 confirmé. */
export function fixture1Simple(): {
  closed: FiscalYear;
  archived: PersistedWorkspace;
  expectedStocks: FiscalYearOpening["stocks"];
} {
  const closure = fixtureClosure({
    stocks: { deficits: [], amortissementsReportes: 0, deficitsExpires: [] },
    patrimoine: {
      compteExploitantAvantAffectationResultat: 1000,
      resultatComptableExercice: 500,
      ranSituation: "NATIF",
      ranValeur: 0,
    },
  });
  const closed = fixtureClosedFiscalYear({ closures: [closure] });
  const archived: PersistedWorkspace = {
    fiscalYear: closed,
    properties: [
      {
        id: "prop-1",
        label: "Appartement",
        address: "1 rue Test",
        city: "Paris",
        postalCode: "75001",
      },
    ],
    documents: [],
    extractions: [],
    validationItems: [],
    ledgerEntries: [],
    declarationDraft: {
      completedSteps: [],
      siret: "12345678900011",
      siren: "123456789",
      activityStartDate: "2020-01-15",
      dateMiseEnService: "2020-01-15",
      financementAssistantState: {
        step: "complete",
        currentLoanIndex: 0,
        loans: [],
        fieldSources: {},
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
    },
  };
  return {
    closed,
    archived,
    expectedStocks: {
      deficits: available([]),
      amortissementsReportes: available(0),
    },
  };
}

/** Fixture 2 — stocks non nuls + immobilisations + prêt. */
export function fixture2WithCarryforwardAndAssets(): {
  closed: FiscalYear;
  archived: PersistedWorkspace;
} {
  const closure = fixtureClosure({
    stocks: {
      deficits: [{ millesime: 2023, montant: 2000 }],
      amortissementsReportes: 4000,
      deficitsExpires: [],
    },
    patrimoine: {
      compteExploitantAvantAffectationResultat: 10000,
      resultatComptableExercice: -2000,
      ranSituation: "IMPORTE",
      ranValeur: 1500,
    },
    immobilisationsComptables: {
      brutCloture: 120000,
      amortissementsCumulesCloture: 15000,
      vncCloture: 105000,
      actifs: [
        {
          id: "terrain",
          propertyId: "prop-1",
          label: "Terrain",
          categorie: "terrain",
          coutBrut: 20000,
          amortissementCumule: 0,
          vnc: 20000,
          provenance: "historique",
        },
        {
          id: "f010-0",
          propertyId: "prop-1",
          label: "Gros œuvre",
          categorie: "composant",
          coutBrut: 100000,
          amortissementCumule: 15000,
          vnc: 85000,
          provenance: "historique",
        },
      ],
    },
  });
  const closed = fixtureClosedFiscalYear({ closures: [closure] });
  const archived: PersistedWorkspace = {
    fiscalYear: closed,
    properties: [
      {
        id: "prop-1",
        label: "Appartement",
        address: "1 rue Test",
        city: "Paris",
        postalCode: "75001",
        amortissementBase: {
          composants: [{ label: "Gros œuvre", montant: 100000, dureeAnnees: 50 }],
          valeurTerrain: 20000,
          dateMiseEnService: "2019-06-01",
        },
      },
    ],
    documents: [],
    extractions: [],
    validationItems: [],
    ledgerEntries: [],
    declarationDraft: {
      completedSteps: [],
      siret: "12345678900011",
      dateMiseEnService: "2019-06-01",
      logementAmortissement: {
        prixRevient: 120000,
        valeurTerrain: 20000,
        valeurBati: 100000,
        baseAmortissableBati: 100000,
        montantMobilier: 0,
        dotationAnnuelle: 2000,
        dureeMoyenneAnnees: 50,
        prorataRatio: 1,
        plan: {
          lignes: [
            {
              label: "Gros œuvre",
              montant: 100000,
              dureeAnnees: 50,
              dotationExercice: 2000,
              amortissementsCumules: 15000,
              vnc: 85000,
            },
          ],
          totalAnnuelExercice: 2000,
          totalBrut: 100000,
        },
        fieldSources: {},
        computedAt: "2026-01-01T00:00:00.000Z",
        exerciceFiscal: 2025,
      },
      financementAssistantState: {
        step: "complete",
        currentLoanIndex: 0,
        loans: [
          {
            pretId: "pret-1",
            typePret: "amortissable",
            capitalInitial: 180000,
            tauxNominal: 0.035,
            dureeMois: 240,
            datePremiereMensualite: "2019-07-01",
            assuranceAnnuelle: 400,
            assuranceType: "bancaire",
            typeGarantie: "caution",
          },
        ],
        fieldSources: {},
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
    },
  };
  return { closed, archived };
}

/** Fixture 3 — absences explicites (UNAVAILABLE), jamais normalisées en 0/[]. */
export function fixture3UnavailableFacts(): FiscalYearOpening {
  return {
    openingId: "opening-unavailable",
    revision: 1,
    targetFiscalYear: 2026,
    dossierId: "dossier-1",
    source: {
      kind: "internal_closure",
      previousFiscalYearId: "fy-2025",
      sourceClosureId: "closure-2025",
    },
    stocks: {
      deficits: unavailable("déficits inconnus"),
      amortissementsReportes: unavailable("stock amortissements inconnu"),
    },
    assets: unavailable("actifs inconnus"),
    loans: unavailable("prêts inconnus"),
    patrimoine: {
      ouvertureCompteExploitant: unavailable("compte exploitant inconnu"),
      ran: unavailable("RAN inconnu"),
      tresorerieOuverture: unavailable("trésorerie inconnue"),
    },
    properties: unavailable("biens inconnus"),
    identity: unavailable("identité inconnue"),
    provenance: {
      source: { fieldPath: "source", sourceKind: "closure", sourceRef: "closure-2025" },
      "stocks.deficits": { fieldPath: "stocks.deficits", sourceKind: "closure", sourceRef: "closure-2025" },
      "stocks.amortissementsReportes": {
        fieldPath: "stocks.amortissementsReportes",
        sourceKind: "closure",
        sourceRef: "closure-2025",
      },
    },
    validation: { status: "pending" },
  };
}

/** Fixture — source externe (structure définie, non utilisée en production Lot 1). */
export function fixtureExternalTakeoverShape(): FiscalYearOpening["source"] {
  return {
    kind: "external_takeover",
    takeoverId: "takeover-1",
    sourceFiscalYear: 2024,
  };
}

function emptyArchivedShell(closed: FiscalYear): PersistedWorkspace {
  return {
    fiscalYear: closed,
    properties: [
      {
        id: "prop-1",
        label: "Appartement",
        address: "1 rue Test",
        city: "Paris",
        postalCode: "75001",
      },
    ],
    documents: [],
    extractions: [],
    validationItems: [],
    ledgerEntries: [],
    declarationDraft: { completedSteps: [] },
  };
}

/**
 * Fixture 4 — actif historique attesté (ouverture 2026).
 * Cumul = 4 500 attesté — jamais recalculé (ex. 6 × 1 000 = 6 000, ou 7 000).
 */
export function fixture4HistoricalAsset(): {
  closed: FiscalYear;
  archived: PersistedWorkspace;
} {
  const closure = fixtureClosure({
    immobilisationsComptables: {
      brutCloture: 14000,
      amortissementsCumulesCloture: 4500,
      vncCloture: 9500,
      actifs: [
        {
          id: "terrain",
          propertyId: "prop-1",
          label: "Terrain",
          categorie: "terrain",
          coutBrut: 2000,
          amortissementCumule: 0,
          vnc: 2000,
          provenance: "historique",
        },
        {
          id: "actif-hist-1",
          propertyId: "prop-1",
          label: "Agencements",
          categorie: "composant",
          coutBrut: 12000,
          amortissementCumule: 4500,
          vnc: 7500,
          provenance: "historique",
          dateDebut: "2020-01-01",
        },
      ],
    },
  });
  const closed = fixtureClosedFiscalYear({ closures: [closure] });
  const archived = emptyArchivedShell(closed);
  archived.properties[0] = {
    ...archived.properties[0],
    amortissementBase: {
      composants: [
        {
          id: "actif-hist-1",
          label: "Agencements",
          montant: 12000,
          dureeAnnees: 12,
          dateDebut: "2020-01-01",
        },
      ],
      valeurTerrain: 2000,
      dateMiseEnService: "2020-01-01",
    },
  };
  archived.declarationDraft = {
    completedSteps: [],
    dateMiseEnService: "2020-01-01",
  };
  return { closed, archived };
}

/**
 * Fixture 5 — prêt historique : transport des termes (+ CRD attesté optionnel).
 * Cas parallèle « prêts inconnus » : omettre financementAssistantState.
 */
export function fixture5ExistingLoan(): {
  closed: FiscalYear;
  archived: PersistedWorkspace;
  attestedLoanControls: Array<{ pretId: string; crdOuverture: number }>;
} {
  const closure = fixtureClosure();
  const closed = fixtureClosedFiscalYear({ closures: [closure] });
  const archived = emptyArchivedShell(closed);
  archived.declarationDraft = {
    completedSteps: [],
    financementAssistantState: {
      step: "complete",
      currentLoanIndex: 0,
      loans: [
        {
          pretId: "pret-hist-1",
          typePret: "amortissable",
          capitalInitial: 150000,
          tauxNominal: 0.029,
          dureeMois: 300,
          datePremiereMensualite: "2018-03-01",
          assuranceAnnuelle: 320,
          assuranceType: "externe",
          typeGarantie: "hypotheque_ippd",
        },
      ],
      fieldSources: {},
      updatedAt: "2026-01-01T00:00:00.000Z",
    },
  };
  return {
    closed,
    archived,
    attestedLoanControls: [{ pretId: "pret-hist-1", crdOuverture: 112500 }],
  };
}

/** Fixture 5b — aucune preuve de prêt dans le contexte archivé. */
export function fixture5LoansUnknown(): {
  closed: FiscalYear;
  archived: PersistedWorkspace;
} {
  const closure = fixtureClosure();
  const closed = fixtureClosedFiscalYear({ closures: [closure] });
  const archived = emptyArchivedShell(closed);
  archived.declarationDraft = { completedSteps: [] };
  return { closed, archived };
}

/**
 * Fixture 6 — patrimoine : cloture 10 000 + résultat 1 200 → ouverture 11 200 ; RAN 700.
 */
export function fixture6Patrimoine(): {
  closed: FiscalYear;
  archived: PersistedWorkspace;
} {
  const closure = fixtureClosure({
    patrimoine: {
      compteExploitantAvantAffectationResultat: 10000,
      resultatComptableExercice: 1200,
      ranSituation: "IMPORTE",
      ranValeur: 700,
    },
  });
  const closed = fixtureClosedFiscalYear({ closures: [closure] });
  return { closed, archived: emptyArchivedShell(closed) };
}
