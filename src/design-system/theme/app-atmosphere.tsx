import type { CSSProperties } from "react";

import { gradients } from "@/design-system/theme/gradients";

/**
 * Shared immersive orange atmosphere for private app shells.
 * Mirrors PublicLayout layering — every layer covers the full viewport.
 */
export function appAtmosphereLayers(): Array<{ id: string; className: string; style: CSSProperties }> {
  const fullScreen: CSSProperties = {
    backgroundSize: "100% 100%",
    backgroundRepeat: "no-repeat",
  };

  return [
    {
      id: "atmosphere",
      className: "pointer-events-none absolute inset-0",
      style: { ...fullScreen, backgroundImage: gradients.app.atmosphere },
    },
    {
      id: "glow-left",
      className: "pointer-events-none absolute inset-0",
      style: { ...fullScreen, backgroundImage: gradients.app.glowLeft },
    },
    {
      id: "glow-right",
      className: "pointer-events-none absolute inset-0",
      style: { ...fullScreen, backgroundImage: gradients.app.glowRight },
    },
    {
      id: "sunset-right",
      className: "pointer-events-none absolute inset-0",
      style: { ...fullScreen, backgroundImage: gradients.app.sunsetRight },
    },
    {
      id: "center-vault",
      className: "pointer-events-none absolute inset-0",
      style: { ...fullScreen, backgroundImage: gradients.app.centerVault },
    },
  ];
}
