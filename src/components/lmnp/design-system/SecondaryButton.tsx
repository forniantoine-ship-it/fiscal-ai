import Link from "next/link";
import type { ReactNode } from "react";

interface SecondaryButtonProps {
  href?: string;
  onClick?: () => void;
  children: ReactNode;
  className?: string;
}

const base =
  "inline-flex items-center justify-center gap-2 rounded-full border border-stone-200/80 bg-card/80 px-6 py-2.5 text-[13px] font-medium text-stone-600 transition-colors hover:border-stone-300 hover:bg-card hover:text-stone-800";

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
