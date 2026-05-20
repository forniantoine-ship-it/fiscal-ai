"use client";

import Link from "next/link";
import type { FeedbackMessage } from "./FeedbackProvider";

const KIND_STYLES = {
  success: "border-emerald-500/30 bg-emerald-500/10",
  error: "border-red-500/30 bg-red-500/10",
  info: "border-blue-500/30 bg-blue-500/10",
} as const;

const KIND_TITLE = {
  success: "text-emerald-300",
  error: "text-red-300",
  info: "text-blue-300",
} as const;

interface FeedbackToastStackProps {
  messages: FeedbackMessage[];
  onDismiss: (id: string) => void;
}

export function FeedbackToastStack({ messages, onDismiss }: FeedbackToastStackProps) {
  if (messages.length === 0) return null;

  return (
    <div
      className="pointer-events-none fixed bottom-4 right-4 z-[100] flex w-full max-w-sm flex-col gap-2 px-4 sm:px-0"
      aria-live="polite"
    >
      {messages.map((message) => (
        <div
          key={message.id}
          className={`pointer-events-auto rounded-xl border p-4 shadow-xl backdrop-blur-md ${KIND_STYLES[message.kind]}`}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className={`text-sm font-semibold ${KIND_TITLE[message.kind]}`}>
                {message.title}
              </p>
              {message.description && (
                <p className="mt-1 text-xs leading-relaxed text-zinc-400">{message.description}</p>
              )}
              {message.href && (
                <Link
                  href={message.href}
                  className="mt-2 inline-block text-xs font-medium text-emerald-400 hover:text-emerald-300"
                >
                  Voir →
                </Link>
              )}
            </div>
            <button
              type="button"
              onClick={() => onDismiss(message.id)}
              className="shrink-0 text-zinc-500 hover:text-zinc-300"
              aria-label="Fermer"
            >
              ×
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
