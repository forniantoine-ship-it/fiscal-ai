/**
 * Dossier documentaire de la liasse fiscale — pages de notes AVANT les Cerfa.
 *
 * Construit depuis la RFS (`rfs.identite` / `rfs.fiscalResult` /
 * `rfs.immobilisations` / `rfs.emprunts`) : aucun appel à
 * produceFiscalResult(), aucun mapper Cerfa, aucun recalcul fiscal.
 * Chaque montant fiscal est une restitution directe d'un champ F-006 déjà
 * calculé. `resultatComptable()` est la fonction déjà consommée par les
 * cases 136/310 — transport pur, jamais une seconde formule.
 *
 * Les extras F010/F011/F012 (et stocks d'ouverture d'exercice) sont
 * uniquement descriptifs : un champ absent est omis, jamais remplacé par
 * 0, "Non renseigné", ou une valeur déduite.
 *
 * Séparation volontaire : cette fonction produit une représentation
 * structurée et testable ; le renderer PDF (étape suivante) ne fait que
 * disposer ce contenu.
 */

import { resultatComptable } from "@/runtime/capabilities/bilan/resultat-comptable";
import type { FiscalResult, StockDeficit } from "@/runtime/capabilities/f006/types";
import type { PretFinancementExercice } from "@/runtime/capabilities/f011/types";
import type { ComposantNouveau } from "@/runtime/capabilities/f012/types";
import type { FiscalRepresentation } from "@/runtime/capabilities/rfs/types";

const CHARGE_CATEGORY_LABELS: Record<string, string> = {
  taxe_fonciere: "Taxe foncière",
  assurance_pno: "Assurance propriétaire non occupant",
  assurance_gli: "Assurance loyers impayés",
  copropriete: "Charges de copropriété",
  honoraires_gestion: "Honoraires de gestion locative",
  travaux: "Travaux et réparations",
  honoraires_comptable: "Honoraires comptables",
  frais_bancaires: "Frais bancaires",
  divers: "Autres charges",
};

function humanizeUnknownCategorie(categorie: string): string {
  return categorie.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());
}

