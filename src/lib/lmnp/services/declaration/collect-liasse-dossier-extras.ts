/**
 * Extras descriptifs de la liasse — lecture du draft persisté, jamais un calcul.
 *
 * Fiscalité = RFS. Ici uniquement les champs déjà saisis et disponibles :
 * F-009 (dates / statut / régime), F-010 (bien), F-011 (prêts), F-012
 * (lignes descriptives), `FiscalYear.stocksOuverture` (persisté à la création
 * de l'exercice). Champ absent = omission. Aucune inférence, aucun 0 inventé.
 */

import type { LiasseDossierExtras } from "./build-liasse-dossier-document";
import type { DeclarationDraft, FiscalYear } from "@/lib/lmnp/types/domain";

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function omitEmpty(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

export type LiasseDossierExtrasSource = {
  declarationDraft?: DeclarationDraft | null;
  fiscalYear?: Pick<FiscalYear, "stocksOuverture"> | null;
};

function collectBien(draft: DeclarationDraft): LiasseDossierExtras["bien"] {
  const logement = draft.logementAssistantState;
  if (!logement) return undefined;
  const bien: NonNullable<LiasseDossierExtras["bien"]> = {};
  const adresse = omitEmpty(logement.adresse);
  const typeBien = omitEmpty(logement.typeBien);
  const dateAcquisition = omitEmpty(logement.dateAcquisition);
  if (adresse) bien.adresse = adresse;
  if (typeBien) bien.typeBien = typeBien;
  if (dateAcquisition) bien.dateAcquisition = dateAcquisition;
  if (isFiniteNumber(logement.prixAcquisition)) bien.prixAcquisition = logement.prixAcquisition;
  if (isFiniteNumber(logement.fraisNotaire)) bien.fraisNotaire = logement.fraisNotaire;
  if (logement.choixTraitementFrais === "integration" || logement.choixTraitementFrais === "deduction") {
    bien.choixTraitementFrais = logement.choixTraitementFrais;
  }
  return Object.keys(bien).length > 0 ? bien : undefined;
}

function collectPrets(draft: DeclarationDraft): LiasseDossierExtras["pretsDescriptifs"] {
  const loans = draft.financementAssistantState?.loans;
  if (!loans || loans.length === 0) return undefined;
  const prets = loans
    .filter((loan) => Boolean(omitEmpty(loan.pretId)))
    .map((loan) => {
      const pret: NonNullable<LiasseDossierExtras["pretsDescriptifs"]>[number] = { pretId: loan.pretId };
      if (isFiniteNumber(loan.capitalInitial)) pret.capitalInitial = loan.capitalInitial;
      if (isFiniteNumber(loan.tauxNominal)) pret.tauxNominal = loan.tauxNominal;
      if (isFiniteNumber(loan.dureeMois)) pret.dureeMois = loan.dureeMois;
      const datePremiere = omitEmpty(loan.datePremiereMensualite);
      if (datePremiere) pret.datePremiereMensualite = datePremiere;
      const typePret = omitEmpty(loan.typePret);
      if (typePret) pret.typePret = typePret;
      return pret;
    });
  return prets.length > 0 ? prets : undefined;
}

function collectCharges(draft: DeclarationDraft): LiasseDossierExtras["chargesDescriptives"] {
  const collected = draft.chargesAssistantState?.collected;
  if (!collected) return undefined;
  const out: NonNullable<LiasseDossierExtras["chargesDescriptives"]> = {};
  const copro = collected.coproLignes
    .filter((ligne) => isFiniteNumber(ligne.montant))
    .map((ligne) => ({
      type: ligne.type,
      montant: ligne.montant,
      ...(omitEmpty(ligne.description) ? { description: ligne.description!.trim() } : {}),
    }));
  if (copro.length > 0) out.coproLignes = copro;

  const familyLines = (collected.familyLines ?? [])
    .filter((ligne) => isFiniteNumber(ligne.montant))
    .map((ligne) => ({
      category: ligne.category,
      description: ligne.description,
      montant: ligne.montant,
      ...(omitEmpty(ligne.paidAt) ? { paidAt: ligne.paidAt!.trim() } : {}),
    }));
  if (familyLines.length > 0) out.familyLines = familyLines;

  const travaux = collected.travaux
    .filter((ligne) => isFiniteNumber(ligne.montant))
    .map((ligne) => ({
      description: ligne.description,
      montant: ligne.montant,
      ...(omitEmpty(ligne.choix) ? { choix: ligne.choix } : {}),
    }));
  if (travaux.length > 0) out.travaux = travaux;

  const divers = collected.divers
    .filter((ligne) => isFiniteNumber(ligne.montant))
    .map((ligne) => ({
      description: ligne.description,
      montant: ligne.montant,
    }));
  if (divers.length > 0) out.divers = divers;

  return Object.keys(out).length > 0 ? out : undefined;
}

function collectStocksOuverture(
  fiscalYear: Pick<FiscalYear, "stocksOuverture"> | null | undefined,
): LiasseDossierExtras["stocksOuverture"] {
  const stocks = fiscalYear?.stocksOuverture?.stocks;
  if (!stocks) return undefined;
  const out: NonNullable<LiasseDossierExtras["stocksOuverture"]> = {};
  if (stocks.deficits && stocks.deficits.length > 0) out.deficits = stocks.deficits;
  if (isFiniteNumber(stocks.amortissementsReportes)) {
    out.amortissementsReportes = stocks.amortissementsReportes;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

/**
 * Construit les extras du builder documentaire depuis le draft et l'exercice
 * déjà persistés. Retourne `undefined` si rien n'est disponible — le builder
 * omet alors toute métadonnée descriptive.
 */
export function collectLiasseDossierExtras(source: LiasseDossierExtrasSource): LiasseDossierExtras | undefined {
  const draft = source.declarationDraft ?? undefined;
  const extras: LiasseDossierExtras = {};

  const activityStartDate = omitEmpty(draft?.activityStartDate);
  if (activityStartDate) extras.activityStartDate = activityStartDate;

  if (draft?.activityType === "LMNP" || draft?.activityType === "LMP") {
    extras.activityType = draft.activityType;
  }

  const regime = draft?.activiteAssistantState?.regimeFiscal;
  if (regime === "reel_simplifie" || regime === "reel_normal") {
    extras.regimeFiscal = regime;
  }

  const bien = draft ? collectBien(draft) : undefined;
  if (bien) extras.bien = bien;

  const prets = draft ? collectPrets(draft) : undefined;
  if (prets) extras.pretsDescriptifs = prets;

  const charges = draft ? collectCharges(draft) : undefined;
  if (charges) extras.chargesDescriptives = charges;

  const stocksOuverture = collectStocksOuverture(source.fiscalYear);
  if (stocksOuverture) extras.stocksOuverture = stocksOuverture;

  return Object.keys(extras).length > 0 ? extras : undefined;
}
