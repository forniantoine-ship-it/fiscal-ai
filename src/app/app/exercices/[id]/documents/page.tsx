"use client";

import Link from "next/link";
import { DocumentChecklist } from "@/components/lmnp/documents/DocumentChecklist";
import { DocumentUploadPanel } from "@/components/lmnp/documents/DocumentUploadPanel";
import { useLmnp } from "@/lib/lmnp/store";

export default function DocumentsPage() {
  const { workspace } = useLmnp();
  const base = `/app/exercices/${workspace.fiscalYear.id}`;
  const isAnalyzing = workspace.documents.some(
    (d) => d.status === "uploaded" || d.status === "processing",
  );

  return (
    <div className="mx-auto max-w-lg animate-fade-in px-4 py-12 sm:py-16">
      <Link href={base} className="text-[12px] text-stone-400 hover:text-stone-600">
        ← Déclaration
      </Link>
      <h1 className="mt-10 text-2xl font-normal tracking-tight text-stone-800">
        {isAnalyzing ? "Analyse en cours" : "Vos documents"}
      </h1>
      <p className="mt-3 text-[15px] text-stone-500">
        Déposez vos pièces — l’IA extrait les montants en silence.
      </p>
      <div className="mt-10 space-y-8">
        <DocumentUploadPanel />
        {!isAnalyzing && workspace.documents.length > 0 && <DocumentChecklist />}
      </div>
    </div>
  );
}
