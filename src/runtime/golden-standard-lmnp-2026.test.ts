/**
 * GOLDEN DOSSIER #1 — LMNP réel simplifié, exercice 2026.
 *
 * Dossier standard V1 (validation fiscale finale avant gel) : personne
 * physique, LMNP, un seul logement meublé, acquisition classique, aucune
 * dispense 2033-A (CA N-1 volontairement au-dessus du seuil), aucun élément
 * exceptionnel (pas de cession, pas de dépôt de garantie, pas de créance/
 * dette, pas de subvention, pas de déficit antérieur).
 *
 * ==========================================================================
 * ANTI-CIRCULARITÉ — LECTURE OBLIGATOIRE AVANT TOUTE MODIFICATION
 * ==========================================================================
 *
 * Chaque valeur de la section « ORACLE INDÉPENDANT » ci-dessous est classée :
 *   A = fait brut de fixture (choisi librement, documenté)
 *   B = arithmétique indépendante (recalculée à la main / script, hors
 *       production, avant tout appel à runDeclarationGeneration())
 *   C = formule/règle officielle déjà documentée dans le Knowledge System ou
 *       le code source lu en lecture seule (jamais exécutée pour produire la
 *       valeur — seule sa DÉFINITION est reprise)
 *   D = valeur produite en exécutant Fiscal AI puis recopiée ici
 *
 * AUCUNE valeur attendue de ce fichier n'est de catégorie D. Si une
 * correction future en introduit une, ce fichier n'est plus un oracle valide
 * et doit être reconstruit.
 *
 * Les fixtures suivantes ont été délibérément ÉVITÉES pour ne pas copier des
 * valeurs déjà utilisées comme oracle ailleurs dans le dépôt : CASE-001
 * Marie Dupont (knowledge/09 - Validation/Canonical Cases, prix 180 000 €,
 * loyer 750 €/mois...) et le dossier témoin Elsa Bouvard
 * (golden-master-technical-pipeline.test.ts, recettes 5 100 €...). Toutes
 * les valeurs ci-dessous sont propres à ce fichier.
 *
 * ==========================================================================
 * FRONTIÈRE D'INJECTION (section 12 de la mission)
 * ==========================================================================
 *
 * Aucune conversation d'assistant (F-009 à F-014), aucun OCR, aucun chat
 * n'est exercé. Les sorties DURABLES de chaque assistant (LogementAmortissementOutput,
 * FinancementChargesOutput, ChargesAssistantOutput, RevenusAssistantOutput,
 * AmortissementAssistantOutput) sont construites directement comme des
 * objets de domaine — exactement ce que chaque assistant persisterait une
 * fois sa conversation terminée. C'est la même convention que TOUTES les
 * fixtures déjà existantes du dépôt (draftReel/generationReadyDraft dans
 * final-declarability.test.ts et route.test.ts, CASE-001 dans f006.test.ts) :
 * aucune n'exécute non plus les assistants conversationnels. À partir de ce
 * point, tout le reste tourne en PRODUCTION RÉELLE, sans raccourci :
 *
 *   DeclarationDraft (facts ci-dessus)
 *     → runDeclarationGeneration()          [F-006 réel, RFS réelle]
 *     → assembleLiasseFromRfs()             [mappers 2031/2033-A/B/C/D réels]
 *     → buildClientSummaryDocument()        [aide 2042-C-PRO réelle]
 *     → resolveFinalDeclarabilityState()    [gate de livraison réel]
 *     → buildCerfaPdfRequestPayload()       [sélection de formulaires réelle]
 *
 * Run: npx tsx --test src/runtime/golden-standard-lmnp-2026.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { runDeclarationGeneration } from "@/lib/lmnp/services/declaration/run-declaration-generation";
import { resolveFinalDeclarabilityState } from "@/lib/lmnp/services/declaration/final-declarability";
import { buildCerfaPdfRequestPayload } from "@/lib/lmnp/services/declaration/download-cerfa-pdf";
import { buildClientSummaryDocument } from "@/lib/lmnp/services/declaration/build-client-summary-document";
import type { DeclarationDraft } from "@/lib/lmnp/types/domain";
import type { BilanInputs } from "@/runtime/capabilities/bilan/types";
import type { AmortissementPlan } from "@/runtime/capabilities/f010/types";
import type { PretFinancementExercice } from "@/runtime/capabilities/f011/types";

// ===========================================================================
// 1. FAITS BRUTS DE FIXTURE (catégorie A) — gelés AVANT tout calcul
// ===========================================================================

const EXERCICE = 2026;

/**
 * CA N-1 (année civile 2025) — fait déclaratif indépendant, sans rapport
 * avec le chiffre d'affaires 2026 (36 000 €, voir REVENUE plus bas). Choisi
 * délibérément AU-DESSUS du seuil 2026-2028 (66 000 € HT, resolveSeuilDispense2033A)
 * pour forcer le chemin complet 2033-A (NOT_ELIGIBLE), conformément à la
 * mission — jamais USE_DISPENSE dans ce dossier.
 */
const CA_N1 = 70_000;

