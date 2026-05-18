import type { Metadata } from "next";
import { LmnpOnboarding } from "@/components/onboarding/lmnp/LmnpOnboarding";

export const metadata: Metadata = {
  title: "Déclaration LMNP — Onboarding | Fiscal AI",
  description:
    "Parcours guidé pour votre déclaration LMNP en France : documents, OCR, bien locatif et assistant IA.",
};

export default function LmnpOnboardingPage() {
  return (
    <div className="min-h-screen">
      <LmnpOnboarding />
    </div>
  );
}
