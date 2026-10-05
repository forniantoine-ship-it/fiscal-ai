/**
 * INT-4.1 — GATE PUR du switch vers le moteur fiscal exact : « toutes les préconditions sont-elles réunies ? ».
 *
 * Ne switch RIEN, n'active rien, n'est appelé par aucun module productif. Il étend la readiness pré-switch (aucune
 * duplication des règles) avec la seule condition qui n'est pas une propriété du dossier : la preuve DISTANTE de la
 * protection anti-régression de version des snapshots (ADR-012 §3 : fonction + trigger SQL, trigger de réouverture
 * d'un snapshot clos, ACL attendues).
 *
 * L'attestation distante est une ENTRÉE (un constat en lecture seule fait hors du code, daté et rattaché à un projet) :
 * absente, échouée ou non vérifiée → le gate reste rouge. Jamais présumée.
 */
import type { PersistedWorkspace } from "@/lib/lmnp/store/persistence";
import type { LigneCharge } from "@/runtime/capabilities/f012/types";
import type { Article39cOpeningStocks } from "./opening-stocks";
import { evaluateArticle39cPreSwitchReadiness, type PreSwitchReadiness } from "./pre-switch-readiness";

export type RemoteAntiDowngradeAttestation =
  | {
      readonly status: "VERIFIED";
      /** Projet DEV / STAGING désigné par la gouvernance (jamais déduit). */
      readonly projectRef: string;
      readonly checkedAt: string;
      /** `public.lmnp_prevent_snapshot_schema_downgrade()` présente. */
      readonly downgradeFunction: true;
      /** `trg_lmnp_prevent_snapshot_schema_downgrade` présent et actif sur `public.lmnp_workspace_snapshots`. */
      readonly downgradeTrigger: true;
      /** `trg_lmnp_prevent_reopen_closed_snapshot` toujours présent. */
      readonly closedSnapshotTrigger: true;
      /** ACL attendues (pas d'exécution publique de la fonction, pas de politique élargie). */
      readonly aclAsExpected: true;
    }
  | { readonly status: "FAIL"; readonly reason: string }
  | { readonly status: "NOT_VERIFIED"; readonly reason?: string };

export type RemoteAntiDowngradeStatus = "VERIFIED" | "FAIL" | "NOT_VERIFIED";

function remoteStatus(attestation: RemoteAntiDowngradeAttestation | undefined): RemoteAntiDowngradeStatus {
  if (attestation === undefined) return "NOT_VERIFIED";
  if (attestation.status !== "VERIFIED") return attestation.status;
  // Une attestation « VERIFIED » incomplète n'est jamais acceptée.
  const complete =
    attestation.projectRef.trim() !== "" && attestation.checkedAt.trim() !== "" && attestation.downgradeFunction === true && attestation.downgradeTrigger === true && attestation.closedSnapshotTrigger === true && attestation.aclAsExpected === true;
  return complete ? "VERIFIED" : "FAIL";
}

export type ExactSwitchGate = {
  readonly canSwitch: boolean;
  /** Raisons pour lesquelles le switch est refusé (vide si `canSwitch`). */
  readonly blockers: readonly string[];
  readonly preSwitch: PreSwitchReadiness;
  readonly remoteAntiDowngrade: RemoteAntiDowngradeStatus;
  /**
   * `SWITCH_BOUND_ONLY` : ce qui reste pour activer F013 v2 est propre au switch (drapeau global, remplacement du proxy
   * productif, évolution des gardes productifs). `DOSSIER_NOT_READY` : le dossier lui-même n'est pas prêt.
   */
  readonly f013V2ActivationBlocker: "SWITCH_BOUND_ONLY" | "DOSSIER_NOT_READY";
  readonly switchBoundItems: readonly string[];
  /** Le gate ne switch rien : constats figés. */
  readonly effect: "NONE";
  readonly productiveF006: "OLD_PROXY";
};

export function canSwitchToExactFiscalEngine(input: {
  workspace: PersistedWorkspace;
  expectedDossierId: string;
  remoteAntiDowngrade?: RemoteAntiDowngradeAttestation;
  openingStocks?: Article39cOpeningStocks;
  activityLines?: readonly LigneCharge[];
}): ExactSwitchGate {
  const preSwitch = evaluateArticle39cPreSwitchReadiness({
    workspace: input.workspace,
    expectedDossierId: input.expectedDossierId,
    ...(input.openingStocks !== undefined ? { openingStocks: input.openingStocks } : {}),
    ...(input.activityLines !== undefined ? { activityLines: input.activityLines } : {}),
  });
  const remote = remoteStatus(input.remoteAntiDowngrade);
  const blockers: string[] = [];
  if (!preSwitch.readyForExact39c) blockers.push(`DOSSIER_${preSwitch.status}`, ...preSwitch.reasons);
  if (remote !== "VERIFIED") blockers.push(remote === "FAIL" ? "REMOTE_ANTI_DOWNGRADE_FAIL" : "REMOTE_ANTI_DOWNGRADE_NOT_VERIFIED");
  return {
    canSwitch: blockers.length === 0,
    blockers: [...new Set(blockers)],
    preSwitch,
    remoteAntiDowngrade: remote,
    f013V2ActivationBlocker: preSwitch.readyForExact39c ? "SWITCH_BOUND_ONLY" : "DOSSIER_NOT_READY",
    switchBoundItems: preSwitch.switchBoundItems,
    effect: "NONE",
    productiveF006: "OLD_PROXY",
  };
}