/** Acquisition — prix payé au vendeur, hors frais de notaire. */
const PRIX_ACQUISITION = 200_000;
/** Frais de notaire — choix JUG-001 branche B (déduction immédiate en charge de l'exercice, pas d'intégration au prix de revient). */
const FRAIS_NOTAIRE = 15_000;
/** Aucun mobilier isolé dans ce dossier — golden #1 volontairement simple (mission §4). */
const MONTANT_MOBILIER = 0;
/**
 * Ratio terrain — JUG-002 : aucune formule ne le détermine, c'est un choix
 * utilisateur confirmé (barème SAV-003 = simple suggestion). 15 % choisi ici
 * (dans la fourchette usuelle 5–45 %, ratio-terrain.ts) pour produire
 * exactement terrain 30 000 € / bâti 170 000 € sur un prix de revient de
 * 200 000 € (frais en charges, jamais intégrés au prix de revient — voir
 * FRAIS_NOTAIRE ci-dessus).
 */
const RATIO_TERRAIN = 0.15;
const PRIX_REVIENT = PRIX_ACQUISITION; // mobilier=0, frais en charges (pas d'intégration)
const VALEUR_TERRAIN = round2(PRIX_REVIENT * RATIO_TERRAIN); // 30 000
const VALEUR_BATI = round2(PRIX_REVIENT - VALEUR_TERRAIN); // 170 000

/** Date de mise en service = premier jour de l'exercice → prorata 1.0, pleine année (mission §4). */
const DATE_MISE_EN_SERVICE = "2026-01-01";

// --- Emprunt (F-011) — un seul prêt amortissable ---
const CAPITAL_EMPRUNTE = 160_000;
const TAUX_ANNUEL = 0.03;
const DUREE_MOIS = 240;
const ASSURANCE_EMPRUNTEUR_ANNUELLE = 480;
const FRAIS_DOSSIER = 1_000;
const GARANTIE = 1_500;

// --- Revenus ---
/**
 * Mission §8 : le loyer initial suggéré (1 000 €/mois = 12 000 €/an) ne
 * dégage pas un résultat avant amortissement positif une fois les charges
 * réelles de ce dossier posées (financement d'un prêt de 160 000 € + frais
 * de notaire en charge immédiate) — voir ORACLE ci-dessous, charges totales
 * 25 898,92 €. Loyer relevé à 3 000 €/mois AVANT tout calcul de production,
 * conformément à l'instruction explicite de la mission §8 ("increase annual
 * rent... do this BEFORE freezing the fixture").
 */
const LOYER_MENSUEL = 3_000;
const RECETTES_2026 = LOYER_MENSUEL * 12; // 36 000

// --- Charges d'exploitation ordinaires (hors financement, hors amortissement) ---
const TAXE_FONCIERE = 1_200; // aucune TEOM récupérée dans ce dossier (voir ORACLE)
const ASSURANCE_PNO = 200;
const CHARGES_COPRO_NON_RECUPERABLES = 1_000;
const HONORAIRES_COMPTABLES = 500;
const ENTRETIEN_COURANT = 300;
const TOTAL_CHARGES_ORDINAIRES = round2(
  TAXE_FONCIERE + ASSURANCE_PNO + CHARGES_COPRO_NON_RECUPERABLES + HONORAIRES_COMPTABLES + ENTRETIEN_COURANT,
); // 3 200

// --- Patrimonial (2033-A) ---
/** Trésorerie professionnelle déclarée au 31/12 — fait explicite, jamais un solde résiduel calculé (mission §10). */
const CASH_CLOTURE = 5_000;
const OUVERTURE_120 = 0; // premier exercice, NATIF
const PRELEVEMENTS = 0;

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

// ===========================================================================
// 2. ARITHMÉTIQUE INDÉPENDANTE (catégorie B) — hors production, avant tout run
// ===========================================================================

/**
 * Échéancier de prêt — formule mathématique standard de l'amortissement à
 * mensualité constante (mêmes équations que generate-loan-schedule.ts, mais
 * réimplémentées ici indépendamment, jamais importées) :
 *   tauxMensuel = tauxAnnuel / 12
 *   mensualité  = capital × tauxMensuel × (1+tauxMensuel)^durée / ((1+tauxMensuel)^durée − 1)
 *   intérêts_mois = CRD × tauxMensuel  (arrondis au centime, comme toute
 *   table d'amortissement bancaire réelle)
 * Calculé par script Python indépendant le 2026-09-18, reproductible.
 */
function calculerEcheancierAnnee1(capital: number, tauxAnnuel: number, dureeMois: number) {
  const tauxMensuel = tauxAnnuel / 12;
  const facteur = Math.pow(1 + tauxMensuel, dureeMois);
  const mensualite = round2((capital * tauxMensuel * facteur) / (facteur - 1));
  let crd = capital;
  let totalInterets = 0;
  let totalCapital = 0;
  for (let i = 0; i < 12; i += 1) {
    const interets = round2(crd * tauxMensuel);
    let capitalMois = round2(mensualite - interets);
    if (i === dureeMois - 1) capitalMois = round2(crd);
    crd = round2(crd - capitalMois);
    totalInterets = round2(totalInterets + interets);
    totalCapital = round2(totalCapital + capitalMois);
  }
  return { mensualite, totalInterets, totalCapital, crdFinAnnee1: crd };
}

const ECHEANCIER = calculerEcheancierAnnee1(CAPITAL_EMPRUNTE, TAUX_ANNUEL, DUREE_MOIS);
const INTERETS_2026 = ECHEANCIER.totalInterets; // 4 718.92
const CAPITAL_REMBOURSE_2026 = ECHEANCIER.totalCapital; // 5 929.40
const CRD_31_12_2026 = ECHEANCIER.crdFinAnnee1; // 154 070.60

