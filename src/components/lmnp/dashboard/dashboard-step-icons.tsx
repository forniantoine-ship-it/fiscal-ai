import { colors } from "@/design-system/theme/colors";
import type { DashboardWorkflowStepId } from "@/components/lmnp/dashboard/dashboard-workflow-model";

export function StepIcon({ id, muted = false }: { id: DashboardWorkflowStepId; muted?: boolean }) {
  const stroke = muted ? colors.text.muted : colors.orange[500];
  const common = { width: 20, height: 20, viewBox: "0 0 20 20", fill: "none", "aria-hidden": true as const };

  switch (id) {
    case "activite":
      return (
        <svg {...common}>
          <path d="M4 15V8l6-3 6 3v7" stroke={stroke} strokeWidth="1.4" strokeLinecap="round" />
          <path d="M8 15v-4h4v4" stroke={stroke} strokeWidth="1.4" />
        </svg>
      );
    case "logement":
      return (
        <svg {...common}>
          <path d="M3 10.5 10 4l7 6.5V16a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V10.5Z" stroke={stroke} strokeWidth="1.4" />
        </svg>
      );
    case "credit":
      return (
        <svg {...common}>
          <rect x="3" y="5" width="14" height="10" rx="2" stroke={stroke} strokeWidth="1.4" />
          <path d="M3 9h14" stroke={stroke} strokeWidth="1.4" />
        </svg>
      );
    case "amortissement":
      return (
        <svg {...common}>
          <path d="M5 15V7h4v8M11 15V5h4v10" stroke={stroke} strokeWidth="1.4" strokeLinecap="round" />
        </svg>
      );
    case "revenus":
      return (
        <svg {...common}>
          <path d="M4 14c2.5-4 4.5-4 6 0s3.5 4 6 0" stroke={stroke} strokeWidth="1.4" strokeLinecap="round" />
        </svg>
      );
    case "charges":
      return (
        <svg {...common}>
          <path d="M6 5h8M6 10h8M6 15h5" stroke={stroke} strokeWidth="1.4" strokeLinecap="round" />
        </svg>
      );
    default:
      return (
        <svg {...common}>
          <path d="M6 10.5 9 13.5 14 7.5" stroke={stroke} strokeWidth="1.4" strokeLinecap="round" />
          <circle cx="10" cy="10" r="7" stroke={stroke} strokeWidth="1.4" />
        </svg>
      );
  }
}
