"use client";

import { useState } from "react";
import { SectionHeading } from "./ui/SectionHeading";

const faqs = [
  {
    question: "Est-ce vraiment légal de réduire ses impôts avec l'IA ?",
    answer:
      "Oui. L'IA ne crée pas de montages fictifs : elle identifie les dispositifs prévus par le CGI (PER, déficit foncier, réductions d'impôt, etc.) adaptés à votre situation. Chaque recommandation est validée par un expert fiscaliste avant application.",
  },
  {
    question: "Qui peut utiliser Fiscal AI ?",
    answer:
      "Salariés, indépendants, dirigeants, investisseurs immobiliers et professions libérales en France. Notre moteur couvre l'impôt sur le revenu, les plus-values, la fiscalité des sociétés et l'optimisation patrimoniale.",
  },
  {
    question: "Mes données sont-elles sécurisées ?",
    answer:
      "Vos données sont chiffrées, hébergées en Union européenne (France) et ne sont jamais revendues. Nous sommes conformes au RGPD. Vous pouvez demander la suppression de vos données à tout moment.",
  },
  {
    question: "Combien coûte le service ?",
    answer:
      "Le diagnostic initial est gratuit et sans engagement. Les formules payantes démarrent à partir de 49 €/mois selon la complexité de votre patrimoine. Vous ne payez que si l'économie fiscale estimée dépasse nos honoraires.",
  },
  {
    question: "L'IA remplace-t-elle mon comptable ?",
    answer:
      "Non. Fiscal AI complète votre expert-comptable en détectant des opportunités qu'il n'a pas le temps d'explorer. Nous travaillons en synergie avec votre cabinet ou vous mettons en relation avec un partenaire agréé.",
  },
  {
    question: "Que se passe-t-il en cas de contrôle fiscal ?",
    answer:
      "Chaque optimisation est documentée avec les textes de loi applicables et les justificatifs nécessaires. En cas de contrôle, notre équipe vous accompagne pour présenter un dossier cohérent et traçable.",
  },
];

export function FAQ() {
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  return (
    <section id="faq" className="border-t border-stone-200 py-20 sm:py-28">
      <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
        <SectionHeading
          label="FAQ"
          title="Questions fréquentes"
          description="Tout ce que vous devez savoir avant de lancer votre diagnostic fiscal gratuit."
        />

        <div className="mt-12 space-y-3">
          {faqs.map((faq, index) => {
            const isOpen = openIndex === index;
            return (
              <div
                key={faq.question}
                className="overflow-hidden rounded-xl border border-stone-200 bg-card"
              >
                <button
                  type="button"
                  className="flex w-full items-center justify-between gap-4 px-6 py-5 text-left text-sm font-medium sm:text-base"
                  onClick={() => setOpenIndex(isOpen ? null : index)}
                  aria-expanded={isOpen}
                >
                  {faq.question}
                  <svg
                    className={`h-5 w-5 shrink-0 text-accent transition-transform ${isOpen ? "rotate-180" : ""}`}
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
                {isOpen && (
                  <div className="border-t border-stone-200 px-6 pb-5 pt-0">
                    <p className="text-sm leading-relaxed text-stone-600">{faq.answer}</p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
