"use client";

import { MobileBar, PageTitle } from "./chrome";
import { useScenario } from "./context";
import { type DomainId, type Point, type ScenarioId, eur } from "./model";
import { DOMAINS, KIND_META } from "./meta";
import { visibleDocs } from "./scenarios";
import { Card, Eyebrow, Icon, Money, Pill, PrimaryButton, StatusMark, TextButton, serif } from "./ui";

function usePrimaryAction(s: ScenarioId) {
  const { state, progress, go } = useScenario(s);
  const firstOpen = progress.queue.find((p) => p.blocking) ?? null;
  if (progress.escalated.length > 0 && progress.blockingOpen.length === 0) {
    return { label: "Voir mon résultat provisoire", run: () => go("resultat") };
  }
  if (firstOpen) {
    const n = progress.blockingOpen.length;
    return { label: n > 1 ? `Répondre aux ${n} points` : "Répondre au dernier point", run: () => go("points", firstOpen.id) };
  }
  if (state.generated) return { label: "Voir ma liasse et le guide de dépôt", run: () => go("liasse") };
  return { label: "Voir mon résultat", run: () => go("resultat") };
}

export function DossierScreen({ s }: { s: ScenarioId }) {
  const { def, state, view, progress, go, openPanel } = useScenario(s);
  const primary = usePrimaryAction(s);
  const nBlocking = progress.blockingOpen.length;
  const allDeferred = nBlocking > 0 && progress.blockingOpen.every((p) => state.points[p.id]?.status === "deferred");

  let title: string;
  let lead: string;
  if (progress.escalated.length > 0) {
    title = "Tout est prêt, sauf un point que je fais vérifier.";
    lead = "Je ne conclus pas seul sur une situation que les règles ne tranchent pas clairement. Vous serez prévenu dès que la vérification sera faite.";
  } else if (nBlocking > 0 && allDeferred) {
    title = `Il me manque encore ${nBlocking} réponse${nBlocking > 1 ? "s" : ""} que vous avez mise${nBlocking > 1 ? "s" : ""} de côté.`;
    lead = "Tout le reste est prêt. Revenez quand vous avez l’information : je n’aurai besoin de rien d’autre.";
  } else if (nBlocking > 0) {
    title = `J’ai préparé l’essentiel. Il me manque ${nBlocking} réponse${nBlocking > 1 ? "s" : ""}.`;
    lead = "Tout le reste vient de vos documents. Vous pouvez tout vérifier ci-dessous — sans rien avoir à saisir.";
  } else if (state.generated) {
    title = `Votre liasse ${def.year} est prête.`;
    lead = "Il ne reste qu’à la déposer. Je vous guide pas à pas.";
  } else {
    title = "Votre dossier est prêt.";
    lead = "Toutes les informations indispensables sont réunies : votre résultat est définitif.";
  }

  return (
    <main className="mx-auto max-w-[1180px] px-4 pb-36 pt-8 md:px-8 md:pb-24 md:pt-12">
      <PageTitle eyebrow={`Votre dossier ${def.year} · ${view.propertyShort}`} title={title} lead={lead} />

      <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1.45fr)_minmax(0,1fr)] lg:items-start">
        <div className="grid min-w-0 grid-cols-1 gap-6">
          <ActionCard s={s} />
          <div className="lg:hidden">
            <ResultMini s={s} />
          </div>
          {s === "b" && <RepriseCard s={s} />}
          {s === "c" && <ChangesCard s={s} />}
          <Understood s={s} />
          <HandledCard s={s} />
          <DocsStrip s={s} />
        </div>
        <aside className="hidden gap-6 lg:sticky lg:top-[92px] lg:grid">
          <ResultMini s={s} />
          <Card className="p-5">
            <p className="text-[13.5px] leading-6 text-[var(--o-ink-2)]">
              <span className="font-medium text-[var(--o-ink)]">Trois niveaux, toujours.</span> Ce dossier vous donne l’essentiel. Chaque ligne s’ouvre pour vous <em>expliquer</em>, puis pour vous laisser <em>vérifier</em> la source.
            </p>
            <TextButton className="mt-3" onClick={() => openPanel("choix")}>
              Voir les choix faits pour vous <Icon name="arrow" />
            </TextButton>
          </Card>
        </aside>
      </div>

      <MobileBar>
        <PrimaryButton className="w-full" onClick={primary.run}>
          {primary.label} <Icon name="arrow" />
        </PrimaryButton>
        {progress.toHandle > 0 && nBlocking === 0 && (
          <button type="button" onClick={() => go("points")} className="mt-2 w-full text-center text-[13px] text-[var(--o-ink-3)]">
            {progress.optionalOpen.length} question facultative
          </button>
        )}
      </MobileBar>
    </main>
  );
}

