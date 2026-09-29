/**
 * R15.1 — pure selection of the shell an owner assistant is displayed in.
 *
 * `V3AssistantShell` is used only when BOTH hold: the verified correction scope carries the V3 shell marker AND the
 * pathname is one of the six owner assistants listed below (exact match, fail-closed). Everything else — no scope, a
 * legacy scope, `/documents`, `/declarations`, `/dashboard`, payment, validation, any other route — keeps the
 * historical `DashboardLayout`.
 */
import type { V3CorrectionScope } from "@/lab/v2-dossier/correction-scope";

/** The only routes that may be shown inside the V3 assistant shell, with their rubrique label. */
export const V3_ASSISTANT_ROUTES: Readonly<Record<string, string>> = {
  "/assistants/activite": "Activité",
  "/assistants/logement": "Logement",
  "/assistants/financement": "Financement",
  "/assistants/charges": "Charges",
  "/assistants/revenus": "Revenus",
  "/assistants/amortissements": "Amortissements",
};

export type AssistantShellChoice = { kind: "legacy" } | { kind: "v3-assistant"; title: string };

function normalise(pathname: string): string {
  return pathname.length > 1 && pathname.endsWith("/") ? pathname.slice(0, -1) : pathname;
}

export function v3AssistantTitle(pathname: string | null | undefined): string | null {
  if (!pathname) return null;
  const key = normalise(pathname);
  return Object.prototype.hasOwnProperty.call(V3_ASSISTANT_ROUTES, key) ? V3_ASSISTANT_ROUTES[key]! : null;
}

export function selectAssistantShell(
  scope: Pick<V3CorrectionScope, "shell"> | null | undefined,
  pathname: string | null | undefined,
): AssistantShellChoice {
  if (scope?.shell !== "v3") return { kind: "legacy" };
  const title = v3AssistantTitle(pathname);
  return title === null ? { kind: "legacy" } : { kind: "v3-assistant", title };
}
