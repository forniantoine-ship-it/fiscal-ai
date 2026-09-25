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
 * - F011 fees/guarantee V1 fix — `loan.loanApplicationFees`/
 *   `loan.loanGuaranteeFees` sont désormais transmis à `PretInput.fraisDossier`/
 *   `PretInput.garantieDeductible`, gatés par `loan.souscritCetExercice`
 *   (même champ canonique que `F011LoanDraft.souscritCetExercice`, jamais une
 *   seconde représentation par canal — voir `LoanProfile.souscritCetExercice`,
 *   `domain.ts`) : `true` → `anneeSouscription = exerciceFiscal` ; `false`
 *   ou `undefined` → `anneeSouscription = undefined`, qui échoue déjà
 *   naturellement `anneeSouscription === exerciceFiscal`
 *   (`compute-financement-exercice.ts:computePret`) sans qu'aucune année
 *   fictive ne soit jamais inventée pour "pas cet exercice". La distinction
 *   `false` (répondu, non déductible) vs `undefined` (pas répondu) reste
 *   nécessaire uniquement pour la complétude (`excludedLoanIdsFromFinancing`
 *   ci-dessous), jamais pour ce calcul ;
 * - `loan.startDate` existe dans le type mais n'est alimenté par aucun champ
 *   UI ni extraction — l'utiliser comme année de souscription inventerait
 *   une décision fiscale, jamais fait ici ;
 * - un prêt sans date de première mensualité ne peut pas être daté dans le
 *   temps : il est exclu du calcul plutôt que daté arbitrairement.
 */
import { computeFinancementExercice } from "@/runtime";
import type { ComputeFinancementExerciceInput, PretInput, TypePret } from "@/runtime";
import type { CreditFinancingData } from "@/lib/lmnp/types";
import type { FinancementChargesOutput } from "@/lib/lmnp/types/domain";
import { resolveCreditFinancingLoanEcheances } from "./f011-documentary-installments";

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
 * F011 fees/guarantee V1 fix — un prêt avec des frais de dossier/garantie
 * saisis (> 0) mais sans réponse à « souscrit cette année ? » ne peut pas
 * être considéré complet : le moteur produirait silencieusement 0€ de
 * déduction (comportement sûr, jamais une valeur inventée) mais rien ne le
 * signalerait au client. `undefined` seul déclenche cette incomplétude —
 * `false` (répondu, non déductible) est une réponse complète et légitime.
 */
export function loanHasKnownSubscriptionYearIfFeesExist(
  loan: Pick<CreditFinancingData["loans"][number], "loanApplicationFees" | "loanGuaranteeFees" | "souscritCetExercice">,
): boolean {
  const feesExist = (loan.loanApplicationFees ?? 0) > 0 || (loan.loanGuaranteeFees ?? 0) > 0;
  if (!feesExist) return true;
  return loan.souscritCetExercice !== undefined;
}

/**
 * NEXT-2 (F011-CREDIT-SILENT-LOAN-EXCLUSION) — dérive, à partir de la donnée
 * source canonique (`CreditFinancingData.loans[].firstPaymentDate`, jamais
 * une seconde représentation de la date), la liste des prêts qui seraient
 * exclus par `mapCreditFinancingToFinancementCharges()`. Utilisée par le
 * gate F-006 pour protéger rétroactivement les dossiers confirmés avant ce
 * correctif UI — `financementCharges.excludedLoanIds` persisté peut être
 * absent pour ces dossiers, mais `creditFinancing.loans` a toujours existé.
 *
 * F011 fees/guarantee V1 fix — étend cette même liste (jamais une seconde)
 * avec `loanHasKnownSubscriptionYearIfFeesExist()` : un prêt avec des frais
 * non confirmés reste fiscalement calculable pour ses intérêts (il n'est PAS
 * retiré des `prets` du mapper ci-dessous, seule sa réponse aux frais est
 * manquante), mais doit tout de même apparaître ici pour bloquer la
 * complétude/génération tant que le client n'a pas répondu — même sévérité
 * que `firstPaymentDate` manquant, volontairement.
 *
 * R1 — étend encore cette même liste avec les prêts dont l'échéancier documentaire est présent mais
 * inexploitable ou non attribuable (`resolveCreditFinancingLoanEcheances`) : le mapper ne les calcule
 * pas (jamais de reconstruction substituée au document), le gate F-006 bloque. La couverture du
 * tableau s'évalue pour un exercice : `exerciceFiscal` est un paramètre obligatoire ; `undefined`
 * (exercice réellement inconnu de l'appelant) n'évalue que les règles précédentes — le gate F-006
 * (`run-declaration-generation`, panneau F-006) passe toujours l'exercice.
 */
export function excludedLoanIdsFromFinancing(
  financing: CreditFinancingData | undefined,
  exerciceFiscal: number | undefined,
): string[] {
  return (financing?.loans ?? [])
    .filter(
      (loan) =>
        !loanHasFirstPaymentDate(loan) ||
        !loanHasKnownSubscriptionYearIfFeesExist(loan) ||
        (exerciceFiscal !== undefined &&
          resolveCreditFinancingLoanEcheances(financing!, loan, exerciceFiscal).status === "non_exploitable"),
    )
    .map((loan) => loan.id);
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
  /** Prêts exclus du calcul : date de première mensualité inconnue, ou échéancier documentaire inexploitable (R1). */
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
    .flatMap((loan) => {
      // R1 — tableau documentaire exploitable → échéances prioritaires (chemin déjà prévu par le moteur) ;
      // absent → reconstruction ; présent mais inexploitable/non attribuable → exclu (bloquant), jamais reconstruit.
      const documentary = resolveCreditFinancingLoanEcheances(params.financing, loan, params.exerciceFiscal);
      if (documentary.status === "non_exploitable") {
        excludedLoanIds.push(loan.id);
        return [];
      }
      return [{ loan, echeances: documentary.status === "exploitable" ? documentary.echeances : undefined }];
    })
    .map(({ loan, echeances }) => ({
      pretId: loan.id,
      typePret: inferTypePretFromFreeText(loan.loanType),
      capitalInitial: loan.borrowedAmount,
      tauxNominal: loan.rate / 100,
      dureeMois: loan.durationMonths,
      datePremiereMensualite: loan.firstPaymentDate,
      echeances,
      // NEXT-3 (blocker fix) — `loan.insurance` est déjà l'unité canonique
      // ANNUELLE (normalisée à l'écriture, voir doc-comment ci-dessus) :
      // transport pur, AUCUNE conversion ici. `undefined` si aucune assurance
      // saisie, jamais 0 fabriqué.
      assuranceAnnuelle: loan.insurance ? loan.insurance : undefined,
      // F011 fees/guarantee V1 fix — voir doc-comment de fichier : transport
      // pur des montants saisis, gaté par le même souscritCetExercice que
      // F-011. Jamais 0 fabriqué : `undefined` si non saisi.
      fraisDossier: loan.loanApplicationFees ? loan.loanApplicationFees : undefined,
      garantieDeductible: loan.loanGuaranteeFees ? loan.loanGuaranteeFees : undefined,
      anneeSouscription: loan.souscritCetExercice ? params.exerciceFiscal : undefined,
      // iraDeductible : volontairement absent (hors périmètre de ce fix).
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