/**
 * Décomposition du bâti — grille "appartement" documentée (decompose-bati.ts
 * / grilles.ts, AX-005, méthode par composants obligatoire), reprise ici à
 * la main : 6 composants dont les pourcentages/durées sont la RÈGLE
 * officielle du produit (catégorie C), jamais recalculés en appelant
 * decomposeBati()/computeAmortizationPlan().
 *   Gros œuvre 50 % / 50 ans · Toiture 10 % / 25 ans ·
 *   Installations électriques 10 % / 25 ans · Plomberie/sanitaires 10 % / 25 ans ·
 *   Étanchéité 5 % / 15 ans · Agencements intérieurs 15 % / 15 ans.
 */
const GRILLE_APPARTEMENT = [
  { label: "Gros œuvre", pourcentage: 0.5, dureeAnnees: 50 },
  { label: "Toiture", pourcentage: 0.1, dureeAnnees: 25 },
  { label: "Installations électriques", pourcentage: 0.1, dureeAnnees: 25 },
  { label: "Plomberie / sanitaires", pourcentage: 0.1, dureeAnnees: 25 },
  { label: "Étanchéité", pourcentage: 0.05, dureeAnnees: 15 },
  { label: "Agencements intérieurs", pourcentage: 0.15, dureeAnnees: 15 },
] as const;

const LIGNES_AMORTISSEMENT: AmortissementPlan["lignes"] = GRILLE_APPARTEMENT.map((c) => {
  const montant = round2(VALEUR_BATI * c.pourcentage);
  const dotationExercice = round2(montant / c.dureeAnnees); // prorata = 1 (pleine année)
  return {
    label: c.label,
    montant,
    dureeAnnees: c.dureeAnnees,
    dotationExercice,
    amortissementsCumules: dotationExercice, // année 1 : cumul = dotation de l'exercice
    vnc: round2(montant - dotationExercice),
  };
});
const TOTAL_BRUT_BATI = round2(LIGNES_AMORTISSEMENT.reduce((acc, l) => acc + l.montant, 0)); // 170 000
const DOTATION_ANNUELLE_2026 = round2(LIGNES_AMORTISSEMENT.reduce((acc, l) => acc + l.dotationExercice, 0)); // 6 006.67
assert.equal(TOTAL_BRUT_BATI, VALEUR_BATI, "précondition — la grille doit reconstituer exactement la valeur bâti");

// --- Charges de financement de l'exercice (F-011 → F-006, formule officielle déjà documentée) ---
const TOTAL_CHARGES_FINANCEMENT = round2(INTERETS_2026 + ASSURANCE_EMPRUNTEUR_ANNUELLE + FRAIS_DOSSIER + GARANTIE); // 7 698.92

// --- Agrégation F-006 (formule officielle déjà documentée dans aggregate-inputs.ts / compute-resultat-avant-amort.ts) ---
const CHARGES_EXPLOITATION = round2(TOTAL_CHARGES_ORDINAIRES + FRAIS_NOTAIRE); // 18 200 (frais notaire = fraisEnCharges F-010)
const TOTAL_CHARGES_DEDUCTIBLES = round2(CHARGES_EXPLOITATION + TOTAL_CHARGES_FINANCEMENT); // 25 898.92
const RESULTAT_AVANT_AMORT = round2(RECETTES_2026 - TOTAL_CHARGES_DEDUCTIBLES); // 10 101.08

// --- Application de l'amortissement (TRF-0031, apply-amortissement-stocks.ts, formule officielle) ---
// resultatAvantAmort >= 0, aucun déficit antérieur, aucun stock d'amortissement reporté :
// amortDeduct = min(amortCalcule, resultatAvantAmort).
const AMORT_CALCULE = DOTATION_ANNUELLE_2026; // 6 006.67
assert.ok(RESULTAT_AVANT_AMORT >= AMORT_CALCULE, "précondition golden — amortissement intégralement déductible, jamais plafonné (mission §8)");
const AMORT_DEDUCT = AMORT_CALCULE;
const AMORT_REPORTE = 0;
const RESULTAT_FISCAL = round2(RESULTAT_AVANT_AMORT - AMORT_DEDUCT); // 4 094.41
const RESULTAT_COMPTABLE = round2(RESULTAT_AVANT_AMORT - AMORT_CALCULE - 0); // totalNonDeductible=0 → 4 094.41 (= RESULTAT_FISCAL ici)

// --- Bilan patrimonial (2033-A) ---
const ACTIF_BRUT_IMMOBILISATIONS = round2(VALEUR_TERRAIN + VALEUR_BATI); // 200 000 (= 028)
const AMORT_CUMULE_IMMOBILISATIONS = AMORT_CALCULE; // année 1 : cumul = dotation (= 030)
const NET_IMMOBILISATIONS = round2(ACTIF_BRUT_IMMOBILISATIONS - AMORT_CUMULE_IMMOBILISATIONS);

