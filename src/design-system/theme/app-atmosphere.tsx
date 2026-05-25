import type { CSSProperties } from "react";

import { gradients } from "@/design-system/theme/gradients";

const fullScreenLayer: CSSProperties = {
  backgroundSize: "100% 100%",
  backgroundRepeat: "no-repeat",
};

/**
 * Shared immersive orange atmosphere for private app shells.
 * Mirrors PublicLayout layering — every layer covers the full viewport.
 */
export function appAtmosphereLayers(): Array<{ id: string; className: string; style: CSSProperties }> {
  return [
    {
      id: "atmosphere",
      className: "pointer-events-none absolute inset-0",
      style: { ...fullScreenLayer, backgroundImage: gradients.app.atmosphere },
    },
    {
      id: "glow-left",
      className: "pointer-events-none absolute inset-0",
      style: { ...fullScreenLayer, backgroundImage: gradients.app.glowLeft },
    },
    {
      id: "glow-right",
      className: "pointer-events-none absolute inset-0",
      style: { ...fullScreenLayer, backgroundImage: gradients.app.glowRight },
    },
    {
      id: "sunset-right",
      className: "pointer-events-none absolute inset-0",
      style: { ...fullScreenLayer, backgroundImage: gradients.app.sunsetRight },
    },
    {
      id: "center-vault",
      className: "pointer-events-none absolute inset-0",
      style: { ...fullScreenLayer, backgroundImage: gradients.app.centerVault },
    },
  ];
}

/**
 * Dashboard-only atmosphere — landing-like bilateral sunset diffusion,
 * stronger on the right, cream-readable center, soft premium tones only.
 */
export function dashboardAtmosphereLayers(): Array<{ id: string; className: string; style: CSSProperties }> {
  return [
    {
      id: "dashboard-atmosphere",
      className: "pointer-events-none absolute inset-0",
      style: { ...fullScreenLayer, backgroundImage: gradients.dashboard.atmosphere },
    },
    {
      id: "dashboard-glow-left",
      className: "pointer-events-none absolute inset-0",
      style: { ...fullScreenLayer, backgroundImage: gradients.dashboard.glowLeft },
    },
    {
      id: "dashboard-glow-right",
      className: "pointer-events-none absolute inset-0",
      style: { ...fullScreenLayer, backgroundImage: gradients.dashboard.glowRight },
    },
    {
      id: "dashboard-sunset-right",
      className: "pointer-events-none absolute inset-0",
      style: { ...fullScreenLayer, backgroundImage: gradients.dashboard.sunsetRight },
    },
    {
      id: "dashboard-center-vault",
      className: "pointer-events-none absolute inset-0",
      style: { ...fullScreenLayer, backgroundImage: gradients.dashboard.centerVault },
    },
  ];
}
