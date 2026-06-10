"use client";

import { memo, type CSSProperties, type ReactNode } from "react";

type PersistentTunnelPanelProps = {
  tunnel: string;
  active: boolean;
  children: ReactNode;
};

/** Opacity keep-alive: subtree stays in render tree while inactive (no cold repaint on reveal). */
const GRID_ACTIVE_STYLE: CSSProperties = {
  gridArea: "1 / 1",
  opacity: 1,
  visibility: "visible",
  pointerEvents: "auto",
  zIndex: 1,
  willChange: "opacity",
};

const GRID_INACTIVE_STYLE: CSSProperties = {
  gridArea: "1 / 1",
  opacity: 0,
  visibility: "visible",
  pointerEvents: "none",
  userSelect: "none",
  zIndex: 0,
  willChange: "opacity",
};

function comparePersistentTunnelPanel(
  prev: PersistentTunnelPanelProps,
  next: PersistentTunnelPanelProps,
): boolean {
  if (prev.tunnel !== next.tunnel) return false;
  if (!prev.active && !next.active) return true;
  return prev.active === next.active;
}

function PersistentTunnelPanelView({ tunnel, active, children }: PersistentTunnelPanelProps) {
  console.log("[render-checkpoint]", `PersistentTunnelPanel:${tunnel}`, "entry");
  console.log("[render-checkpoint]", `PersistentTunnelPanel:${tunnel}`, "exit");
  return (
    <div
      data-tunnel={tunnel}
      data-active={active ? "true" : "false"}
      style={active ? GRID_ACTIVE_STYLE : GRID_INACTIVE_STYLE}
      aria-hidden={active ? undefined : true}
      {...(!active ? { inert: true } : {})}
    >
      {children}
    </div>
  );
}

export const PersistentTunnelPanel = memo(
  PersistentTunnelPanelView,
  comparePersistentTunnelPanel,
);
