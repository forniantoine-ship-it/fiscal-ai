import Link from "next/link";

export function SiteFooter() {
  return (
    <footer className="border-t border-stone-200/80 py-14">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-6 px-6 sm:flex-row">
        <div className="text-center sm:text-left">
          <p className="text-sm font-medium text-stone-700">Fiscal AI</p>
          <p className="mt-1 text-[12px] text-stone-500">
            Déclaration LMNP guidée — simple, conforme, rassurante.
          </p>
        </div>
        <div className="flex gap-6 text-[12px] text-stone-500">
          <Link href="/app" className="hover:text-stone-700">
            Mon dossier
          </Link>
          <a href="mailto:contact@fiscal-ai.fr" className="hover:text-stone-700">
            Contact
          </a>
        </div>
      </div>
    </footer>
  );
}