function ActionCard({ s }: { s: ScenarioId }) {
  const { def, state, progress, go } = useScenario(s);
  const primary = usePrimaryAction(s);
  const first = progress.queue.find((p) => p.blocking) ?? null;
  const points = def.points;

  return (
    <section aria-labelledby="action-title" className="overflow-hidden rounded-[28px] bg-[linear-gradient(160deg,#F5A06A_0%,#E87D3A_55%,#D66B28_100%)] p-[1px] shadow-[0_24px_60px_-30px_rgba(214,107,40,0.7)]">
      <div className="rounded-[27px] bg-[linear-gradient(165deg,rgba(255,255,255,0.18),rgba(255,255,255,0.02))] p-6 text-white md:p-8">
        <p className="flex items-center gap-2 text-[12px] font-medium uppercase tracking-[0.14em] text-white/85">
          <Icon name="spark" className="h-3.5 w-3.5" /> À faire maintenant
        </p>
        {first ? (
          <>
            <h2 id="action-title" className={`${serif} mt-3 text-[26px] leading-tight md:text-[30px]`}>{first.title}</h2>
            <p className="mt-2 text-[15px] leading-6 text-white/85">{KIND_META[first.kind].label}. Environ {Math.max(1, progress.blockingOpen.length)} minute{progress.blockingOpen.length > 1 ? "s" : ""} en tout.</p>
          </>
        ) : progress.escalated.length > 0 ? (
          <>
            <h2 id="action-title" className={`${serif} mt-3 text-[26px] leading-tight md:text-[30px]`}>Rien, pour l’instant.</h2>
            <p className="mt-2 text-[15px] leading-6 text-white/85">Un point est en vérification. Votre résultat reste provisoire en attendant.</p>
          </>
        ) : state.generated ? (
          <>
            <h2 id="action-title" className={`${serif} mt-3 text-[26px] leading-tight md:text-[30px]`}>Déposer votre liasse sur impots.gouv.fr</h2>
            <p className="mt-2 text-[15px] leading-6 text-white/85">Le guide de dépôt vous accompagne étape par étape.</p>
          </>
        ) : (
          <>
            <h2 id="action-title" className={`${serif} mt-3 text-[26px] leading-tight md:text-[30px]`}>Découvrir votre résultat définitif</h2>
            <p className="mt-2 text-[15px] leading-6 text-white/85">Puis préparer votre liasse fiscale.</p>
          </>
        )}
        <div className="mt-6 hidden md:block">
          <button
            type="button"
            onClick={primary.run}
            className="inline-flex min-h-[48px] items-center gap-2 rounded-full bg-white px-6 text-[15px] font-medium text-[var(--o-ink)] shadow-[0_6px_18px_-8px_rgba(28,25,23,0.4)] transition hover:bg-[var(--o-accent-soft)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
          >
            {primary.label} <Icon name="arrow" />
          </button>
        </div>
      </div>
      <div className="rounded-b-[27px] bg-[var(--o-surface)] px-6 py-4 md:px-8">
        <div className="flex items-center justify-between gap-3">
          <p className="text-[13px] font-medium text-[var(--o-ink-2)]">
            {progress.answered.length} réglé{progress.answered.length > 1 ? "s" : ""} sur {points.length}
            {progress.deferred.length > 0 && ` · ${progress.deferred.length} mis de côté`}
          </p>
          <ProgressDots s={s} />
        </div>
        <ul className="mt-3 grid gap-1">
          {points.map((p) => (
            <PointLine key={p.id} s={s} point={p} onOpen={() => go("points", p.id)} />
          ))}
        </ul>
      </div>
    </section>
  );
}

function ProgressDots({ s }: { s: ScenarioId }) {
  const { def, state } = useScenario(s);
  return (
    <span className="flex items-center gap-1" aria-hidden="true">
      {def.points.map((p) => {
        const st = state.points[p.id]?.status;
        const cls =
          st === "answered" ? "bg-[var(--o-ok)]" : st === "escalated" ? "bg-[var(--o-warn)]" : st === "deferred" ? "bg-[var(--o-line)]" : "bg-[var(--o-accent)]";
        return <span key={p.id} className={`h-2 w-2 rounded-full ${cls}`} />;
      })}
    </span>
  );
}

