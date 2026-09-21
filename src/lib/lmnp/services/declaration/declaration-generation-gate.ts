import type { Anomaly } from "@/runtime";
import { documentJourneyRoute, LMNP_ROUTES } from "../../routes";
import type { DeclarationDraft, FiscalEngineOutput, Property } from "../../types";
import { runDeclarationGeneration, TAXE_FONCIERE_LEGACY_INTEGRITY_UNRESOLVED } from "./run-declaration-generation";
import { identiteFromDeclarationDraft } from "../f007/draft-to-liasse-inputs";
import type { PriorHistoryEligibility } from "./prior-history-eligibility";
import type { PatrimonialState } from "@/runtime/capabilities/bilan/types";
import {
  buildValidationDossierSnapshot,
  type MissingDossierItem,
  type ValidationDossierSnapshot,
} from "../validation-profile";

/**
 * Lot 1 N→N+1 — preuve positive sur la génération de référence déjà stockée
 * (`generated: true`). Distingue explicitement les cas que `canGenerate`
 * amalgamait : `canGenerate === false` n'est PAS une preuve de fraîcheur.
 *
 * - `absent`     : aucun `fiscalResult` stocké à comparer ;
 * - `incomplete` : dossier incomplet / multi-bien — recalcul impossible ;
 * - `blocked`    : dossier « complet » mais F-006/F-007 refuse le recalcul ;
 * - `stale`      : recalcul possible et divergent de la génération stockée ;
 * - `current`    : recalcul possible et strictement aligné (fraîcheur positive).
 */
export type ReferenceGenerationStatus =
  | "absent"
  | "incomplete"
  | "blocked"
  | "stale"
  | "current";

export type DeclarationGenerationGate = {
  snapshot: ValidationDossierSnapshot;
  canCheckout: boolean;
  canRetryAfterPayment: boolean;
  canGenerate: boolean;
  blockingAnomalies: Anomaly[];
  recoveryItems: MissingDossierItem[];
  /**
   * Le FiscalResult (F-006) réellement recalculé par cette porte, dès qu'il est
   * disponible — jamais une estimation séparée. `undefined` uniquement quand
   * F-006/F-007 n'a pas pu être exécuté (dossier incomplet ou anomalie
   * bloquante) : dans ce cas il n'existe aucun résultat fiscal à afficher, pas
   * même approximatif.
   */
  fiscalResult?: FiscalEngineOutput;
  /**
   * Présent uniquement quand `input.generated === true` : statut de la
   * génération de référence face à l'état métier courant. Absent pour un
   * appelant qui n'a pas encore généré (parcours paiement / première
   * génération).
   */
  referenceGenerationStatus?: ReferenceGenerationStatus;
  /**
   * P0 launch safety — présent uniquement si l'appelant a fourni
   * `input.priorHistory`. `eligible: false` ⇒ toutes les capacités ci-dessus
   * sont à `false` : ni paiement, ni régénération, ni génération.
   */
  priorHistory?: PriorHistoryEligibility;
};

