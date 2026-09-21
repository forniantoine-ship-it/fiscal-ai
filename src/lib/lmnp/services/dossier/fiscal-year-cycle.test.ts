/**
 * P3-SOCLE-CYCLE-FISCAL — P0-1 — tests de la logique pure du cycle N → N+1.
 * Couvre T4 à T12 de la matrice de tests du Design Gate (T1/T2/T3/T13/T14 —
 * migration/atomicité/documents — sont couverts séparément dans
 * `dossier-db.test.ts`, au niveau où ils s'appliquent réellement).
 * Run: npx tsx --test src/lib/lmnp/services/dossier/fiscal-year-cycle.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  appendClosure,
  buildFiscalYearClosure,
  buildNextExerciseFromClosedYear,
  canCloseFiscalYear,
  canCreateNextFiscalYear,
  composantsF012DepuisBase,
  createNextDeclarationDraft,
  createNextFiscalYear,
  extractAmortissementBase,
  extractDossierLevelDataFromWorkspace,
  extractFinancementBases,
  extractIdentity,
  latestClosure,
  mergeComposantsF012,
  resolveArchivedFiscalYearAccess,
  resolveStocksOuverture,
} from "./fiscal-year-cycle";
import type { DeclarationDraft, FiscalYear, Property } from "../../types/domain";
import type { PropertyAmortissementBase } from "../../types/dossier";
import type { PersistedWorkspace } from "../../store/persistence";
import type { F011LoanDraft } from "@/runtime/assistants/f011-financement/types";
import type { ComposantNouveau } from "@/runtime/capabilities/f012/types";
import { runDeclarationGeneration } from "../declaration/run-declaration-generation";
import type { BilanInputs } from "@/runtime/capabilities/bilan/types";

const NOW = "2026-09-04T00:00:00.000Z";

function baseFiscalYear(overrides: Partial<FiscalYear> = {}): FiscalYear {
  return {
    id: "fy-N",
    year: 2025,
    status: "draft",
    regime: "reel",
    propertyIds: ["prop-1"],
    createdAt: NOW,
    updatedAt: NOW,
    dossierId: "dossier-1",
    previousFiscalYearId: null,
    closures: [],
    ...overrides,
  };
}

const STOCKS_V1 = { deficits: [{ millesime: 2025, montant: 1200 }], amortissementsReportes: 300 };
const STOCKS_V2 = { deficits: [{ millesime: 2025, montant: 900 }], amortissementsReportes: 300 };

// ---------------------------------------------------------------------------
// T11 — F-010 : amortissementBase permet de recalculer N et N+1 sans utiliser
// l'output N comme input.
// ---------------------------------------------------------------------------
describe("extractAmortissementBase — T11", () => {
  it("extrait uniquement les champs stables (composants/valeurTerrain/montantMobilier/dateMiseEnService), jamais dotationExercice/amortissementsCumules (exercice-spécifiques)", () => {
    const logementAmortissement: DeclarationDraft["logementAmortissement"] = {
      prixRevient: 125136,
      valeurTerrain: 17960,
      valeurBati: 107176,
      baseAmortissableBati: 107176,
      montantMobilier: 5400,
      dotationAnnuelle: 1500,
      dureeMoyenneAnnees: 30,
      prorataRatio: 1,
      plan: {
        lignes: [
          { label: "Gros œuvre", montant: 37186, dureeAnnees: 75, dotationExercice: 372, amortissementsCumules: 372, vnc: 36814 },
        ],
        totalAnnuelExercice: 372,
        totalBrut: 37186,
      },
      fieldSources: {},
      computedAt: NOW,
    };

    const base = extractAmortissementBase(logementAmortissement, "2024-04-15");
    assert.deepEqual(base, {
      composants: [{ label: "Gros œuvre", montant: 37186, dureeAnnees: 75 }],
      valeurTerrain: 17960,
      montantMobilier: 5400,
      dateMiseEnService: "2024-04-15",
    });
    // Aucune valeur d'exercice (dotationExercice/amortissementsCumules/vnc) n'a fuité dans la base stable.
    assert.equal(
      Object.prototype.hasOwnProperty.call(base!.composants[0], "dotationExercice"),
      false,
    );
  });

  it("undefined si aucun plan d'amortissement n'existe encore — jamais une base inventée", () => {
    assert.equal(extractAmortissementBase(undefined, "2024-04-15"), undefined);
  });
});

// ---------------------------------------------------------------------------
// T12 — F-011 : FinancementBase permet de recalculer les exercices concernés.
// ---------------------------------------------------------------------------
describe("extractFinancementBases — T12", () => {
  it("extrait les termes stables d'un prêt depuis F011LoanDraft[], jamais depuis un output d'exercice", () => {
    const loans: F011LoanDraft[] = [
      {
        pretId: "pret-1",
        typePret: "amortissable",
        capitalInitial: 200000,
        tauxNominal: 0.032,
        dureeMois: 240,
        datePremiereMensualite: "2024-05-01",
        assuranceAnnuelle: 480,
        fraisDossier: 900,
        commissionCaution: 3200,
        iraMontant: 0,
      },
    ];
    const bases = extractFinancementBases(loans);
    assert.deepEqual(bases, [
      {
        pretId: "pret-1",
        capitalInitial: 200000,
        tauxNominal: 0.032,
        dureeMois: 240,
        datePremiereMensualite: "2024-05-01",
        assuranceAnnuelle: 480,
        fraisDossier: 900,
        garantieDeductible: 3200,
        iraDeductible: 0,
      },
    ]);
  });

  it("tableau vide si aucun prêt — jamais undefined transformé en une valeur inventée", () => {
    assert.deepEqual(extractFinancementBases(undefined), []);
  });
});

// ---------------------------------------------------------------------------
// T8 — Closure versionnée : une seconde clôture de N n'écrase pas la première.
// ---------------------------------------------------------------------------
describe("appendClosure/latestClosure — T8", () => {
  it("append-only : deux clôtures successives cohabitent, la première reste intacte", () => {
    const v1 = buildFiscalYearClosure({
      fiscalYearId: "fy-N",
      dossierId: "dossier-1",
      stocks: STOCKS_V1,
      computedAt: NOW,
      sourceDeclarationVersionId: "decl-v1",
      now: NOW,
    });
    let fy = baseFiscalYear();
    fy = appendClosure(fy, v1);
    assert.equal(fy.closures?.length, 1);

    const v2 = buildFiscalYearClosure({
      fiscalYearId: "fy-N",
      dossierId: "dossier-1",
      stocks: STOCKS_V2,
      computedAt: NOW,
      sourceDeclarationVersionId: "decl-v2",
      now: "2026-09-05T00:00:00.000Z",
    });
    fy = appendClosure(fy, v2);

    assert.equal(fy.closures?.length, 2);
    assert.deepEqual(fy.closures?.[0], v1, "V1 reste intacte, jamais réécrite");
    assert.equal(latestClosure(fy)?.id, v2.id);
  });

  it("idempotent : ré-appliquer la même closure ne la duplique pas", () => {
    const v1 = buildFiscalYearClosure({
      fiscalYearId: "fy-N",
      dossierId: "dossier-1",
      stocks: STOCKS_V1,
      computedAt: NOW,
      now: NOW,
    });
    let fy = baseFiscalYear();
    fy = appendClosure(fy, v1);
    fy = appendClosure(fy, v1);
    assert.equal(fy.closures?.length, 1);
  });
});

// ---------------------------------------------------------------------------
// T4/T5/T6/T7/T9/T10 — garde stricte des stocks N → N+1.
// ---------------------------------------------------------------------------
describe("resolveStocksOuverture — garde stricte", () => {
  it("T4 — N clôturé avec closure → N+1 consomme précisément cette closure (sourceClosureId conservé)", () => {
    const closure = buildFiscalYearClosure({
      fiscalYearId: "fy-N",
      dossierId: "dossier-1",
      stocks: STOCKS_V1,
      computedAt: NOW,
      now: NOW,
    });
    const n = appendClosure(baseFiscalYear({ status: "closed" }), closure);
    const nPlus1 = baseFiscalYear({ id: "fy-N+1", year: 2026, previousFiscalYearId: "fy-N" });

    const result = resolveStocksOuverture(nPlus1, n);
    assert.deepEqual(result, { status: "available", sourceClosureId: closure.id, stocks: STOCKS_V1 });
  });

  it("T5 — mauvais dossier : un précédent FiscalYear d'un autre dossier est refusé", () => {
    const closure = buildFiscalYearClosure({
      fiscalYearId: "fy-N",
      dossierId: "dossier-AUTRE",
      stocks: STOCKS_V1,
      computedAt: NOW,
      now: NOW,
    });
    const n = appendClosure(
      baseFiscalYear({ status: "closed", dossierId: "dossier-AUTRE" }),
      closure,
    );
    const nPlus1 = baseFiscalYear({
      id: "fy-N+1",
      year: 2026,
      dossierId: "dossier-1",
      previousFiscalYearId: "fy-N",
    });

    const result = resolveStocksOuverture(nPlus1, n);
    assert.equal(result.status, "unavailable");
  });

  it("T6 — N-2 ne peut jamais servir de N-1 (adjacence stricte)", () => {
    const closure = buildFiscalYearClosure({
      fiscalYearId: "fy-N-2",
      dossierId: "dossier-1",
      stocks: STOCKS_V1,
      computedAt: NOW,
      now: NOW,
    });
    const nMinus2 = appendClosure(
      baseFiscalYear({ id: "fy-N-2", year: 2023, status: "closed" }),
      closure,
    );
    const nPlus1 = baseFiscalYear({
      id: "fy-N+1",
      year: 2026,
      previousFiscalYearId: "fy-N-2",
    });

    const result = resolveStocksOuverture(nPlus1, nMinus2);
    assert.equal(result.status, "unavailable");
  });

  it("T7 — exercice précédent non clos ne fournit pas de stocks", () => {
    const closure = buildFiscalYearClosure({
      fiscalYearId: "fy-N",
      dossierId: "dossier-1",
      stocks: STOCKS_V1,
      computedAt: NOW,
      now: NOW,
    });
    const n = appendClosure(baseFiscalYear({ status: "ready_to_close" }), closure);
    const nPlus1 = baseFiscalYear({ id: "fy-N+1", year: 2026, previousFiscalYearId: "fy-N" });

    const result = resolveStocksOuverture(nPlus1, n);
    assert.equal(result.status, "unavailable");
  });

  it("aucun previousFiscalYearId → continuité indisponible, jamais 0 ni estimation", () => {
    const n = baseFiscalYear({ status: "closed" });
    const nPlus1 = baseFiscalYear({ id: "fy-N+1", year: 2026, previousFiscalYearId: null });
    const result = resolveStocksOuverture(nPlus1, n);
    assert.equal(result.status, "unavailable");
  });

  it("N clos sans aucune closure produite → continuité indisponible", () => {
    const n = baseFiscalYear({ status: "closed", closures: [] });
    const nPlus1 = baseFiscalYear({ id: "fy-N+1", year: 2026, previousFiscalYearId: "fy-N" });
    const result = resolveStocksOuverture(nPlus1, n);
    assert.equal(result.status, "unavailable");
  });

  it("T10 — après une nouvelle closure de N, sourceClosureId de N+1 permet de détecter une dépendance obsolète", () => {
    const v1 = buildFiscalYearClosure({ fiscalYearId: "fy-N", dossierId: "dossier-1", stocks: STOCKS_V1, computedAt: NOW, now: NOW });
    let n = appendClosure(baseFiscalYear({ status: "closed" }), v1);
    const nPlus1 = baseFiscalYear({ id: "fy-N+1", year: 2026, previousFiscalYearId: "fy-N" });

    const firstResult = resolveStocksOuverture(nPlus1, n);
    assert.equal(firstResult.status, "available");
    const consumedClosureId = firstResult.status === "available" ? firstResult.sourceClosureId : undefined;

    // N est corrigé : une nouvelle closure V2 est ajoutée (jamais un remplacement de V1).
    const v2 = buildFiscalYearClosure({ fiscalYearId: "fy-N", dossierId: "dossier-1", stocks: STOCKS_V2, computedAt: NOW, now: "2026-09-06T00:00:00.000Z" });
    n = appendClosure(n, v2);

    const currentLatest = latestClosure(n);
    assert.notEqual(currentLatest?.id, consumedClosureId, "la closure consommée par N+1 n'est plus la dernière : dépendance obsolète détectable");
    assert.equal(n.closures?.length, 2, "V1 reste tracée, jamais supprimée");
  });
});

// ---------------------------------------------------------------------------
// Création de N+1 — ne copie aucune donnée métier, garde les références.
// ---------------------------------------------------------------------------
describe("createNextFiscalYear / createNextDeclarationDraft / extractIdentity", () => {
  it("N+1 référence dossierId et previousFiscalYearId, propertyIds copiés (référence, pas régénération d'ID)", () => {
    const n = baseFiscalYear({ status: "closed" });
    const nPlus1 = createNextFiscalYear(n, "dossier-1", "2026-09-04T00:00:00.000Z");
    assert.equal(nPlus1.dossierId, "dossier-1");
    assert.equal(nPlus1.previousFiscalYearId, "fy-N");
    assert.deepEqual(nPlus1.propertyIds, ["prop-1"]);
    assert.notEqual(nPlus1.id, n.id);
    assert.equal(nPlus1.year, 2026);
    assert.deepEqual(nPlus1.closures, []);
  });

  it("extractIdentity ne reporte que les champs Dossier-level, jamais les données d'exercice", () => {
    const draft: DeclarationDraft = {
      completedSteps: ["siren"],
      siren: "123456789",
      exploitantFirstName: "Marie",
      revenusAssistant: { exerciceFiscal: 2025, totalRecettes: 9000, loyersEncaisses: 9000, indemnitesAssurance: 0, recettesPlateforme: 0, ajustementsJanDec: 0, moisLocationEffectifs: 12, fieldSources: {}, computedAt: NOW },
    } as DeclarationDraft;
    const identity = extractIdentity(draft);
    assert.deepEqual(identity, { siren: "123456789", exploitantFirstName: "Marie" });
    assert.equal((identity as Record<string, unknown>).revenusAssistant, undefined);
  });

  it("createNextDeclarationDraft reporte l'identité mais repart d'un draft vide sinon", () => {
    const previous: DeclarationDraft = { completedSteps: ["siren"], siren: "123456789" } as DeclarationDraft;
    const next = createNextDeclarationDraft(previous);
    assert.deepEqual(next, { completedSteps: [], siren: "123456789" });
  });
});

// ---------------------------------------------------------------------------
// Extraction Dossier-level depuis un workspace mono-exercice existant.
// ---------------------------------------------------------------------------
describe("extractDossierLevelDataFromWorkspace", () => {
  it("rattache amortissementBase au premier bien, extrait financements[], sans modifier le workspace", () => {
    const workspace: PersistedWorkspace = {
      fiscalYear: baseFiscalYear(),
      properties: [{ id: "prop-1", label: "Mon bien", address: "1 rue X", city: "Lyon", postalCode: "69000" }],
      documents: [],
      extractions: [],
      validationItems: [],
      ledgerEntries: [],
      declarationDraft: {
        completedSteps: [],
        dateMiseEnService: "2024-04-15",
        logementAmortissement: {
          prixRevient: 125136,
          valeurTerrain: 17960,
          valeurBati: 107176,
          baseAmortissableBati: 107176,
          montantMobilier: 5400,
          dotationAnnuelle: 1500,
          dureeMoyenneAnnees: 30,
          prorataRatio: 1,
          plan: {
            lignes: [{ label: "Gros œuvre", montant: 37186, dureeAnnees: 75, dotationExercice: 372, amortissementsCumules: 372, vnc: 36814 }],
            totalAnnuelExercice: 372,
            totalBrut: 37186,
          },
          fieldSources: {},
          computedAt: NOW,
        },
      },
    };

    const { properties, financements } = extractDossierLevelDataFromWorkspace(workspace);
    assert.equal(properties[0].id, "prop-1", "Property.id conservé");
    assert.deepEqual(properties[0].amortissementBase?.dateMiseEnService, "2024-04-15");
    assert.deepEqual(financements, []);
    // Non-mutation du workspace source.
    assert.equal(workspace.properties[0].amortissementBase, undefined);
  });
});

// ---------------------------------------------------------------------------
// P0-B — Contrat N → N+1 pour les composants F-012 : identité stable, base/
// date/durée conservées, accumulation sans perte, sans double comptage.
// ---------------------------------------------------------------------------
function composantTravaux(overrides: Partial<ComposantNouveau> = {}): ComposantNouveau {
  return {
    id: "travaux-1",
    label: "Extension véranda",
    montant: 12000,
    dureeAnnees: 18,
    dotationAnnuelle: 667,
    nature: "amélioration",
    dateDebut: "2025-09-01",
    origin: "f012_travaux",
    ...overrides,
  };
}

describe("mergeComposantsF012 / composantsF012DepuisBase — P0-B", () => {
  it("1/2/3/4/5 — un composant F-012 de l'exercice est repris avec le même id, la même date, la même base, la même durée", () => {
    const merged = mergeComposantsF012([composantTravaux()], undefined);
    assert.equal(merged.length, 1);
    assert.deepEqual(merged[0], composantTravaux());
  });

  it("11 — plusieurs composants créés la même année sont tous repris indépendamment", () => {
    const a = composantTravaux({ id: "travaux-1", label: "Extension" });
    const b = composantTravaux({ id: "copro-1", label: "Toiture copro", origin: "f012_copro" });
    const merged = mergeComposantsF012([a, b], undefined);
    assert.equal(merged.length, 2);
    assert.ok(merged.some((c) => c.id === "travaux-1"));
    assert.ok(merged.some((c) => c.id === "copro-1"));
  });

  it("9/10 — un composant déjà présent dans la base persistée n'est jamais dupliqué par le même composant produit à nouveau (même id)", () => {
    const base: PropertyAmortissementBase = {
      composants: [
        { id: "travaux-1", label: "Extension véranda", montant: 12000, dureeAnnees: 18, origin: "f012_travaux", dateDebut: "2025-09-01" },
      ],
    };
    // Même composant, encore présent dans `chargesAssistant` (cas normal
    // pendant l'exercice où F-012 vient de le créer, avant toute transition).
    const merged = mergeComposantsF012([composantTravaux()], base);
    assert.equal(merged.length, 1, "jamais compté deux fois — fusion par id, pas concaténation");
  });

  it("accumulation sur deux exercices : un composant créé en N-1 (dans la base) et un autre créé en N (dans chargesAssistant) coexistent tous les deux", () => {
    const baseN: PropertyAmortissementBase = {
      composants: [
        { id: "travaux-ancien", label: "Toiture 2023", montant: 8000, dureeAnnees: 20, origin: "f012_travaux", dateDebut: "2023-03-01" },
      ],
    };
    const nouveauEnN = composantTravaux({ id: "travaux-nouveau", label: "Véranda 2025" });
    const merged = mergeComposantsF012([nouveauEnN], baseN);
    assert.equal(merged.length, 2, "le composant de N-1 n'est jamais perdu, celui de N n'est jamais oublié");
    assert.ok(merged.some((c) => c.id === "travaux-ancien"));
    assert.ok(merged.some((c) => c.id === "travaux-nouveau"));
  });

  it("composantsF012DepuisBase ignore silencieusement une ligne F-010 (sans id/origin/dateDebut) — jamais un composant F-012 inventé", () => {
    const base: PropertyAmortissementBase = {
      composants: [{ label: "Gros œuvre", montant: 37186, dureeAnnees: 75 }],
    };
    assert.deepEqual(composantsF012DepuisBase(base), []);
  });
});

describe("extractAmortissementBase — P0-B, accumulation F-012 N → N+1", () => {
  it("2/4/5 — un composant F-012 créé cet exercice est persisté avec id/origine/date/base/durée, en plus des lignes F-010", () => {
    const logementAmortissement: DeclarationDraft["logementAmortissement"] = {
      prixRevient: 125136,
      valeurTerrain: 17960,
      valeurBati: 107176,
      baseAmortissableBati: 107176,
      montantMobilier: 5400,
      dotationAnnuelle: 1500,
      dureeMoyenneAnnees: 30,
      prorataRatio: 1,
      plan: {
        lignes: [{ label: "Gros œuvre", montant: 37186, dureeAnnees: 75, dotationExercice: 372, amortissementsCumules: 372, vnc: 36814 }],
        totalAnnuelExercice: 372,
        totalBrut: 37186,
      },
      fieldSources: {},
      computedAt: NOW,
    };

    const base = extractAmortissementBase(
      logementAmortissement,
      "2023-06-01",
      [composantTravaux()],
      undefined,
    );

    assert.equal(base?.composants.length, 2, "ligne F-010 + composant F-012, aucune perte");
    const f012 = base?.composants.find((c) => c.id === "travaux-1");
    assert.equal(f012?.montant, 12000);
    assert.equal(f012?.dureeAnnees, 18);
    assert.equal(f012?.dateDebut, "2025-09-01");
    assert.equal(f012?.origin, "f012_travaux");
  });

  it("13 — dossier sans composant F-012 : comportement historique inchangé (seules les lignes F-010, comme avant ce chantier)", () => {
    const logementAmortissement: DeclarationDraft["logementAmortissement"] = {
      prixRevient: 125136,
      valeurTerrain: 17960,
      valeurBati: 107176,
      baseAmortissableBati: 107176,
      montantMobilier: 5400,
      dotationAnnuelle: 1500,
      dureeMoyenneAnnees: 30,
      prorataRatio: 1,
      plan: {
        lignes: [{ label: "Gros œuvre", montant: 37186, dureeAnnees: 75, dotationExercice: 372, amortissementsCumules: 372, vnc: 36814 }],
        totalAnnuelExercice: 372,
        totalBrut: 37186,
      },
      fieldSources: {},
      computedAt: NOW,
    };
    const base = extractAmortissementBase(logementAmortissement, "2024-04-15");
    assert.deepEqual(base, {
      composants: [{ label: "Gros œuvre", montant: 37186, dureeAnnees: 75 }],
      valeurTerrain: 17960,
      montantMobilier: 5400,
      dateMiseEnService: "2024-04-15",
    });
  });

  it("1 — N+1 : `logementAmortissement` absent (non rejoué), le composant F-012 déjà persisté (N) est reporté sans recréation, les lignes F-010 déjà persistées ne sont pas perdues", () => {
    const existingBase: PropertyAmortissementBase = {
      composants: [
        { label: "Gros œuvre", montant: 37186, dureeAnnees: 75 },
        { id: "travaux-1", label: "Extension véranda", montant: 12000, dureeAnnees: 18, origin: "f012_travaux", dateDebut: "2025-09-01" },
      ],
      valeurTerrain: 17960,
      montantMobilier: 5400,
      dateMiseEnService: "2023-06-01",
    };

    // N+1 : chargesAssistant/logementAmortissement vides (createNextDeclarationDraft).
    const baseNPlus1 = extractAmortissementBase(undefined, undefined, undefined, existingBase);

    assert.equal(baseNPlus1?.composants.length, 2, "ni la ligne F-010 ni le composant F-012 ne sont perdus");
    assert.ok(baseNPlus1?.composants.some((c) => c.label === "Gros œuvre"), "ligne F-010 reportée");
    const f012 = baseNPlus1?.composants.find((c) => c.id === "travaux-1");
    assert.ok(f012, "3 — même identité reportée");
    assert.equal(f012?.montant, 12000, "4 — base d'origine conservée");
    assert.equal(f012?.dureeAnnees, 18, "5 — durée conservée");
    assert.equal(f012?.dateDebut, "2025-09-01", "date propre conservée");
    assert.equal(baseNPlus1?.dateMiseEnService, "2023-06-01", "métadonnées Property-level reportées elles aussi");
  });
});

// ---------------------------------------------------------------------------
// P3-SOCLE-CYCLE-FISCAL — P0-1 v2 — préconditions de CREATE_NEXT_FISCAL_YEAR
// (T-P0-4 / T-P0-5, niveau fonction pure).
// ---------------------------------------------------------------------------
describe("canCreateNextFiscalYear — préconditions 3/4", () => {
  it("T-P0-4 — refuse si l'exercice n'est pas clôturé", () => {
    const result = canCreateNextFiscalYear({
      id: "fy-1",
      year: 2025,
      status: "ready_to_close",
      regime: "reel",
      propertyIds: ["prop-1"],
      createdAt: NOW,
      updatedAt: NOW,
      closures: [
        {
          id: "closure-1",
          fiscalYearId: "fy-1",
          stocks: { deficits: [], amortissementsReportes: 0 },
          computedAt: NOW,
          closedAt: NOW,
        },
      ],
    });
    assert.equal(result.ok, false);
  });

  it("T-P0-5 — refuse si aucune closure n'existe, même si le statut est closed", () => {
    const result = canCreateNextFiscalYear({
      id: "fy-1",
      year: 2025,
      status: "closed",
      regime: "reel",
      propertyIds: ["prop-1"],
      createdAt: NOW,
      updatedAt: NOW,
      closures: [],
    });
    assert.equal(result.ok, false);
  });

  it("autorise quand l'exercice est clos ET porte une closure", () => {
    const result = canCreateNextFiscalYear({
      id: "fy-1",
      year: 2025,
      status: "closed",
      regime: "reel",
      propertyIds: ["prop-1"],
      createdAt: NOW,
      updatedAt: NOW,
      closures: [
        {
          id: "closure-1",
          fiscalYearId: "fy-1",
          stocks: { deficits: [], amortissementsReportes: 0 },
          computedAt: NOW,
          closedAt: NOW,
        },
      ],
    });
    assert.equal(result.ok, true);
  });
});

// ---------------------------------------------------------------------------
// Design Gate "Clôture N → N+1", Décision 1 — précondition du geste
// utilisateur unique "Clôturer et continuer".
// ---------------------------------------------------------------------------
// P0 launch safety — un exercice ne se clôture que si son antériorité LMNP est
// établie (voir prior-history-eligibility.ts). Fixture : première année déclarée.
const FIRST_YEAR_DECLARED = { status: "FIRST_REAL_YEAR" as const, declaredAt: NOW };

describe("canCloseFiscalYear — précondition du geste de clôture", () => {
  it("refuse si status !== ready_to_close", () => {
    const result = canCloseFiscalYear({
      fiscalYear: baseFiscalYear({ status: "pending_validation", declarationGeneratedAt: NOW }),
      declarationDraft: undefined,
      properties: [],
    });
    assert.equal(result.ok, false);
  });

  it("refuse si declarationGeneratedAt est absent, même si status === ready_to_close", () => {
    const result = canCloseFiscalYear({
      fiscalYear: baseFiscalYear({ status: "ready_to_close", declarationGeneratedAt: undefined }),
      declarationDraft: undefined,
      properties: [],
    });
    assert.equal(result.ok, false);
  });

  it("refuse quand status === ready_to_close ET declarationGeneratedAt existe mais aucune génération exploitable (dossier minimal)", () => {
    // Lot 1 — clôture positive : `canGenerate === false` (dossier incomplet /
    // aucune génération) n'autorise JAMAIS la clôture.
    const result = canCloseFiscalYear({
      fiscalYear: baseFiscalYear({ status: "ready_to_close", declarationGeneratedAt: NOW, priorHistoryDeclaration: FIRST_YEAR_DECLARED }),
      declarationDraft: undefined,
      properties: [],
    });
    assert.equal(result.ok, false);
  });

  it("ne dépend jamais de transmittedAt — la clôture reste indépendante de l'EDI", () => {
    // Fixture minimaliste : sans génération fraîche, refuse (indépendamment de transmittedAt).
    const withoutTransmission = canCloseFiscalYear({
      fiscalYear: baseFiscalYear({
        status: "ready_to_close",
        declarationGeneratedAt: NOW,
        transmittedAt: undefined,
        priorHistoryDeclaration: FIRST_YEAR_DECLARED,
      }),
      declarationDraft: undefined,
      properties: [],
    });
    assert.equal(withoutTransmission.ok, false);
  });
});

// ---------------------------------------------------------------------------
// P0-1 (audit "Idempotence + Generation Gate", constats B1/B2) — la clôture
// ne doit jamais reposer sur declarationGeneratedAt seul : elle doit refléter
// la MÊME dérive que resolveDeclarationGenerationGate() (aucune seconde liste
// de champs, aucun fingerprint parallèle — réutilisation directe du gate).
// ---------------------------------------------------------------------------
describe("canCloseFiscalYear — drift (P0-1, B1/B2)", () => {
  const PROPERTY: Property = {
    id: "prop-1",
    label: "Studio Lyon",
    address: "1 rue Test",
    city: "Lyon",
    postalCode: "69001",
  };

  function completeFlags(overrides: Partial<DeclarationDraft> = {}): DeclarationDraft {
    return {
      completedSteps: [],
      inpiConfirmedAt: NOW,
      logementConfirmedAt: NOW,
      // V1 Bucket-1 / Lot 1 — isLogementComplete() exige la sortie F-010
      // (`logementAmortissement`), pas seulement l'horodatage : sans elle le
      // gate court-circuite la détection de dérive (incomplete ≠ current).
      logementAmortissement: {
        computedAt: NOW,
        prixRevient: 200000,
        valeurTerrain: 40000,
        valeurBati: 160000,
        baseAmortissableBati: 160000,
        montantMobilier: 0,
        dotationAnnuelle: 5333,
        dureeMoyenneAnnees: 30,
        plan: { lignes: [], totalAnnuelExercice: 0, totalBrut: 0 },
      } as DeclarationDraft["logementAmortissement"],
      creditDeclaredNoneAt: NOW,
      revenusConfirmedAt: NOW,
      chargesConfirmedAt: NOW,
      amortissementConfirmedAt: NOW,
      ...overrides,
    } as DeclarationDraft;
  }

  function generationReadyDraft(overrides: Partial<DeclarationDraft> = {}): DeclarationDraft {
    return completeFlags({
      siret: "12345678901234",
      siren: "123456789",
      exploitantFirstName: "Marie",
      exploitantLastName: "Dupont",
      exploitantEmail: "marie.dupont@example.com",
      exploitantTelephone: "0601020304",
      personalAddress: "10 rue des Lilas",
      personalCity: "Lyon",
      personalPostalCode: "69001",
      dateMiseEnService: "2020-01-01",
      revenusAssistant: { exerciceFiscal: 2025, totalRecettes: 9000 },
      chargesAssistant: { exerciceFiscal: 2025, totalDeductible: 2000, totalPreExploitation: 0 },
      amortissementAssistant: { exerciceFiscal: 2025, totalDotations: 1500, status: "validated" },
      ...overrides,
    } as DeclarationDraft);
  }

  function readyFiscalYear(overrides: Partial<FiscalYear> = {}): FiscalYear {
    return baseFiscalYear({
      status: "ready_to_close",
      declarationGeneratedAt: NOW,
      priorHistoryDeclaration: FIRST_YEAR_DECLARED,
      ...overrides,
    });
  }

  // Reproduit exactement ce que ValidationDocumentStep.tsx écrit sur le
  // draft après une génération (fiscalResult = miroir de la dernière
  // génération) — même helper que run-declaration-generation.test.ts.
  function apresGeneration(draft: DeclarationDraft): DeclarationDraft {
    const generation = runDeclarationGeneration(draft, 2025);
    assert.equal(generation.status, "generated", "le fixture doit produire une génération réelle, pas un blocage");
    if (generation.status !== "generated") throw new Error("unreachable");
    return { ...draft, fiscalResult: generation.fiscalResult, rfs: generation.rfs } as DeclarationDraft;
  }

  it("R1 — génération valide → canCloseFiscalYear === true", () => {
    const draft = apresGeneration(generationReadyDraft());
    const result = canCloseFiscalYear({
      fiscalYear: readyFiscalYear(),
      declarationDraft: draft,
      properties: [PROPERTY],
    });
    assert.equal(result.ok, true);
  });

  it("R2 — replay identique (aucun changement fiscal/identité) → canCloseFiscalYear === true", () => {
    const draft = apresGeneration(generationReadyDraft());
    // Deuxième évaluation, mêmes données strictement — simule un rendu
    // ultérieur sans aucune modification utilisateur entre-temps.
    const result = canCloseFiscalYear({
      fiscalYear: readyFiscalYear(),
      declarationDraft: { ...draft },
      properties: [PROPERTY],
    });
    assert.equal(result.ok, true);
  });

  it("R3a — nom/prénom modifiés après génération → canCloseFiscalYear === false", () => {
    const draft = apresGeneration(generationReadyDraft());
    const corrige = { ...draft, exploitantLastName: "Martin" } as DeclarationDraft;
    const result = canCloseFiscalYear({
      fiscalYear: readyFiscalYear(),
      declarationDraft: corrige,
      properties: [PROPERTY],
    });
    assert.equal(result.ok, false);
    assert.ok(result.ok === false && result.reason.length > 0);
  });

  it("R3a — SIREN modifié après génération → canCloseFiscalYear === false", () => {
    const draft = apresGeneration(generationReadyDraft());
    const corrige = { ...draft, siren: "987654321" } as DeclarationDraft;
    const result = canCloseFiscalYear({
      fiscalYear: readyFiscalYear(),
      declarationDraft: corrige,
      properties: [PROPERTY],
    });
    assert.equal(result.ok, false);
  });

  it("R3a — adresse personnelle modifiée après génération → canCloseFiscalYear === false", () => {
    const draft = apresGeneration(generationReadyDraft());
    const corrige = { ...draft, personalAddress: "22 avenue Neuve" } as DeclarationDraft;
    const result = canCloseFiscalYear({
      fiscalYear: readyFiscalYear(),
      declarationDraft: corrige,
      properties: [PROPERTY],
    });
    assert.equal(result.ok, false);
  });

  it("R3a — email/téléphone modifiés après génération → canCloseFiscalYear === false", () => {
    const draft = apresGeneration(generationReadyDraft());
    const corrige = {
      ...draft,
      exploitantEmail: "nouvelle.adresse@example.com",
      exploitantTelephone: "0611223344",
    } as DeclarationDraft;
    const result = canCloseFiscalYear({
      fiscalYear: readyFiscalYear(),
      declarationDraft: corrige,
      properties: [PROPERTY],
    });
    assert.equal(result.ok, false);
  });

  it("R3b — financement ajouté après génération (dérive fiscale) → canCloseFiscalYear === false", () => {
    const draft = apresGeneration(generationReadyDraft());
    const corrige = {
      ...draft,
      chargesAssistant: { exerciceFiscal: 2025, totalDeductible: 2000 + 1200, totalPreExploitation: 0 },
    } as DeclarationDraft;
    const result = canCloseFiscalYear({
      fiscalYear: readyFiscalYear(),
      declarationDraft: corrige,
      properties: [PROPERTY],
    });
    assert.equal(result.ok, false);
  });

  it("R3b — amortissement modifié après génération (dérive fiscale) → canCloseFiscalYear === false", () => {
    const draft = apresGeneration(generationReadyDraft());
    const corrige = {
      ...draft,
      amortissementAssistant: { exerciceFiscal: 2025, totalDotations: 3000, status: "validated" as const },
    } as DeclarationDraft;
    const result = canCloseFiscalYear({
      fiscalYear: readyFiscalYear(),
      declarationDraft: corrige,
      properties: [PROPERTY],
    });
    assert.equal(result.ok, false);
  });

  it("R4 — après correction détectée, une nouvelle génération valide redonne canCloseFiscalYear === true", () => {
    const draft = apresGeneration(generationReadyDraft());
    const corrige = { ...draft, exploitantLastName: "Martin" } as DeclarationDraft;

    const bloque = canCloseFiscalYear({
      fiscalYear: readyFiscalYear(),
      declarationDraft: corrige,
      properties: [PROPERTY],
    });
    assert.equal(bloque.ok, false, "la clôture doit être bloquée avant régénération");

    // Régénération réelle (même chemin que ValidationDocumentStep.tsx) sur
    // le draft corrigé — le nouveau fiscalResult/rfs reflète "Martin".
    const regenere = apresGeneration(corrige);

    const debloque = canCloseFiscalYear({
      fiscalYear: readyFiscalYear(),
      declarationDraft: regenere,
      properties: [PROPERTY],
    });
    assert.equal(debloque.ok, true, "après régénération, plus aucune dérive détectée");
  });

  /**
   * P0-1A (2026-09-07) — bug confirmé par l'audit P0-1 : `canCloseFiscalYear`
   * relayait `resolveDeclarationGenerationGate()` sans jamais lui transmettre
   * `fiscalYear.stocksOuverture`. Pour un exercice N+1 en continuité réelle
   * (déficits antérieurs/amortissements reportés non nuls), le preview de la
   * porte tournait alors sans ce stock alors que la génération réelle en
   * tenait compte — dérive artificielle, clôture bloquée à tort. Même
   * fixture que declaration-generation-gate.test.ts (P0-1A) : resultatAvantAmort
   * = 7000, amortissement calculé = 8000, déficit antérieur = 3000 → change
   * strictement amortDeduct/amortReporte (les deux champs comparés par la
   * porte) selon que le stock est pris en compte ou non.
   */
  it("R5 — exercice N+1 en continuité (stocksOuverture réel), aucune modification → canCloseFiscalYear === true (pas de blocage artificiel)", () => {
    const stocksOuverture = { deficits: [{ millesime: 2024, montant: 3000 }], amortissementsReportes: 0 };
    const draft = generationReadyDraft({
      revenusAssistant: { exerciceFiscal: 2025, totalRecettes: 9000 },
      chargesAssistant: { exerciceFiscal: 2025, totalDeductible: 2000, totalPreExploitation: 0 },
      amortissementAssistant: { exerciceFiscal: 2025, totalDotations: 8000, status: "validated" },
    });
    const generation = runDeclarationGeneration(draft, 2025, stocksOuverture);
    assert.equal(generation.status, "generated");
    if (generation.status !== "generated") throw new Error("unreachable");
    // Précondition — confirme que le stock change bien amortDeduct/amortReporte
    // (sinon ce test ne prouverait rien face à la version sans correction).
    assert.equal(generation.fiscalResult.amortDeduct, 4000);
    assert.equal(generation.fiscalResult.amortReporte, 4000);

    const draftGenere = { ...draft, fiscalResult: generation.fiscalResult, rfs: generation.rfs } as DeclarationDraft;

    const result = canCloseFiscalYear({
      fiscalYear: readyFiscalYear({ stocksOuverture: { sourceClosureId: "closure-n", stocks: stocksOuverture } }),
      declarationDraft: draftGenere,
      properties: [PROPERTY],
    });
    assert.equal(
      result.ok,
      true,
      "un exercice en continuité, sans aucune modification, ne doit jamais bloquer la clôture",
    );
  });

  /**
   * P0-1B (2026-09-07) — TEST P0-1B-8. `canCloseFiscalYear` relaie
   * `resolveDeclarationGenerationGate()` sans transformation propre : cette
   * assertion vérifie que le renforcement patrimonial de la porte (comparaison
   * de `rfs.patrimoine`) n'introduit aucune fausse dérive quand le patrimoine
   * est réellement inchangé — la clôture doit rester autorisée.
   */
  it("R6 (P0-1B-8) — patrimoine inchangé après génération → canCloseFiscalYear reste autorisé", () => {
    const bilanPatrimonial: BilanInputs = {
      tresorerie: { bankMode: "INCONNU" },
      compteExploitant: {},
      ran: { situation: "NATIF" },
      ventilationTiers: { postes: [{ nature: "LOYER_DU_PAR_LOCATAIRE", montant: 500 }] },
    };
    const draft = { ...generationReadyDraft(), bilanPatrimonial } as DeclarationDraft;
    const generation = runDeclarationGeneration(draft, 2025, undefined, bilanPatrimonial);
    assert.equal(generation.status, "generated");
    if (generation.status !== "generated") throw new Error("unreachable");
    const draftGenere = { ...draft, fiscalResult: generation.fiscalResult, rfs: generation.rfs } as DeclarationDraft;

    const result = canCloseFiscalYear({
      fiscalYear: readyFiscalYear(),
      declarationDraft: draftGenere,
      properties: [PROPERTY],
    });
    assert.equal(result.ok, true, "un patrimoine inchangé ne doit jamais bloquer une clôture par ailleurs valide");
  });

  it("Lot1 — différence purement technique (computedAt) après génération → ne rend pas stale / clôture autorisée", () => {
    const draft = apresGeneration(generationReadyDraft());
    const technique = {
      ...draft,
      logementAmortissement: {
        ...draft.logementAmortissement!,
        computedAt: "2099-12-31T23:59:59.000Z",
      },
    } as DeclarationDraft;
    const result = canCloseFiscalYear({
      fiscalYear: readyFiscalYear(),
      declarationDraft: technique,
      properties: [PROPERTY],
    });
    assert.equal(result.ok, true, "un timestamp technique ne doit jamais invalider une génération autrement fraîche");
  });

  it("Lot1 — dérive patrimoniale après génération → canCloseFiscalYear === false", () => {
    const bilanAvant: BilanInputs = {
      tresorerie: { bankMode: "INCONNU" },
      compteExploitant: {},
      ran: { situation: "NATIF" },
      ventilationTiers: { postes: [{ nature: "LOYER_DU_PAR_LOCATAIRE", montant: 500 }] },
    };
    const draft = { ...generationReadyDraft(), bilanPatrimonial: bilanAvant } as DeclarationDraft;
    const generation = runDeclarationGeneration(draft, 2025, undefined, bilanAvant);
    assert.equal(generation.status, "generated");
    if (generation.status !== "generated") throw new Error("unreachable");
    const draftGenere = { ...draft, fiscalResult: generation.fiscalResult, rfs: generation.rfs } as DeclarationDraft;
    const bilanApres: BilanInputs = {
      ...bilanAvant,
      ventilationTiers: { postes: [{ nature: "LOYER_DU_PAR_LOCATAIRE", montant: 900 }] },
    };
    const corrige = { ...draftGenere, bilanPatrimonial: bilanApres } as DeclarationDraft;
    const result = canCloseFiscalYear({
      fiscalYear: readyFiscalYear(),
      declarationDraft: corrige,
      properties: [PROPERTY],
    });
    assert.equal(result.ok, false);
  });

  it("Lot1 — transmittedAt n'influence jamais une clôture autrement valide", () => {
    const draft = apresGeneration(generationReadyDraft());
    const withTx = canCloseFiscalYear({
      fiscalYear: readyFiscalYear({ transmittedAt: NOW }),
      declarationDraft: draft,
      properties: [PROPERTY],
    });
    const withoutTx = canCloseFiscalYear({
      fiscalYear: readyFiscalYear({ transmittedAt: undefined }),
      declarationDraft: draft,
      properties: [PROPERTY],
    });
    assert.equal(withTx.ok, true);
    assert.equal(withoutTx.ok, true);
  });

  it("F1 blocker — totalPreExploitation modifié (résultatFiscal 5500→3000) → canCloseFiscalYear refuse (ancien 4-scalaires aurait autorisé)", () => {
    const draft = apresGeneration(
      generationReadyDraft({
        chargesAssistant: { exerciceFiscal: 2025, totalDeductible: 2000, totalPreExploitation: 0 },
      }),
    );
    assert.equal(draft.fiscalResult!.resultatFiscal, 5500);

    const reouvertF012 = {
      ...draft,
      chargesAssistant: { exerciceFiscal: 2025, totalDeductible: 2000, totalPreExploitation: 2500 },
    } as DeclarationDraft;
    const recomputed = runDeclarationGeneration(reouvertF012, 2025);
    assert.equal(recomputed.status, "generated");
    if (recomputed.status !== "generated") throw new Error("unreachable");
    assert.equal(recomputed.fiscalResult.resultatFiscal, 3000);

    // Ancienne frontière insuffisante : les 4 scalaires restent égaux.
    assert.equal(draft.fiscalResult!.totalRecettes, recomputed.fiscalResult.totalRecettes);
    assert.equal(draft.fiscalResult!.totalCharges, recomputed.fiscalResult.totalCharges);
    assert.equal(draft.fiscalResult!.amortDeduct, recomputed.fiscalResult.amortDeduct);
    assert.equal(draft.fiscalResult!.amortReporte, recomputed.fiscalResult.amortReporte);

    const result = canCloseFiscalYear({
      fiscalYear: readyFiscalYear(),
      declarationDraft: reouvertF012,
      properties: [PROPERTY],
    });
    assert.equal(result.ok, false);
    assert.ok(result.ok === false && /changé depuis la dernière génération/i.test(result.reason));
  });
});

