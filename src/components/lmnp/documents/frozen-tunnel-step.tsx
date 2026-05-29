"use client";

import { memo, type ComponentType } from "react";

/** Props every tunnel document step accepts for render-freeze isolation. */
export type TunnelStepProps = {
  /** When false, parent-driven rerenders are skipped via memo equality. */
  isActive: boolean;
};

/**
 * Skip rerender when tunnel stays inactive across parent (DocumentsWorkspace) updates.
 * Rerender when isActive flips or while active (allows local state / context updates).
 */
export function compareFrozenTunnelStep(
  prev: TunnelStepProps,
  next: TunnelStepProps,
): boolean {
  if (!prev.isActive && !next.isActive) {
    return true;
  }
  return prev.isActive === next.isActive;
}

export function withFrozenTunnelStep<P extends TunnelStepProps>(
  Component: ComponentType<P>,
  displayName: string,
) {
  const Frozen = memo(Component, compareFrozenTunnelStep);
  Frozen.displayName = displayName;
  return Frozen;
}
