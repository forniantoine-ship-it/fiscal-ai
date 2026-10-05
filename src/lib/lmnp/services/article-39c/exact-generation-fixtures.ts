/**
 * INT-5 — fixtures de dossiers EXACTS COMPLETS (génération productive de bout en bout). Support de tests uniquement.
 *
 * Un dossier exact porte : F013 v2 confirmé, F012 confirmé et réconcilié, F010 / F014 validés, identité, stocks d'ouverture
 * démontrés (première année déclarée, ou continuité native). `legacyDraft` produit le MÊME dossier sous l'ancien contrat
 * (recettes F013 v1 = `totalRecettes`, aucun état F013 v2) pour les comparaisons proxy / exact.
 */
import type { DeclarationDraft } from "@/lib/lmnp/types";
import type { PersistedWorkspace } from "@/lib/lmnp/store/persistence";
import { DOSSIER, YEAR, bien, collected, rentState, type BienOptions } from "./article-39c-test-fixtures";

const NOW = "2026-12-31T00:00:00.000Z";

const IDENTITY = {
  siret: "12345678901234", siren: "123456789", exploitantFirstName: "Marie", exploitantLastName: "Dupont",
  exploitantEmail: "marie.dupont@example.com", exploitantTelephone: "0601020304", personalAddress: "10 rue des Lilas",
  personalCity: "Lyon", personalPostalCode: "69001", dateMiseEnService: "2020-01-01",
};

export type ExactDossierSpec = {
  /** Encaissements E de l'exercice (euros). */
  cash: number;
  /** Créance de clôture CC / avance de clôture AC (euros). */
  closingReceivables?: number;
  closingAdvances?: number;
  collected?: Parameters<typeof collected>[0];
  dotation: number;
  propertyId?: string;
  /** Stocks d'ouverture natifs (continuité N−1) ; absent = première année déclarée. */
  openingStocks?: { deficits: { millesime: number; montant: number }[]; amortissementsReportes: number };
  bien?: Partial<BienOptions>;
};

function baseDraft(dotation: number): DeclarationDraft {
  return {
    completedSteps: [], inpiConfirmedAt: NOW, logementConfirmedAt: NOW,
    logementAmortissement: {
      computedAt: NOW, exerciceFiscal: YEAR, prixRevient: 200000, valeurTerrain: 40000, valeurBati: 160000, baseAmortissableBati: 160000,
      montantMobilier: 0, dotationAnnuelle: dotation, dureeMoyenneAnnees: 30, plan: { lignes: [], totalAnnuelExercice: 0, totalBrut: 0 },
    },
    creditDeclaredNoneAt: NOW, chargesConfirmedAt: NOW, amortissementConfirmedAt: NOW,
    ...IDENTITY,
  } as unknown as DeclarationDraft;
}

function fiscalYear(spec: ExactDossierSpec, propertyId: string) {
  return {
    id: "fy-1", year: YEAR, status: "draft", regime: "reel", propertyIds: [propertyId], dossierId: DOSSIER, createdAt: NOW, updatedAt: NOW,
    ...(spec.openingStocks === undefined
      ? { priorHistoryDeclaration: { status: "FIRST_REAL_YEAR", declaredAt: NOW } }
      : { previousFiscalYearId: "fy-0", stocksOuverture: { sourceClosureId: "closure-prev", stocks: { deficits: spec.openingStocks.deficits, amortissementsReportes: spec.openingStocks.amortissementsReportes } } }),
  };
}

function workspaceOf(draft: DeclarationDraft, spec: ExactDossierSpec, propertyId: string): PersistedWorkspace {
  return {
    fiscalYear: fiscalYear(spec, propertyId), properties: [{ id: propertyId, label: propertyId, address: "1 rue X", city: "Lyon", postalCode: "69000" }],
    documents: [], extractions: [], validationItems: [], ledgerEntries: [], declarationDraft: draft, aiActivityFeed: [],
  } as unknown as PersistedWorkspace;
}

/** Dossier EXACT : F013 v2 confirmé + F012 / F010 / F014 exacts. */
export function exactDossier(spec: ExactDossierSpec): PersistedWorkspace {
  const propertyId = spec.propertyId ?? "prop-1";
  const b = bien(propertyId, {
    rent: rentState(propertyId, spec.cash, spec.closingReceivables ?? 0, spec.closingAdvances ?? 0),
    collected: collected(spec.collected ?? {}),
    logement: {},
    dotation: spec.dotation,
    ...spec.bien,
  });
  const { propertyId: _id, completedSteps: _steps, ...fields } = b;
  void _id; void _steps;
  const draft = { ...baseDraft(spec.dotation), ...fields, logementAmortissement: baseDraft(spec.dotation).logementAmortissement } as DeclarationDraft;
  return workspaceOf(draft, spec, propertyId);
}

/** Le MÊME dossier sous l'ancien contrat : recettes F013 v1, aucun état F013 v2 → LEGACY_PROXY. */
export function legacyDossier(spec: ExactDossierSpec): PersistedWorkspace {
  const propertyId = spec.propertyId ?? "prop-1";
  const exact = exactDossier(spec);
  const draft = { ...(exact.declarationDraft as DeclarationDraft) } as DeclarationDraft & { rentReconciliationV2?: unknown };
  delete draft.rentReconciliationV2;
  const l = spec.cash + (spec.closingReceivables ?? 0) - (spec.closingAdvances ?? 0);
  return workspaceOf(
    { ...draft, revenusConfirmedAt: NOW, revenusAssistant: { exerciceFiscal: YEAR, totalRecettes: l } } as DeclarationDraft,
    spec,
    propertyId,
  );
}
