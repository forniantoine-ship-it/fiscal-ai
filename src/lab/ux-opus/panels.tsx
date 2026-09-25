"use client";

import type { ReactNode } from "react";

import { useScenario } from "./context";
import { DOMAINS } from "./meta";
import { type DomainId, type Row, type ScenarioId, eur } from "./model";
import { findDoc } from "./scenarios";
import { closePanel } from "./store";
import { Drawer, Explain, Icon, Money, ProvBadge, SecondaryButton, TextButton, serif } from "./ui";

const DOMAIN_IDS: DomainId[] = ["logement", "financement", "loyers", "depenses", "amortissements", "historique"];

export function PanelHost({ s }: { s: ScenarioId }) {
  const { route } = useScenario(s);
  const panel = route.panel;
  if (!panel) return null;
  const onClose = () => closePanel(route);
  if (panel.startsWith("doc:")) return <DocPanel s={s} docId={panel.slice(4)} onClose={onClose} />;
  if (panel === "trace") return <TracePanel s={s} onClose={onClose} />;
  if (panel === "choix") return <DefaultsPanel s={s} onClose={onClose} />;
  if (DOMAIN_IDS.includes(panel as DomainId)) return <DomainPanel s={s} domain={panel as DomainId} onClose={onClose} />;
  return null;
}

function SectionTitle({ level, children }: { level: 1 | 2 | 3; children: ReactNode }) {
  const labels = { 1: "L’essentiel", 2: "Comprendre", 3: "Vérifier" } as const;
  return (
    <p className="mb-3 flex items-center gap-2 text-[12px] font-medium uppercase tracking-[0.14em] text-[var(--o-ink-3)]">
      <span className="grid h-5 w-5 place-items-center rounded-full bg-[var(--o-sand)] text-[11px] text-[var(--o-ink-2)]">{level}</span>
      {labels[level]} · {children}
    </p>
  );
}

