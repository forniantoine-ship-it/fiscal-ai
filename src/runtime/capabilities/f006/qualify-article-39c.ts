/**
 * Qualificateur EXPLICITE article 39 C (39C-FIX-1) — catégorie F-012 + preuve éventuelle → classe canonique.
 *
 * Contrat : aucune classification n'est déduite d'un libellé libre. Seules les catégories établies par SAV-031
 * reçoivent une classe par défaut. Les catégories ambiguës exigent une preuve (`evidence`) fournie par l'appelant ;
 * sans preuve elles sont `NEEDS_QUALIFICATION` (fail-closed, `UNKNOWN ≠ 0 ≠ B ≠ ACTIVITY`).
 *
 * - CFE : `UNRESOLVED` (SAV-031). Aucune preuve fournie ne la classe : ce module ne tranche pas la doctrine
 *   (la qualification par `cfeBaseKind` vit dans les adapters INT-1, couche `lib`, jamais importée ici).
 * - honoraires_gestion / assurance_pno : catégories AGRÉGÉES (INT-2) — la catégorie technique ne suffit pas. B seulement
 *   si la nature précise est fournie (`PROPERTY_MANAGEMENT` / `PNO`) ; sinon `NEEDS_QUALIFICATION`. Règle unique,
 *   partagée avec l'adapter INT-1 (jamais une seconde table).
 * - frais bancaires / divers : jamais classés automatiquement.
 * - indemnité GLI : jamais ajoutée à L ; `OUT_OF_DOMAIN` (double reconnaissance possible du loyer impayé acquis).
 * - dépense capitalisée / amortie : `EXCLUDED` de B — sa dotation est plafonnée, jamais soustraite de B.
 *
 * Module pur. Les noms de catégorie suivent `ChargeCategorie` de F-012 plus les clés `cfe`, `indemnite_gli`.
 */
import type {
  Article39cQualificationLevel,
  Article39cQualifiedAmount,
  Article39cResolvedClass,
} from "./article-39c-capacity";

export type Article39cEvidence = {
  demonstratedClass: "B" | "ACTIVITY" | "EXCLUDED";
  level: Exclude<Article39cQualificationLevel, "UNRESOLVED">;
  /** Nature démontrée (ex. « frais de dossier du prêt du bien A »). */
  reason: string;
};

/** Nature de gestion (INT-2). `PROPERTY_MANAGEMENT` est la seule nature qui devient B automatiquement. */
export type Article39cManagementNature = "PROPERTY_MANAGEMENT" | "LETTING" | "INVENTORY" | "ADVERTISING" | "OTHER" | "UNKNOWN";
/** Nature d'assurance (INT-2). `PNO` et `GLI` sont les seules à porter un B ; l'assurance emprunteur relève de F011. */
export type Article39cInsuranceNature = "PNO" | "GLI" | "BORROWER" | "OTHER" | "UNKNOWN";

export type Article39cQualifierInput = {
  id: string;
  propertyId?: string;
  /** Clé de catégorie (F-012 `ChargeCategorie`, `cfe`, `indemnite_gli`). */
  category: string;
  amount: number;
  provenance: string;
  /** F-012 : `amortissement` = dépense capitalisée ; `non_deductible` = charge non déductible. */
  deductibilite?: "deductible" | "non_deductible" | "amortissement";
  evidence?: Article39cEvidence;
  /** Nature précise pour `honoraires_gestion` (absente = UNKNOWN). */
  managementNature?: Article39cManagementNature;
  /** Nature précise pour `assurance_pno` (absente = UNKNOWN). */
  insuranceNature?: Article39cInsuranceNature;
};

const DEFAULT_PLAUSIBLE: readonly Article39cResolvedClass[] = ["ACTIVITY", "B"];

