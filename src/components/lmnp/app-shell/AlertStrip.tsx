"use client";

import Link from "next/link";
import { useLmnp } from "@/lib/lmnp/store";

export function AlertStrip() {
  const { workspace } = useLmnp();

  const topAlerts = workspace.alerts.slice(0, 2);
  if (topAlerts.length === 0) return null;

  return (
    <div className="border-b border-stone-200 bg-card/95">
      <div className="mx-auto flex max-w-7xl flex-col gap-2 px-4 py-2 sm:px-6">
        {topAlerts.map((alert) => (
          <div
            key={alert.id}
            className={`flex flex-wrap items-center justify-between gap-2 rounded-lg px-3 py-2 text-xs ${
              alert.severity === "blocking"
                ? "bg-red-50 text-red-800"
                : alert.severity === "warning"
                  ? "bg-amber-50 text-amber-900"
                  : "bg-stone-100 text-stone-600"
            }`}
          >
            <span className="font-medium">{alert.title}</span>
            {alert.primaryActionHref && (
              <Link
                href={alert.primaryActionHref}
                className="font-semibold underline-offset-2 hover:underline"
              >
                {alert.primaryActionLabel ?? "Agir"} →
              </Link>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
