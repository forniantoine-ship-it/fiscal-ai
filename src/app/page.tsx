import Link from "next/link";
import { PrimaryButton, SecondaryButton } from "@/components/lmnp/design-system";
import { LandingFaq } from "./landing-faq";

const serif = { fontFamily: "var(--font-display), Georgia, serif" } as const;

const steps = [
  {
    label: "Vous déposez",
    title: "Vos documents, un par un",
    body: "Le parcours vous guide. Baux, quittances, relevés — sans classeur, sans Excel.",
  },
  {
    label: "Nous préparons",
    title: "Le dossier se remplit en silence",
    body: "Les montants sont lus et rangés. La comptabilité avance pendant que vous avancez.",
  },
  {
    label: "Vous validez",
    title: "Quelques confirmations",
    body: "Un regard sur l’essentiel. Vous gardez le contrôle, sans calculatrice.",
  },
  {
    label: "C’est transmis",
    title: "La déclaration part",
    body: "Liasse, PDF, envoi EDI — la fin du parcours, sans démarche obscure.",
  },
];

function HeroProductPreview() {
  const prepared = [
    "Loyers et charges classés",
    "Amortissements calculés",
    "Liasse structurée",
  ];

  return (
    <div className="relative">
      <div
        className="pointer-events-none absolute -inset-4 rounded-[2rem] bg-[radial-gradient(ellipse_at_center,rgba(232,180,184,0.12),transparent_70%)]"
        aria-hidden
      />
      <div className="relative overflow-hidden rounded-[1.35rem] bg-white/95 shadow-[0_32px_90px_rgba(41,37,36,0.07),0_1px_0_rgba(255,255,255,0.8)_inset] ring-1 ring-stone-200/60">
        <div className="border-b border-stone-100/80 bg-gradient-to-b from-[#faf7f2] to-white px-7 py-6 sm:px-8 sm:py-7">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[11px] tracking-[0.06em] text-stone-400 uppercase">
                Dossier LMNP · 2025
              </p>
              <p className="mt-3 text-[1.2rem] leading-snug text-stone-800 sm:text-[1.35rem]" style={serif}>
                Déjà préparé pour vous
              </p>
            </div>
            <span className="shrink-0 rounded-full bg-[#f0ebe4] px-3 py-1 text-[11px] text-stone-600">
              En attente de validation
            </span>
          </div>
        </div>

        <div className="space-y-6 px-7 py-6 sm:px-8 sm:py-7">
          <div>
            <p className="text-[11px] text-stone-400">Traitement silencieux</p>
            <ul className="mt-3 space-y-2">
              {prepared.map((item) => (
                <li key={item} className="flex items-center gap-3 text-[13px] text-stone-600">
                  <span className="h-1 w-1 shrink-0 rounded-full bg-stone-400" aria-hidden />
                  {item}
                </li>
              ))}
            </ul>
          </div>

          <div className="space-y-2">
            <p className="text-[11px] text-stone-400">Il vous reste à confirmer</p>
            {[
              { label: "Loyers perçus", value: "14 280 €" },
              { label: "Charges déductibles", value: "1 940 €" },
            ].map((row) => (
              <div
                key={row.label}
                className="flex items-center justify-between rounded-2xl bg-[#f7f4ef]/90 px-4 py-3"
              >
                <span className="text-[13px] text-stone-600">{row.label}</span>
                <span className="text-[13px] tabular-nums text-stone-800">{row.value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Home() {
  return (
    <>
      <header className="fixed inset-x-0 top-0 z-50 border-b border-stone-200/30 bg-[#f6f3ee]/80 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
          <Link href="/" className="text-[14px] font-medium text-stone-800">
            Fiscal AI
          </Link>
          <nav className="hidden items-center gap-8 md:flex" aria-label="Navigation">
            <a href="#parcours" className="text-[13px] text-stone-500 hover:text-stone-800">
              Parcours
            </a>
            <a href="#tarif" className="text-[13px] text-stone-500 hover:text-stone-800">
              Tarif
            </a>
            <a href="#faq" className="text-[13px] text-stone-500 hover:text-stone-800">
              FAQ
            </a>
            <PrimaryButton href="/app" className="!px-5 !py-2 text-[13px]">
              Commencer
            </PrimaryButton>
          </nav>
          <Link href="/app" className="text-[13px] font-medium text-stone-700 md:hidden">
            Commencer →
          </Link>
        </div>
      </header>

      <main className="overflow-x-hidden">
        <section className="relative overflow-hidden border-b border-stone-200/30 bg-[#ebe3d8]/50 pt-[5.5rem] pb-20 sm:pt-36 sm:pb-28 lg:pb-32">
          <div
            className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_90%_70%_at_0%_-10%,rgba(232,180,184,0.16),transparent_55%),radial-gradient(ellipse_60%_50%_at_100%_20%,rgba(245,240,234,0.9),transparent_50%)]"
            aria-hidden
          />

          <div className="relative mx-auto max-w-6xl px-6 lg:px-8">
            <div className="grid items-end gap-14 lg:grid-cols-[minmax(0,1.08fr)_minmax(0,0.92fr)] lg:gap-12 xl:gap-20">
              <div className="max-w-[36rem] text-left">
                <p className="text-[11px] font-medium tracking-[0.12em] text-stone-500 uppercase">
                  LMNP · France
                </p>

                <p className="mt-8 max-w-[32ch] text-[1.05rem] leading-[1.55] text-stone-600 sm:text-[1.125rem] sm:leading-[1.6]">
                  La comptabilité LMNP complexe est déjà traitée pour vous — amortissements,
                  charges, liasse.
                </p>

                <h1
                  className="mt-5 text-[2.75rem] leading-[1.04] tracking-[-0.02em] text-stone-900 sm:mt-6 sm:text-[3.5rem] lg:text-[4rem] lg:leading-[1.02]"
                  style={serif}
                >
                  Votre déclaration,
                  <br />
                  <span className="text-stone-500">enfin simple.</span>
                </h1>

                <p className="mt-8 max-w-[38ch] text-[17px] leading-[1.7] text-stone-500">
                  Déposez vos documents, validez l’essentiel. Pendant ce temps, le dossier se
                  construit en silence — sans jargon, sans tableur, sans stress.
                </p>

                <div className="mt-12 flex flex-wrap items-center gap-4">
                  <PrimaryButton href="/app">Commencer ma déclaration</PrimaryButton>
                  <SecondaryButton href="#parcours" className="!border-transparent !bg-transparent !px-0 !shadow-none hover:!bg-transparent">
                    Voir le parcours →
                  </SecondaryButton>
                </div>

                <div className="mt-14 flex items-baseline gap-3 text-stone-600">
                  <span className="text-[1.5rem] leading-none text-stone-800" style={serif}>
                    149 €
                  </span>
                  <span className="text-[14px] text-stone-500">
                    TTC · une fois par an · EDI inclus
                  </span>
                </div>
              </div>

              <div className="lg:pb-2">
                <p className="mb-5 max-w-[22ch] text-[13px] leading-relaxed text-stone-500">
                  Ce que vous voyez après vos documents — le travail comptable, déjà fait.
                </p>
                <HeroProductPreview />
              </div>
            </div>
          </div>
        </section>

        <section className="bg-[#e8dfd3]/35 px-6 py-16 sm:py-20">
          <div className="mx-auto max-w-3xl text-left sm:text-center">
            <p
              className="text-[1.35rem] leading-[1.45] text-stone-800 sm:text-[1.65rem]"
              style={serif}
            >
              « La partie comptable avance pendant que je vis ma vie. »
            </p>
            <p className="mt-5 max-w-xl text-[16px] leading-[1.75] text-stone-500 sm:mx-auto">
              C’est l’intention du produit : vous garder l’esprit léger, avec la certitude que le
              dossier se construit correctement.
            </p>
          </div>
        </section>

        <section id="parcours" className="px-6 py-20 sm:py-28">
          <div className="mx-auto max-w-6xl">
            <div className="max-w-lg text-left">
              <p className="text-[11px] tracking-[0.12em] text-stone-500 uppercase">Le parcours</p>
              <h2
                className="mt-4 text-[2rem] leading-tight text-stone-900 sm:text-[2.35rem]"
                style={serif}
              >
                Quatre moments.
                <br />
                Une seule promesse.
              </h2>
            </div>
            <ol className="mt-14 grid gap-8 sm:grid-cols-2 sm:gap-x-12 sm:gap-y-10 lg:mt-16">
              {steps.map((step) => (
                <li key={step.title} className="rounded-2xl bg-white/70 p-7 ring-1 ring-stone-200/50">
                  <p className="text-[12px] text-stone-400">{step.label}</p>
                  <h3 className="mt-2 text-[17px] font-medium text-stone-800">{step.title}</h3>
                  <p className="mt-3 text-[15px] leading-relaxed text-stone-500">{step.body}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section
          id="tarif"
          className="border-y border-stone-200/40 bg-[#ece4da]/30 px-6 py-20 sm:py-24"
        >
          <div className="mx-auto max-w-lg text-left">
            <p className="text-[11px] tracking-[0.12em] text-stone-500 uppercase">Tarif</p>
            <h2
              className="mt-4 text-[2rem] leading-tight text-stone-900 sm:text-[2.2rem]"
              style={serif}
            >
              Un prix clair. Une fois par an.
            </h2>
            <div className="mt-10 rounded-2xl bg-white/80 p-8 ring-1 ring-stone-200/60 sm:p-10">
              <p className="text-[13px] text-stone-500">Par bien · par déclaration</p>
              <p className="mt-4">
                <span className="text-[3.5rem] leading-none text-stone-900" style={serif}>
                  149 €
                </span>
                <span className="ml-2 text-[16px] text-stone-500">TTC</span>
              </p>
              <p className="mt-2 text-[14px] text-stone-500">Télétransmission EDI incluse</p>
              <ul className="mt-8 space-y-2.5 text-[14px] text-stone-600">
                <li>Déclaration LMNP générée</li>
                <li>Amortissements calculés</li>
                <li>PDF de votre liasse</li>
              </ul>
              <div className="mt-8">
                <PrimaryButton href="/app">Commencer ma déclaration</PrimaryButton>
              </div>
            </div>
          </div>
        </section>

        <section id="faq" className="px-6 py-20 sm:py-24">
          <div className="mx-auto max-w-xl text-left">
            <p className="text-[11px] tracking-[0.12em] text-stone-500 uppercase">Questions</p>
            <h2 className="mt-4 text-[1.85rem] text-stone-900 sm:text-[2rem]" style={serif}>
              Ce que l’on nous demande souvent
            </h2>
            <LandingFaq />
          </div>
        </section>

        <section className="px-6 pb-24 pt-4 sm:pb-32">
          <div className="mx-auto max-w-2xl rounded-[1.35rem] bg-[#e8dfd3]/45 px-8 py-14 text-left sm:px-12 sm:py-16 sm:text-center">
            <h2 className="text-[1.75rem] leading-tight text-stone-900 sm:text-[2rem]" style={serif}>
              Votre déclaration LMNP,
              <br />
              enfin à votre image.
            </h2>
            <p className="mt-5 text-[16px] leading-relaxed text-stone-500 sm:mx-auto sm:max-w-md">
              Ouvrez votre dossier, déposez vos pièces — le reste avance avec vous.
            </p>
            <div className="mt-8 sm:flex sm:justify-center">
              <PrimaryButton href="/app">Commencer ma déclaration</PrimaryButton>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-stone-200/40 px-6 py-12">
        <div className="mx-auto flex max-w-6xl flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-[14px] font-medium text-stone-800">Fiscal AI</p>
            <p className="mt-1 text-[13px] text-stone-500">
              Déclaration LMNP — calme, claire, sans jargon.
            </p>
          </div>
          <div className="flex gap-8 text-[13px] text-stone-500">
            <Link href="/app" className="hover:text-stone-800">
              Mon dossier
            </Link>
            <a href="mailto:contact@fiscal-ai.fr" className="hover:text-stone-800">
              Contact
            </a>
          </div>
        </div>
      </footer>
    </>
  );
}