function RowList({ s, rows }: { s: ScenarioId; rows: Row[] }) {
  const { docName, openDoc, go, dispatch, notify, state } = useScenario(s);
  return (
    <ul className="divide-y divide-[var(--o-line-soft)] rounded-2xl border border-[var(--o-line-soft)]">
      {rows.map((row) => {
        const pointStatus = row.pointId ? state.points[row.pointId]?.status : undefined;
        const needs = row.pointId && pointStatus !== "answered";
        return (
          <li key={row.id} className={`px-4 py-3.5 ${row.flag === "gap" ? "bg-[var(--o-accent-soft)]" : ""}`}>
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p className={`text-[14.5px] ${row.removed ? "text-[var(--o-ink-4)] line-through" : "text-[var(--o-ink)]"}`}>{row.label}</p>
                {row.sub && <p className="text-[13px] leading-5 text-[var(--o-ink-3)]">{row.sub}</p>}
              </div>
              <p className={`shrink-0 text-right text-[14.5px] ${row.removed ? "text-[var(--o-ink-4)] line-through" : "text-[var(--o-ink)]"}`}>
                {row.amount !== undefined ? <Money value={row.amount} /> : null}
                {row.value && <span className={`block ${row.amount !== undefined ? "text-[13px] text-[var(--o-ink-3)]" : ""} ${row.flag === "gap" ? "text-[var(--o-accent-text)]" : ""}`}>{row.value}</span>}
              </p>
            </div>
            <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
              <ProvBadge prov={row.prov} docName={docName} onOpenDoc={openDoc} />
              <span className="flex flex-wrap gap-3">
                {needs && (
                  <TextButton onClick={() => go("points", row.pointId ?? null)}>
                    {row.flag === "gap" ? "Compléter" : "Confirmer"} <Icon name="arrow" />
                  </TextButton>
                )}
                {row.pointId && pointStatus === "answered" && (
                  <TextButton onClick={() => go("points", row.pointId ?? null)}>Modifier ma réponse</TextButton>
                )}
                {row.removable && !row.removed && (
                  <TextButton
                    onClick={() => {
                      dispatch({ type: "removeRow", s, rowId: row.id });
                      notify("Dépense retirée de ce dossier. Résultat recalculé.", () => dispatch({ type: "restoreRow", s, rowId: row.id }));
                    }}
                  >
                    Ne concerne pas ce logement
                  </TextButton>
                )}
                {row.removed && (
                  <TextButton onClick={() => dispatch({ type: "restoreRow", s, rowId: row.id })}>
                    <Icon name="refresh" /> Rétablir
                  </TextButton>
                )}
              </span>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function KeyFigure({ label, value, note }: { label: string; value: ReactNode; note?: string }) {
  return (
    <div className="rounded-2xl bg-[var(--o-bg)] p-5">
      <p className="text-[13px] text-[var(--o-ink-3)]">{label}</p>
      <p className={`${serif} mt-1 text-[34px] leading-none text-[var(--o-ink)]`}>{value}</p>
      {note && <p className="mt-2 text-[14px] leading-6 text-[var(--o-ink-2)]">{note}</p>}
    </div>
  );
}

function DomainPanel({ s, domain, onClose }: { s: ScenarioId; domain: DomainId; onClose: () => void }) {
  const { def, view, notify } = useScenario(s);
  const meta = DOMAINS[domain];
  const summary = view.summaries[domain];
  const { seq, amort } = view;

  let essential: ReactNode;
  let explain: ReactNode;
  let detail: ReactNode;

  switch (domain) {
    case "logement":
      essential = <KeyFigure label="Votre logement" value={view.propertyShort} note={summary.text} />;
      explain = (
        <>
          <p>Je retiens le prix et la date de l’acte notarié : c’est lui qui fait foi. Le mobilier vendu avec le logement est isolé, car il s’use plus vite.</p>
          <p className="mt-2">La date de mise en location compte aussi : c’est à partir d’elle que l’usure se déduit.</p>
        </>
      );
      detail = (
        <>
          <RowList s={s} rows={view.logement} />
          <div className="mt-5 grid gap-3">
            {view.autoResolved.map((a) => (
              <div key={a.title} className="rounded-2xl bg-[var(--o-ok-soft)] px-4 py-3 text-[14px] leading-6 text-[var(--o-ink-2)]">
                <span className="font-medium text-[var(--o-ink)]">{a.title}.</span> {a.detail} <span className="text-[12px] text-[var(--o-ink-3)]">({a.rule})</span>
              </div>
            ))}
          </div>
        </>
      );
      break;
    case "financement":
      essential = (
        <KeyFigure
          label={`Intérêts et assurance déduits en ${view.year}`}
          value={<Money value={view.depenses.rows.filter((r) => r.id === "d-int" || r.id === "d-ass").reduce((t, r) => t + (r.amount ?? 0), 0)} />}
          note={summary.text}
        />
      );
      explain = <p>{view.financement.scheduleNote} Chaque mensualité mélange les deux : le tableau d’amortissement de la banque permet de les séparer, mois par mois.</p>;
      detail = (
        <>
          <RowList s={s} rows={view.financement.rows} />
          {view.financement.schedule.length > 0 && (
            <details className="mt-5 rounded-2xl border border-[var(--o-line-soft)] [&_summary::-webkit-details-marker]:hidden">
              <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3 text-[14px] font-medium text-[var(--o-ink-2)]">
                Détail du calcul : {view.financement.schedule.length} échéances
                <Icon name="chevron" className="h-4 w-4" />
              </summary>
              <div className="overflow-x-auto px-4 pb-4">
                <table className="w-full min-w-[320px] text-[13.5px] tabular-nums">
                  <thead>
                    <tr className="text-left text-[12px] uppercase tracking-[0.08em] text-[var(--o-ink-3)]">
                      <th className="py-2 font-medium">Échéance</th>
                      <th className="py-2 text-right font-medium">Intérêts</th>
                      <th className="py-2 text-right font-medium">Assurance</th>
                    </tr>
                  </thead>
                  <tbody>
                    {view.financement.schedule.map((row) => (
                      <tr key={row.label} className="border-t border-[var(--o-line-soft)] text-[var(--o-ink-2)]">
                        <td className="py-1.5">{row.label}</td>
                        <td className="py-1.5 text-right">{row.interest.toFixed(2).replace(".", ",")} €</td>
                        <td className="py-1.5 text-right">{row.insurance.toFixed(2).replace(".", ",")} €</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          )}
        </>
      );
      break;
    case "loyers":
      essential = <KeyFigure label={`Loyers encaissés en ${view.year}`} value={<Money value={view.loyers.total} />} note={summary.text} />;
      explain = <p>Je retiens les loyers réellement encaissés pendant l’année, retrouvés dans vos relevés et rapprochés de votre bail. S’il manque un mois, je ne le suppose pas : je vous le demande.</p>;
      detail = <RowList s={s} rows={view.loyers.rows} />;
      break;
    case "depenses":
      essential = <KeyFigure label={`Dépenses retenues en ${view.year}`} value={<Money value={view.depenses.total} />} note={summary.text} />;
      explain = (
        <p>
          Chaque dépense est classée pour vous et reliée à son justificatif. Le capital remboursé de votre prêt n’en fait pas partie, ni les meubles : ils s’usent sur plusieurs années (voir l’usure). Si un document ne concerne pas ce logement, retirez-le ici : c’est une correction ciblée, le reste ne bouge pas.
        </p>
      );
      detail = <RowList s={s} rows={view.depenses.rows} />;
      break;
    case "amortissements":
      essential = (
        <KeyFigure
          label={`Usure calculée pour ${view.year}`}
          value={<Money value={amort.totalYear} />}
          note={
            seq.amortUsed < amort.totalYear
              ? `${eur(seq.amortUsed)} déduits cette année, ${eur(seq.newArd)} mis de côté pour les années suivantes.`
              : "Entièrement déduite cette année."
          }
        />
      );
      explain = (
        <>
          <p>Le logement ne s’use pas d’un bloc : sa structure dure des décennies, sa cuisine ou sa plomberie beaucoup moins. Je le découpe donc en éléments, chacun avec sa durée. Les meubles ont la leur. Le terrain, lui, ne s’use jamais.</p>
          <p className="mt-2">L’usure ne peut pas créer une perte : ce qui ne peut pas être déduit cette année est mis de côté, sans limite de durée.</p>
        </>
      );
      detail = (
        <>
          <p className="mb-2 text-[13px] font-medium text-[var(--o-ink-2)]">Valeur qui s’use</p>
          <RowList s={s} rows={amort.baseRows} />
          <p className="mb-2 mt-6 text-[13px] font-medium text-[var(--o-ink-2)]">Éléments du logement</p>
          <AmortTable rows={amort.components.map((c) => ({ label: `${c.label} (${Math.round(c.share * 100)} %)`, base: c.base, years: c.years, year: c.year }))} year={view.year} />
          <p className="mb-2 mt-6 text-[13px] font-medium text-[var(--o-ink-2)]">Meubles</p>
          <AmortTable rows={amort.mobilier} year={view.year} />
          <div className="mt-4 rounded-2xl bg-[var(--o-bg)] px-4 py-3 text-[14px] leading-6 text-[var(--o-ink-2)]">
            <p>{amort.prorataNote}</p>
            <p className="mt-1">
              Total {view.year} : <span className="font-medium text-[var(--o-ink)]">{eur(amort.totalYear)}</span> · déduits : {eur(seq.amortUsed)} · mis de côté : {eur(seq.newArd)}
            </p>
          </div>
        </>
      );
      break;
    case "historique":
      essential = (
        <KeyFigure
          label="Mis de côté après cette année"
          value={<Money value={seq.ardStockAfter} />}
          note={seq.deficitsStockAfter > 0 ? `Et ${eur(seq.deficitsStockAfter)} de déficit reportable.` : summary.text}
        />
      );
      explain = (
        <>
          <p>Deux choses peuvent passer d’une année à l’autre. Le déficit, quand vos dépenses dépassent vos loyers : il se garde 10 ans et se déduit en premier. L’usure non déduite : elle se garde sans limite.</p>
          {s === "a" && <p className="mt-2">C’est votre première année : tout commence ici, et je m’en souviendrai l’an prochain.</p>}
        </>
      );
      detail = (
        <>
          <div className="overflow-x-auto rounded-2xl border border-[var(--o-line-soft)]">
            <table className="w-full min-w-[440px] text-[13.5px] tabular-nums">
              <thead>
                <tr className="bg-[var(--o-bg)] text-left text-[12px] uppercase tracking-[0.08em] text-[var(--o-ink-3)]">
                  <th className="px-3 py-2 font-medium">Année</th>
                  <th className="px-3 py-2 text-right font-medium">Usure calculée</th>
                  <th className="px-3 py-2 text-right font-medium">Déduite</th>
                  <th className="px-3 py-2 text-right font-medium">Mis de côté (cumul)</th>
                </tr>
              </thead>
              <tbody>
                {view.history.map((h) => (
                  <tr key={h.year} className="border-t border-[var(--o-line-soft)] text-[var(--o-ink-2)]">
                    <td className="px-3 py-2">
                      <span className="text-[var(--o-ink)]">{h.year}</span>
                      <span className="block text-[12px] text-[var(--o-ink-3)]">{h.label}</span>
                    </td>
                    <td className="px-3 py-2 text-right">{eur(h.dotation)}</td>
                    <td className="px-3 py-2 text-right">{eur(h.used)}</td>
                    <td className="px-3 py-2 text-right text-[var(--o-ink)]">{eur(h.stock)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {view.history.map((h) => (
              <span key={h.year} className="text-[12px] text-[var(--o-ink-3)]">
                {h.year} :{" "}
                <ProvBadge prov={h.prov} docName={(id) => findDoc(def, id)?.kind ?? id} />
              </span>
            ))}
          </div>
          {view.deficits.length > 0 && (
            <div className="mt-5 rounded-2xl bg-[var(--o-bg)] px-4 py-3 text-[14px] leading-6 text-[var(--o-ink-2)]">
              {view.deficits.map((d) => (
                <p key={d.year}>
                  Déficit né en {d.year} : {eur(d.amount)} — utilisé cette année : {eur(d.used)}, reste {eur(d.amount - d.used)} (jusqu’en {d.year + 10}).
                </p>
              ))}
            </div>
          )}
        </>
      );
      break;
  }

  return (
    <Drawer
      title={meta.title}
      eyebrow={`${meta.tech} · ${view.year}`}
      onClose={onClose}
      footer={
        <div className="flex flex-wrap items-center justify-between gap-3">
          <TextButton onClick={() => notify(`Dans le produit réel : ouvre l’${meta.assistant.charAt(0).toLowerCase()}${meta.assistant.slice(1)}, directement sur ce sujet.`)}>
            Modifier en détail dans l’assistant spécialisé
          </TextButton>
          <SecondaryButton onClick={onClose}>Revenir au dossier</SecondaryButton>
        </div>
      }
    >
      <p className="mb-6 text-[15px] leading-6 text-[var(--o-ink-2)]">{meta.lead}</p>
      <SectionTitle level={1}>en une phrase</SectionTitle>
      {essential}
      <div className="mt-8">
        <SectionTitle level={2}>comment je l’ai établi</SectionTitle>
        <Explain summary="Expliquez-moi" defaultOpen>
          {explain}
        </Explain>
      </div>
      <div className="mt-8">
        <SectionTitle level={3}>montants, sources, calcul</SectionTitle>
        {detail}
      </div>
    </Drawer>
  );
}

function AmortTable({ rows, year }: { rows: { label: string; base: number; years: number; year: number }[]; year: number }) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-[var(--o-line-soft)]">
      <table className="w-full min-w-[420px] text-[13.5px] tabular-nums">
        <thead>
          <tr className="bg-[var(--o-bg)] text-left text-[12px] uppercase tracking-[0.08em] text-[var(--o-ink-3)]">
            <th className="px-3 py-2 font-medium">Élément</th>
            <th className="px-3 py-2 text-right font-medium">Valeur</th>
            <th className="px-3 py-2 text-right font-medium">Durée</th>
            <th className="px-3 py-2 text-right font-medium">{year}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.label} className="border-t border-[var(--o-line-soft)] text-[var(--o-ink-2)]">
              <td className="px-3 py-2 text-[var(--o-ink)]">{r.label}</td>
              <td className="px-3 py-2 text-right">{eur(r.base)}</td>
              <td className="px-3 py-2 text-right">{r.years} ans</td>
              <td className="px-3 py-2 text-right text-[var(--o-ink)]">{eur(r.year)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function DocPanel({ s, docId, onClose }: { s: ScenarioId; docId: string; onClose: () => void }) {
  const { def, state, openPanel, go } = useScenario(s);
  const doc = findDoc(def, docId);
  if (!doc) return null;
  const pointStatus = doc.pointId ? state.points[doc.pointId]?.status : undefined;
  const needsYou = doc.status === "attention" && pointStatus !== "answered";
  return (
    <Drawer title={doc.kind} eyebrow={`Source · ${doc.file}`} onClose={onClose}>
      {needsYou && doc.pointId && (
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-[var(--o-accent-soft)] px-4 py-3 text-[14px] text-[var(--o-ink)]">
          <span>
            <Icon name="alert" className="mr-1.5 inline h-4 w-4 text-[var(--o-accent-strong)]" />
            {doc.statusNote}
          </span>
          <TextButton onClick={() => go("points", doc.pointId ?? null)}>
            Régler ce point <Icon name="arrow" />
          </TextButton>
        </div>
      )}
      <div className="rounded-[6px] border border-[var(--o-line)] bg-white px-5 py-6 shadow-[0_18px_40px_-24px_rgba(28,25,23,0.35)] md:px-7">
        <p className="border-b border-[var(--o-line-soft)] pb-3 font-[family-name:Georgia,serif] text-[15px] text-[var(--o-ink)]">{doc.paper.heading}</p>
        <ul className="mt-3 grid gap-1.5">
          {doc.paper.lines.map((l) => (
            <li key={l.t} className={`flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 rounded-md px-2 py-1 font-[family-name:Georgia,serif] text-[14px] leading-6 ${l.mark ? "bg-[rgba(255,196,154,0.35)] text-[var(--o-ink)]" : "text-[var(--o-ink-2)]"}`}>
              <span className="min-w-0">{l.t}</span>
              {l.mark && <span className="shrink-0 rounded-full bg-white px-2 font-sans text-[11.5px] font-medium text-[var(--o-accent-text)]">→ {l.mark}</span>}
            </li>
          ))}
        </ul>
        <p className="mt-4 text-[11.5px] text-[var(--o-ink-4)]">Reproduction fictive — les passages surlignés sont ceux que j’ai lus et retenus.</p>
      </div>
      <div className="mt-8">
        <SectionTitle level={3}>ce que j’en ai retenu</SectionTitle>
        <ul className="grid gap-2">
          {doc.findings.map((f) => (
            <li key={f.label} className="flex items-start justify-between gap-4 rounded-xl bg-[var(--o-bg)] px-4 py-2.5 text-[14px]">
              <span className="text-[var(--o-ink-3)]">{f.label}</span>
              <span className="text-right text-[var(--o-ink)]">{f.value}</span>
            </li>
          ))}
        </ul>
      </div>
      <div className="mt-8">
        <p className="mb-3 text-[13px] font-medium text-[var(--o-ink-2)]">Utilisé pour</p>
        <div className="flex flex-wrap gap-2">
          {doc.usedIn.map((u) => (
            <SecondaryButton key={u} onClick={() => openPanel(u)}>
              {DOMAINS[u].title} <Icon name="arrow" />
            </SecondaryButton>
          ))}
        </div>
      </div>
    </Drawer>
  );
}

function TracePanel({ s, onClose }: { s: ScenarioId; onClose: () => void }) {
  const { view } = useScenario(s);
  const { seq } = view;
  const steps: { title: string; value: ReactNode; text: string; rule: string }[] = [
    { title: "Recettes de l’exercice", value: <Money value={seq.recettes} />, text: "Somme des loyers encaissés.", rule: "TRF-0029" },
    { title: "Charges déductibles", value: <Money value={-seq.charges} signed />, text: "Somme des dépenses retenues, hors capital emprunté et hors immobilisations.", rule: "TRF-0020" },
    { title: "Résultat avant amortissements", value: <Money value={seq.avant} />, text: "Recettes moins charges.", rule: "TRF-0030" },
    {
      title: "Déficits antérieurs imputés",
      value: <Money value={-seq.deficitsUsed} signed />,
      text: `Stock avant : ${eur(seq.deficitsStockBefore)}. Imputés en premier, du plus ancien au plus récent, car ils expirent après 10 ans.`,
      rule: "SAV-027 · AX-016",
    },
    {
      title: "Amortissement de l’exercice",
      value: <Money value={-seq.amortUsed} signed />,
      text: `Calculé : ${eur(seq.amortYear)}. Déduit dans la limite du résultat restant ; le solde (${eur(seq.newArd)}) est reporté.`,
      rule: "TRF-0012 · TRF-0031",
    },
    {
      title: "Amortissements reportés utilisés",
      value: <Money value={-seq.ardUsed} signed />,
      text: `Stock avant : ${eur(seq.ardStockBefore)}. Utilisés en dernier, car ils n’expirent jamais.`,
      rule: "SAV-027 · AX-017",
    },
    { title: "Résultat fiscal", value: <Money value={seq.result} />, text: "Montant de l’activité à reporter sur la déclaration de revenus.", rule: "TRF-0032" },
  ];
  return (
    <Drawer title="Le calcul complet" eyebrow={`Vérifier · résultat ${view.year}`} onClose={onClose}>
      <p className="mb-6 text-[15px] leading-6 text-[var(--o-ink-2)]">
        L’ordre des étapes compte : il suit la séquence de calcul documentée dans le Knowledge System. Les références entre parenthèses renvoient aux règles utilisées.
      </p>
      <ol className="grid gap-3">
        {steps.map((st, i) => (
          <li key={st.title} className="rounded-2xl border border-[var(--o-line-soft)] px-4 py-3">
            <div className="flex items-baseline justify-between gap-3">
              <p className="text-[14.5px] text-[var(--o-ink)]">
                <span className="mr-2 text-[var(--o-ink-4)]">{i + 1}.</span>
                {st.title}
              </p>
              <p className="shrink-0 text-[15px] font-medium text-[var(--o-ink)]">{st.value}</p>
            </div>
            <p className="mt-1 text-[13.5px] leading-5 text-[var(--o-ink-2)]">
              {st.text} <span className="text-[12px] text-[var(--o-ink-4)]">({st.rule})</span>
            </p>
          </li>
        ))}
      </ol>
      <div className="mt-6 rounded-2xl bg-[var(--o-bg)] px-4 py-3 text-[14px] leading-6 text-[var(--o-ink-2)]">
        Après cet exercice : amortissements reportés <span className="font-medium text-[var(--o-ink)]">{eur(seq.ardStockAfter)}</span>
        {seq.deficitsStockAfter > 0 && (
          <>
            {" "}· déficits reportables <span className="font-medium text-[var(--o-ink)]">{eur(seq.deficitsStockAfter)}</span>
          </>
        )}
        .
      </div>
      <div className="mt-8">
        <SectionTitle level={3}>où ces montants apparaîtront</SectionTitle>
        <ul className="grid gap-2 text-[14px] leading-6 text-[var(--o-ink-2)]">
          <li><span className="font-medium text-[var(--o-ink)]">2031</span> — déclaration de résultats : le résultat de l’exercice.</li>
          <li><span className="font-medium text-[var(--o-ink)]">2033-B</span> — compte de résultat : loyers, charges, dotation aux amortissements.</li>
          <li><span className="font-medium text-[var(--o-ink)]">2033-C</span> — immobilisations et amortissements : logement, éléments, meubles.</li>
          <li><span className="font-medium text-[var(--o-ink)]">2033-A</span> — bilan simplifié, sauf dispense applicable.</li>
          <li><span className="font-medium text-[var(--o-ink)]">2033-D</span> — toujours produit ; pour une activité à l’impôt sur le revenu, les déficits se reportent via la déclaration de revenus.</li>
        </ul>
        <p className="mt-3 text-[12.5px] text-[var(--o-ink-4)]">Composition selon SAV-029. La correspondance case par case figurerait dans le Journal des calculs.</p>
      </div>
    </Drawer>
  );
}

function DefaultsPanel({ s, onClose }: { s: ScenarioId; onClose: () => void }) {
  const { view, notify } = useScenario(s);
  return (
    <Drawer title="Choix faits pour vous" eyebrow="Comprendre · modifiables à tout moment" onClose={onClose}>
      <p className="mb-6 text-[15px] leading-6 text-[var(--o-ink-2)]">
        Quand une pratique recommandée existe et que votre situation la rend évidente, je l’applique plutôt que de vous poser la question. Vous gardez la main : chaque choix se modifie.
      </p>
      <ul className="grid gap-3">
        {view.defaults.map((d) => (
          <li key={d.title} className="rounded-2xl border border-[var(--o-line-soft)] p-4">
            <div className="flex items-start justify-between gap-3">
              <p className="text-[15px] font-medium text-[var(--o-ink)]">{d.title}</p>
              <span className="shrink-0 rounded-full bg-[var(--o-sand)] px-2 py-0.5 text-[11.5px] text-[var(--o-ink-3)]">{d.rule}</span>
            </div>
            <p className="mt-1 text-[14px] leading-6 text-[var(--o-ink-2)]">{d.detail}</p>
            <TextButton className="mt-2" onClick={() => notify(`Dans le produit réel : ouvre l’${d.assistant.charAt(0).toLowerCase()}${d.assistant.slice(1)} sur ce choix.`)}>
              Modifier ce choix
            </TextButton>
          </li>
        ))}
      </ul>
    </Drawer>
  );
}
