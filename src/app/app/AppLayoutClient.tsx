"use client";

import { AppShell } from "@/components/lmnp/app-shell/AppShell";

export function AppLayoutClient({ children }: { children: React.ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
