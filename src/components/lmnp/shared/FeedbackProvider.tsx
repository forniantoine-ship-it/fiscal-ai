"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { FeedbackToastStack } from "./FeedbackToast";

export type FeedbackKind = "success" | "error" | "info";

export interface FeedbackMessage {
  id: string;
  kind: FeedbackKind;
  title: string;
  description?: string;
  href?: string;
}

interface FeedbackContextValue {
  showSuccess: (title: string, description?: string, href?: string) => void;
  showError: (title: string, description?: string) => void;
  showInfo: (title: string, description?: string, href?: string) => void;
}

const FeedbackContext = createContext<FeedbackContextValue | null>(null);

export function FeedbackProvider({ children }: { children: ReactNode }) {
  const [messages, setMessages] = useState<FeedbackMessage[]>([]);

  const dismiss = useCallback((id: string) => {
    setMessages((current) => current.filter((m) => m.id !== id));
  }, []);

  const push = useCallback(
    (kind: FeedbackKind, title: string, description?: string, href?: string) => {
      const id = crypto.randomUUID();
      setMessages((current) => [...current, { id, kind, title, description, href }]);
      window.setTimeout(() => dismiss(id), 5500);
    },
    [dismiss],
  );

  const value = useMemo(
    () => ({
      showSuccess: (title: string, description?: string, href?: string) =>
        push("success", title, description, href),
      showError: (title: string, description?: string) => push("error", title, description),
      showInfo: (title: string, description?: string, href?: string) =>
        push("info", title, description, href),
    }),
    [push],
  );

  return (
    <FeedbackContext.Provider value={value}>
      {children}
      <FeedbackToastStack messages={messages} onDismiss={dismiss} />
    </FeedbackContext.Provider>
  );
}

export function useFeedback(): FeedbackContextValue {
  const ctx = useContext(FeedbackContext);
  if (!ctx) throw new Error("useFeedback must be used within FeedbackProvider");
  return ctx;
}
