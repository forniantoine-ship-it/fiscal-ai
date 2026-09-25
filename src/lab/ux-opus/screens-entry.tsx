"use client";

import { useEffect, useRef, useState } from "react";

import { MobileBar, PageTitle } from "./chrome";
import { useLab, useScenario } from "./context";
import type { ScenarioId } from "./model";
import { SCENARIOS, visibleDocs } from "./scenarios";
import { navigate, routeHash } from "./store";
import { Card, Eyebrow, Icon, PrimaryButton, SecondaryButton, serif } from "./ui";

// ─── Index du laboratoire ────────────────────────────────────────────────────

export function HomeScreen() {
  const { all } = useLab();
  const ids: ScenarioId[] = ["a", "b", "c"];
  return (
    <main className="mx-auto max-w-[1180px] px-4 pb-24 pt-10 md:px-8 md:pt-16">
      <PageTitle
        eyebrow="Laboratoire UX · Assistant du Réel"
        title={
          <>
            Vous déposez.
            <br />
            <span className="text-[var(--o-accent-text)]">Fiscal AI fait le reste</span> — et vous montre tout.
          </>
        }
        lead="Trois situations réelles, rejouables. Dans chacune, l’utilisateur ne choisit jamais un assistant ni une rubrique : il dépose ce qu’il a, répond seulement à ce que ses documents ne disent pas, puis vérifie autant qu’il le souhaite."
      />

      <div className="mt-10 grid gap-4 md:grid-cols-3">
        {ids.map((id) => {
          const def = SCENARIOS[id];
          const started = all[id].phase !== "start";
          return (
            <Card key={id} className="flex flex-col p-6">
              <div className="flex items-center justify-between">
                <span className={`${serif} grid h-11 w-11 place-items-center rounded-full bg-[var(--o-accent-soft-2)] text-[20px] text-[var(--o-accent-strong)]`}>{id.toUpperCase()}</span>
                <span className="text-[13px] text-[var(--o-ink-3)]">Exercice {def.year}</span>
              </div>
              <h2 className={`${serif} mt-5 text-[26px] leading-tight text-[var(--o-ink)]`}>{def.label}</h2>
              <p className="mt-2 text-[14.5px] leading-6 text-[var(--o-ink-2)]">{def.persona}</p>
              <p className="mt-3 text-[14.5px] leading-6 text-[var(--o-ink)]">{def.pitch}</p>
              {id === "c" && <p className="mt-3 text-[13px] leading-5 text-[var(--o-ink-3)]">Reprend les réponses données dans le scénario A, si vous l’avez joué.</p>}
              <div className="mt-auto pt-6">
                <PrimaryButton className="w-full" onClick={() => navigate(routeHash({ scenario: id, screen: started ? "dossier" : "start" }))}>
                  {started ? "Reprendre" : "Tester ce scénario"}
                  <Icon name="arrow" />
                </PrimaryButton>
              </div>
            </Card>
          );
        })}
      </div>

      <section className="mt-14 grid gap-8 md:grid-cols-[1fr_1.4fr]">
        <div>
          <Eyebrow>Ce que ce prototype met à l’épreuve</Eyebrow>
          <h2 className={`${serif} mt-2 text-[28px] leading-tight text-[var(--o-ink)]`}>Le moteur ne change pas. Sa façon de parler, si.</h2>
        </div>
        <ol className="grid gap-4 text-[15px] leading-6 text-[var(--o-ink-2)]">
          {[
            ["Le document d’abord, la question par exception.", "Ce qui est lu avec certitude n’est jamais redemandé. Ce qui est lu est toujours montré."],
            ["Trois sortes de questions seulement.", "Ce qui manque, ce qui se contredit, ce qui vous appartient de décider. Plus les facultatives, qui ne bloquent jamais."],
            ["Les rubriques deviennent une vue de vérification.", "Loyers, dépenses, prêt, amortissements restent à un clic — mais ne sont plus le chemin à parcourir."],
            ["Chaque chiffre a une origine.", "Lu, recoupé, calculé, choisi par vous, choix par défaut, repris : la provenance est visible partout."],
          ].map(([title, text], index) => (
            <li key={title} className="flex gap-4">
              <span className={`${serif} mt-0.5 text-[20px] text-[var(--o-accent-text)]`}>{index + 1}</span>
              <p>
                <span className="font-medium text-[var(--o-ink)]">{title}</span> {text}
              </p>
            </li>
          ))}
        </ol>
      </section>
    </main>
  );
}

// ─── Démarrage ───────────────────────────────────────────────────────────────