const RECOVERY_BY_FIELD: Record<string, MissingDossierItem> = {
  dateMiseEnService: {
    id: "activite-date",
    label: "Date de mise en service manquante",
    href: LMNP_ROUTES.activite,
  },
  "identite.siret": {
    id: "activite-siret",
    label: "SIRET ou SIREN manquant",
    href: LMNP_ROUTES.activite,
  },
  "identite.denomination": {
    id: "activite-identite",
    label: "Identité de l'exploitant manquante",
    href: LMNP_ROUTES.activite,
  },
  revenusAssistant: {
    id: "revenus-assistant",
    label: "Recettes non calculées",
    href: LMNP_ROUTES.revenusAssistant,
  },
  "revenusAssistant.exerciceFiscal": {
    id: "revenus-exercice",
    label: "Exercice des recettes incohérent",
    href: LMNP_ROUTES.revenusAssistant,
  },
  // NEXT-1 (REV-P0-03) — une anomalie F-013 error/fatal non résolue (indemnité
  // GLI non chiffrée, revenu nul non justifié...) route vers l'assistant
  // Revenus plutôt que vers l'écran de validation générique.
  "revenusAssistant.anomalies": {
    id: "revenus-anomalies",
    label: "Une incohérence dans vos revenus doit être résolue",
    href: LMNP_ROUTES.revenusAssistant,
  },
  chargesAssistant: {
    id: "charges-assistant",
    label: "Charges non calculées",
    href: LMNP_ROUTES.chargesAssistant,
  },
  // Recouvrement F-011 / F-012 périmé : F-011 a changé depuis la confirmation de F-012 → reconfirmer les charges.
  "chargesAssistant.recouvrementAssuranceF011": {
    id: "charges-recouvrement-f011",
    label: "Confirmez à nouveau vos charges : l'assurance de votre prêt a changé",
    href: LMNP_ROUTES.chargesAssistant,
  },
  "chargesAssistant.recouvrementFraisDossierF011": {
    id: "charges-recouvrement-frais-dossier-f011",
    label: "Confirmez à nouveau vos charges : les frais de dossier de votre prêt ont changé",
    href: LMNP_ROUTES.chargesAssistant,
  },
  amortissementAssistant: {
    id: "amortissement-assistant",
    label: "Amortissements non validés",
    href: LMNP_ROUTES.amortissementsAssistant,
  },
  // NEXT-2 (F011-CREDIT-SILENT-LOAN-EXCLUSION) — un prêt exclu faute de date
  // de première échéance route vers l'écran documentaire crédit (là où
  // `firstPaymentDate` se corrige), pas vers l'écran de validation générique.
  "financementCharges.excludedLoanIds": {
    id: "credit-excluded-loan",
    label: "Un prêt doit être complété avant de continuer",
    href: documentJourneyRoute("credit-immobilier"),
  },
  "amortissementAssistant.status": {
    id: "amortissement-status",
    label: "Le plan d'amortissement doit être validé",
    href: LMNP_ROUTES.amortissementsAssistant,
  },
};

function recoveryItemsFromAnomalies(anomalies: Anomaly[]): MissingDossierItem[] {
  const seen = new Set<string>();
  const items: MissingDossierItem[] = [];
  for (const anomaly of anomalies) {
    if (anomaly.severity !== "fatal" && anomaly.severity !== "error") continue;
    // Blocker #3 Lot C — message utilisateur §15, pas le code technique.
    if (anomaly.message === TAXE_FONCIERE_LEGACY_INTEGRITY_UNRESOLVED) {
      const integrityItem: MissingDossierItem = {
        id: "charges-taxe-fonciere-integrity",
        label:
          "Nous devons vérifier une information de votre taxe foncière avant de finaliser votre déclaration.",
        href: LMNP_ROUTES.chargesAssistant,
      };
      if (!seen.has(integrityItem.id)) {
        seen.add(integrityItem.id);
        items.push(integrityItem);
      }
      continue;
    }
    const mapped = anomaly.field ? RECOVERY_BY_FIELD[anomaly.field] : undefined;
    const item = mapped ?? {
      id: anomaly.field ?? anomaly.message,
      label: anomaly.message,
      href: documentJourneyRoute("validation"),
    };
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    items.push(item);
  }
  return items;
}

/**
 * P0-1 (2026-09-03) — le drift fiscal (recettes/charges/amortissement) ne
 * couvre pas l'identité (SIREN/SIRET/dénomination/adresse/début d'activité) :
 * ces champs n'entrent jamais dans FiscalEngineOutput, seulement dans
 * `identite` (RFS/liasse). Sans ce contrôle, une correction d'identité seule
 * ne débloque jamais canGenerate. Compare l'identité qui a servi à la
 * DERNIÈRE génération (`draft.rfs.identite`, déjà persistée — pas de nouveau
 * champ) à celle recalculée depuis le draft courant, via la même fonction
 * que la génération réelle (`identiteFromDeclarationDraft`).
 */
function identiteChanged(draft: DeclarationDraft | undefined, fiscalYear: number): boolean {
  const previous = draft?.rfs?.identite;
  if (!previous) return false;
  const current = identiteFromDeclarationDraft(draft, fiscalYear);
  return (
    previous.siren !== current.siren ||
    previous.siret !== current.siret ||
    previous.denomination !== current.denomination ||
    previous.adresseEntreprise !== current.adresseEntreprise ||
    previous.exerciceDebut !== current.exerciceDebut ||
    previous.email !== current.email ||
    previous.telephone !== current.telephone
  );
}