// ---------------------------------------------------------------------------
// P1 — Historique des exercices clôturés : précondition d'accès read-only.
// ---------------------------------------------------------------------------
describe("resolveArchivedFiscalYearAccess — précondition d'accès à l'historique", () => {
  it("3/10 — exercice clôturé d'un AUTRE dossier → refusé (isolation multi-dossier)", () => {
    const record = baseFiscalYear({ status: "closed", dossierId: "dossier-1" });
    const result = resolveArchivedFiscalYearAccess(record, "dossier-2");
    assert.equal(result.ok, false);
  });

  it("9 — exercice introuvable (record undefined) → refusé proprement", () => {
    const result = resolveArchivedFiscalYearAccess(undefined, "dossier-1");
    assert.equal(result.ok, false);
  });

  it("exercice ACTIF (non clôturé) du même dossier → refusé (jamais consultable via ce parcours)", () => {
    const record = baseFiscalYear({ status: "ready_to_close", dossierId: "dossier-1" });
    const result = resolveArchivedFiscalYearAccess(record, "dossier-1");
    assert.equal(result.ok, false, "un exercice non clôturé ne doit jamais être servi par la vue historique");
  });

  it("exercice clôturé du bon dossier → autorisé", () => {
    const record = baseFiscalYear({ status: "closed", dossierId: "dossier-1" });
    const result = resolveArchivedFiscalYearAccess(record, "dossier-1");
    assert.equal(result.ok, true);
  });

  it("dossierId courant vide/absent → refusé, jamais une autorisation par défaut", () => {
    const record = baseFiscalYear({ status: "closed", dossierId: "dossier-1" });
    const result = resolveArchivedFiscalYearAccess(record, "");
    assert.equal(result.ok, false);
  });
});

