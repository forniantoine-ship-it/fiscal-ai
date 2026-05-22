"use client";

import { useState } from "react";

const faqs = [
  {
    q: "Dois-je connaître la fiscalité LMNP ?",
    a: "Non. Le parcours vous pose les bonnes questions et pré-remplit les montants à partir de vos documents.",
  },
  {
    q: "Quels documents déposer ?",
    a: "Baux, quittances, relevés bancaires, taxe foncière, assurance, charges, factures d’ameublement, attestations d’emprunt…",
  },
  {
    q: "La télétransmission est-elle incluse ?",
    a: "Oui, jusqu’à l’envoi sécurisé de votre liasse, avec signature électronique.",
  },
];

export function HomeFaq() {
  const [open, setOpen] = useState<number | null>(0);

  return (
    <section id="faq" className="border-t border-stone-200/80 py-24 sm:py-32">
      <div className="mx-auto max-w-xl px-6">
        <h2
          className="text-center text-2xl font-normal text-stone-800"
          style={{ fontFamily: "var(--font-display), Georgia, serif" }}
        >
          Questions fréquentes
        </h2>
        <ul className="mt-12 space-y-2">
          {faqs.map((faq, i) => (
            <li key={faq.q} className="rounded-xl bg-card shadow-[var(--shadow-soft)]">
              <button
                type="button"
                className="flex w-full items-center justify-between px-5 py-4 text-left text-[15px] text-stone-700"
                onClick={() => setOpen(open === i ? null : i)}
              >
                {faq.q}
                <span className="text-stone-400">{open === i ? "−" : "+"}</span>
              </button>
              {open === i && (
                <p className="border-t border-stone-100 px-5 pb-4 pt-2 text-[14px] leading-relaxed text-stone-500">
                  {faq.a}
                </p>
              )}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
