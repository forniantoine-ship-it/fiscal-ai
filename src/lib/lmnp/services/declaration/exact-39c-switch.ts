/**
 * INT-5 — FRONTIÈRE PRODUCTIVE du switch article 39 C exact : UNE décision explicite par dossier.
 *
 *   `EXACT_39C_V2`  : dossier explicitement F013 v2 (un bien porte un état `rentReconciliationV2` de l'exercice).
 *   `LEGACY_PROXY`  : tout le reste (F013 v1, dossier jamais passé par F013 v2). Strictement inchangé, jamais recalculé.
 *
 * Pas de mélange (L exact + capacité ancienne, stocks exacts + résultat proxy) et AUCUN repli silencieux : un dossier
 * `EXACT_39C_V2` dont le gate est rouge est BLOQUÉ, il ne retombe jamais sur le proxy. Ouvrir, sauvegarder ou régénérer le bilan
 * d'un dossier legacy ne le migre pas : seule la présence d'un état F013 v2 (donnée explicite) engage le parcours exact.
 *
 * Ce module n'implémente aucune règle fiscale : la capacité `C = max(0, L − B)`, la matérialité et l'ordre D → H → déficits sont
 * ceux du moteur exact existant (`computeArticle39c`) et de l'unique séquence (`applyArticle39cSequence`). Il ne fait que
 * (1) exiger le gate final INT-4.1, (2) transformer le résultat du moteur exact en contrat pour F-006, (3) vérifier que le
 * résultat F-006 concorde avec le moteur exact (sinon refus).
 *
 * LIMITE DOCUMENTÉE : l'attestation distante ci-dessous est un constat daté posé par le Product Owner (SQL en lecture seule sur
 * le projet `jviyqblcjuqennfvgrdg`). Aucun lien technique ne prouve que le déploiement courant pointe sur ce projet : ce n'est
 * pas un contrôle continu. Toute migration touchant `lmnp_workspace_snapshots` (table, triggers, fonctions, ACL) périme la preuve.
 */
import type { PersistedWorkspace } from "@/lib/lmnp/store/persistence";
import type { FiscalEngineInputs, FiscalResult, StockDeficit } from "@/runtime/capabilities/f006/types";
import { round2 } from "@/runtime/capabilities/f006/types";
import { parseQualificationStore } from "@/lib/lmnp/services/article-39c/qualification-store";
import { canSwitchToExactFiscalEngine, type ExactSwitchGate, type RemoteAntiDowngradeAttestation } from "@/lib/lmnp/services/article-39c/switch-gate";

export type FiscalCalculationMode = "EXACT_39C_V2" | "LEGACY_PROXY";

/** Preuve distante PO (ADR-012 §3) : fonction + triggers présents et activés, ACL explicites sans PUBLIC / anon / authenticated. */
export const PO_REMOTE_ANTI_DOWNGRADE_ATTESTATION: RemoteAntiDowngradeAttestation = {
  status: "VERIFIED",
  projectRef: "jviyqblcjuqennfvgrdg",
  checkedAt: "2026-10-05T00:00:00.000Z",
  downgradeFunction: true,
  downgradeTrigger: true,
  closedSnapshotTrigger: true,
  aclAsExpected: true,
};

type DraftWithV2 = {
  rentReconciliationV2?: { facts: { fiscalYear: number } };
  biens?: Record<string, { rentReconciliationV2?: { facts: { fiscalYear: number } } } | undefined>;
} | undefined;

/** La seule décision : engagement explicite F013 v2 pour l'exercice. */
export function resolveFiscalCalculationMode(workspace: { fiscalYear: { year: number }; declarationDraft?: unknown }): FiscalCalculationMode {
  const draft = workspace.declarationDraft as DraftWithV2;
  const year = workspace.fiscalYear.year;
  const states = [draft?.rentReconciliationV2, ...Object.values(draft?.biens ?? {}).map((b) => b?.rentReconciliationV2)];
  return states.some((s) => s?.facts.fiscalYear === year) ? "EXACT_39C_V2" : "LEGACY_PROXY";
}

export type ExactFiscalContract = {
  readonly mode: "EXACT_39C_V2";
  /** Capacité `C` (euros), issue du moteur exact. */
  readonly capacite: number;
  /** Résultat global avant amortissement (euros), issu du moteur exact. */
  readonly resultatAvantAmort: number;
  /** Recettes transmises à F-006 : `L` + autres produits (jamais L par défaut ni de cash). */
  readonly recettesEuros: number;
  /** `L` par bien (euros) issu de F013 v2 : sert uniquement à alimenter la contribution de chaque bien à la consolidation. */
  readonly loyersAcquisParBienEuros: Readonly<Record<string, number>>;
  /** Charges d'activité / CFE que les assistants F-012 / F-011 ne portent pas (euros) : transmises à F-006 une seule fois. */
  readonly exactOnlyChargesEuros: number;
  readonly stocks: { readonly ard: number; readonly deficits: readonly StockDeficit[]; readonly basis: string };
  /** Sorties du moteur exact : F-006 doit les retrouver (réconciliation). */
  readonly expected: {
    readonly amortDeduit: number;
    readonly ardConsomme: number;
    readonly stockArdFinal: number;
    readonly resultatApresAmortissements: number;
    readonly deficitsImputes: number;
    readonly deficitNouveau: number;
    readonly resultatFiscal: number;
  };
  readonly gate: ExactSwitchGate;
};

