"use client";

import Link from "next/link";

import { colors } from "@/design-system/theme/colors";
import { typography } from "@/design-system/theme/typography";

export function ValidationSupportFooter() {
  return (
    <footer className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 pt-4">
      <Link
        href="mailto:aide@fiscal-ai.fr"
        style={{ ...typography.caption.desktop, color: colors.text.muted }}
      >
        aide@fiscal-ai.fr
      </Link>
      <span style={{ color: colors.border.default }} aria-hidden>
        ·
      </span>
      <Link href="/#faq" style={{ ...typography.caption.desktop, color: colors.text.muted }}>
        Questions fréquentes
      </Link>
    </footer>
  );
}
