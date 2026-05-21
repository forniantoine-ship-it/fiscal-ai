import { Button } from "./ui/Button";

export function CTABanner() {
  return (
    <section className="py-12 sm:py-16">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <div className="relative overflow-hidden rounded-3xl border border-emerald-500/20 bg-gradient-to-br from-emerald-500/10 via-zinc-900 to-amber-500/5 px-8 py-12 text-center sm:px-16 sm:py-16">
          <div className="absolute -right-20 -top-20 h-60 w-60 rounded-full bg-accent-subtle blur-3xl" />
          <div className="absolute -bottom-20 -left-20 h-60 w-60 rounded-full bg-amber-500/10 blur-3xl" />
          <div className="relative">
            <h2
              className="text-3xl font-normal sm:text-4xl"
              style={{ fontFamily: "var(--font-display), Georgia, serif" }}
            >
              Prêt à payer moins d&apos;impôts, légalement ?
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-stone-600">
              Rejoignez plus de 2 400 contribuables qui ont déjà optimisé leur fiscalité avec
              Fiscal AI. Diagnostic gratuit, sans engagement.
            </p>
            <div className="mt-8 flex flex-col items-center justify-center gap-4 sm:flex-row">
              <Button href="#contact">Commencer maintenant</Button>
              <Button variant="secondary" href="#faq">
                En savoir plus
              </Button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
