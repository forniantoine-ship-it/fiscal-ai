import type { Anomaly } from "@/runtime";
import { documentJourneyRoute, LMNP_ROUTES } from "../../routes";
import type { DeclarationDraft, FiscalEngineOutput, Property } from "../../types";
import { runDeclarationGeneration } from "./run-declaration-generation";
import { identiteFromDeclarationDraft } from "../f007/draft-to-liasse-inputs";
import type { PatrimonialState } from "@/runtime/capabilities/bilan/types";
import {
  buildValidationDossierSnapshot,
  type MissingDossierItem,
  type ValidationDossierSnapshot,
} from "../validation-profile";

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
  chargesAssistant: {
    id: "charges-assistant",
    label: "Charges non calculées",
    href: LMNP_ROUTES.chargesAssistant,
  },
  amortissementAssistant: {
    id: "amortissement-assistant",
    label: "Amortissements non validés",
    href: LMNP_ROUTES.amortissementsAssistant,
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
}): DeclarationGenerationGate {
  const snapshot = buildValidationDossierSnapshot(input.draft, input.properties, input.fiscalYear);

  if (input.generated) {
    const stored = input.draft?.fiscalResult;
    if (snapshot.isComplete && !snapshot.isMultiProperty) {
      // G1-P0 — même bilanPatrimonial que la génération réelle (voir plus
      // bas) : jamais une seconde construction de BilanInputs, jamais un
      // aperçu qui diverge silencieusement du document réellement produit.
      // P0-1A — même stocksOuverture que la génération réelle (voir le
      // commentaire du paramètre ci-dessus) : jamais `undefined` en dur, qui
      // désynchronisait ce preview de la génération réelle pour un exercice
      // en continuité.
      const preview = runDeclarationGeneration(input.draft, input.fiscalYear, input.stocksOuverture, input.draft?.bilanPatrimonial);
      if (
        preview.status === "generated" &&
        (stored?.totalRecettes !== preview.fiscalResult.totalRecettes ||
          stored?.totalCharges !== preview.fiscalResult.totalCharges ||
          stored?.amortDeduct !== preview.fiscalResult.amortDeduct ||
          stored?.amortReporte !== preview.fiscalResult.amortReporte ||
          identiteChanged(input.draft, input.fiscalYear) ||
          patrimoineChanged(input.draft?.rfs?.patrimoine, preview.rfs.patrimoine))
      ) {
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
        };
      }
    }

    return {
      snapshot,
      canCheckout: false,
      canRetryAfterPayment: false,
      canGenerate: false,
      blockingAnomalies: [],
      recoveryItems: [],
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
  const preview = runDeclarationGeneration(input.draft, input.fiscalYear, input.stocksOuverture, input.draft?.bilanPatrimonial);
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
