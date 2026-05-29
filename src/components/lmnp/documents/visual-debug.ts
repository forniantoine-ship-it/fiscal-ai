type VisualLogKind =
  | "visual-reset"
  | "form-reset"
  | "visible-sections-change"
  | "animation-replay"
  | "loading-state-change"
  | "autosave-rerender"
  | "visibility-change";

export function logVisualMutation(
  kind: VisualLogKind,
  source: string,
  previous: unknown,
  next: unknown,
  extra?: Record<string, unknown>,
) {
  if (previous === next) return;
  console.log(`[${kind}]`, { source, previous, next, ...extra });
}