const TOTAL_044 = ACTIF_BRUT_IMMOBILISATIONS; // 014+028+040, seul 028 non nul
const TOTAL_048 = AMORT_CUMULE_IMMOBILISATIONS; // 016+030+042, seul 030 non nul
const TOTAL_096 = CASH_CLOTURE; // 064+068+072+080+084+092, seul 084 non nul
const TOTAL_098 = 0; // 066+070+074+082+086+094, tous nuls confirmés
const TOTAL_110 = round2(TOTAL_044 + TOTAL_096); // 205 000
const TOTAL_112 = round2(TOTAL_048 + TOTAL_098); // 6 006.67
const NET_ACTIF = round2(TOTAL_110 - TOTAL_112); // 198 993.33 — vérifié indépendamment, jamais via checkBilanEquilibre()

/**
 * Apports de l'exploitant — reconstitués par flux de trésorerie indépendant
 * (compte professionnel dédié unique, convention golden documentée
 * ci-dessous), JAMAIS par résidu pour forcer ACTIF NET = PASSIF (interdit
 * par la mission §10/§11). Équation posée AVANT tout calcul de production :
 *
 *   clôture_cash = ouverture(0) + apports − prélèvements(0)
 *                  + déblocage_prêt(160 000) − coût_acquisition(200 000+15 000)
 *                  + loyers_encaissés(36 000) − charges_ordinaires_cash(3 200)
 *                  − mensualités_prêt_payées(mensualité×12) − assurance_emprunteur(480)
 *                  − frais_dossier(1 000) − garantie(1 500)
 *
 * Convention golden explicite : tous les flux (déblocage de prêt, paiement
 * du bien, loyers, charges, échéances) transitent par l'unique compte
 * professionnel dédié suivi par Fiscal AI ("DEDIE") — aucun flux hors
 * compte. C'est un choix de modélisation du dossier golden, pas une règle
 * Fiscal AI. resultatFiscal.
 */
const MENSUALITES_PAYEES_2026 = round2(ECHEANCIER.mensualite * 12);
const FLUX_CONNUS_HORS_APPORTS = round2(
  0 + // ouverture
    CAPITAL_EMPRUNTE - // déblocage prêt
    (PRIX_ACQUISITION + FRAIS_NOTAIRE) + // coût d'acquisition total payé cash
    RECETTES_2026 - // loyers encaissés (aucun impayé dans ce dossier)
    TOTAL_CHARGES_ORDINAIRES - // charges ordinaires payées cash
    MENSUALITES_PAYEES_2026 - // mensualités du prêt (intérêts + capital)
    ASSURANCE_EMPRUNTEUR_ANNUELLE - // assurance emprunteur
    FRAIS_DOSSIER - // frais de dossier
    GARANTIE - // commission de caution
    PRELEVEMENTS,
);
const APPORTS = round2(CASH_CLOTURE - FLUX_CONNUS_HORS_APPORTS); // 40 828.32
const CLOTURE_120 = round2(OUVERTURE_120 + APPORTS - PRELEVEMENTS); // = APPORTS ici

const TOTAL_142 = round2(CLOTURE_120 + 0 /* RAN */ + RESULTAT_COMPTABLE + 0 /* subventions */); // 44 922.73
const TOTAL_176 = CRD_31_12_2026; // seul 156 non nul (aucun autre tiers-dette)
const TOTAL_180 = round2(TOTAL_142 + TOTAL_176); // 198 993.33

// Vérification d'équilibre INDÉPENDANTE — jamais via checkBilanEquilibre() ni aucun helper de production.
assert.equal(
  NET_ACTIF,
  TOTAL_180,
  `GOLDEN FIXTURE INVALID — actif net (${NET_ACTIF}) ≠ passif (${TOTAL_180}) : les faits choisis ne s'équilibrent pas naturellement`,
);

// ===========================================================================
// 3. CONSTRUCTION DU DOSSIER DE PRODUCTION (frontière F-009→F-014 output)
// ===========================================================================

