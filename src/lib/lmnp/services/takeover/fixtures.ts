/**
 * Lot 4B — fixtures structurées (sortie FUTURE d'extracteurs).
 * Aucune prétention OCR / PDF réelle.
 */

import { createConfidenceScore } from "@/lib/documents/types/confidence-score";
import type { CandidateHistoricalAsset } from "./asset-candidates";
import type { CandidateFiscalStocks } from "./fiscal-stocks-candidates";
import type { TakeoverCandidatePackage } from "./package";
import {
  missingCandidate,
  presentCandidate,
  type CandidateProvenance,
} from "./candidate-value";

function taxProv(overrides: Partial<CandidateProvenance> = {}): CandidateProvenance {
  return {
    documentId: "doc-tax-package-fixture",
    documentRole: "prior_tax_package",
    extractionMethod: "fixture_structured",
    confidence: createConfidenceScore(0.9, ["fixture"]),
    evidence: { snippet: "fixture tax package", page: 1 },
    fieldSource: "extracted",
    ...overrides,
  };
}

function registerProv(overrides: Partial<CandidateProvenance> = {}): CandidateProvenance {
  return {
    documentId: "doc-asset-register-fixture",
    documentRole: "depreciation_register",
    extractionMethod: "fixture_structured",
    confidence: createConfidenceScore(0.88, ["fixture"]),
    evidence: { snippet: "fixture asset register", page: 2 },
    fieldSource: "extracted",
    ...overrides,
  };
}

/** Déficits 2022 / 2024 + stock ARD depuis source dédiée (jamais 318). */
export function fixtureTaxPackageCandidates(): CandidateFiscalStocks {
  return {
    deficits: presentCandidate(
      [
        { millesime: 2022, montant: 1200 },
        { millesime: 2024, montant: 3500 },
      ],
      "direct",
      taxProv({
        documentRole: "aide_2042",
        fieldLabel: "5GA-5GJ",
        sourceRef: "aide_2042:deficits",
        evidence: { snippet: "déficits antérieurs 2022 / 2024", page: 3 },
      }),
    ),
    amortissementsReportes: presentCandidate(
      4500,
      "direct",
      taxProv({
        documentRole: "accountant_note",
        fieldLabel: "stock ARD historique",
        sourceRef: "stock_historique_explicit",
        evidence: { snippet: "amortissements fiscalement non déduits reportés 4 500", page: 1 },
      }),
    ),
    amortissementsReportesSource: "stock_historique_explicit",
  };
}

function assetShell(
  partial: Pick<CandidateHistoricalAsset, "candidateKey" | "sourceAssetRef"> & {
    label: string;
    coutBrut: number;
    cumulOuverture: number;
    classification: "terrain" | "batiment" | "mobilier";
    nonAmortizable?: boolean;
    startDate?: string;
    durationYears?: number;
    rowRef: string;
  },
): CandidateHistoricalAsset {
  const prov = (fieldLabel: string) =>
    registerProv({
      fieldLabel,
      sourceRef: partial.rowRef,
      evidence: { snippet: `${partial.label} — ${fieldLabel}`, page: 2 },
    });

  const amortizable = partial.classification !== "terrain" && !partial.nonAmortizable;

  return {
    candidateKey: partial.candidateKey,
    sourceAssetRef: partial.sourceAssetRef,
    label: presentCandidate(partial.label, "direct", prov("libellé")),
    coutBrut: presentCandidate(partial.coutBrut, "direct", prov("base brute")),
    cumulOuverture: presentCandidate(partial.cumulOuverture, "direct", prov("cumul ouverture")),
    startDate: amortizable && partial.startDate
      ? presentCandidate(partial.startDate, "direct", prov("date mise en service"))
      : missingCandidate("non applicable ou absent du fixture"),
    durationYears: amortizable && partial.durationYears !== undefined
      ? presentCandidate(partial.durationYears, "direct", prov("durée"))
      : missingCandidate("non applicable ou absent du fixture"),
    method: amortizable
      ? presentCandidate("lineaire", "direct", prov("méthode"))
      : missingCandidate("terrain / non amortissable"),
    prorataConvention: amortizable
      ? presentCandidate("jours_reels", "direct", prov("prorata"))
      : missingCandidate("terrain / non amortissable"),
    classification: presentCandidate(partial.classification, "direct", prov("classification")),
    nonAmortizable: presentCandidate(
      partial.nonAmortizable ?? partial.classification === "terrain",
      "direct",
      prov("non amortissable"),
    ),
    propertyId: missingCandidate("propertyId inconnu — aucun fallback mono-bien dans les candidates"),
  };
}

/** Bâtiment + terrain + mobilier — propertyId volontairement missing. */
export function fixtureAssetRegisterCandidates(): CandidateHistoricalAsset[] {
  return [
    assetShell({
      candidateKey: "cand-batiment",
      sourceAssetRef: "SRC-BAT-01",
      label: "Bâtiment",
      coutBrut: 180_000,
      cumulOuverture: 36_000,
      classification: "batiment",
      startDate: "2020-03-15",
      durationYears: 40,
      rowRef: "register:row:1",
    }),
    assetShell({
      candidateKey: "cand-terrain",
      sourceAssetRef: "SRC-TER-01",
      label: "Terrain",
      coutBrut: 60_000,
      cumulOuverture: 0,
      classification: "terrain",
      nonAmortizable: true,
      rowRef: "register:row:2",
    }),
    assetShell({
      candidateKey: "cand-mobilier",
      sourceAssetRef: "SRC-MOB-01",
      label: "Mobilier",
      coutBrut: 12_000,
      cumulOuverture: 4_800,
      classification: "mobilier",
      startDate: "2020-03-15",
      durationYears: 10,
      rowRef: "register:row:3",
    }),
  ];
}

export function fixtureTakeoverCandidatePackage(): TakeoverCandidatePackage {
  return {
    packageId: "pkg-fixture-4b",
    sourceFiscalYear: 2025,
    stocks: fixtureTaxPackageCandidates(),
    assets: fixtureAssetRegisterCandidates(),
  };
}
