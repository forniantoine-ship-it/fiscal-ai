import { DepthComposition } from "@/lab/advisor-scene/composition/DepthComposition";
import { FanComposition } from "@/lab/advisor-scene/composition/FanComposition";
import type { CompositionStrategy } from "@/lab/advisor-scene/composition/CompositionStrategy";

export type CompositionId = "fan" | "depth";

export const compositions: Record<CompositionId, CompositionStrategy> = {
  fan: FanComposition,
  depth: DepthComposition,
};

export const compositionLabels: Record<CompositionId, string> = {
  fan: "Éventail",
  depth: "Profondeur",
};

export { FanComposition, DepthComposition };
export type { CompositionStrategy };
