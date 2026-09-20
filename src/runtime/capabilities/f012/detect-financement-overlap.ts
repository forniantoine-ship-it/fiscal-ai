/**
 * Cycle 3 — frontière F-011 ↔ F-012 (RAI-000, AX-009).
 *
 * F-012 n'a qu'un seul champ où l'utilisateur rédige son propre texte libre :
 * "Charges diverses" (et libellés documentaires / famille gestion). C'est le
 * vecteur par lequel une charge de financement pourrait être saisie une seconde
 * fois alors qu'elle est déjà comptée par F-011.
 *
 * Détection par mots-clés = candidature POTENTIELLE uniquement. La neutralisation
 * économique n'intervient que dans `compute-charges-exercice` à hauteur d'une
 * enveloppe F-011 réelle (assurance ≠ frais de dossier — enveloppes séparées).
 *
 * - Capital remboursé : AX-009 — jamais une charge. Erreur bloquante.
 */

export type FinancementChargesSummary = {
  /** Assurance emprunteur de l'exercice APRÈS mise en service (F-011). */
  totalAssurance: number;
  /** Assurance emprunteur AVANT mise en service (F-011) : avec `totalAssurance`, l'assurance de l'année. */
  totalAssurancePreExploitation?: number;
  /**
   * Frais de dossier bancaires déductibles de l'exercice (Σ prêts F-011).
   * Absent = 0 (dossiers / deps historiques).
   */
  totalFraisDossier?: number;
  totalCapitalRembourse: number;
  /** Exercice de la sortie F-011 ; absent = non vérifiable. */
  exerciceFiscal?: number;
};

/**
 * Assurance emprunteur de l'année établie par F-011 (exercice + pré-exploitation).
 */
export function assuranceAnnuelleF011(summary: FinancementChargesSummary | undefined): number {
  if (!summary) return 0;
  return Math.round((summary.totalAssurance + (summary.totalAssurancePreExploitation ?? 0)) * 100) / 100;
}

/** Frais de dossier F-011 de l'exercice (enveloppe dédiée, jamais croisée avec l'assurance). */
export function fraisDossierF011(summary: FinancementChargesSummary | undefined): number {
  if (!summary) return 0;
  const value = summary.totalFraisDossier ?? 0;
  return Number.isFinite(value) ? Math.round(Math.max(0, value) * 100) / 100 : 0;
}

export type DetectFinancementOverlapInput = {
  description: string;
  montant: number;
  financementCharges?: FinancementChargesSummary;
};

export type FinancementOverlapKind = "assurance_emprunteur" | "frais_dossier";

export type FinancementOverlapResult =
  | { kind: "none" }
  | { kind: "assurance_emprunteur"; sameAmount: boolean; message: string }
  | { kind: "frais_dossier"; sameAmount: boolean; message: string }
  | { kind: "capital_pret"; message: string };

function normalize(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

const ASSURANCE_EMPRUNTEUR_PATTERN = /assurance.{0,40}(emprunt|pret|credit|financement)/;

const CAPITAL_PRET_PATTERN = /(capital.{0,30}(rembours|emprunt|pret)|rembours\w*.{0,30}capital)/;

/** Frais de dossier / frais de crédit / intérêts du prêt — candidature frais de dossier F-011. */
const FRAIS_DOSSIER_PATTERN =
  /frais.{0,40}(dossier|credit|pret|emprunt|financement)|int[eé]r[eê]ts?\s+(du\s+)?pr[eê]t/;

export function detectFinancementOverlap(input: DetectFinancementOverlapInput): FinancementOverlapResult {
  const description = normalize(input.description);

  if (CAPITAL_PRET_PATTERN.test(description)) {
    return {
      kind: "capital_pret",
      message:
        "Le remboursement du capital d'un prêt n'est jamais une charge déductible (AX-009) — c'est un " +
        "remboursement de dette, pas une dépense d'exploitation. Il est déjà pris en compte dans l'Assistant " +
        "Financement. Cette ligne n'a pas été ajoutée à vos charges.",
    };
  }

  if (ASSURANCE_EMPRUNTEUR_PATTERN.test(description)) {
    const known = assuranceAnnuelleF011(input.financementCharges);
    const sameAmount = known > 0 && Math.abs(known - input.montant) < 1;
    const message =
      known <= 0
        ? "Aucune assurance emprunteur n'est déclarée dans l'Assistant Financement : cette ligne est donc comptée " +
          "normalement ici. Si elle concerne un prêt, ajoutez-le dans l'Assistant Financement pour éviter un doublon."
        : sameAmount || input.montant <= known
          ? "Ce montant d'assurance de votre prêt est déjà déclaré dans l'Assistant Financement — il reste visible dans " +
            "votre récapitulatif, mais n'est pas recompté ici pour éviter un doublon."
          : `L'Assistant Financement déclare déjà ${known.toLocaleString("fr-FR")} € d'assurance emprunteur : ce montant ` +
            "n'est pas recompté ici ; le reste de cette ligne est compté normalement.";
    return { kind: "assurance_emprunteur", sameAmount, message };
  }

  if (FRAIS_DOSSIER_PATTERN.test(description)) {
    const known = fraisDossierF011(input.financementCharges);
    const sameAmount = known > 0 && Math.abs(known - input.montant) < 1;
    const message =
      known <= 0
        ? "Aucun frais de dossier n'est déclaré dans l'Assistant Financement : cette ligne est donc comptée " +
          "normalement ici. Si elle concerne votre prêt, ajoutez-la dans l'Assistant Financement pour éviter un doublon."
        : sameAmount || input.montant <= known
          ? "Ces frais liés à votre prêt sont déjà déclarés dans l'Assistant Financement — ils restent visibles dans " +
            "votre récapitulatif, mais ne sont pas recomptés ici pour éviter un doublon."
          : `L'Assistant Financement déclare déjà ${known.toLocaleString("fr-FR")} € de frais de dossier : ce montant ` +
            "n'est pas recompté ici ; le reste de cette ligne est compté normalement.";
    return { kind: "frais_dossier", sameAmount, message };
  }

  return { kind: "none" };
}
