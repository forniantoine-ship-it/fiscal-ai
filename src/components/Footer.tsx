import { Button } from "./ui/Button";

export function Footer() {
  return (
    <footer className="border-t border-white/5 bg-zinc-950 py-12">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col items-center justify-between gap-8 sm:flex-row">
          <div className="text-center sm:text-left">
            <a href="#" className="flex items-center justify-center gap-2 sm:justify-start">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/20 text-sm font-bold text-emerald-400">
                F
              </span>
              <span className="text-lg font-semibold">
                Fiscal<span className="text-emerald-400">AI</span>
              </span>
            </a>
            <p className="mt-2 max-w-xs text-sm text-zinc-500">
              Optimisation fiscale intelligente pour les contribuables français.
            </p>
          </div>

          <Button href="#contact">Diagnostic gratuit</Button>
        </div>

        <div className="mt-10 flex flex-col items-center justify-between gap-4 border-t border-white/5 pt-8 text-xs text-zinc-600 sm:flex-row">
          <p>© {new Date().getFullYear()} Fiscal AI. Tous droits réservés.</p>
          <nav className="flex flex-wrap justify-center gap-6">
            <a href="#" className="hover:text-zinc-400">
              Mentions légales
            </a>
            <a href="#" className="hover:text-zinc-400">
              Confidentialité
            </a>
            <a href="#" className="hover:text-zinc-400">
              CGU
            </a>
            <a href="mailto:contact@fiscal-ai.fr" className="hover:text-zinc-400">
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