function PointLine({ s, point, onOpen }: { s: ScenarioId; point: Point; onOpen: () => void }) {
  const { state } = useScenario(s);
  const st = state.points[point.id] ?? { status: "open" as const };
  const meta =
    st.status === "answered"
      ? { icon: "check" as const, cls: "text-[var(--o-ok)]", note: st.answer ?? "Réglé" }
      : st.status === "deferred"
        ? { icon: "pause" as const, cls: "text-[var(--o-ink-3)]", note: point.blocking ? "Mis de côté — nécessaire pour finaliser" : "Mis de côté — facultatif" }
        : st.status === "escalated"
          ? { icon: "shield" as const, cls: "text-[var(--o-warn)]", note: "En vérification par un expert" }
          : { icon: "question" as const, cls: "text-[var(--o-accent-strong)]", note: point.blocking ? KIND_META[point.kind].label : "Facultatif" };
  return (
    <li>
      <button type="button" onClick={onOpen} className="group flex w-full items-start gap-3 rounded-xl px-2 py-2 text-left hover:bg-[var(--o-bg)] focus-visible:outline-2 focus-visible:outline-[var(--o-accent)]">
        <span className={`mt-0.5 ${meta.cls}`}>
          <Icon name={meta.icon} />
        </span>
        <span className="min-w-0 flex-1">
          <span className={`block text-[14px] leading-5 ${st.status === "answered" ? "text-[var(--o-ink-2)]" : "text-[var(--o-ink)]"}`}>{point.title}</span>
          <span className="block text-[12.5px] leading-5 text-[var(--o-ink-3)]">{meta.note}</span>
        </span>
        <span className="mt-0.5 text-[12.5px] text-[var(--o-ink-4)] opacity-0 transition group-hover:opacity-100">{st.status === "answered" ? "Modifier" : "Ouvrir"}</span>
      </button>
    </li>
  );
}

export function ResultMini({ s }: { s: ScenarioId }) {
  const { def, view, go } = useScenario(s);
  const { seq } = view;
  return (
    <Card className="overflow-hidden">
      <div className="bg-[var(--o-ink)] px-6 pb-6 pt-5 text-white">
        <div className="flex items-center justify-between">
          <p className="text-[12px] font-medium uppercase tracking-[0.14em] text-white/70">Résultat LMNP {def.year}</p>
          <span className={`rounded-full px-2.5 py-0.5 text-[11.5px] font-medium ${view.provisional ? "bg-white/12 text-[#FFDCC4]" : "bg-[rgba(94,138,102,0.3)] text-[#C5D9C9]"}`}>
            {view.provisional ? "Provisoire" : "Définitif"}
          </span>
        </div>
        <p className={`${serif} mt-3 text-[44px] leading-none`}>
          {seq.result < 0 ? `− ${eur(-seq.result)}` : eur(seq.result)}
        </p>
        <p className="mt-2 text-[13px] leading-5 text-white/70">
          {seq.result < 0 ? "Déficit, reportable sur vos résultats futurs de location meublée." : seq.result === 0 ? "Rien à ajouter à vos revenus imposables pour cette activité." : "Montant de votre activité à reporter sur votre déclaration de revenus."}
        </p>
      </div>
      <dl className="grid gap-2 px-6 py-5 text-[14px]">
        <div className="flex justify-between gap-3">
          <dt className="text-[var(--o-ink-2)]">Loyers encaissés</dt>
          <dd><Money value={seq.recettes} /></dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-[var(--o-ink-2)]">Dépenses</dt>
          <dd><Money value={-seq.charges} signed /></dd>
        </div>
        {seq.deficitsUsed > 0 && (
          <div className="flex justify-between gap-3">
            <dt className="text-[var(--o-ink-2)]">Déficit antérieur utilisé</dt>
            <dd><Money value={-seq.deficitsUsed} signed /></dd>
          </div>
        )}
        <div className="flex justify-between gap-3">
          <dt className="text-[var(--o-ink-2)]">Usure déduite (amortissements)</dt>
          <dd><Money value={-(seq.amortUsed + seq.ardUsed)} signed /></dd>
        </div>
        <div className="mt-2 flex justify-between gap-3 border-t border-[var(--o-line-soft)] pt-3">
          <dt className="text-[var(--o-ink-3)]">Mis de côté pour la suite</dt>
          <dd className="text-[var(--o-ink-2)]"><Money value={seq.ardStockAfter} /></dd>
        </div>
      </dl>
      <div className="border-t border-[var(--o-line-soft)] px-6 py-4">
        <TextButton onClick={() => go("resultat")}>
          Comprendre ce résultat <Icon name="arrow" />
        </TextButton>
      </div>
    </Card>
  );
}

