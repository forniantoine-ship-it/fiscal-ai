import { Button } from "./ui/Button";

export function Footer() {
  return (
    <footer className="border-t border-stone-200 bg-subtle py-12">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col items-center justify-between gap-8 sm:flex-row">
          <div className="text-center sm:text-left">
            <a href="#" className="flex items-center justify-center gap-2 sm:justify-start">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/20 text-sm font-bold text-accent">
                F
              </span>
              <span className="text-lg font-semibold">
                Fiscal<span className="text-accent">AI</span>
              </span>
            </a>
            <p className="mt-2 max-w-xs text-sm text-stone-500">
              Optimisation fiscale intelligente pour les contribuables français.
            </p>
          </div>

          <Button href="#contact">Diagnostic gratuit</Button>
        </div>

        <div className="mt-10 flex flex-col items-center justify-between gap-4 border-t border-stone-200 pt-8 text-xs text-stone-500 sm:flex-row">
          <p>© {new Date().getFullYear()} Fiscal AI. Tous droits réservés.</p>
          <nav className="flex flex-wrap justify-center gap-6">
            <a href="#" className="hover:text-stone-600">
              Mentions légales
            </a>
            <a href="#" className="hover:text-stone-600">
              Confidentialité
            </a>
            <a href="#" className="hover:text-stone-600">
              CGU
            </a>
            <a href="mailto:contact@fiscal-ai.fr" className="hover:text-stone-600">
              contact@fiscal-ai.fr
            </a>
          </nav>
        </div>

        <p className="mt-6 text-center text-xs text-zinc-700">
          Fiscal AI ne constitue pas un conseil juridique. Consultez un professionnel agréé pour
          toute décision fiscale engageante.
        </p>
      </div>
    </footer>
  );
}
