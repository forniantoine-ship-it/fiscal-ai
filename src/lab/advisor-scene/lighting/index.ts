import { DefaultLighting } from "@/lab/advisor-scene/lighting/DefaultLighting";
import type { LightingStrategy } from "@/lab/advisor-scene/lighting/LightingStrategy";

export const lighting: LightingStrategy = DefaultLighting;

export { DefaultLighting };
export type { LightingStrategy };