function buildGoldenDraft(): DeclarationDraft {
  const plan: AmortissementPlan = {
    lignes: LIGNES_AMORTISSEMENT,
    totalAnnuelExercice: DOTATION_ANNUELLE_2026,
    totalBrut: TOTAL_BRUT_BATI,
  };

  const pret: PretFinancementExercice = {
    pretId: "golden-pret-1",
    typePret: "amortissable",
    interetsEmpruntExercice: INTERETS_2026,
    interetsPreExploitation: 0,
    assuranceEmpruntExercice: ASSURANCE_EMPRUNTEUR_ANNUELLE,
    assurancePreExploitation: 0,
    capitalRembourseExercice: CAPITAL_REMBOURSE_2026,
    capitalRestantDu31_12: CRD_31_12_2026,
    fraisDossierDeductibles: FRAIS_DOSSIER,
    garantieDeductible: GARANTIE,
    iraDeductible: 0,
  };

  return {
    completedSteps: [],
    siret: "12345678900012",
    siren: "123456789",
    exploitantFirstName: "Jean",
    exploitantLastName: "Golden",
    activityStartDate: DATE_MISE_EN_SERVICE,
    dateMiseEnService: DATE_MISE_EN_SERVICE,
    activityType: "LMNP",
    logementAmortissement: {
      prixRevient: PRIX_REVIENT,
      fraisEnCharges: FRAIS_NOTAIRE,
      valeurTerrain: VALEUR_TERRAIN,
      valeurBati: VALEUR_BATI,
      baseAmortissableBati: VALEUR_BATI,
      montantMobilier: MONTANT_MOBILIER,
      dotationAnnuelle: DOTATION_ANNUELLE_2026,
      dureeMoyenneAnnees: 30,
      prorataRatio: 1,
      plan,
      fieldSources: {},
      computedAt: "2026-01-01T00:00:00.000Z",
    },
    financementCharges: {
      exerciceFiscal: EXERCICE,
      totalInteretsEmprunt: INTERETS_2026,
      totalInteretsPreExploitation: 0,
      totalAssurance: ASSURANCE_EMPRUNTEUR_ANNUELLE,
      totalAssurancePreExploitation: 0,
      totalCapitalRembourse: CAPITAL_REMBOURSE_2026,
      totalChargesFinancementExercice: TOTAL_CHARGES_FINANCEMENT,
      prets: [pret],
      fieldSources: {},
      computedAt: "2026-01-01T00:00:00.000Z",
    },
    chargesAssistant: {
      exerciceFiscal: EXERCICE,
      totalDeductible: TOTAL_CHARGES_ORDINAIRES,
      totalNonDeductible: 0,
      totalAmortissable: 0,
      totalPreExploitation: 0,
      // A1 — ventilation fidèle à ce qu'un F-012 réel persisterait : Σ = totalDeductible (3 200 €).
      parCategorie: {
        taxe_fonciere: TAXE_FONCIERE,
        assurance_pno: ASSURANCE_PNO,
        copropriete: CHARGES_COPRO_NON_RECUPERABLES,
        honoraires_comptable: HONORAIRES_COMPTABLES,
        divers: ENTRETIEN_COURANT,
      },
      parCategoriePreExploitation: {},
      parCategorieNonDeductible: {},
      composantsNouveaux: [],
      fieldSources: {},
      computedAt: "2026-01-01T00:00:00.000Z",
    },
    revenusAssistant: {
      exerciceFiscal: EXERCICE,
      totalRecettes: RECETTES_2026,
      loyersEncaisses: RECETTES_2026,
      indemnitesAssurance: 0,
      recettesPlateforme: 0,
      ajustementsJanDec: 0,
      moisLocationEffectifs: 12,
      fieldSources: {},
      computedAt: "2026-01-01T00:00:00.000Z",
    },
    amortissementAssistant: {
      exerciceFiscal: EXERCICE,
      totalDotations: DOTATION_ANNUELLE_2026,
      status: "validated",
      planVersion: "golden-v1",
      profil: "PROF-001",
      validatedAt: "2026-01-01T00:00:00.000Z",
    },
    dispense2033A: { caReferenceN1Declaree: CA_N1 },
  } as unknown as DeclarationDraft;
}

/** Toutes les familles patrimoniales sans objet dans ce dossier sont explicitement NUL_CONFIRME/NON_APPLICABLE — jamais une absence de saisie (mission §10 : "no receivables/payables", "no unusual assets"). */
function buildGoldenBilanInputs(): BilanInputs {
  return {
    tresorerie: {
      bankMode: "DEDIE",
      closingCash: CASH_CLOTURE,
      provisionsAmortissements: { status: "NUL_CONFIRME" },
    },
    compteExploitant: { ouverture: OUVERTURE_120, apports: APPORTS, prelevements: PRELEVEMENTS },
    ran: { situation: "NATIF" },
    tiers: { creances: { status: "NUL_CONFIRME" }, dettes: { status: "NUL_CONFIRME" } },
    subventionsInvestissement: { status: "NUL_CONFIRME" },
    lignesSimples: {
      autresImmobilisationsIncorporellesBrut: { status: "NUL_CONFIRME" },
      autresImmobilisationsIncorporellesNet: { status: "NUL_CONFIRME" },
      immobilisationsFinancieresBrut: { status: "NUL_CONFIRME" },
      immobilisationsFinancieresNet: { status: "NUL_CONFIRME" },
      avancesAcomptesVerses: { status: "NUL_CONFIRME" },
      avancesAcomptesVersesAmort: { status: "NUL_CONFIRME" },
      clientsAmortissementsProvisions: { status: "NUL_CONFIRME" },
      autresCreancesAmortissementsProvisions: { status: "NUL_CONFIRME" },
      valeursMobilieresPlacementBrut: { status: "NUL_CONFIRME" },
      valeursMobilieresPlacementNet: { status: "NUL_CONFIRME" },
      chargesConstateesAvance: { status: "NUL_CONFIRME" },
      chargesConstateesAvanceAmort: { status: "NUL_CONFIRME" },
      produitsConstatesAvance: { status: "NUL_CONFIRME" },
      autresDettes: { status: "NUL_CONFIRME" },
    },
    ventilationTiers: {
      naturesConfirmeesVides: [
        "LOYER_DU_PAR_LOCATAIRE",
        "ACOMPTE_VERSE_A_FOURNISSEUR",
        "AUTRE_CREANCE_ACTIVITE",
        "CHARGE_CONSTATEE_AVANCE",
        "FOURNISSEUR_NON_PAYE",
        "DETTE_FISCALE_OU_SOCIALE",
        "DEPOT_GARANTIE_LOCATAIRE",
        "LOYER_ENCAISSE_D_AVANCE",
        "ACOMPTE_RECU_SUR_COMMANDE",
      ],
    },
  };
}

// ===========================================================================
// 4. EXÉCUTION RÉELLE + ASSERTIONS
// ===========================================================================

