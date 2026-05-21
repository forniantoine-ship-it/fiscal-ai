"use client";

import { useEffect, useState } from "react";
import {
  AI_ANALYSIS_PHASES,
  getAnalysisPhasesForType,
} from "@/lib/lmnp/constants/ai-activity-copy";
import type { DocumentType } from "@/lib/lmnp/types";

interface AiActivityFeedProps {
  documentType?: DocumentType;
  compact?: boolean;
}

export function AiActivityFeed({ documentType, compact }: AiActivityFeedProps) {
  const phases = documentType
    ? getAnalysisPhasesForType(documentType)
    : AI_ANALYSIS_PHASES;
  const [phaseIndex, setPhaseIndex] = useState(0);

  useEffect(() => {
    const interval = window.setInterval(() => {
      setPhaseIndex((i) => (i + 1) % phases.length);
    }, 2400);
    return () => window.clearInterval(interval);
  }, [phases.length]);

  return (
    <p
      className={`text-zinc-500 ${compact ? "text-xs" : "text-sm"}`}
      key={phaseIndex}
    >
      <span className="mr-2 inline-block h-1 w-1 animate-pulse rounded-full bg-violet-400/80 align-middle" />
      {phases[phaseIndex]}
    </p>
  );
}
