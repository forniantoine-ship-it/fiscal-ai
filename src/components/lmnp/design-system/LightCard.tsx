import type { ReactNode } from "react";

import { Card, type CardProps } from "@/design-system/components/Card";

interface LightCardProps {
  children: ReactNode;
  className?: string;
  variant?: CardProps["variant"];
}

export function LightCard({ children, className = "", variant = "default" }: LightCardProps) {
  return (
    <Card className={className} variant={variant} interactive>
      {children}
    </Card>
  );
}
