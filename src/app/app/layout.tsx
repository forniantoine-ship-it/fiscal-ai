import { LmnpProvider } from "@/lib/lmnp/store";
import { FeedbackProvider } from "@/components/lmnp/shared/FeedbackProvider";
import { AppLayoutClient } from "./AppLayoutClient";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Mon dossier LMNP | Fiscal AI",
  description: "Copilote LMNP — documents, validation et suivi de dossier.",
};

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <LmnpProvider>
      <FeedbackProvider>
        <div className="gradient-mesh min-h-screen">
          <AppLayoutClient>{children}</AppLayoutClient>
        </div>
      </FeedbackProvider>
    </LmnpProvider>
  );
}