const ESTABLISHED: Readonly<Record<string, { class: "B" | "ACTIVITY"; reason: string }>> = {
  taxe_fonciere: { class: "B", reason: "Taxe foncière : charge afférente au bien (SAV-031)." },
  assurance_gli: { class: "B", reason: "Prime GLI directement attachée au risque locatif du bien (SAV-031)." },
  honoraires_comptable: {
    class: "ACTIVITY",
    reason: "Frais de comptabilité : charge de pure activité (BOI-BIC-AMT-20-40-10-20 § 70).",
  },
};

export function qualifyArticle39cCharge(input: Article39cQualifierInput): Article39cQualifiedAmount {
  const base = {
    id: input.id,
    ...(input.propertyId !== undefined ? { propertyId: input.propertyId } : {}),
    category: input.category,
    amount: input.amount,
    provenance: input.provenance,
  };
  const unresolved = (reason: string, plausible = DEFAULT_PLAUSIBLE): Article39cQualifiedAmount => ({
    ...base,
    class: "NEEDS_QUALIFICATION",
    plausibleClasses: plausible,
    qualificationLevel: "UNRESOLVED",
    reason,
  });

  if (input.category === "indemnite_gli") {
    return {
      ...base,
      class: "OUT_OF_DOMAIN",
      qualificationLevel: "UNRESOLVED",
      reason: "Indemnité GLI : jamais ajoutée automatiquement à L (double reconnaissance du loyer impayé acquis).",
    };
  }
  if (input.category === "cfe") {
    return unresolved("CFE : UNRESOLVED (SAV-031). Aucune classe tranchée : branches B et ACTIVITY comparées.");
  }
  if (input.deductibilite === "amortissement") {
    return {
      ...base,
      class: "EXCLUDED",
      qualificationLevel: "DIRECT",
      reason: "Dépense capitalisée : hors B ; sa dotation entre dans les amortissements plafonnés (pas de double déduction).",
    };
  }
  if (input.deductibilite === "non_deductible") {
    return {
      ...base,
      class: "EXCLUDED",
      qualificationLevel: "DIRECT",
      reason: "Charge non déductible : hors B et hors ACTIVITY.",
    };
  }

  // Catégories agrégées : la nature précise décide (jamais la catégorie technique seule).
  if (input.category === "honoraires_gestion" && input.managementNature === "PROPERTY_MANAGEMENT") {
    return { ...base, class: "B", qualificationLevel: "DIRECT", reason: "Gestion locative démontrée (SAV-031)." };
  }
  if (input.category === "assurance_pno" && input.insuranceNature === "PNO") {
    return { ...base, class: "B", qualificationLevel: "DIRECT", reason: "Assurance PNO identifiée, directement attachée au bien (SAV-031)." };
  }

  const established = ESTABLISHED[input.category];
  if (established) {
    return { ...base, class: established.class, qualificationLevel: "DIRECT", reason: established.reason };
  }

  if (input.evidence) {
    return {
      ...base,
      class: input.evidence.demonstratedClass,
      qualificationLevel: input.evidence.level,
      reason: input.evidence.reason,
    };
  }

  switch (input.category) {
    case "honoraires_gestion":
      return unresolved(
        "Honoraires : la catégorie regroupe gestion, mise en location, état des lieux, publicité et autres services. Nature « gestion locative » non démontrée.",
      );
    case "assurance_pno":
      return unresolved("Assurance « logement » générique : PNO non identifiée — jamais B automatique.");
    case "frais_bancaires":
      return unresolved("Frais bancaires : libellé insuffisant. Nature démontrée requise (financement du bien → B ; frais généraux → ACTIVITY).");
    case "copropriete":
      return unresolved(
        "Appel de fonds copropriété ≠ automatiquement B : qualification fiscale requise (charge courante → B ; avance/fonds travaux ou dépense capitalisée → hors B).",
        ["B", "EXCLUDED"],
      );
    case "travaux":
      return unresolved("Travaux : charge déductible (B) ou dépense capitalisée (hors B) à qualifier.", ["B", "EXCLUDED"]);
    case "divers":
      return unresolved("Catégorie divers : jamais B ni ACTIVITY sans qualification explicite.");
    default:
      return unresolved(`Catégorie « ${input.category} » non qualifiée.`);
  }
}