describe("GOLDEN #1 — LMNP réel simplifié 2026 : validation fiscale end-to-end", () => {
  const draft = buildGoldenDraft();
  const bilanInputs = buildGoldenBilanInputs();
  const generation = runDeclarationGeneration(draft, EXERCICE, undefined, bilanInputs, draft.dispense2033A);

  it("préconditions golden — dossier réellement généré (pas bloqué)", () => {
    assert.equal(generation.status, "generated");
  });
  if (generation.status !== "generated") return;

  const { rfs, liasseRfs } = generation;

  describe("RFS — faits matériels", () => {
    it("recettes / charges déductibles / résultat", () => {
      assert.equal(rfs.fiscalResult.recettes.total, RECETTES_2026);
      assert.equal(rfs.fiscalResult.charges.totalDeductible, TOTAL_CHARGES_DEDUCTIBLES);
      assert.equal(rfs.fiscalResult.charges.chargesFinancement, TOTAL_CHARGES_FINANCEMENT);
      assert.equal(rfs.fiscalResult.resultatAvantAmort, RESULTAT_AVANT_AMORT);
    });

    it("amortissement — calculé / déduit / reporté", () => {
      assert.equal(rfs.fiscalResult.amortCalcule, AMORT_CALCULE);
      assert.equal(rfs.fiscalResult.amortDeduct, AMORT_DEDUCT);
      assert.equal(rfs.fiscalResult.amortReporte, AMORT_REPORTE);
    });

    it("résultat fiscal final = résultat comptable (amortissement intégralement déductible, aucune charge non déductible)", () => {
      assert.equal(rfs.fiscalResult.resultatFiscal, RESULTAT_FISCAL);
      assert.equal(rfs.fiscalResult.deficitNouveau, 0);
    });

    it("immobilisations (F-010/F-014)", () => {
      assert.equal(rfs.immobilisations?.totalBrut, TOTAL_BRUT_BATI);
      assert.equal(rfs.immobilisations?.valeurTerrain, VALEUR_TERRAIN);
      assert.equal(rfs.immobilisations?.totalAnnuelExercice, DOTATION_ANNUELLE_2026);
    });

    it("emprunt (F-011) — CRD au 31/12", () => {
      assert.equal(rfs.emprunts?.[0]?.capitalRestantDu31_12, CRD_31_12_2026);
      assert.equal(rfs.emprunts?.[0]?.interetsEmpruntExercice, INTERETS_2026);
    });

    it("patrimoine — totaux", () => {
      assert.equal(rfs.patrimoine?.immobilisations.brutTotal, ACTIF_BRUT_IMMOBILISATIONS);
      assert.equal(rfs.patrimoine?.immobilisations.cumuleTotal, AMORT_CUMULE_IMMOBILISATIONS);
      assert.equal(rfs.patrimoine?.tresorerie.clotureRetenue, CASH_CLOTURE);
      assert.equal(rfs.patrimoine?.compteExploitant.clotureN, CLOTURE_120);
      assert.equal(rfs.patrimoine?.resultatComptable, RESULTAT_COMPTABLE);
    });

    it("dispense 2033-A — NOT_ELIGIBLE (CA N-1 70 000 € > seuil 66 000 €)", () => {
      assert.equal(rfs.dispense2033A?.eligibilite.etat, "NOT_ELIGIBLE");
    });
  });

  describe("2031-SD — cases matérielles", () => {
    function findCase(id: string) {
      return liasseRfs.form2031.cases.find((c) => c.caseId === id);
    }
    it("C_L1_COL1 (résultat fiscal bénéfice)", () => assert.equal(findCase("C_L1_COL1")?.value, RESULTAT_FISCAL));
    it("I_7A (BIC non pro bénéfice)", () => assert.equal(findCase("I_7A")?.value, RESULTAT_FISCAL));
    it("C_L1_COL2 / I_7B absents (aucun déficit)", () => {
      assert.equal(findCase("C_L1_COL2"), undefined);
      assert.equal(findCase("I_7B"), undefined);
    });
  });

  describe("2033-A-SD — cases matérielles (17 cases minimum requises par la mission)", () => {
    function findCase(id: string) {
      return liasseRfs.form2033A.cases.find((c) => c.caseId === id);
    }
    const attendus: Record<string, number> = {
      "028": ACTIF_BRUT_IMMOBILISATIONS,
      "030": AMORT_CUMULE_IMMOBILISATIONS,
      "044": TOTAL_044,
      "048": TOTAL_048,
      "084": CASH_CLOTURE,
      "086": 0,
      "096": TOTAL_096,
      "098": TOTAL_098,
      "110": TOTAL_110,
      "112": TOTAL_112,
      "120": CLOTURE_120,
      "134": 0,
      "136": RESULTAT_COMPTABLE,
      "142": TOTAL_142,
      "156": CRD_31_12_2026,
      "176": TOTAL_176,
      "180": TOTAL_180,
    };
    for (const [caseId, expected] of Object.entries(attendus)) {
      it(`case ${caseId} = ${expected}`, () => {
        const found = findCase(caseId);
        assert.notEqual(found, undefined, `case ${caseId} doit être publiée (non bloquée) sur ce dossier`);
        assert.equal(found?.value, expected);
      });
    }

    it("équilibre — statut EQUILIBRE (checkBilanEquilibre, jamais recalculé ici, seulement observé)", () => {
      assert.equal(liasseRfs.form2033A.equilibreStatus, "EQUILIBRE");
    });

    it("110 - 112 = 180 (identité Cerfa vérifiée indépendamment en section 2, revérifiée ici sur la sortie réelle)", () => {
      const c110 = findCase("110")?.value as number;
      const c112 = findCase("112")?.value as number;
      const c180 = findCase("180")?.value as number;
      assert.equal(round2(c110 - c112), c180);
    });
  });

  describe("2033-B-SD — cases matérielles", () => {
    function findCase(id: string) {
      return liasseRfs.form2033B.cases.find((c) => c.caseId === id);
    }
    const attendus: Record<string, number> = {
      "218": RECETTES_2026,
      "232": RECETTES_2026,
      "254": AMORT_CALCULE,
      // Frais de dossier → 242 ∈ 264 (notice 2033-NOT-SD) ; 294 = financement hors frais dossier.
      // 310 inchangé : 264 ↑ et 294 ↓ du même montant FRAIS_DOSSIER.
      "294": round2(TOTAL_CHARGES_FINANCEMENT - FRAIS_DOSSIER),
      "300": 0,
      "310": RESULTAT_COMPTABLE,
      "312": RESULTAT_COMPTABLE,
      "318": AMORT_REPORTE,
      "350": 0,
      "370": RESULTAT_FISCAL,
    };
    for (const [caseId, expected] of Object.entries(attendus)) {
      it(`case ${caseId} = ${expected}`, () => {
        const found = findCase(caseId);
        assert.notEqual(found, undefined, `case ${caseId} doit être publiée sur ce dossier`);
        assert.equal(found?.value, expected);
      });
    }
    it("242/244 : frais de dossier F-011 publiés en 242 si conservation F-012 ; sinon ECART frais notaire inchangé hors FD", () => {
      // Sans ventilation F-012 complète, 242/244 F-012 restent non publiés ; les frais de dossier
      // restent néanmoins dans 264 (et hors 294). Sur ce golden, conservation = ECART (frais notaire).
      assert.equal(findCase("244"), undefined);
      assert.equal(liasseRfs.form2033B.conservationDetail.status, "ECART");
      // L'écart de conservation F-012 reste les frais notaire ; les FD sont ajoutés des deux côtés
      // (attendu/attribue) via le mapper — l'écart affiché reste FRAIS_NOTAIRE.
      assert.equal(liasseRfs.form2033B.conservationDetail.ecart, FRAIS_NOTAIRE);
    });
    it("réconciliation Cerfa avec crédit : 270 − 294 − 300 = 310", () => {
      const v = (id: string) => (findCase(id)?.value as number | undefined) ?? 0;
      assert.equal(round2(v("270") - v("294") - v("300")), v("310"));
    });
    it("264 (total charges exploitation) et 270 (résultat exploitation) — formule officielle + frais dossier F-011", () => {
      const charges264 = round2(CHARGES_EXPLOITATION + AMORT_CALCULE + FRAIS_DOSSIER);
      const resultat270 = round2(RECETTES_2026 - charges264);
      assert.equal(findCase("264")?.value, charges264);
      assert.equal(findCase("270")?.value, resultat270);
      assert.equal(round2(TOTAL_CHARGES_FINANCEMENT - FRAIS_DOSSIER), findCase("294")?.value);
    });
    it("314 / 330 / 372 absents (aucun déficit dans ce dossier)", () => {
      assert.equal(findCase("314"), undefined);
      assert.equal(findCase("330"), undefined);
      assert.equal(findCase("372"), undefined);
    });
  });

  describe("2033-C-SD — mouvements matériels (premier exercice de mise en service)", () => {
    function findCase(id: string) {
      return liasseRfs.form2033C.cases.find((c) => c.caseId === id);
    }
    const attendus: Record<string, number> = {
      "572": AMORT_CALCULE,
      "426": VALEUR_TERRAIN,
      "476": MONTANT_MOBILIER,
      "496": ACTIF_BRUT_IMMOBILISATIONS,
      "576": AMORT_CUMULE_IMMOBILISATIONS,
      "490": 0,
      "492": ACTIF_BRUT_IMMOBILISATIONS,
      "570": 0,
    };
    for (const [caseId, expected] of Object.entries(attendus)) {
      it(`case ${caseId} = ${expected}`, () => {
        const found = findCase(caseId);
        assert.notEqual(found, undefined, `case ${caseId} doit être publiée sur ce dossier (premier exercice)`);
        assert.equal(found?.value, expected);
      });
    }
  });

  describe("2033-D-SD — formulaire présent, structurellement vide pour un LMNP à l'IR (SAV-029)", () => {
    it("aucune case alimentée — comportement attendu, pas un défaut", () => {
      assert.deepEqual(liasseRfs.form2033D.cases, []);
    });
  });

  describe("2033-E-SD — non applicable", () => {
    it("CA de l'exercice (36 000 €) très inférieur au seuil de 152 500 € HT (SAV-029) — et aucun mapper 2033-E n'existe dans ce périmètre produit", () => {
      assert.ok(RECETTES_2026 < 152_500);
    });
  });

  describe("2042-C-PRO — assistance réelle (buildClientSummaryDocument)", () => {
    const aide = buildClientSummaryDocument(rfs, { activityStartDate: draft.activityStartDate });

    it("case 5NA = résultat fiscal, case 5NY absente (bénéfice, pas de déficit)", () => {
      const case5NA = aide.aide2042.cases.find((c) => c.case === "5NA");
      const case5NY = aide.aide2042.cases.find((c) => c.case === "5NY");
      assert.equal(case5NA?.montant, RESULTAT_FISCAL);
      assert.equal(case5NY, undefined);
    });

    it("synthèse fiscale — cohérente avec la RFS, jamais recalculée indépendamment", () => {
      assert.equal(aide.syntheseFiscale.resultatFiscal, RESULTAT_FISCAL);
      assert.equal(aide.syntheseFiscale.recettes, RECETTES_2026);
      assert.equal(aide.syntheseFiscale.resultatPrincipal.nature, "benefice");
      assert.equal(aide.syntheseFiscale.resultatPrincipal.montant, RESULTAT_FISCAL);
    });
  });

  describe("Réconciliation inter-formulaires", () => {
    it("F-006 fiscalResult.resultatFiscal = RFS = 2033-B case 370 = 2031 case C_L1_COL1/I_7A = aide 2042 case 5NA", () => {
      const c370 = liasseRfs.form2033B.cases.find((c) => c.caseId === "370")?.value;
      const cL1 = liasseRfs.form2031.cases.find((c) => c.caseId === "C_L1_COL1")?.value;
      const i7a = liasseRfs.form2031.cases.find((c) => c.caseId === "I_7A")?.value;
      const aide = buildClientSummaryDocument(rfs);
      const c5NA = aide.aide2042.cases.find((c) => c.case === "5NA")?.montant;
      assert.equal(rfs.fiscalResult.resultatFiscal, RESULTAT_FISCAL);
      assert.equal(c370, RESULTAT_FISCAL);
      assert.equal(cL1, RESULTAT_FISCAL);
      assert.equal(i7a, RESULTAT_FISCAL);
      assert.equal(c5NA, RESULTAT_FISCAL);
    });

    it("F-014 amortissement (amortCalcule) ↔ 2033-B case 254/572 ↔ 2033-C case 572", () => {
      const case254 = liasseRfs.form2033B.cases.find((c) => c.caseId === "254")?.value;
      const case572 = liasseRfs.form2033C.cases.find((c) => c.caseId === "572")?.value;
      assert.equal(rfs.fiscalResult.amortCalcule, AMORT_CALCULE);
      assert.equal(case254, AMORT_CALCULE);
      assert.equal(case572, AMORT_CALCULE);
    });

    it("F-011 CRD (rfs.emprunts) ↔ 2033-A case 156 ↔ 2033-A case 176 (seul poste de dette)", () => {
      const case156 = liasseRfs.form2033A.cases.find((c) => c.caseId === "156")?.value;
      const case176 = liasseRfs.form2033A.cases.find((c) => c.caseId === "176")?.value;
      assert.equal(rfs.emprunts?.[0]?.capitalRestantDu31_12, CRD_31_12_2026);
      assert.equal(case156, CRD_31_12_2026);
      assert.equal(case176, CRD_31_12_2026);
    });

    it("F-010/F-014 immobilisations ↔ 2033-A cases 028/030 ↔ 2033-C cases 496/576 (même valeur, même formule documentée)", () => {
      const case028 = liasseRfs.form2033A.cases.find((c) => c.caseId === "028")?.value;
      const case030 = liasseRfs.form2033A.cases.find((c) => c.caseId === "030")?.value;
      const case496 = liasseRfs.form2033C.cases.find((c) => c.caseId === "496")?.value;
      const case576 = liasseRfs.form2033C.cases.find((c) => c.caseId === "576")?.value;
      assert.equal(case028, ACTIF_BRUT_IMMOBILISATIONS);
      assert.equal(case496, ACTIF_BRUT_IMMOBILISATIONS);
      assert.equal(case030, AMORT_CUMULE_IMMOBILISATIONS);
      assert.equal(case576, AMORT_CUMULE_IMMOBILISATIONS);
    });

    it("2033-A : 110 - 112 = 180 sur la sortie réelle (identité déjà vérifiée indépendamment en section 2)", () => {
      const c110 = liasseRfs.form2033A.cases.find((c) => c.caseId === "110")?.value as number;
      const c112 = liasseRfs.form2033A.cases.find((c) => c.caseId === "112")?.value as number;
      const c180 = liasseRfs.form2033A.cases.find((c) => c.caseId === "180")?.value as number;
      assert.equal(round2(c110 - c112), c180);
      assert.equal(c180, TOTAL_180);
    });
  });

  describe("Déclarabilité finale + livraison", () => {
    it("DELIVERABLE (aucune divergence interne sur ce dossier)", () => {
      const state = resolveFinalDeclarabilityState(liasseRfs);
      assert.equal(state.deliverable, true);
      assert.deepEqual(state.internalProjectionIssues, []);
    });

    it("2033-A-SD présent dans la sélection de téléchargement (NOT_ELIGIBLE, jamais dispensé)", () => {
      const payload = buildCerfaPdfRequestPayload(rfs, "golden-v1");
      assert.ok(payload.forms.includes("2033-A-SD"), "2033-A-SD doit être demandé — la dispense n'est jamais en effet ici");
      assert.deepEqual(payload.forms, ["2031-SD", "2031-bis-SD", "2033-A-SD", "2033-B-SD", "2033-C-SD", "2033-D-SD"]);
    });
  });
});