function omitEmpty(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/** Même filtre d'affichage que la synthèse 2042 : le déficit N est déjà le déficit de l'exercice. */
function deficitsVraimentAnterieurs(fr: FiscalResult): StockDeficit[] {
  return fr.stocks.deficits.filter((deficit) => deficit.millesime !== fr.exercice);
}

export type LiasseDossierResultatPrincipal =
  | { nature: "benefice"; montant: number }
  | { nature: "deficit"; montant: number };

export type LiasseDossierBienDescriptif = {
  adresse?: string;
  typeBien?: string;
  dateAcquisition?: string;
  prixAcquisition?: number;
  fraisNotaire?: number;
  choixTraitementFrais?: "integration" | "deduction";
};

export type LiasseDossierPretDescriptif = {
  pretId: string;
  capitalInitial?: number;
  tauxNominal?: number;
  dureeMois?: number;
  datePremiereMensualite?: string;
  typePret?: string;
};

export type LiasseDossierCoproLigneDescriptive = {
  type: string;
  montant: number;
  description?: string;
};

export type LiasseDossierFamilyLineDescriptive = {
  category: string;
  description: string;
  montant: number;
  paidAt?: string;
};

export type LiasseDossierTravauxDescriptif = {
  description: string;
  montant: number;
  choix?: string;
};

export type LiasseDossierDiversDescriptif = {
  description: string;
  montant: number;
};

export type LiasseDossierChargesDescriptives = {
  coproLignes?: LiasseDossierCoproLigneDescriptive[];
  familyLines?: LiasseDossierFamilyLineDescriptive[];
  travaux?: LiasseDossierTravauxDescriptif[];
  divers?: LiasseDossierDiversDescriptif[];
};

export type LiasseDossierStocksOuverture = {
  deficits?: StockDeficit[];
  amortissementsReportes?: number;
};

/**
 * Données descriptives hors RFS — jamais une source fiscale concurrente.
 * Chaque champ est optionnel : absence = omission.
 */
export type LiasseDossierExtras = {
  activityStartDate?: string;
  activityType?: "LMNP" | "LMP";
  regimeFiscal?: "reel_simplifie" | "reel_normal";
  bien?: LiasseDossierBienDescriptif;
  pretsDescriptifs?: LiasseDossierPretDescriptif[];
  chargesDescriptives?: LiasseDossierChargesDescriptives;
  /** `FiscalYear.stocksOuverture.stocks` — persisté, jamais dérivé de la clôture N. */
  stocksOuverture?: LiasseDossierStocksOuverture;
};

export type LiasseDossierChargeCategorie = {
  categorie: string;
  label: string;
  montant: number;
  source: "exploitation" | "financement";
};

export type LiasseDossierRecettesDetail = {
  loyersEncaisses?: number;
  recettesPlateforme?: number;
  indemnitesAssurance?: number;
  ajustementsJanDec?: number;
};

export type LiasseDossierFormationResultat = {
  recettes: number;
  recettesDetail?: LiasseDossierRecettesDetail;
  chargesDeductibles: number;
  chargesExploitation: number;
  chargesFinancement: number;
  chargesPreExploitation: number;
  chargesNonDeductibles: number;
  resultatAvantAmortissement: number;
  /** `resultatComptable(fr)` — même fonction que les cases 136/310. */
  resultatComptable: number;
  amortissementCalcule: number;
  amortissementDeductible: number;
  amortissementReporte: number;
  amortissementReportesUtilises: number;
  resultatFiscal: number;
  deficitFiscal: number;
  deficitsAnterieursImputes: number;
  resultatPrincipal: LiasseDossierResultatPrincipal;
};

export type LiasseDossierImmobilisationLigne = {
  label: string;
  valeurBrute: number;
  dureeAnnees?: number;
  dateMiseEnService?: string;
  dotationExercice?: number;
  amortissementsCumules?: number;
  vnc?: number;
  source: "plan" | "terrain" | "travaux";
};

export type LiasseDossierPret = {
  pretId: string;
  typePret?: string;
  interetsEmpruntExercice?: number;
  interetsPreExploitation?: number;
  assuranceEmpruntExercice?: number;
  assurancePreExploitation?: number;
  capitalRembourseExercice?: number;
  capitalRestantDu31_12?: number;
  fraisDossierDeductibles?: number;
  garantieDeductible?: number;
  iraDeductible?: number;
  capitalInitial?: number;
  tauxNominal?: number;
  dureeMois?: number;
  datePremiereMensualite?: string;
};

export type LiasseDossierDocument = {
  meta: {
    exercice: number;
    identite: {
      denomination?: string;
      siren?: string;
      siret?: string;
      adresseEntreprise?: string;
      adresseDeclarant?: string;
      email?: string;
      telephone?: string;
      exerciceDebut?: string;
      exerciceFin?: string;
    };
    activityStartDate?: string;
    activityType?: "LMNP" | "LMP";
    regimeFiscal?: "reel_simplifie" | "reel_normal";
    generatedAt: string;
    sourceFiscalResultAt: string;
  };
  bien?: LiasseDossierBienDescriptif;
  formationDuResultat: LiasseDossierFormationResultat;
  chargesParCategorie: LiasseDossierChargeCategorie[];
  chargesDescriptives?: LiasseDossierChargesDescriptives;
  immobilisations?: {
    dateMiseEnService?: string;
    totalBrut?: number;
    totalDotationExercice?: number;
    lignes: LiasseDossierImmobilisationLigne[];
  };
  financement?: {
    prets: LiasseDossierPret[];
  };
  reports: {
    deficitExercice: number;
    deficitsAnterieurs: StockDeficit[];
    deficitsImputes: number;
    stockDeficitsCloture: StockDeficit[];
    deficitsExpires: StockDeficit[];
    amortissementReporteExercice: number;
    amortissementReportesUtilises: number;
    stockAmortissementsReportesCloture: number;
    stockDeficitsOuverture?: StockDeficit[];
    stockAmortissementsReportesOuverture?: number;
  };
};

function buildRecettesDetail(fr: FiscalResult): LiasseDossierRecettesDetail | undefined {
  const detail: LiasseDossierRecettesDetail = {};
  if (isFiniteNumber(fr.recettes.loyersEncaisses)) detail.loyersEncaisses = fr.recettes.loyersEncaisses;
  if (isFiniteNumber(fr.recettes.recettesPlateforme)) detail.recettesPlateforme = fr.recettes.recettesPlateforme;
  if (isFiniteNumber(fr.recettes.indemnitesAssurance)) detail.indemnitesAssurance = fr.recettes.indemnitesAssurance;
  if (isFiniteNumber(fr.recettes.ajustementsJanDec)) detail.ajustementsJanDec = fr.recettes.ajustementsJanDec;
  return Object.keys(detail).length > 0 ? detail : undefined;
}

function buildChargesParCategorie(fr: FiscalResult, emprunts: PretFinancementExercice[] | undefined): LiasseDossierChargeCategorie[] {
  const detail = fr.charges.detailParCategorie;
  const lignes: LiasseDossierChargeCategorie[] = detail
    ? Object.entries(detail)
        .filter((entry): entry is [string, number] => isFiniteNumber(entry[1]) && entry[1] > 0)
        .map(([categorie, montant]) => ({
          categorie,
          label: CHARGE_CATEGORY_LABELS[categorie] ?? humanizeUnknownCategorie(categorie),
          montant,
          source: "exploitation" as const,
        }))
    : [];

  if (emprunts !== undefined) {
    for (const pret of emprunts) {
      if (pret.interetsEmpruntExercice > 0) {
        lignes.push({
          categorie: `interets_emprunt:${pret.pretId}`,
          label: "Intérêts d'emprunt",
          montant: pret.interetsEmpruntExercice,
          source: "financement",
        });
      }
      if (pret.interetsPreExploitation > 0) {
        lignes.push({
          categorie: `interets_pre_exploitation:${pret.pretId}`,
          label: "Intérêts d'emprunt (pré-exploitation)",
          montant: pret.interetsPreExploitation,
          source: "financement",
        });
      }
      if (pret.assuranceEmpruntExercice > 0) {
        lignes.push({
          categorie: `assurance_emprunteur:${pret.pretId}`,
          label: "Assurance emprunteur",
          montant: pret.assuranceEmpruntExercice,
          source: "financement",
        });
      }
      if (pret.assurancePreExploitation > 0) {
        lignes.push({
          categorie: `assurance_pre_exploitation:${pret.pretId}`,
          label: "Assurance emprunteur (pré-exploitation)",
          montant: pret.assurancePreExploitation,
          source: "financement",
        });
      }
      if (pret.fraisDossierDeductibles > 0) {
        lignes.push({
          categorie: `frais_dossier:${pret.pretId}`,
          label: "Frais de dossier d'emprunt",
          montant: pret.fraisDossierDeductibles,
          source: "financement",
        });
      }
      if (pret.garantieDeductible > 0) {
        lignes.push({
          categorie: `garantie:${pret.pretId}`,
          label: "Commission de garantie / caution",
          montant: pret.garantieDeductible,
          source: "financement",
        });
      }
      if (pret.iraDeductible > 0) {
        lignes.push({
          categorie: `ira:${pret.pretId}`,
          label: "Indemnité de remboursement anticipé",
          montant: pret.iraDeductible,
          source: "financement",
        });
      }
    }
  } else if (fr.charges.chargesFinancement > 0) {
    lignes.push({
      categorie: "financement_emprunt",
      label: "Intérêts et assurance d'emprunt",
      montant: fr.charges.chargesFinancement,
      source: "financement",
    });
  }

  return lignes;
}

function buildBien(extras: LiasseDossierExtras | undefined): LiasseDossierBienDescriptif | undefined {
  const bien = extras?.bien;
  if (!bien) return undefined;
  const out: LiasseDossierBienDescriptif = {};
  const adresse = omitEmpty(bien.adresse);
  const typeBien = omitEmpty(bien.typeBien);
  const dateAcquisition = omitEmpty(bien.dateAcquisition);
  if (adresse) out.adresse = adresse;
  if (typeBien) out.typeBien = typeBien;
  if (dateAcquisition) out.dateAcquisition = dateAcquisition;
  if (isFiniteNumber(bien.prixAcquisition)) out.prixAcquisition = bien.prixAcquisition;
  if (isFiniteNumber(bien.fraisNotaire)) out.fraisNotaire = bien.fraisNotaire;
  if (bien.choixTraitementFrais === "integration" || bien.choixTraitementFrais === "deduction") {
    out.choixTraitementFrais = bien.choixTraitementFrais;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

function buildChargesDescriptives(
  extras: LiasseDossierExtras | undefined,
): LiasseDossierChargesDescriptives | undefined {
  const raw = extras?.chargesDescriptives;
  if (!raw) return undefined;
  const out: LiasseDossierChargesDescriptives = {};
  if (raw.coproLignes && raw.coproLignes.length > 0) out.coproLignes = raw.coproLignes;
  if (raw.familyLines && raw.familyLines.length > 0) out.familyLines = raw.familyLines;
  if (raw.travaux && raw.travaux.length > 0) out.travaux = raw.travaux;
  if (raw.divers && raw.divers.length > 0) out.divers = raw.divers;
  return Object.keys(out).length > 0 ? out : undefined;
}

function buildImmobilisations(rfs: FiscalRepresentation): LiasseDossierDocument["immobilisations"] {
  const immo = rfs.immobilisations;
  if (!immo) return undefined;

  const dateMiseEnService = omitEmpty(immo.dateMiseEnService);
  const lignes: LiasseDossierImmobilisationLigne[] = immo.lignes.map((ligne) => {
    const row: LiasseDossierImmobilisationLigne = {
      label: ligne.label,
      valeurBrute: ligne.montant,
      dureeAnnees: ligne.dureeAnnees,
      dotationExercice: ligne.dotationExercice,
      amortissementsCumules: ligne.amortissementsCumules,
      vnc: ligne.vnc,
      source: "plan",
    };
    if (dateMiseEnService) row.dateMiseEnService = dateMiseEnService;
    return row;
  });

  if (isFiniteNumber(immo.valeurTerrain)) {
    lignes.push({
      label: "Terrain",
      valeurBrute: immo.valeurTerrain,
      source: "terrain",
    });
  }

  const travaux: ComposantNouveau[] | undefined = immo.composantsNouveaux;
  if (travaux) {
    for (const composant of travaux) {
      const row: LiasseDossierImmobilisationLigne = {
        label: composant.label,
        valeurBrute: composant.montant,
        dureeAnnees: composant.dureeAnnees,
        source: "travaux",
      };
      const dateDebut = omitEmpty(composant.dateDebut);
      if (dateDebut) row.dateMiseEnService = dateDebut;
      if (isFiniteNumber(composant.dotationAnnuelle)) row.dotationExercice = composant.dotationAnnuelle;
      lignes.push(row);
    }
  }

  const block: NonNullable<LiasseDossierDocument["immobilisations"]> = { lignes };
  if (dateMiseEnService) block.dateMiseEnService = dateMiseEnService;
  if (isFiniteNumber(immo.totalBrut)) block.totalBrut = immo.totalBrut;
  if (isFiniteNumber(immo.totalAnnuelExercice)) block.totalDotationExercice = immo.totalAnnuelExercice;
  return block;
}

function descriptiveByPretId(
  extras: LiasseDossierExtras | undefined,
): Map<string, LiasseDossierPretDescriptif> {
  const map = new Map<string, LiasseDossierPretDescriptif>();
  for (const pret of extras?.pretsDescriptifs ?? []) {
    if (pret.pretId) map.set(pret.pretId, pret);
  }
  return map;
}

function applyDescriptif(row: LiasseDossierPret, descriptif: LiasseDossierPretDescriptif | undefined): void {
  if (!descriptif) return;
  if (isFiniteNumber(descriptif.capitalInitial)) row.capitalInitial = descriptif.capitalInitial;
  if (isFiniteNumber(descriptif.tauxNominal)) row.tauxNominal = descriptif.tauxNominal;
  if (isFiniteNumber(descriptif.dureeMois)) row.dureeMois = descriptif.dureeMois;
  const datePremiere = omitEmpty(descriptif.datePremiereMensualite);
  if (datePremiere) row.datePremiereMensualite = datePremiere;
  const typePret = omitEmpty(descriptif.typePret);
  if (typePret && row.typePret === undefined) row.typePret = typePret;
}

function fromEmpruntRfs(pret: PretFinancementExercice): LiasseDossierPret {
  return {
    pretId: pret.pretId,
    typePret: pret.typePret,
    interetsEmpruntExercice: pret.interetsEmpruntExercice,
    interetsPreExploitation: pret.interetsPreExploitation,
    assuranceEmpruntExercice: pret.assuranceEmpruntExercice,
    assurancePreExploitation: pret.assurancePreExploitation,
    capitalRembourseExercice: pret.capitalRembourseExercice,
    capitalRestantDu31_12: pret.capitalRestantDu31_12,
    fraisDossierDeductibles: pret.fraisDossierDeductibles,
    garantieDeductible: pret.garantieDeductible,
    iraDeductible: pret.iraDeductible,
  };
}

function fromDescriptifOnly(descriptif: LiasseDossierPretDescriptif): LiasseDossierPret {
  const row: LiasseDossierPret = { pretId: descriptif.pretId };
  applyDescriptif(row, descriptif);
  return row;
}

function buildFinancement(
  rfs: FiscalRepresentation,
  extras: LiasseDossierExtras | undefined,
): LiasseDossierDocument["financement"] {
  const descriptifs = descriptiveByPretId(extras);

  if (rfs.emprunts !== undefined) {
    const prets = rfs.emprunts.map((pret) => {
      const row = fromEmpruntRfs(pret);
      applyDescriptif(row, descriptifs.get(pret.pretId));
      return row;
    });
    return { prets };
  }

  const extrasOnly = extras?.pretsDescriptifs;
  if (!extrasOnly || extrasOnly.length === 0) return undefined;
  return { prets: extrasOnly.map(fromDescriptifOnly) };
}

export function buildLiasseDossierDocument(
  rfs: FiscalRepresentation,
  extras?: LiasseDossierExtras,
): LiasseDossierDocument {
  const fr = rfs.fiscalResult;
  const isDeficit = fr.deficitNouveau > 0;
  const resultatPrincipal: LiasseDossierResultatPrincipal = isDeficit
    ? { nature: "deficit", montant: fr.deficitNouveau }
    : { nature: "benefice", montant: fr.resultatFiscal };

  const identite = rfs.identite;
  const activityStartDate = omitEmpty(extras?.activityStartDate);
  const activityType = extras?.activityType === "LMNP" || extras?.activityType === "LMP" ? extras.activityType : undefined;
  const regimeFiscal =
    extras?.regimeFiscal === "reel_simplifie" || extras?.regimeFiscal === "reel_normal"
      ? extras.regimeFiscal
      : undefined;

  const recettesDetail = buildRecettesDetail(fr);
  const formationDuResultat: LiasseDossierFormationResultat = {
    recettes: fr.recettes.total,
    chargesDeductibles: fr.charges.totalDeductible,
    chargesExploitation: fr.charges.chargesExploitation,
    chargesFinancement: fr.charges.chargesFinancement,
    chargesPreExploitation: fr.charges.chargesPreExploitation,
    chargesNonDeductibles: fr.charges.totalNonDeductible,
    resultatAvantAmortissement: fr.resultatAvantAmort,
    resultatComptable: resultatComptable(fr),
    amortissementCalcule: fr.amortCalcule,
    amortissementDeductible: fr.amortDeduct,
    amortissementReporte: fr.amortReporte,
    amortissementReportesUtilises: fr.amortReportesUtilises,
    resultatFiscal: fr.resultatFiscal,
    deficitFiscal: fr.deficitNouveau,
    deficitsAnterieursImputes: fr.deficitsImputes,
    resultatPrincipal,
  };
  if (recettesDetail) formationDuResultat.recettesDetail = recettesDetail;

  const reports: LiasseDossierDocument["reports"] = {
    deficitExercice: fr.deficitNouveau,
    deficitsAnterieurs: deficitsVraimentAnterieurs(fr),
    deficitsImputes: fr.deficitsImputes,
    stockDeficitsCloture: fr.stocks.deficits,
    deficitsExpires: fr.stocks.deficitsExpires,
    amortissementReporteExercice: fr.amortReporte,
    amortissementReportesUtilises: fr.amortReportesUtilises,
    stockAmortissementsReportesCloture: fr.stocks.amortissementsReportes,
  };
  if (extras?.stocksOuverture?.deficits) {
    reports.stockDeficitsOuverture = extras.stocksOuverture.deficits;
  }
  if (isFiniteNumber(extras?.stocksOuverture?.amortissementsReportes)) {
    reports.stockAmortissementsReportesOuverture = extras.stocksOuverture.amortissementsReportes;
  }

  const document: LiasseDossierDocument = {
    meta: {
      exercice: rfs.exercice,
      identite: {
        denomination: omitEmpty(identite.denomination),
        siren: omitEmpty(identite.siren),
        siret: omitEmpty(identite.siret),
        adresseEntreprise: omitEmpty(identite.adresseEntreprise),
        adresseDeclarant: omitEmpty(identite.adresseDeclarant),
        email: omitEmpty(identite.email),
        telephone: omitEmpty(identite.telephone),
        exerciceDebut: omitEmpty(identite.exerciceDebut),
        exerciceFin: omitEmpty(identite.exerciceFin),
      },
      generatedAt: new Date().toISOString(),
      sourceFiscalResultAt: fr.trace.computedAt,
    },
    formationDuResultat,
    chargesParCategorie: buildChargesParCategorie(fr, rfs.emprunts),
    reports,
  };
  if (activityStartDate) document.meta.activityStartDate = activityStartDate;
  if (activityType) document.meta.activityType = activityType;
  if (regimeFiscal) document.meta.regimeFiscal = regimeFiscal;

  const bien = buildBien(extras);
  if (bien) document.bien = bien;

  const chargesDescriptives = buildChargesDescriptives(extras);
  if (chargesDescriptives) document.chargesDescriptives = chargesDescriptives;

  const immobilisations = buildImmobilisations(rfs);
  if (immobilisations) document.immobilisations = immobilisations;

  const financement = buildFinancement(rfs, extras);
  if (financement) document.financement = financement;

  return document;
}
