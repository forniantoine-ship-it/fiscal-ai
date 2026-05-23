import Link from "next/link";

export function SiteFooter() {
  return (
    <footer className="py-16 sm:py-20">
      <div className="mx-auto flex max-w-5xl flex-col items-center justify-between gap-8 px-6 sm:flex-row sm:items-start">
        <div className="text-center sm:text-left">
          <p className="text-[14px] font-medium text-stone-700">Fiscal AI</p>
          <p className="mt-2 max-w-xs text-[13px] leading-relaxed text-stone-500">
            La déclaration LMNP, enfin aussi simple qu’un service que vous utilisez au quotidien.
          </p>
        </div>
        <div className="flex flex-wrap justify-center gap-x-8 gap-y-2 text-[13px] text-stone-500 sm:justify-end">
          <Link href="/app" className="transition-colors hover:text-stone-700">
            Mon dossier
          </Link>
          <a href="mailto:contact@fiscal-ai.fr" className="transition-colors hover:text-stone-700">
            Contact
          </a>
        </div>
      </div>
    </footer>
  );
}