export type ExactSwitchResolution =
  | { readonly mode: "LEGACY_PROXY" }
  | { readonly mode: "EXACT_39C_V2"; readonly status: "READY"; readonly contract: ExactFiscalContract }
  | { readonly mode: "EXACT_39C_V2"; readonly status: "BLOCKED"; readonly reasons: readonly string[]; readonly gate?: ExactSwitchGate };

export const EXACT_GATE_RED_CODE = "exact_39c_gate_not_green";
export const EXACT_RECONCILIATION_FAILED_CODE = "exact_39c_reconciliation_failed";
export const EXACT_REQUIRES_WORKSPACE_CODE = "exact_39c_requires_workspace_generation";

type StoreHolder = { article39cQualifications?: unknown; article39cActivityQualifications?: unknown; biens?: Record<string, { article39cQualifications?: unknown } | undefined> } | undefined;

/** Montant (centimes) des avis de CFE et charges d'activité de l'exercice que F-006 ne lit nulle part ailleurs. */
function exactOnlyChargesCents(draft: StoreHolder, fiscalYear: number): number {
  const stores = [draft?.article39cQualifications, draft?.article39cActivityQualifications, ...Object.values(draft?.biens ?? {}).map((b) => b?.article39cQualifications)];
  let cents = 0;
  for (const raw of stores) {
    for (const record of parseQualificationStore(raw)?.records ?? []) {
      if (record.fiscalYear !== fiscalYear || record.validation !== "VALIDATED") continue;
      if (record.recordKind === "ACTIVITY_CHARGE") cents += record.charge.amountCents;
      // Une CFE LIÉE à une ligne « divers » est déjà portée par F-012 (la ligne reste dans ses totaux) : jamais deux fois.
      else if (record.recordKind === "CFE" && record.diversLinkage?.kind !== "LINKED") cents += record.notice.amountCents;
    }
  }
  return cents;
}

export function resolveExactSwitch(
  workspace: Pick<PersistedWorkspace, "properties" | "fiscalYear" | "documents" | "declarationDraft">,
  options: { remoteAntiDowngrade?: RemoteAntiDowngradeAttestation } = {},
): ExactSwitchResolution {
  if (resolveFiscalCalculationMode(workspace) === "LEGACY_PROXY") return { mode: "LEGACY_PROXY" };
  const dossierId = workspace.fiscalYear.dossierId;
  if (dossierId === undefined || dossierId === "") return { mode: "EXACT_39C_V2", status: "BLOCKED", reasons: [EXACT_GATE_RED_CODE, "DOSSIER_IDENTITY_MISSING"] };

  const gate = canSwitchToExactFiscalEngine({
    workspace: workspace as PersistedWorkspace,
    expectedDossierId: dossierId,
    remoteAntiDowngrade: options.remoteAntiDowngrade ?? PO_REMOTE_ANTI_DOWNGRADE_ATTESTATION,
  });
  // Gate rouge : BLOCAGE. Aucun repli sur le proxy historique, jamais.
  if (!gate.canSwitch) return { mode: "EXACT_39C_V2", status: "BLOCKED", reasons: [EXACT_GATE_RED_CODE, ...gate.blockers], gate };

  const exact = gate.preSwitch.exact;
  const figures = exact.engine?.figures;
  const stocks = exact.consolidated.openingStocks;
  if (figures === undefined || stocks === undefined) return { mode: "EXACT_39C_V2", status: "BLOCKED", reasons: [EXACT_GATE_RED_CODE, "EXACT_ENGINE_RESULT_MISSING"], gate };
  const capacite = figures.capacite ?? (exact.engine!.status === "COMPUTED" || exact.engine!.status === "COMPUTED_UNRESOLVED_IMMATERIAL" ? exact.engine!.capaciteMin : undefined);
  if (capacite === undefined) return { mode: "EXACT_39C_V2", status: "BLOCKED", reasons: [EXACT_GATE_RED_CODE, "EXACT_CAPACITY_MISSING"], gate };

  const byClass = exact.consolidated.byClassCents;
  return {
    mode: "EXACT_39C_V2",
    status: "READY",
    contract: {
      mode: "EXACT_39C_V2",
      capacite,
      resultatAvantAmort: figures.resultatAvantAmort,
      recettesEuros: round2((byClass.L + byClass.OTHER_PRODUCT) / 100),
      loyersAcquisParBienEuros: Object.fromEntries(
        exact.consolidated.contributions.flatMap((c) => (c.class === "L" && c.scope.level === "PROPERTY" ? [[c.scope.propertyId, round2(c.amountCents / 100)] as const] : [])),
      ),
      exactOnlyChargesEuros: round2(exactOnlyChargesCents(workspace.declarationDraft as StoreHolder, workspace.fiscalYear.year) / 100),
      stocks:
        stocks.kind === "PROVIDED"
          ? { ard: stocks.historicalArdStock, deficits: stocks.priorDeficits, basis: stocks.basis ?? "PROVIDED" }
          : { ard: 0, deficits: [], basis: stocks.basis ?? "NONE_FIRST_YEAR" },
      expected: {
        amortDeduit: figures.amortDeduit,
        ardConsomme: figures.ardConsomme,
        stockArdFinal: figures.stockArdFinal,
        resultatApresAmortissements: figures.resultatApresAmortissements,
        deficitsImputes: figures.deficitsImputes,
        deficitNouveau: figures.deficitNouveau,
        resultatFiscal: figures.resultatFiscal,
      },
      gate,
    },
  };
}

