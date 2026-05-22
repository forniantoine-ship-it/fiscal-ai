import Link from "next/link";
import type { ReactNode } from "react";

interface SecondaryButtonProps {
  href?: string;
  onClick?: () => void;
  children: ReactNode;
  className?: string;
}

const base =
  "inline-flex items-center justify-center gap-2 rounded-full border border-border bg-card px-6 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-subtle";

export function SecondaryButton({ href, onClick, children, className = "" }: SecondaryButtonProps) {
  const classes = `${base} ${className}`;

  if (href) {
    return (
      <Link href={href} className={classes}>
        {children}
      </Link>
    );
  }

  return (
    <button type="button" onClick={onClick} className={classes}>
      {children}
    </button>
  );
}
