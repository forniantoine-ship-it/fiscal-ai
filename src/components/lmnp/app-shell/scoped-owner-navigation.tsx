"use client";

import Link from "next/link";
import type { ComponentProps } from "react";
import { useV3CorrectionScope } from "@/lab/v2-dossier/correction-context";
import { v3ScopedNavigationHref } from "@/lab/v2-dossier/correction-scope";

/** One navigation rule shared by every owner panel. Legacy routes keep their original href. */
export function useScopedOwnerHref(href: string): string | null {
  const scope = useV3CorrectionScope();
  return v3ScopedNavigationHref(href, scope);
}

export function ScopedOwnerLink({ href, children, ...props }: ComponentProps<typeof Link>) {
  const scoped = useScopedOwnerHref(typeof href === "string" ? href : `${href.pathname ?? ""}${href.search ?? ""}`);
  if (!scoped) return <span className={props.className} style={props.style} aria-disabled="true">{children}</span>;
  return <Link href={scoped} {...props}>{children}</Link>;
}
