"use client";

import Link from "next/link";
import { isValidElement, type ComponentProps, type KeyboardEvent } from "react";
import { useV3CorrectionScope } from "@/lab/v2-dossier/correction-context";
import { v3ScopedNavigationHref } from "@/lab/v2-dossier/correction-scope";
import { scopedOwnerTarget } from "./scoped-owner-target";
import { useV3CorrectionReturn } from "./useV3CorrectionReturn";

/** One navigation rule shared by every owner panel. Legacy routes keep their original href. */
export function useScopedOwnerHref(href: string): string | null {
  const scope = useV3CorrectionScope();
  return v3ScopedNavigationHref(href, scope);
}

/**
 * Under the V3 shell, an exit to the legacy dashboard is a return to Mon dossier: it runs the confirmed-save
 * mechanism instead of navigating. The wrapper keeps its children (text or a Button) exactly as the panel wrote them.
 */
function V3DossierExit({ children, className, style }: Pick<ComponentProps<typeof Link>, "children" | "className" | "style">) {
  const { status, run } = useV3CorrectionReturn();
  // A nested Button already carries the interactive semantics; bare text needs its own.
  const nested = isValidElement(children);
  const onKeyDown = (event: KeyboardEvent<HTMLSpanElement>) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    void run();
  };
  return (
    <>
      <span
        className={className}
        style={{ cursor: "pointer", ...style }}
        onClick={() => { if (status !== "saving") void run(); }}
        {...(nested ? {} : { role: "button", tabIndex: 0, onKeyDown })}
        aria-busy={status === "saving" || undefined}
      >
        {children}
      </span>
      {status === "error" ? <span role="alert"> La sauvegarde n’a pas pu être confirmée. Réessayez avant de revenir.</span> : null}
    </>
  );
}

export function ScopedOwnerLink({ href, children, ...props }: ComponentProps<typeof Link>) {
  const scope = useV3CorrectionScope();
  const target = scopedOwnerTarget(typeof href === "string" ? href : `${href.pathname ?? ""}${href.search ?? ""}`, scope);
  if (target.kind === "exit") return <V3DossierExit className={props.className} style={props.style}>{children}</V3DossierExit>;
  if (target.kind === "disabled") return <span className={props.className} style={props.style} aria-disabled="true">{children}</span>;
  return <Link href={target.href} {...props}>{children}</Link>;
}
