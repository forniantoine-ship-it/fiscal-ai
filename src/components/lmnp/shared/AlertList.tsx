"use client";

import Link from "next/link";
import type { Alert } from "@/lib/lmnp/types";

interface AlertListProps {
  alerts: Alert[];
  limit?: number;
}

const SEVERITY_STYLES = {
  blocking: "border-red-500/30 bg-red-500/5",
  warning: "border-amber-500/30 bg-amber-500/5",
  info: "border-stone-200 bg-stone-100/80",
};

export function AlertList({ alerts, limit = 5 }: AlertListProps) {
  const shown = alerts.slice(0, limit);

  if (shown.length === 0) {
    return (
      <p className="rounded-xl border border-stone-200 bg-stone-100/80 px-4 py-6 text-center text-sm text-stone-500">
        Aucune alerte pour le moment — tout va bien.
      </p>
    );
  }

  return (
    <ul className="space-y-3">
      {shown.map((alert) => (
        <li
          key={alert.id}
          className={`rounded-xl border p-4 ${SEVERITY_STYLES[alert.severity]}`}
        >
          <p className="text-sm font-semibold text-stone-900">{alert.title}</p>
          <p className="mt-1 text-sm text-stone-600">{alert.message}</p>
          {alert.primaryActionHref && alert.primaryActionLabel && (
            <Link
              href={alert.primaryActionHref}
              className="mt-3 inline-block text-sm font-medium text-accent hover:text-accent"
            >
              {alert.primaryActionLabel} →
            </Link>
          )}
        </li>
      ))}
    </ul>
  );
}
