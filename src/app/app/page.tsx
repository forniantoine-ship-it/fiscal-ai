"use client";

import Link from "next/link";
import { useLmnp } from "@/lib/lmnp/store";

export default function MesDeclarationsPage() {
  const { workspace, isReady } = useLmnp();

  if (!isReady) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center text-sm text-stone-500">
        Chargement…
      </div>
    );
  }

  const base = `/app/exercices/${workspace.fiscalYear.id}`;
  const { fiscalYear } = workspace;
  const statusLabel = fiscalYear.transmittedAt
    ? "Transmise"
    : fiscalYear.paidAt
      ? "À transmettre"
      : "En cours";

  return (
    <div className="mx-auto max-w-md animate-fade-in px-6 py-16 sm:py-24">
      <h1
        className="text-center text-2xl font-normal text-stone-800"
        style={{ fontFamily: "var(--font-display), Georgia, serif" }}
      >
        Mes déclarations
      </h1>
      <p className="mt-3 text-center text-[14px] text-stone-500">
        Retrouvez vos dossiers LMNP et reprenez là où vous vous êtes arrêté.
      </p>

      <Link
        href={base}
        className="mt-10 block rounded-[var(--radius-xl)] bg-card/90 px-6 py-5 shadow-[var(--shadow-soft)] transition-colors hover:bg-card"
      >
        <p className="text-[15px] font-medium text-stone-800">LMNP {fiscalYear.year}</p>
        <p className="mt-1 text-[12px] text-stone-500">{statusLabel}</p>
      </Link>

      <div className="mt-10 flex flex-col items-center gap-3">
        <Link
          href={`${base}/documents`}
          className="text-[12px] text-stone-500 hover:text-stone-700"
        >
          Voir les documents
        </Link>
        <Link href="/" className="text-[12px] text-stone-400 hover:text-stone-600">
          Retour à l&apos;accueil du site
        </Link>
      </div>
    </div>
  );
}
