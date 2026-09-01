"use client";

import { ActiviteDocumentStep } from "@/components/lmnp/activite/ActiviteDocumentStep";
import { AmortissementDocumentStep } from "@/components/lmnp/documents/AmortissementDocumentStep";
import { ChargesDocumentStep } from "@/components/lmnp/documents/ChargesDocumentStep";
import type { TunnelStepProps } from "@/components/lmnp/documents/frozen-tunnel-step";
import { CreditDocumentStep } from "@/components/lmnp/documents/CreditDocumentStep";
import { withFrozenTunnelStep } from "@/components/lmnp/documents/frozen-tunnel-step";
import { LogementDocumentStep } from "@/components/lmnp/documents/LogementDocumentStep";
import { RevenusDocumentStep } from "@/components/lmnp/documents/RevenusDocumentStep";
import { ValidationDocumentStep } from "@/components/lmnp/documents/ValidationDocumentStep";

export const FrozenActiviteDocumentStep = withFrozenTunnelStep(
  ActiviteDocumentStep,
  "FrozenActiviteDocumentStep",
);

export const FrozenLogementDocumentStep = withFrozenTunnelStep(
  LogementDocumentStep,
  "FrozenLogementDocumentStep",
);

export const FrozenCreditDocumentStep = withFrozenTunnelStep(
  CreditDocumentStep,
  "FrozenCreditDocumentStep",
);

export const FrozenAmortissementDocumentStep = withFrozenTunnelStep(
  AmortissementDocumentStep,
  "FrozenAmortissementDocumentStep",
);

export const FrozenRevenusDocumentStep = withFrozenTunnelStep(
  RevenusDocumentStep,
  "FrozenRevenusDocumentStep",
);

function FrozenChargesDocumentStepRenderProbe(props: TunnelStepProps) {
  console.log("[render-checkpoint]", "FrozenChargesDocumentStep", "entry");
  const view = <ChargesDocumentStep {...props} />;
  console.log("[render-checkpoint]", "FrozenChargesDocumentStep", "exit");
  return view;
}

export const FrozenChargesDocumentStep = withFrozenTunnelStep(
  FrozenChargesDocumentStepRenderProbe,
  "FrozenChargesDocumentStep",
);

export const FrozenValidationDocumentStep = withFrozenTunnelStep(
  ValidationDocumentStep,
  "FrozenValidationDocumentStep",
);
