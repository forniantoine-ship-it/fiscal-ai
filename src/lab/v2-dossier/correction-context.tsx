"use client";

import { createContext, useContext } from "react";
import type { V3CorrectionScope } from "./correction-scope";

export const V3CorrectionScopeContext = createContext<V3CorrectionScope | null>(null);

export function useV3CorrectionScope() {
  return useContext(V3CorrectionScopeContext);
}