// ---------------------------------------------------------------------------
// Lot 1 — constructeur pur N→N+1 (contrat explicite, déterministe).
// ---------------------------------------------------------------------------
describe("buildNextExerciseFromClosedYear — Lot 1 contrat N→N+1", () => {
  function closedN(overrides: Partial<FiscalYear> = {}): FiscalYear {
    return baseFiscalYear({
      id: "fy-N",
      year: 2025,
      status: "closed",
      regime: "reel",
      propertyIds: ["prop-1", "prop-2"],
      dossierId: "dossier-1",
      closures: [
        {
          id: "closure-N",
          fiscalYearId: "fy-N",
          dossierId: "dossier-1",
          stocks: STOCKS_V1,
          computedAt: NOW,
          closedAt: NOW,
          patrimoine: {
            compteExploitantAvantAffectationResultat: 1200,
            resultatComptableExercice: 5500,
            ranSituation: "NATIF",
            ranValeur: 0,
          },
        },
      ],
      ...overrides,
    });
  }

  function richPreviousDraft(): DeclarationDraft {
    return {
      completedSteps: ["siren", "revenus", "charges"],
      siren: "123456789",
      siret: "12345678901234",
      exploitantFirstName: "Marie",
      exploitantLastName: "Dupont",
      exploitantEmail: "marie@example.com",
      activityStartDate: "2019-06-01",
      dateMiseEnService: "2020-01-01",
      revenusAssistant: { exerciceFiscal: 2025, totalRecettes: 9000 },
      chargesAssistant: { exerciceFiscal: 2025, totalDeductible: 2000, totalPreExploitation: 0 },
      amortissementAssistant: { exerciceFiscal: 2025, totalDotations: 1500, status: "validated" },
      fiscalResult: {
        exercice: 2025,
        resultatFiscal: 5500,
        resultatAvantAmort: 7000,
        totalRecettes: 9000,
        totalCharges: 2000,
        amortDeduct: 1500,
        amortReporte: 0,
        deficitNouveau: 0,
        stocks: STOCKS_V1,
        trace: { ksArtifacts: [], computedAt: NOW, journal: [] },
        computedAt: NOW,
      },
      rfs: { identite: { siren: "123456789" } } as DeclarationDraft["rfs"],
      liasseResult: { form2031: {} } as DeclarationDraft["liasseResult"],
      liasseRfs: {} as DeclarationDraft["liasseRfs"],
      declaration: { id: "decl-1", fiscalYearId: "fy-N", createdAt: NOW },
      declarationGeneratedAt: NOW,
      inpiConfirmedAt: NOW,
      logementConfirmedAt: NOW,
      revenusConfirmedAt: NOW,
      chargesConfirmedAt: NOW,
      amortissementConfirmedAt: NOW,
      paidAt: NOW,
    } as DeclarationDraft;
  }

  it("8–13 — année N+1, previousFiscalYearId, sourceClosureId, stocks, patrimoine, identité stables", () => {
    const previous = richPreviousDraft();
    const built = buildNextExerciseFromClosedYear({
      closedFiscalYear: closedN(),
      previousDraft: previous,
      dossierId: "dossier-1",
      nextFiscalYearId: "fy-N1",
      now: "2027-01-01T00:00:00.000Z",
    });

    assert.equal(built.fiscalYear.year, 2026);
    assert.equal(built.fiscalYear.id, "fy-N1");
    assert.equal(built.fiscalYear.previousFiscalYearId, "fy-N");
    assert.equal(built.sourceClosureId, "closure-N");
    assert.equal(built.fiscalYear.stocksOuverture?.sourceClosureId, "closure-N");
    assert.deepEqual(built.fiscalYear.stocksOuverture?.stocks, STOCKS_V1);
    assert.equal(built.fiscalYear.patrimoineOuverture?.sourceClosureId, "closure-N");
    assert.equal(typeof built.fiscalYear.patrimoineOuverture?.ouvertureCompteExploitant, "number");
    assert.deepEqual(built.fiscalYear.propertyIds, ["prop-1", "prop-2"]);
    assert.equal(built.fiscalYear.dossierId, "dossier-1");
    assert.equal(built.fiscalYear.regime, "reel");
    assert.equal(built.declarationDraft.siren, "123456789");
    assert.equal(built.declarationDraft.exploitantFirstName, "Marie");
    assert.equal(built.declarationDraft.activityStartDate, "2019-06-01");
  });

  it("14–19 — revenus/charges/génération/paiement/confirmations/documents N absents du draft N+1", () => {
    const built = buildNextExerciseFromClosedYear({
      closedFiscalYear: closedN(),
      previousDraft: richPreviousDraft(),
      dossierId: "dossier-1",
      nextFiscalYearId: "fy-N1",
      now: NOW,
    });
    const draft = built.declarationDraft as Record<string, unknown>;
    assert.equal(draft.revenusAssistant, undefined);
    assert.equal(draft.chargesAssistant, undefined);
    assert.equal(draft.fiscalResult, undefined);
    assert.equal(draft.rfs, undefined);
    assert.equal(draft.liasseResult, undefined);
    assert.equal(draft.liasseRfs, undefined);
    assert.equal(draft.declaration, undefined);
    assert.equal(draft.paidAt, undefined);
    assert.equal(draft.declarationGeneratedAt, undefined);
    assert.deepEqual(built.declarationDraft.completedSteps, []);
    assert.equal(draft.revenusConfirmedAt, undefined);
    assert.equal(draft.chargesConfirmedAt, undefined);
    assert.equal(draft.amortissementConfirmedAt, undefined);
    assert.equal(draft.inpiConfirmedAt, undefined);
    assert.equal(draft.logementConfirmedAt, undefined);
    assert.equal(draft.logementAmortissement, undefined);
    assert.deepEqual(built.fiscalYear.closures, []);
    assert.equal(built.fiscalYear.declarationGeneratedAt, undefined);
    assert.equal(built.fiscalYear.paidAt, undefined);
  });

  it("20 — mêmes entrées + mêmes IDs/timestamps injectés = résultat identique", () => {
    const input = {
      closedFiscalYear: closedN(),
      previousDraft: richPreviousDraft(),
      dossierId: "dossier-1",
      nextFiscalYearId: "fy-N1-fixed",
      now: "2027-02-02T12:00:00.000Z",
    };
    const a = buildNextExerciseFromClosedYear(input);
    const b = buildNextExerciseFromClosedYear(input);
    assert.deepEqual(a, b);
  });

  it("ouverture patrimoniale indisponible → jamais un zéro inventé", () => {
    const closedSansPatrimoine = closedN({
      closures: [
        {
          id: "closure-N",
          fiscalYearId: "fy-N",
          dossierId: "dossier-1",
          stocks: STOCKS_V1,
          computedAt: NOW,
          closedAt: NOW,
        },
      ],
    });
    const built = buildNextExerciseFromClosedYear({
      closedFiscalYear: closedSansPatrimoine,
      previousDraft: undefined,
      dossierId: "dossier-1",
      nextFiscalYearId: "fy-N1",
      now: NOW,
    });
    assert.equal(built.fiscalYear.patrimoineOuverture, undefined);
    assert.ok(built.fiscalYear.stocksOuverture, "les stocks restent disponibles indépendamment du patrimoine");
  });

  it("ne mute jamais l'exercice N source (pas de reseed silencieux)", () => {
    const n = closedN();
    const snapshot = structuredClone(n);
    buildNextExerciseFromClosedYear({
      closedFiscalYear: n,
      previousDraft: richPreviousDraft(),
      dossierId: "dossier-1",
      nextFiscalYearId: "fy-N1",
      now: NOW,
    });
    assert.deepEqual(n, snapshot);
  });
});