/**
 * Entrées F-006 du dossier exact : recettes = L (+ autres produits) du moteur exact, stocks d'ouverture démontrés, charges
 * d'activité / CFE ajoutées UNE fois, capacité exacte. Les charges B / ACTIVITY des assistants restent celles de F-012 / F-011
 * (aucune recomposition parallèle) : leur concordance avec le moteur exact est vérifiée par F-006 (`article39cExact`).
 */
export function applyExactContractToEngineInputs(inputs: FiscalEngineInputs, contract: ExactFiscalContract): FiscalEngineInputs {
  const charges = inputs.chargesAssistant;
  const extra = contract.exactOnlyChargesEuros;
  return {
    ...inputs,
    revenusAssistant: { exerciceFiscal: inputs.exerciceFiscal, totalRecettes: contract.recettesEuros },
    ...(charges !== undefined
      ? {
          chargesAssistant:
            extra > 0
              ? { ...charges, totalDeductible: round2(charges.totalDeductible + extra), parCategorie: { ...charges.parCategorie, divers: round2((charges.parCategorie?.divers ?? 0) + extra) } }
              : charges,
        }
      : {}),
    stockDeficitsAnterieurs: contract.stocks.deficits.map((d) => ({ millesime: d.millesime, montant: d.montant })),
    stockAmortissementsReportes: contract.stocks.ard,
    article39cExact: { capacite: contract.capacite, resultatAvantAmort: contract.resultatAvantAmort },
  };
}

/** Écarts entre le résultat F-006 et le moteur exact (vide = concordance). Une divergence refuse la génération. */
export function reconcileExactFiscalResult(fiscalResult: FiscalResult, contract: ExactFiscalContract): string[] {
  const e = contract.expected;
  const diffs: string[] = [];
  const check = (label: string, actual: number | undefined, expected: number) => {
    if (typeof actual !== "number" || Math.abs(round2(actual - expected)) > 0.005) diffs.push(`${label}: F-006 ${actual} ≠ moteur exact ${expected}`);
  };
  check("amortDeduct", fiscalResult.amortDeduct, e.amortDeduit);
  check("amortReportesUtilises", fiscalResult.amortReportesUtilises, e.ardConsomme);
  check("stocks.amortissementsReportes", fiscalResult.stocks.amortissementsReportes, e.stockArdFinal);
  check("resultatFiscalAvantDeficits", fiscalResult.resultatFiscalAvantDeficits, e.resultatApresAmortissements);
  check("deficitsImputes", fiscalResult.deficitsImputes, e.deficitsImputes);
  check("deficitNouveau", fiscalResult.deficitNouveau, e.deficitNouveau);
  check("resultatFiscal", fiscalResult.resultatFiscal, e.resultatFiscal);
  return diffs;
}

/**
 * Dossier multi exact : la contribution de chaque bien à la consolidation lit ses recettes dans `revenusAssistant`. Pour un
 * dossier F013 v2 elles sont les loyers acquis `L` du bien (F013 v2, unique autorité) — jamais un total F013 v1.
 */
export function withExactPropertyRevenues<W extends { fiscalYear: { year: number }; declarationDraft?: unknown }>(workspace: W, contract: ExactFiscalContract): W {
  const draft = workspace.declarationDraft as { biens?: Record<string, Record<string, unknown>> } | undefined;
  if (draft?.biens === undefined) return workspace;
  const biens = Object.fromEntries(
    Object.entries(draft.biens).map(([id, bien]) => [
      id,
      contract.loyersAcquisParBienEuros[id] === undefined ? bien : { ...bien, revenusAssistant: { exerciceFiscal: workspace.fiscalYear.year, totalRecettes: contract.loyersAcquisParBienEuros[id] } },
    ]),
  );
  return { ...workspace, declarationDraft: { ...draft, biens } };
}