function Understood({ s }: { s: ScenarioId }) {
  const { view, openPanel } = useScenario(s);
  const order: DomainId[] = ["logement", "financement", "loyers", "depenses", "amortissements", "historique"];
  return (
    <section aria-labelledby="understood-title">
      <div className="flex items-end justify-between gap-3">
        <div>
          <Eyebrow>Ce que j’ai compris</Eyebrow>
          <h2 id="understood-title" className={`${serif} mt-1 text-[24px] text-[var(--o-ink)]`}>Votre dossier, sujet par sujet</h2>
        </div>
      </div>
      <Card className="mt-4 divide-y divide-[var(--o-line-soft)]">
        {order.map((id) => {
          const summary = view.summaries[id];
          return (
            <button
              key={id}
              type="button"
              onClick={() => openPanel(id)}
              className="group flex w-full items-center gap-4 px-5 py-4 text-left first:rounded-t-[24px] last:rounded-b-[24px] hover:bg-[var(--o-bg)] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--o-accent)] md:px-6"
            >
              <StatusMark status={summary.status} />
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-baseline gap-x-2">
                  <span className="text-[15.5px] font-medium text-[var(--o-ink)]">{DOMAINS[id].title}</span>
                  <span className="text-[12px] uppercase tracking-[0.1em] text-[var(--o-ink-4)]">{DOMAINS[id].tech}</span>
                </span>
                <span className="mt-0.5 block text-[14px] leading-5 text-[var(--o-ink-2)]">{summary.text}</span>
              </span>
              <span className="text-[var(--o-ink-4)] transition group-hover:translate-x-0.5 group-hover:text-[var(--o-ink-2)]">
                <Icon name="chevron" />
              </span>
            </button>
          );
        })}
      </Card>
    </section>
  );
}

function HandledCard({ s }: { s: ScenarioId }) {
  const { view, openPanel } = useScenario(s);
  return (
    <section aria-labelledby="handled-title">
      <Eyebrow>Réglé sans vous déranger</Eyebrow>
      <h2 id="handled-title" className={`${serif} mt-1 text-[24px] text-[var(--o-ink)]`}>Ce que je ne vous ai pas demandé, et pourquoi</h2>
      <Card className="mt-4 p-5 md:p-6">
        <ul className="grid gap-4">
          {view.autoResolved.map((item) => (
            <li key={item.title} className="flex gap-3">
              <span className="mt-0.5 text-[var(--o-ok)]">
                <Icon name="check" />
              </span>
              <div className="min-w-0">
                <p className="text-[14.5px] font-medium text-[var(--o-ink)]">{item.title}</p>
                <p className="text-[14px] leading-6 text-[var(--o-ink-2)]">{item.detail}</p>
              </div>
            </li>
          ))}
        </ul>
        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-[var(--o-sand)] px-4 py-3">
          <p className="text-[14px] text-[var(--o-ink-2)]">
            {view.defaults.length} choix faits pour vous selon la pratique recommandée — tous modifiables.
          </p>
          <TextButton onClick={() => openPanel("choix")}>
            Les voir <Icon name="arrow" />
          </TextButton>
        </div>
      </Card>
    </section>
  );
}

