export type RevenueSupervisionLevel = "green" | "orange" | "red";

export type RevenueSupervisionStatus = {
  level: RevenueSupervisionLevel;
  title: string;
  message: string;
  recoveryHints?: string[];
  warnings?: string[];
  lineCount?: number;
};
