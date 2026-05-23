"use client";

import Link from "next/link";
import { useState } from "react";
import { PrimaryButton } from "@/components/lmnp/design-system";

const links = [
  { href: "#comment-ca-marche", label: "Comment ça marche" },
  { href: "#tarif", label: "Tarif" },
  { href: "#faq", label: "FAQ" },
];

export function SiteHeader() {
  const [open, setOpen] = useState(false);

  return (
    <header className="surface-frost fixed inset-x-0 top-0 z-50">
      <div className="mx-auto flex h-[4.25rem] max-w-5xl items-center justify-between px-6">
        <Link
          href="/"
          className="text-[14px] font-medium text-stone-700 transition-colors hover:text-stone-800"
        >
          Fiscal AI
        </Link>
        <nav className="hidden items-center gap-9 md:flex" aria-label="Navigation principale">
          {links.map((l) => (
            <a
              key={l.href}
              href={l.href}
              className="text-[13px] text-stone-500 transition-colors hover:text-stone-700"
            >
              {l.label}
            </a>
          ))}
          <PrimaryButton href="/app" className="!px-5 !py-2 text-[13px]">
            Commencer ma déclaration
          </PrimaryButton>
        </nav>
        <button
          type="button"
          className="text-[13px] text-stone-600 md:hidden"
          onClick={() => setOpen(!open)}
          aria-expanded={open}
          aria-label={open ? "Fermer le menu" : "Ouvrir le menu"}
        >
          {open ? "Fermer" : "Menu"}
        </button>
      </div>
      {open && (
        <nav className="border-t border-stone-200/50 px-6 py-5 md:hidden" aria-label="Navigation mobile">
          {links.map((l) => (
            <a
              key={l.href}
              href={l.href}
              className="block py-2.5 text-[14px] text-stone-600"
              onClick={() => setOpen(false)}
            >
              {l.label}
            </a>
          ))}
          <Link
            href="/app"
            className="mt-3 inline-block text-[14px] font-medium text-stone-800"
            onClick={() => setOpen(false)}
          >
            Commencer ma déclaration →
          </Link>
        </nav>
      )}
    </header>
  );
}
