"use client";

import { Button } from "@/design-system/components/Button";

interface ValidationFieldActionsProps {
  onApprove: () => void;
  onCorrect: () => void;
  onReject: () => void;
  compact?: boolean;
  approveLabel?: string;
}

export function ValidationFieldActions({
  onApprove,
  onCorrect,
  onReject,
  compact = false,
  approveLabel = "Approuver",
}: ValidationFieldActionsProps) {
  return (
    <div className={`flex flex-wrap gap-2 ${compact ? "" : "mt-4"}`}>
      <Button onClick={onApprove} className={compact ? "!min-h-[36px] !px-3 !py-1.5 !text-xs" : ""}>
        {approveLabel}
      </Button>
      <Button
        variant="secondary"
        onClick={onCorrect}
        className={compact ? "!min-h-[36px] !px-3 !py-1.5 !text-xs" : ""}
      >
        Corriger
      </Button>
      <Button
        variant="ghost"
        onClick={onReject}
        className={compact ? "!min-h-[36px] !px-3 !py-1.5 !text-xs" : ""}
      >
        Rejeter
      </Button>
    </div>
  );
}
