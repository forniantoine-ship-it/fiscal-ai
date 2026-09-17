/**
 * Cycle 4 (F-011) §11 — corrige le trou identifié au Cycle 0 : le parcours
 * documentaire Crédit (Tunnel A) confirme un financement (`creditFinancing`)
 * sans jamais calculer `financementCharges`, alors que F-006 ne lit que ce
 * second champ. F-006 consomme déjà correctement `financementCharges`
 * (`aggregateFiscalInputs`) — le trou est dans l'écriture côté Tunnel A, pas
 * côté F-006, qui n'est donc pas modifié.
 *
 * Fonction pure : construit les `PretInput` du moteur F-011 déjà existant
 * (`computeFinancementExercice`) depuis les prêts confirmés par Tunnel A.
 * Mêmes règles de prudence que le pont documentaire (`credit-bridge.ts`) :
 * - jamais de date de mise en service inventée (précondition Cycle 1, appelant
 *   responsable de ne pas appeler cette fonction si elle est absente) ;
 * - NEXT-3 (blocker fix) — `creditFinancing.loans[].insurance` est l'unité
 *   CANONIQUE ANNUELLE (normalisée aux frontières FORM ↔ DOMAINE dans
 *   `credit-profile.ts` : `formValuesToFinancing` ×12 à la confirmation,
 *   `loanToFormValues` ÷12 à la restitution — jamais ici). Ce mapper fiscal
 *   transmet donc `loan.insurance` tel quel en `assuranceAnnuelle`, SANS
 *   connaître ni le canal d'origine (Tunnel A vs nouvel assistant F011) ni
 *   l'unité d'affichage UI. Une conversion faite ici serait une deuxième
 *   conversion sur une donnée déjà normalisée (audit contradictoire NEXT-3 :
 *   un ×12 local avait produit une surestimation ×12 pour les prêts confirmés
 *   par le nouvel assistant, qui écrit déjà en annuel). Le moteur
 *   (`applyLoanInsurance`) traite bancaire et externe de façon identique dès
 *   que le montant est connu — la distinction que ce fichier évitait
 *   autrefois de « fabriquer » n'est pas requise par le moteur ;
 * - garantie/frais de dossier/IRA restent volontairement absents de
 *   `creditFinancing` → `PretInput` : le moteur ne les déduit que l'année de
 *   souscription du prêt (`anneeSouscription === exerciceFiscal`,
 *   `compute-financement-exercice.ts:computePret`), une DÉCISION fiscale que
 *   Tunnel A ne demande jamais (contrairement au nouvel assistant F-011, qui
 *   pose explicitement la question « souscrit cette année ? »). `loan.startDate`
 *   existe dans le type mais n'est alimenté par aucun champ UI ni extraction —
 *   l'utiliser comme année de souscription inventerait une décision fiscale.
 *   Rester exclu ici est le comportement sûr, pas un oubli (voir audit NEXT-3) ;
 * - un prêt sans date de première mensualité ne peut pas être daté dans le
 *   temps : il est exclu du calcul plutôt que daté arbitrairement.
 */
import { computeFinancementExercice } from "@/runtime";
import type { ComputeFinancementExerciceInput, PretInput, TypePret } from "@/runtime";
import type { CreditFinancingData } from "@/lib/lmnp/types";
import type { FinancementChargesOutput } from "@/lib/lmnp/types/domain";

/**
 * NEXT-2 (F011-CREDIT-SILENT-LOAN-EXCLUSION) — prédicat unique de complétude
 * de date, réutilisé par le filtre du mapper ci-dessous ET par
 * `excludedLoanIdsFromFinancing()` (dérivation live pour le gate F-006,
 * `run-declaration-generation.ts`/`F006FiscalEnginePanel.tsx`) : jamais deux
 * définitions divergentes de la même règle.
 */
export function loanHasFirstPaymentDate(loan: Pick<CreditFinancingData["loans"][number], "firstPaymentDate">): boolean {
  return Boolean(loan.firstPaymentDate?.trim());
}

/**
 * NEXT-2 (F011-CREDIT-SILENT-LOAN-EXCLUSION) — dérive, à partir de la donnée
 * source canonique (`CreditFinancingData.loans[].firstPaymentDate`, jamais
 * une seconde représentation de la date), la liste des prêts qui seraient
 * exclus par `mapCreditFinancingToFinancementCharges()`. Utilisée par le
 * gate F-006 pour protéger rétroactivement les dossiers confirmés avant ce
 * correctif UI — `financementCharges.excludedLoanIds` persisté peut être
 * absent pour ces dossiers, mais `creditFinancing.loans` a toujours existé.
 */