export function StartScreen({ s }: { s: ScenarioId }) {
  const { def, state, all, dispatch, go, notify } = useScenario(s);
  const fileInput = useRef<HTMLInputElement>(null);
  const docs = visibleDocs(def, state).filter((d) => d.year === def.year || s !== "c");
  const start = () => {
    dispatch({ type: "deposit", s });
    go("analyse");
  };

  if (state.phase === "ready") {
    return (
      <main className="mx-auto max-w-[760px] px-4 pb-24 pt-12 md:px-8">
        <PageTitle eyebrow={`Exercice ${def.year}`} title="Vos documents sont déjà analysés." lead="Tout ce que j’ai compris vous attend dans votre dossier." />
        <PrimaryButton className="mt-8" onClick={() => go("dossier")}>
          Ouvrir mon dossier <Icon name="arrow" />
        </PrimaryButton>
      </main>
    );
  }

  if (s === "c") {
    const memory = def.memory?.(all) ?? [];
    const aPlayed = all.a.phase === "ready";
    return (
      <main className="mx-auto max-w-[1180px] px-4 pb-32 pt-10 md:px-8 md:pt-14">
        <PageTitle
          eyebrow={`Exercice 2027 · Bon retour, ${def.firstName}`}
          title="Votre dossier 2027 est ouvert. Je me souviens du reste."
          lead="Je ne vous redemanderai rien de ce que nous avons établi ensemble l’an dernier. Il me faut seulement les documents de cette année : je chercherai ce qui a changé."
        />
        <div className="mt-10 grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
          <Card className="p-6 md:p-8">
            <Eyebrow>Ce que je sais déjà</Eyebrow>
            <ul className="mt-4 divide-y divide-[var(--o-line-soft)]">
              {memory.map((m) => (
                <li key={m.label} className="flex items-start gap-3 py-3">
                  <span className="mt-0.5 text-[var(--o-ok)]">
                    <Icon name="check" />
                  </span>
                  <span className="min-w-0 text-[14.5px] leading-6">
                    <span className="text-[var(--o-ink-3)]">{m.label} · </span>
                    <span className="text-[var(--o-ink)]">{m.value}</span>
                  </span>
                </li>
              ))}
            </ul>
            <p className="mt-4 text-[13px] leading-5 text-[var(--o-ink-3)]">
              {aPlayed ? "Repris de votre dossier 2026 (scénario A)." : "Repris de votre dossier 2026 — jouez le scénario A pour voir vos propres réponses reprises ici."}
            </p>
          </Card>
          <Card className="p-6 md:p-8">
            <Eyebrow>Ce qu’il me faut pour 2027</Eyebrow>
            <ul className="mt-4 grid gap-2.5">
              {(def.expectedDocs ?? []).map((d) => (
                <li key={d} className="flex items-center gap-3 text-[15px] text-[var(--o-ink)]">
                  <span className="grid h-6 w-6 place-items-center rounded-full border border-[var(--o-line)] text-[var(--o-ink-3)]">
                    <Icon name="doc" className="h-3.5 w-3.5" />
                  </span>
                  {d}
                </li>
              ))}
            </ul>
            <p className="mt-5 text-[14px] leading-6 text-[var(--o-ink-2)]">Même en vrac, même incomplet : je vous dirai ce qui manque.</p>
            <div className="mt-6 hidden md:block">
              <PrimaryButton onClick={start}>
                <Icon name="upload" /> Simuler le dépôt de mes documents 2027
              </PrimaryButton>
            </div>
          </Card>
        </div>
        <MobileBar>
          <PrimaryButton className="w-full" onClick={start}>
            <Icon name="upload" /> Déposer mes documents 2027
          </PrimaryButton>
        </MobileBar>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-[1180px] px-4 pb-32 pt-10 md:px-8 md:pt-14">
      <PageTitle
        eyebrow={`Exercice ${def.year} · Bienvenue, ${def.firstName}`}
        title="Commençons par ce que vous avez déjà."
        lead="Déposez tous les documents liés à votre location, dans n’importe quel ordre. Je les lis, je les classe, et je ne vous poserai que les questions auxquelles ils ne répondent pas."
      />
      <div className="mt-10 grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
        <Card className="p-4 md:p-6">
          <div className="flex flex-col items-center justify-center rounded-[20px] border-[1.5px] border-dashed border-[var(--o-accent-line)] bg-[var(--o-accent-soft)] px-6 py-10 text-center md:py-14">
            <span className="grid h-14 w-14 place-items-center rounded-full bg-[var(--o-surface)] text-[var(--o-accent-strong)] shadow-[0_6px_20px_-10px_rgba(214,107,40,0.6)]">
              <Icon name="upload" className="h-6 w-6" />
            </span>
            <p className={`${serif} mt-5 text-[24px] text-[var(--o-ink)]`}>Déposez tout, je fais le tri.</p>
            <p className="mt-2 max-w-[420px] text-[14.5px] leading-6 text-[var(--o-ink-2)]">PDF, photos, tableurs. Rien à renommer, rien à classer.</p>
            <div className="mt-6 hidden flex-wrap justify-center gap-3 md:flex">
              <PrimaryButton onClick={start}>Simuler le dépôt de {docs.length} documents</PrimaryButton>
              <SecondaryButton onClick={() => fileInput.current?.click()}>Choisir des fichiers</SecondaryButton>
            </div>
            <input
              ref={fileInput}
              type="file"
              multiple
              className="sr-only"
              aria-label="Choisir des fichiers"
              onChange={() => {
                start();
                notify("Prototype : vos fichiers ne sont pas lus. Je simule le dépôt du jeu de documents fictif.");
              }}
            />
          </div>
          <div className="mt-5">
            <p className="text-[13px] text-[var(--o-ink-3)]">Le jeu de documents fictif de ce scénario :</p>
            <ul className="mt-2 flex flex-wrap gap-2">
              {docs.map((d) => (
                <li key={d.id} className="inline-flex items-center gap-1.5 rounded-full border border-[var(--o-line)] bg-[var(--o-surface)] px-2.5 py-1 text-[12.5px] text-[var(--o-ink-2)]">
                  <Icon name="doc" className="h-3.5 w-3.5" />
                  {d.file}
                </li>
              ))}
            </ul>
          </div>
        </Card>
        <div className="grid content-start gap-6">
          <Card className="p-6">
            <Eyebrow>Ce qui m’aide le plus</Eyebrow>
            <ul className="mt-4 grid gap-2 text-[14.5px] text-[var(--o-ink)]">
              {["Votre acte d’achat", "Votre offre de prêt", "Vos relevés de loyers", "Assurance, copropriété, taxe foncière", "Factures de meubles ou de travaux"].map((t) => (
                <li key={t} className="flex items-center gap-2.5">
                  <span className="h-1.5 w-1.5 rounded-full bg-[var(--o-accent)]" />
                  {t}
                </li>
              ))}
            </ul>
            <div className="mt-5 rounded-2xl bg-[var(--o-sand)] p-4 text-[14px] leading-6 text-[var(--o-ink-2)]">
              <span className="font-medium text-[var(--o-ink)]">Vous aviez un comptable ?</span> Déposez aussi sa dernière liasse fiscale et son tableau d’amortissements : je reprendrai votre historique sans rien vous redemander.
            </div>
          </Card>
          <Card className="p-6">
            <Eyebrow>Ensuite</Eyebrow>
            <ol className="mt-4 grid gap-3 text-[14.5px] leading-6 text-[var(--o-ink-2)]">
              <li><span className="font-medium text-[var(--o-ink)]">Je lis et je calcule.</span> Vous voyez ce que j’ai compris, document par document.</li>
              <li><span className="font-medium text-[var(--o-ink)]">Vous répondez à quelques questions.</span> Seulement celles que vos documents ne tranchent pas.</li>
              <li><span className="font-medium text-[var(--o-ink)]">Vous vérifiez ce que vous voulez.</span> Chaque montant mène à sa source.</li>
            </ol>
          </Card>
        </div>
      </div>
      <MobileBar>
        <PrimaryButton className="w-full" onClick={start}>
          <Icon name="upload" /> Simuler le dépôt de {docs.length} documents
        </PrimaryButton>
      </MobileBar>
    </main>
  );
}

// ─── Analyse ─────────────────────────────────────────────────────────────────

const TICK_MS = 240;

export function AnalysisScreen({ s }: { s: ScenarioId }) {
  const { def, state, progress, dispatch } = useScenario(s);
  const docs = visibleDocs(def, state).filter((d) => s !== "c" || d.year === 2027);
  const steps = docs.map((d) => 2 + d.findings.length);
  const total = steps.reduce((a, b) => a + b, 0);
  const [tick, setTick] = useState(() =>
    typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches ? total : 0,
  );
  const done = tick >= total;

  useEffect(() => {
    if (done) return;
    const id = window.setInterval(() => setTick((t) => t + 1), TICK_MS);
    return () => window.clearInterval(id);
  }, [done]);

  const findingsCount = docs.reduce((sum, d) => sum + d.findings.length, 0);
  const finish = () => {
    dispatch({ type: "analysisDone", s });
    navigate(routeHash({ scenario: s, screen: "dossier" }), { replace: true });
  };

  const begins = steps.map((_, i) => steps.slice(0, i).reduce((a, b) => a + b, 0));
  const hasHistory = s === "b";

  return (
    <main className="mx-auto max-w-[860px] px-4 pb-32 pt-10 md:px-8 md:pt-14">
      <div aria-live="polite">
        <p className="text-[12px] font-medium uppercase tracking-[0.14em] text-[var(--o-accent-text)]">Exercice {def.year}</p>
        <h1 className={`${serif} mt-2 text-[32px] leading-[1.1] text-[var(--o-ink)] md:text-[42px]`}>
          {done ? `J’ai lu vos ${docs.length} documents.` : "Je lis vos documents…"}
        </h1>
        <p className="mt-3 text-[16px] leading-7 text-[var(--o-ink-2)]">
          {done
            ? `${findingsCount} informations comprises. ${
                progress.blockingOpen.length > 0
                  ? `${progress.blockingOpen.length} point${progress.blockingOpen.length > 1 ? "s ont" : " a"} besoin de vous${progress.optionalOpen.length ? `, et ${progress.optionalOpen.length} question facultative` : ""}.`
                  : "Rien ne bloque."
              }`
            : "Je reconnais chaque document, j’en extrais les montants et je les rapproche entre eux."}
        </p>
      </div>

      {hasHistory && tick > steps[0] && (
        <div className="mt-6 flex items-start gap-3 rounded-2xl border border-[var(--o-ok-line)] bg-[var(--o-ok-soft)] p-4 text-[14.5px] leading-6 text-[var(--o-ink)] motion-safe:animate-[fiscal-fade-in_300ms_ease-out]">
          <span className="mt-0.5 text-[var(--o-ok)]">
            <Icon name="history" />
          </span>
          <p>
            <span className="font-medium">Vous aviez déjà une comptabilité.</span> J’ai trouvé la liasse 2025 de votre cabinet : je repars de là, au lieu de tout reconstruire.
          </p>
        </div>
      )}

      <ul className="mt-8 grid grid-cols-1 gap-3">
        {docs.map((doc, index) => {
          const local = tick - begins[index];
          if (local < 0) {
            return (
              <li key={doc.id} className="flex items-center gap-3 rounded-2xl border border-[var(--o-line-soft)] bg-[var(--o-surface)]/60 px-4 py-3 text-[14px] text-[var(--o-ink-4)]">
                <Icon name="doc" />
                {doc.file}
              </li>
            );
          }
          const reading = local === 0;
          const shown = Math.max(0, Math.min(doc.findings.length, local - 1));
          const complete = local >= steps[index] - 1;
          return (
            <li key={doc.id} className="rounded-2xl border border-[var(--o-line-soft)] bg-[var(--o-surface)] px-4 py-3 motion-safe:animate-[fiscal-fade-in_260ms_ease-out]">
              <div className="flex items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-full ${complete ? (doc.status === "attention" ? "bg-[var(--o-accent-soft-2)] text-[var(--o-accent-strong)]" : "bg-[var(--o-ok-soft)] text-[var(--o-ok)]") : "bg-[var(--o-sand)] text-[var(--o-ink-3)]"}`}>
                    <Icon name={complete ? (doc.status === "attention" ? "question" : "check") : "doc"} />
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-[14.5px] font-medium text-[var(--o-ink)]">{reading ? doc.file : doc.kind}</p>
                    <p className="truncate text-[12.5px] text-[var(--o-ink-3)]">{reading ? "Lecture…" : doc.file}</p>
                  </div>
                </div>
                {complete && doc.statusNote && <span className="hidden shrink-0 text-[12.5px] text-[var(--o-accent-text)] sm:inline">{doc.statusNote}</span>}
              </div>
              {shown > 0 && (
                <ul className="mt-2 grid gap-1 pl-11">
                  {doc.findings.slice(0, shown).map((f) => (
                    <li key={f.label} className="text-[13.5px] leading-5 text-[var(--o-ink-2)] motion-safe:animate-[fiscal-fade-in_220ms_ease-out]">
                      <span className="text-[var(--o-ink-4)]">→ </span>
                      {f.label} : <span className="text-[var(--o-ink)]">{f.value}</span>
                    </li>
                  ))}
                </ul>
              )}
              {complete && doc.statusNote && <p className="mt-1 pl-11 text-[12.5px] text-[var(--o-accent-text)] sm:hidden">{doc.statusNote}</p>}
            </li>
          );
        })}
      </ul>

      <div className="mt-8 hidden items-center gap-3 md:flex">
        {done ? (
          <PrimaryButton onClick={finish}>
            Voir ce que j’ai préparé <Icon name="arrow" />
          </PrimaryButton>
        ) : (
          <SecondaryButton onClick={() => setTick(total)}>Passer l’animation</SecondaryButton>
        )}
      </div>
      <MobileBar>
        {done ? (
          <PrimaryButton className="w-full" onClick={finish}>
            Voir ce que j’ai préparé <Icon name="arrow" />
          </PrimaryButton>
        ) : (
          <SecondaryButton className="w-full" onClick={() => setTick(total)}>
            Passer l’animation
          </SecondaryButton>
        )}
      </MobileBar>
    </main>
  );
}
