"use client";

import { useEffect, useRef, useState } from "react";
import type { ChatMessage, OnboardingStepId } from "./types";

interface AiAssistantChatProps {
  currentStep: OnboardingStepId;
  isOpen: boolean;
  onToggle: () => void;
}

const STEP_HINTS: Record<OnboardingStepId, string> = {
  welcome:
    "Bienvenue ! Je vous guide pour votre déclaration LMNP 2025. Posez-moi vos questions sur le régime réel ou micro-BIC.",
  documents:
    "Déposez vos baux, quittances et factures de charges. L'OCR extraira automatiquement les montants clés.",
  ocr: "L'analyse OCR vérifie la cohérence de vos pièces. Vous pourrez corriger les champs détectés à l'étape suivante.",
  property:
    "Renseignez les informations du bien : adresse, prix d'acquisition, loyers annuels et régime fiscal choisi.",
  review:
    "Vérifiez le récapitulatif avant génération de votre liasse 2031 / 2033. Tout est modifiable en revenant en arrière.",
};

const QUICK_PROMPTS = [
  "Quelle différence entre micro-BIC et réel ?",
  "Quels documents sont obligatoires ?",
  "Puis-je déduire les intérêts d'emprunt ?",
  "Comment fonctionne l'amortissement ?",
];

function getAssistantReply(input: string, step: OnboardingStepId): string {
  const q = input.toLowerCase();

  if (q.includes("micro") || q.includes("réel") || q.includes("reel")) {
    return "En LMNP, le micro-BIC (abattement 50 %, plafond 77 700 €) convient aux petits loyers. Le régime réel permet de déduire charges réelles et d'amortir le bien et le mobilier — souvent plus avantageux au-delà de ~15 000 € de loyers annuels.";
  }
  if (q.includes("document") || q.includes("obligatoire") || q.includes("pièce")) {
    return "Pour une déclaration complète : bail meublé, relevés de loyers, factures de charges (copropriété, assurance, travaux), taxe foncière, tableau d'amortissement si régime réel, et attestation d'emprunt pour les intérêts.";
  }
  if (q.includes("intérêt") || q.includes("emprunt") || q.includes("crédit")) {
    return "Oui, en régime réel LMNP, les intérêts d'emprunt liés à l'acquisition ou aux travaux du bien locatif sont déductibles des revenus BIC, dans la limite des revenus fonciers de l'année.";
  }
  if (q.includes("amort")) {
    return "L'amortissement répartit le coût du bien (hors terrain, ~80 % du prix) et du mobilier sur plusieurs années. Il réduit le bénéfice imposable sans sortie de trésorerie — atout majeur du régime réel.";
  }
  if (q.includes("lmnp") || q.includes("lmp")) {
    return "Le LMNP (Loueur Meublé Non Professionnel) concerne la location meublée sans activité principale. Vous déclarez en BIC, formulaires 2031 et annexes 2033, avec possibilité de TVA si recettes > seuils.";
  }

  return `Merci pour votre question. ${STEP_HINTS[step]} N'hésitez pas à préciser votre situation (régime, montant des loyers, travaux récents).`;
}

