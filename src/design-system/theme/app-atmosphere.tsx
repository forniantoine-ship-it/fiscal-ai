import type { CSSProperties } from "react";

import { gradients } from "@/design-system/theme/gradients";

/** Shared immersive orange atmosphere for private app shells. */
export function appAtmosphereLayers(): Array<{ id: string; className: string; style: CSSProperties }> {
  return [
    {
      id: "atmosphere",
      className: "pointer-events-none absolute inset-0",
      style: { backgroundImage: gradients.app.atmosphere },
    },
    {
      id: "diffusion-left",
      className: "pointer-events-none absolute inset-y-0 left-0 w-[54%]",
      style: { backgroundImage: gradients.app.diffusionLeft },
    },
    {
      id: "diffusion-right",
      className: "pointer-events-none absolute inset-y-0 right-0 w-[82%]",
      style: { backgroundImage: gradients.app.diffusionRight },
    },
    {
      id: "center-vault",
      className: "pointer-events-none absolute inset-0",
      style: { backgroundImage: gradients.app.centerVault },
    },
  ];
}