/**
 * Égalité structurelle locale à ce fichier — même principe que
 * `isDeepEqualDraftValue` (reducer.ts, store/), volontairement NON réutilisée
 * telle quelle : ce module (services/) ne doit dépendre d'aucun utilitaire du
 * store, direction de dépendance inverse de celle déjà établie dans ce
 * projet. Réservée à des valeurs JSON-plates (nombres/chaînes/booléens/
 * tableaux/objets) — `PatrimonialState` ne contient ni `Date` ni fonction ni
 * identifiant généré à chaque calcul (vérifié par lecture de
 * `assemble-patrimoine.ts` et de ses dépendances : aucun `computedAt`, aucun
 * `crypto.randomUUID()`).
 */
function isDeepEqualPlainValue(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((item, i) => isDeepEqualPlainValue(item, b[i]));
  }
  const aKeys = Object.keys(a as Record<string, unknown>);
  const bKeys = Object.keys(b as Record<string, unknown>);
  if (aKeys.length !== bKeys.length) return false;
  return aKeys.every(
    (key) =>
      Object.prototype.hasOwnProperty.call(b, key) &&
      isDeepEqualPlainValue((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key]),
  );
}

/**
 * Lot 1 / F1 — projection sémantique de `FiscalEngineOutput` pour la preuve
 * de fraîcheur. Compare TOUT le résultat fiscal durable déjà produit par
 * `runDeclarationGeneration()` (y compris `resultatFiscal`,
 * `resultatAvantAmort`, `chargesPreExploitation`, `deficitNouveau`, stocks),
 * pas seulement les quatre scalaires historiques (totalRecettes / totalCharges
 * / amortDeduct / amortReporte) qui laissaient passer une dérive
 * pré-exploitation (F012 `totalPreExploitation`) alors que `resultatFiscal`
 * changeait.
 *
 * Exclus volontairement (non métier / non déterministes) :
 * - `computedAt`
 * - `trace` (journal technique + `computedAt` interne)
 *
 * Normalisations d'absence (dossiers antérieurs à P0-3b) : `undefined` sur
 * `chargesPreExploitation` / `deficitsExpires` ≡ 0 / [] — jamais un faux
 * stale purement lié à l'apparition du champ.
 */
function fiscalEngineSemanticProjection(result: FiscalEngineOutput) {
  return {
    exercice: result.exercice,
    resultatFiscal: result.resultatFiscal,
    resultatAvantAmort: result.resultatAvantAmort,
    totalRecettes: result.totalRecettes,
    totalCharges: result.totalCharges,
    chargesPreExploitation: result.chargesPreExploitation ?? 0,
    amortDeduct: result.amortDeduct,
    amortReporte: result.amortReporte,
    deficitNouveau: result.deficitNouveau,
    stocks: {
      deficits: result.stocks?.deficits ?? [],
      amortissementsReportes: result.stocks?.amortissementsReportes ?? 0,
      deficitsExpires: result.stocks?.deficitsExpires ?? [],
    },
  };
}

function fiscalEngineOutputChanged(
  stored: FiscalEngineOutput,
  preview: FiscalEngineOutput,
): boolean {
  return !isDeepEqualPlainValue(
    fiscalEngineSemanticProjection(stored),
    fiscalEngineSemanticProjection(preview),
  );
}

/**
 * P0-1B (2026-09-07) — le drift fiscal (recettes/charges/amortissement) et
 * l'identité (ci-dessus) ne couvrent pas le patrimoine (068/072/164/166/172,
 * amortissements-provisions patrimoniaux, tiers, compte exploitant, RAN...) :
 * ces données vivent entièrement dans `rfs.patrimoine` (assemblePatrimoine(),
 * audit P0-1), jamais dans les 4 scalaires de `FiscalEngineOutput` comparés
 * ci-dessus. Sans ce contrôle, une correction patrimoniale seule pouvait
 * échapper à cette porte si le mécanisme A (reducer, DECLARATION_PATCH_DRAFT)
 * était contourné ou incomplet — ce mécanisme B doit rester une défense
 * indépendante et suffisante à lui seul.
 *
 * Compare le patrimoine qui a servi à la DERNIÈRE génération
 * (`draft.rfs.patrimoine`, déjà persistée — pas de nouveau champ) à celui
 * recalculé depuis le draft courant (même `assemblePatrimoine()` que la
 * génération réelle, déjà calculé par le preview de cette porte — jamais un
 * second appel).
 *
 * Comparaison structurelle de la sortie déjà résolue plutôt qu'une liste de
 * champs source (068/072/164/166/172 + immobilisations + tiers + compte
 * exploitant + RAN + ... — une telle liste n'est jamais garantie exhaustive,
 * cf. audit P0-1 §"faux négatifs") : `PatrimonialState` est entièrement
 * déterministe, et ses composantes fiscalement significatives sont déjà des
 * sommes/statuts résolus par nature — intrinsèquement indépendants de
 * l'ordre de saisie des postes sources. Une composante patrimoniale future
 * entrera automatiquement dans cette comparaison sans modification de cette
 * porte. `liasseRfs` n'ajoute aucune information patrimoniale
 * supplémentaire (pure projection additive de `rfs`, sans second calcul
 * fiscal — cf. `assemble-liasse-from-rfs.ts`) : comparer `rfs.patrimoine`
 * est donc suffisant, une comparaison redondante de `liasseRfs` n'apporterait
 * aucun pouvoir de détection supplémentaire.
 */
