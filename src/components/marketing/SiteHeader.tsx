"use client";

import Link from "next/link";
import { useState } from "react";
import { PrimaryButton } from "@/components/lmnp/design-system";

const links = [
  { href: "#comment-ca-marche", label: "Comment ça marche" },
  { href: "#faq", label: "FAQ" },
];

export function SiteHeader() {
  const [open, setOpen] = useState(false);

  return (
    <header className="surface-frost fixed inset-x-0 top-0 z-50 border-b border-stone-200/30">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
        <Link href="/" className="text-[15px] font-medium text-stone-700">
          Fiscal AI
        </Link>
        <nav className="hidden items-center gap-8 md:flex">
          {links.map((l) => (
            <a key={l.href} href={l.href} className="text-[13px] text-stone-500 hover:text-stone-700">
              {l.label}
            </a>
          ))}
          <PrimaryButton href="/app" className="!px-5 !py-2 text-[13px]">
            Ma déclaration
          </PrimaryButton>
        </nav>
        <button
          type="button"
          className="md:hidden text-stone-600"
          onClick={() => setOpen(!open)}
          aria-label="Menu"
        >
          ☰
        </button>
      </div>
      {open && (
        <nav className="border-t border-stone-200 bg-card px-6 py-4 md:hidden">
          {links.map((l) => (
            <a key={l.href} href={l.href} className="block py-2 text-sm text-stone-600">
              {l.label}
            </a>
          ))}
          <Link href="/app" className="mt-2 block text-sm font-medium text-primary-foreground">
            Ma déclaration →
          </Link>
        </nav>
      )}
    </header>
  );
}