export function AiAssistantChat({ currentStep, isOpen, onToggle }: AiAssistantChatProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: "welcome",
      role: "assistant",
      content: STEP_HINTS.welcome,
      timestamp: new Date(),
    },
  ]);
  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const prevStepRef = useRef<OnboardingStepId | null>(null);

  useEffect(() => {
    if (prevStepRef.current === currentStep) return;
    if (prevStepRef.current !== null) {
      setMessages((prev) => [
        ...prev,
        {
          id: `step-${currentStep}-${Date.now()}`,
          role: "assistant",
          content: STEP_HINTS[currentStep],
          timestamp: new Date(),
        },
      ]);
    }
    prevStepRef.current = currentStep;
  }, [currentStep]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, isTyping]);

  const sendMessage = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;

    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      role: "user",
      content: trimmed,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setIsTyping(true);

    setTimeout(() => {
      setMessages((prev) => [
        ...prev,
        {
          id: `assistant-${Date.now()}`,
          role: "assistant",
          content: getAssistantReply(trimmed, currentStep),
          timestamp: new Date(),
        },
      ]);
      setIsTyping(false);
    }, 800 + Math.random() * 600);
  };

  const panel = (
    <div
      className={`flex flex-col overflow-hidden rounded-2xl border border-stone-200 bg-card shadow-2xl shadow-black/40 ${
        isOpen ? "h-full" : "hidden lg:flex lg:h-full"
      }`}
    >
      <div className="flex items-center gap-3 border-b border-stone-200 bg-stone-100/80 px-4 py-3">
        <div className="relative flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-accent to-stone-400">
          <svg className="h-4 w-4 text-white" fill="currentColor" viewBox="0 0 24 24">
            <path d="M12 2a2 2 0 012 2c0 .74-.4 1.39-1 1.73V7h1a7 7 0 017 7h1a1 1 0 110 2h-1v1a7 7 0 01-7 7h-1v1.27c.6.34 1 .99 1 1.73a2 2 0 11-4 0c0-.74.4-1.39 1-1.73V17h-1a7 7 0 01-7-7h-1a1 1 0 110-2h1v-1a7 7 0 017-7h1V5.73c-.6-.34-1-.99-1-1.73a2 2 0 012-2z" />
          </svg>
          <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-card bg-accent" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-stone-900">Assistant Fiscal LMNP</p>
          <p className="text-xs text-accent/90">En ligne · Expertise 2031/2033</p>
        </div>
        <button
          type="button"
          onClick={onToggle}
          className="rounded-lg p-2 text-stone-500 hover:bg-stone-100 hover:text-stone-700 lg:hidden"
          aria-label="Fermer l'assistant"
        >
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto p-4">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`max-w-[90%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                msg.role === "user"
                  ? "bg-accent-muted text-white ring-1 ring-accent/25"
                  : "bg-stone-100 text-stone-700 ring-1 ring-stone-200"
              }`}
            >
              {msg.content}
            </div>
          </div>
        ))}
        {isTyping && (
          <div className="flex justify-start">
            <div className="flex gap-1 rounded-2xl bg-stone-100 px-4 py-3 ring-1 ring-stone-200">
              <span className="h-2 w-2 animate-bounce rounded-full bg-accent [animation-delay:0ms]" />
              <span className="h-2 w-2 animate-bounce rounded-full bg-accent [animation-delay:150ms]" />
              <span className="h-2 w-2 animate-bounce rounded-full bg-accent [animation-delay:300ms]" />
            </div>
          </div>
        )}
      </div>

      <div className="border-t border-stone-200 p-3">
        <div className="mb-2 flex flex-wrap gap-1.5">
          {QUICK_PROMPTS.map((prompt) => (
            <button
              key={prompt}
              type="button"
              onClick={() => sendMessage(prompt)}
              className="rounded-full bg-stone-100 px-2.5 py-1 text-[10px] text-stone-600 ring-1 ring-stone-200 transition-colors hover:bg-accent/10 hover:text-accent"
            >
              {prompt}
            </button>
          ))}
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            sendMessage(input);
          }}
          className="flex gap-2"
        >
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Posez votre question LMNP…"
            className="flex-1 rounded-xl border border-stone-200 bg-stone-100 px-3 py-2.5 text-sm text-stone-900 placeholder:text-stone-500 focus:border-accent/40 focus:outline-none focus:ring-1 focus:ring-accent/25"
          />
          <button
            type="submit"
            disabled={!input.trim() || isTyping}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent text-white transition-colors hover:opacity-90 disabled:opacity-40"
            aria-label="Envoyer"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
            </svg>
          </button>
        </form>
      </div>
    </div>
  );

  return (
    <>
      <button
        type="button"
        onClick={onToggle}
        className="fixed bottom-6 right-6 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-accent to-stone-400 shadow-lg shadow-stone-900/5 transition-transform hover:scale-105 lg:hidden"
        aria-label="Ouvrir l'assistant IA"
      >
        <svg className="h-6 w-6 text-white" fill="currentColor" viewBox="0 0 24 24">
          <path d="M12 2a2 2 0 012 2c0 .74-.4 1.39-1 1.73V7h1a7 7 0 017 7h1a1 1 0 110 2h-1v1a7 7 0 01-7 7h-1v1.27c.6.34 1 .99 1 1.73a2 2 0 11-4 0c0-.74.4-1.39 1-1.73V17h-1a7 7 0 01-7-7h-1a1 1 0 110-2h1v-1a7 7 0 017-7h1V5.73c-.6-.34-1-.99-1-1.73a2 2 0 012-2z" />
        </svg>
      </button>

      {isOpen && (
        <div className="fixed inset-0 z-50 flex flex-col bg-background/95 p-4 pt-20 backdrop-blur-sm lg:hidden">
          <div className="flex h-full min-h-0 flex-col">{panel}</div>
        </div>
      )}

      <div className="hidden lg:block lg:h-[calc(100vh-8rem)] lg:sticky lg:top-28">{panel}</div>
    </>
  );
}