function patrimoineChanged(
  stored: PatrimonialState | undefined,
  preview: PatrimonialState | undefined,
): boolean {
  return !isDeepEqualPlainValue(stored, preview);
}

/**
 * Porte unique entre l'écran de validation et F-006/F-007.
 * Ne change aucune règle fiscale : elle refuse le paiement si la génération
 * serait bloquée, et autorise un nouvel essai si le paiement a déjà été
 * marqué (état coincé historique).
 */
export function resolveDeclarationGenerationGate(input: {
  draft: DeclarationDraft | undefined;
  properties: Property[];
  fiscalYear: number;
  paid: boolean;
  generated: boolean;
  /**
   * P0-1A (2026-09-07) — mêmes stocks d'ouverture que la génération réelle
   * (`FiscalYear.stocksOuverture?.stocks`, résolus une seule fois à la
   * création de l'exercice par `resolveStocksOuverture()`, jamais recalculés
   * ici). Avant ce paramètre, le preview de cette porte tournait TOUJOURS
   * sans stock d'ouverture alors que la génération réelle en tenait compte
   * pour un exercice en continuité (déficits antérieurs/amortissements
   * reportés non nuls) : la comparaison portait alors sur deux résultats
   * structurellement différents, produisant une dérive artificielle.
   * Optionnel : absent pour un appelant qui n'a pas cette continuité
   * (comportement historique inchangé, cf. `runDeclarationGeneration()` qui
   * traite déjà ce paramètre comme optionnel).
   */
  stocksOuverture?: FiscalEngineOutput["stocks"];
  /**
   * Lot 5 B2 — même continuité immobilisations que la génération finale
   * (`ValidationDocumentStep` → 6e argument de `runDeclarationGeneration`).
   * Absent = comportement historique (premier exercice / appelants sans
   * ouverture). Présent = payment gate et génération finale partagent la
   * même sémantique de réconciliation (fail-closed avant checkout).
   */
  continuity?: {
    composantsF012Merged?: import("@/runtime/capabilities/f012/types").ComposantNouveau[];
    immobilisationsOuverture?: import("../../types/domain").FiscalYear["immobilisationsOuverture"];
    propertyId?: string;
  };
  /**
   * P0 launch safety — éligibilité d'antériorité LMNP
   * (`resolvePriorHistoryEligibility()`). Tout appelant qui décide d'un
   * paiement ou d'une génération DOIT la fournir : un exercice qui n'est pas
   * une première année réelle et sans source d'ouverture valide ne doit
   * jamais atteindre F-006 avec des stocks `[]`/`0` par défaut. Absente =
   * comportement historique (appelants de simple détection de dérive :
   * `canCloseFiscalYear`, `resolveDeclarationOutOfDate`).
   */
  priorHistory?: PriorHistoryEligibility;
}): DeclarationGenerationGate {
  const snapshot = buildValidationDossierSnapshot(input.draft, input.properties, input.fiscalYear);

  if (input.priorHistory && !input.priorHistory.eligible) {
    return {
      snapshot,
      canCheckout: false,
      canRetryAfterPayment: false,
      canGenerate: false,
      blockingAnomalies: [],
      recoveryItems: [],
      priorHistory: input.priorHistory,
    };
  }

  if (input.generated) {
    const stored = input.draft?.fiscalResult;
    if (!stored) {
      return {
        snapshot,
        canCheckout: false,
        canRetryAfterPayment: false,
        canGenerate: false,
        blockingAnomalies: [],
        recoveryItems: snapshot.isComplete ? [] : snapshot.missing,
        referenceGenerationStatus: "absent",
      };
    }
    if (!snapshot.isComplete || snapshot.isMultiProperty) {
      return {
        snapshot,
        canCheckout: false,
        canRetryAfterPayment: false,
        canGenerate: false,
        blockingAnomalies: [],
        recoveryItems: snapshot.missing,
        referenceGenerationStatus: "incomplete",
      };
    }

    // G1-P0 — même bilanPatrimonial que la génération réelle (voir plus
    // bas) : jamais une seconde construction de BilanInputs, jamais un
    // aperçu qui diverge silencieusement du document réellement produit.
    // P0-1A — même stocksOuverture que la génération réelle (voir le
    // commentaire du paramètre ci-dessus) : jamais `undefined` en dur, qui
    // désynchronisait ce preview de la génération réelle pour un exercice
    // en continuité.
    // Lot 5 B2 — même continuité immobilisations que ValidationDocumentStep.
    const preview = runDeclarationGeneration(
      input.draft,
      input.fiscalYear,
      input.stocksOuverture,
      input.draft?.bilanPatrimonial,
      input.draft?.dispense2033A,
      input.continuity,
    );
    if (preview.status === "blocked") {
      return {
        snapshot,
        canCheckout: false,
        canRetryAfterPayment: false,
        canGenerate: false,
        blockingAnomalies: preview.anomalies,
        recoveryItems: recoveryItemsFromAnomalies(preview.anomalies),
        referenceGenerationStatus: "blocked",
      };
    }

    const drifted =
      fiscalEngineOutputChanged(stored, preview.fiscalResult) ||
      identiteChanged(input.draft, input.fiscalYear) ||
      patrimoineChanged(input.draft?.rfs?.patrimoine, preview.rfs.patrimoine);

    if (drifted) {
      return {
        snapshot,
        canCheckout: false,
        canRetryAfterPayment: true,
        canGenerate: true,
        blockingAnomalies: [],
        recoveryItems: [],
        // P0-5.1 — `preview.fiscalResult` est déjà calculé ci-dessus (ligne
        // utilisée pour détecter la dérive elle-même) : l'omettre ici forçait
        // ValidationFiscalSummary à retomber sur buildFiscalSummary(), une
        // estimation qui ignore chargesFinancement/chargesPreExploitation et
        // le moteur 39C/déficits antérieurs, alors que showMainContent rend
        // bien ce composant dans cet état (gate.canGenerate === true).
        fiscalResult: preview.fiscalResult,
        referenceGenerationStatus: "stale",
      };
    }

    return {
      snapshot,
      canCheckout: false,
      canRetryAfterPayment: false,
      canGenerate: false,
      blockingAnomalies: [],
      recoveryItems: [],
      fiscalResult: preview.fiscalResult,
      referenceGenerationStatus: "current",
    };
  }

  if (!snapshot.isComplete || snapshot.isMultiProperty) {
    return {
      snapshot,
      canCheckout: false,
      canRetryAfterPayment: false,
      canGenerate: false,
      blockingAnomalies: [],
      recoveryItems: snapshot.missing,
    };
  }

  // G1-P0 — idem : même bilanPatrimonial que la génération réelle.
  // P0-1A — idem : même stocksOuverture que la génération réelle.
  // Lot 5 B2 — idem : même continuité immobilisations.
  const preview = runDeclarationGeneration(
    input.draft,
    input.fiscalYear,
    input.stocksOuverture,
    input.draft?.bilanPatrimonial,
    input.draft?.dispense2033A,
    input.continuity,
  );
  if (preview.status === "blocked") {
    return {
      snapshot,
      canCheckout: false,
      canRetryAfterPayment: false,
      canGenerate: false,
      blockingAnomalies: preview.anomalies,
      recoveryItems: recoveryItemsFromAnomalies(preview.anomalies),
    };
  }

  return {
    snapshot,
    canCheckout: !input.paid,
    canRetryAfterPayment: input.paid,
    canGenerate: true,
    blockingAnomalies: [],
    recoveryItems: [],
    fiscalResult: preview.fiscalResult,
  };
}