function DocsStrip({ s }: { s: ScenarioId }) {
  const { def, state, go, openDoc } = useScenario(s);
  const docs = visibleDocs(def, state).filter((d) => d.year === def.year || s === "b");
  const shown = docs.slice(0, 5);
  return (
    <section aria-labelledby="docs-title">
      <div className="flex items-end justify-between gap-3">
        <div>
          <Eyebrow>Vos documents</Eyebrow>
          <h2 id="docs-title" className={`${serif} mt-1 text-[24px] text-[var(--o-ink)]`}>{docs.length} documents lus</h2>
        </div>
        <TextButton onClick={() => go("documents")}>
          Tout voir <Icon name="arrow" />
        </TextButton>
      </div>
      <Card className="mt-4 divide-y divide-[var(--o-line-soft)]">
        {shown.map((d) => (
          <button key={d.id} type="button" onClick={() => openDoc(d.id)} className="flex w-full items-center gap-3 px-5 py-3.5 text-left first:rounded-t-[24px] last:rounded-b-[24px] hover:bg-[var(--o-bg)] md:px-6">
            <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-full ${d.status === "attention" ? "bg-[var(--o-accent-soft-2)] text-[var(--o-accent-strong)]" : "bg-[var(--o-sand)] text-[var(--o-ink-3)]"}`}>
              <Icon name="doc" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[14.5px] text-[var(--o-ink)]">{d.kind}</span>
              <span className="block truncate text-[12.5px] text-[var(--o-ink-3)]">
                {d.findings.length} information{d.findings.length > 1 ? "s" : ""} retenue{d.findings.length > 1 ? "s" : ""}
                {d.statusNote ? ` · ${d.statusNote}` : ""}
              </span>
            </span>
            <Icon name="chevron" className="h-4 w-4 text-[var(--o-ink-4)]" />
          </button>
        ))}
      </Card>
    </section>
  );
}

function RepriseCard({ s }: { s: ScenarioId }) {
  const { def, state, go } = useScenario(s);
  const r = def.reprise;
  if (!r) return null;
  const ardDone = state.points["b-ard"]?.status === "answered";
  const loanDone = state.points["b-pret"]?.status === "answered";
  const groups = [
    { title: "Repris et certain", tone: "ok" as const, items: r.certain, icon: "check" as const },
    { title: "Contradictoire", tone: "warn" as const, items: r.contradictory, icon: "split" as const, done: ardDone, point: "b-ard" },
    { title: "Manquant", tone: "warn" as const, items: r.missing, icon: "question" as const, done: loanDone, point: "b-pret" },
    { title: "Nouveau pour 2026", tone: "neutral" as const, items: r.fresh, icon: "plus" as const },
  ];
  return (
    <section aria-labelledby="reprise-title">
      <Eyebrow>Reprise de votre ancienne comptabilité</Eyebrow>
      <h2 id="reprise-title" className={`${serif} mt-1 text-[24px] text-[var(--o-ink)]`}>Je repars de ce que votre cabinet a fait</h2>
      <Card className="mt-4 grid gap-5 p-5 md:grid-cols-2 md:p-6">
        {groups.map((g) => (
          <div key={g.title}>
            <div className="flex items-center gap-2">
              <Pill tone={g.done ? "ok" : g.tone}>
                <Icon name={g.done ? "check" : g.icon} className="h-3 w-3" />
                {g.done ? `${g.title} — réglé` : g.title}
              </Pill>
            </div>
            <ul className="mt-2.5 grid gap-1.5 text-[14px] leading-5 text-[var(--o-ink-2)]">
              {g.items.map((it) => (
                <li key={it} className="flex gap-2">
                  <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-[var(--o-ink-4)]" />
                  {it}
                </li>
              ))}
            </ul>
            {g.point && !g.done && (
              <TextButton className="mt-2" onClick={() => go("points", g.point)}>
                Régler ce point <Icon name="arrow" />
              </TextButton>
            )}
          </div>
        ))}
      </Card>
    </section>
  );
}

function ChangesCard({ s }: { s: ScenarioId }) {
  const { def } = useScenario(s);
  return (
    <section aria-labelledby="changes-title">
      <Eyebrow>Ce qui a changé depuis 2026</Eyebrow>
      <h2 id="changes-title" className={`${serif} mt-1 text-[24px] text-[var(--o-ink)]`}>Repéré dans vos documents 2027</h2>
      <Card className="mt-4 grid gap-3 p-5 sm:grid-cols-2 md:p-6">
        {(def.changes ?? []).map((c) => (
          <div key={c.title} className="rounded-2xl bg-[var(--o-bg)] px-4 py-3">
            <p className="text-[14.5px] font-medium text-[var(--o-ink)]">{c.title}</p>
            <p className="text-[14px] text-[var(--o-ink-2)]">{c.detail}</p>
          </div>
        ))}
        <p className="text-[13.5px] leading-6 text-[var(--o-ink-3)] sm:col-span-2">
          Tout le reste — logement, prêt, plan d’amortissement, part du terrain, montants mis de côté — est repris de 2026 sans rien vous redemander.
        </p>
      </Card>
    </section>
  );
}