export function excludedLoanIdsFromFinancing(financing: CreditFinancingData | undefined): string[] {
  return (financing?.loans ?? []).filter((loan) => !loanHasFirstPaymentDate(loan)).map((loan) => loan.id);
}

function inferTypePretFromFreeText(loanType: string | undefined): TypePret {
  const normalized = loanType?.toLowerCase() ?? "";
  if (/in\s*[\s-]?fine/.test(normalized)) return "in_fine";
  // Amortissable est le cas nominal du KS (F-011) — défaut assumé, jamais
  // "in fine" par défaut (un in fine mal identifié comme amortissable
  // sous-estime les intérêts déductibles ; l'inverse les surestimerait).
  return "amortissable";
}

export type MapCreditFinancingParams = {
  financing: CreditFinancingData;
  exerciceFiscal: number;
  dateMiseEnService: string;
  prixRevient?: number;
};

export type MapCreditFinancingResult = {
  financementCharges: FinancementChargesOutput;
  /** Prêts exclus du calcul faute de date de première mensualité connue. */
  excludedLoanIds: string[];
};

/**
 * Convertit un `CreditFinancingData` confirmé (Tunnel A) en `FinancementChargesOutput`
 * — la forme exacte que F-011 écrit et que F-006 consomme. À appeler
 * uniquement quand `dateMiseEnService` est connue (précondition Cycle 1) ;
 * l'appelant décide quoi faire si elle est absente (aujourd'hui : ne pas
 * appeler cette fonction, `financementCharges` reste absent comme avant).
 */
export function mapCreditFinancingToFinancementCharges(
  params: MapCreditFinancingParams,
): MapCreditFinancingResult {
  const excludedLoanIds: string[] = [];

  const prets: PretInput[] = params.financing.loans
    .filter((loan) => {
      const hasDate = loanHasFirstPaymentDate(loan);
      if (!hasDate) excludedLoanIds.push(loan.id);
      return hasDate;
    })
    .map((loan) => ({
      pretId: loan.id,
      typePret: inferTypePretFromFreeText(loan.loanType),
      capitalInitial: loan.borrowedAmount,
      tauxNominal: loan.rate / 100,
      dureeMois: loan.durationMonths,
      datePremiereMensualite: loan.firstPaymentDate,
      // NEXT-3 (blocker fix) — `loan.insurance` est déjà l'unité canonique
      // ANNUELLE (normalisée à l'écriture, voir doc-comment ci-dessus) :
      // transport pur, AUCUNE conversion ici. `undefined` si aucune assurance
      // saisie, jamais 0 fabriqué.
      assuranceAnnuelle: loan.insurance ? loan.insurance : undefined,
      // fraisDossier, garantieDeductible, iraDeductible, anneeSouscription :
      // volontairement absents (voir doc-comment ci-dessus).
    }));

  const input: ComputeFinancementExerciceInput = {
    exerciceFiscal: params.exerciceFiscal,
    dateMiseEnService: params.dateMiseEnService,
    prixRevient: params.prixRevient,
    prets,
  };

  const computed = computeFinancementExercice(input);
  const now = new Date().toISOString();

  return {
    financementCharges: {
      exerciceFiscal: computed.charges.exerciceFiscal,
      totalInteretsEmprunt: computed.charges.totalInteretsEmprunt,
      totalInteretsPreExploitation: computed.charges.totalInteretsPreExploitation,
      totalAssurance: computed.charges.totalAssurance,
      // NEXT-3 — transport pur depuis le moteur (déjà calculé via
      // `isolatePreExploitationInterests`), jamais transmis avant ce
      // correctif alors que le champ existe sur `FinancementChargesOutput`
      // depuis NEXT-2. Même origine que `totalAssurance`, pas une seconde
      // donnée d'assurance.
      totalAssurancePreExploitation: computed.charges.totalAssurancePreExploitation,
      totalCapitalRembourse: computed.charges.totalCapitalRembourse,
      totalChargesFinancementExercice: computed.charges.totalChargesFinancementExercice,
      prets: computed.charges.prets,
      fieldSources: {},
      computedAt: now,
    },
    excludedLoanIds,
  };
}
