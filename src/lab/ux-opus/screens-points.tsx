"use client";

import { useEffect, useState } from "react";

import { BackLink, MobileBar } from "./chrome";
import { useScenario } from "./context";
import { KIND_META } from "./meta";
import { type Fact, type Point, type PointOption, type ScenarioId, type View, eur, frDate } from "./model";
import { navigate, routeHash } from "./store";
import { Card, Explain, Icon, Pill, PrimaryButton, SecondaryButton, TextButton, serif } from "./ui";

type Snapshot = { result: number; usure: number; loyers: number; depenses: number; reserve: number };

function snap(view: View): Snapshot {
  return {
    result: view.seq.result,
    usure: view.amort.totalYear,
    loyers: view.loyers.total,
    depenses: view.depenses.total,
    reserve: view.seq.ardStockAfter,
  };
}

export function PointsScreen({ s }: { s: ScenarioId }) {
  const { def, progress, route, go } = useScenario(s);
  const requested = route.arg ? def.points.find((p) => p.id === route.arg) : undefined;
  const current = requested ?? progress.queue[0];
  const currentId = current?.id ?? null;

  useEffect(() => {
    if (!route.arg && currentId) navigate(routeHash({ scenario: s, screen: "points", arg: currentId }), { replace: true });
  }, [route.arg, currentId, s]);

  if (!current) {
    return (
      <main className="mx-auto max-w-[720px] px-4 pb-36 pt-10 md:px-8 md:pt-16">
        <BackLink onClick={() => go("dossier")} label="Mon dossier" />
        <p className="mt-10 text-[12px] font-medium uppercase tracking-[0.14em] text-[var(--o-accent-text)]">Tous les points sont traités</p>
        <h1 className={`${serif} mt-2 text-[34px] leading-tight text-[var(--o-ink)] md:text-[44px]`}>
          {progress.escalated.length > 0 ? "J’ai tout ce qu’il me faut, sauf un point en vérification." : "C’est tout ce dont j’avais besoin."}
        </h1>
        <p className="mt-3 text-[16px] leading-7 text-[var(--o-ink-2)]">
          {progress.escalated.length > 0
            ? "Votre résultat reste provisoire jusqu’à la fin de la vérification. Tout le reste est prêt."
            : "Votre résultat est calculé à partir de vos documents et de vos réponses. Vous pouvez le consulter, le comprendre, et vérifier chaque montant."}
        </p>
        <PrimaryButton className="mt-8" onClick={() => go("resultat")}>
          Voir mon résultat <Icon name="arrow" />
        </PrimaryButton>
      </main>
    );
  }

  const order = def.points.findIndex((p) => p.id === current.id) + 1;
  return (
    <main className="mx-auto max-w-[760px] px-4 pb-44 pt-6 md:px-8 md:pb-24 md:pt-10">
      <div className="flex items-center justify-between gap-3">
        <BackLink onClick={() => go("dossier")} label="Mon dossier" />
        <p className="text-[13px] text-[var(--o-ink-3)]">
          Point {order} sur {def.points.length}
          {progress.toHandle > 0 && ` · ${progress.toHandle} à traiter`}
        </p>
      </div>
      <PointFocus key={current.id} s={s} point={current} />
    </main>
  );
}

function inputToFact(option: PointOption, raw: string): { value: Fact; label: string; valid: boolean; warning?: string } {
  const input = option.input;
  if (!input) return { value: null, label: option.label, valid: true };
  if (input.kind === "date") {
    const n = Number(raw.replaceAll("-", ""));
    const valid = /^\d{4}-\d{2}-\d{2}$/.test(raw) && (input.min === undefined || n >= input.min) && (input.max === undefined || n <= input.max);
    return { value: raw, label: valid ? frDate(raw) : "", valid };
  }
  const n = Number(raw.replace(",", "."));
  const valid = raw.trim() !== "" && Number.isFinite(n) && (input.min === undefined || n >= input.min) && (input.max === undefined || n <= input.max);
  const warning =
    valid && input.softMin !== undefined && input.softMax !== undefined && (n < input.softMin || n > input.softMax) ? input.softWarning : undefined;
  return { value: n, label: input.kind === "percent" ? `${n} %` : eur(n), valid, warning };
}

function PointFocus({ s, point }: { s: ScenarioId; point: Point }) {
  const { def, state, all, view, progress, dispatch, go, openDoc, notify } = useScenario(s);
  const pointState = state.points[point.id] ?? { status: "open" as const };
  const [selected, setSelected] = useState<string | null>(null);
  const [raw, setRaw] = useState("");
  const [phase, setPhase] = useState<"ask" | "reading" | "done" | "deferred">("ask");
  const [before, setBefore] = useState<Snapshot | null>(null);
  const [showDelegate, setShowDelegate] = useState(false);
  const kind = KIND_META[point.kind];

  const option = point.options.find((o) => o.id === selected) ?? null;
  const parsed = option ? inputToFact(option, raw) : null;
  const canSubmit = !!option && !!parsed?.valid;

  const preview = def.previewMetric?.[point.id];
  const previewFor = (o: PointOption) => {
    if (!preview || o.input || o.escalate || o.dismiss) return null;
    const facts = { ...state.facts, ...(o.set ?? {}) };
    const addedDocs = o.addDoc ? [...state.addedDocs, o.addDoc] : state.addedDocs;
    const simulated = def.derive({ ...state, facts, addedDocs, points: { ...state.points, [point.id]: { status: "answered" } } }, all);
    return preview(simulated);
  };

  const submit = () => {
    if (!option || !parsed?.valid) return;
    setBefore(snap(view));
    const label = option.input ? parsed.label : option.label;
    if (option.addDoc) {
      setPhase("reading");
      window.setTimeout(() => {
        dispatch({ type: "answer", s, pointId: point.id, optionId: option.id, label: "Document ajouté et lu" });
        setPhase("done");
      }, 1400);
      return;
    }
    dispatch({ type: "answer", s, pointId: point.id, optionId: option.id, value: option.input ? parsed.value : undefined, label });
    setPhase("done");
  };

  const defer = () => {
    dispatch({ type: "defer", s, pointId: point.id });
    setPhase("deferred");
  };

  const nextPoint = progress.queue.find((p) => p.id !== point.id && state.points[p.id]?.status === "open") ?? progress.queue.find((p) => p.id !== point.id);
  const goNext = () => (nextPoint ? go("points", nextPoint.id) : go("points"));

  if (phase === "reading") {
    return (
      <Card className="mt-6 p-6 md:p-10" >
        <div aria-live="polite" className="flex items-center gap-4">
          <span className="grid h-12 w-12 place-items-center rounded-full bg-[var(--o-accent-soft-2)] text-[var(--o-accent-strong)] motion-safe:animate-[fiscal-analyzing-pulse_1.2s_ease-in-out_infinite]">
            <Icon name="doc" className="h-5 w-5" />
          </span>
          <div>
            <p className={`${serif} text-[24px] text-[var(--o-ink)]`}>Je lis votre document…</p>
            <p className="text-[14px] text-[var(--o-ink-3)]">Simulation : le document fictif du scénario est ajouté.</p>
          </div>
        </div>
      </Card>
    );
  }

  if (phase === "done" || phase === "deferred") {
    const after = snap(view);
    const changes: string[] = [];
    if (before && phase === "done") {
      if (before.loyers !== after.loyers) changes.push(`Loyers de l’année : ${eur(before.loyers)} → ${eur(after.loyers)}`);
      if (before.depenses !== after.depenses) changes.push(`Dépenses : ${eur(before.depenses)} → ${eur(after.depenses)}`);
      if (before.usure !== after.usure) changes.push(`Usure calculée cette année : ${eur(before.usure)} → ${eur(after.usure)}`);
      if (before.result !== after.result) changes.push(`Résultat : ${eur(before.result)} → ${eur(after.result)}`);
      if (before.reserve !== after.reserve) changes.push(`Mis de côté pour la suite : ${eur(before.reserve)} → ${eur(after.reserve)}`);
    }
    const escalated = state.points[point.id]?.status === "escalated";
    const escalateText = point.options.find((o) => o.escalate)?.escalate;
    return (
      <Card className="mt-6 p-6 md:p-10">
        <div aria-live="polite">
          <span className={`grid h-12 w-12 place-items-center rounded-full ${phase === "deferred" ? "bg-[var(--o-sand)] text-[var(--o-ink-2)]" : escalated ? "bg-[var(--o-warn-soft)] text-[var(--o-warn)]" : "bg-[var(--o-ok-soft)] text-[var(--o-ok)]"}`}>
            <Icon name={phase === "deferred" ? "pause" : escalated ? "shield" : "check"} className="h-5 w-5" />
          </span>
          <h2 className={`${serif} mt-5 text-[30px] leading-tight text-[var(--o-ink)]`}>
            {phase === "deferred" ? "Mis de côté." : escalated ? "Merci, je le fais vérifier." : "Noté."}
          </h2>
          <p className="mt-2 text-[15.5px] leading-7 text-[var(--o-ink-2)]">
            {phase === "deferred"
              ? point.blocking
                ? "Je vous le rappellerai : votre dossier ne pourra pas être finalisé sans cette réponse. Tout le reste avance."
                : "C’est facultatif : votre dossier pourra être finalisé sans."
              : escalated
                ? escalateText
                : `Votre réponse : ${state.points[point.id]?.answer ?? ""}.`}
          </p>
          {changes.length > 0 && (
            <div className="mt-5 rounded-2xl bg-[var(--o-bg)] p-4">
              <p className="text-[13px] font-medium uppercase tracking-[0.1em] text-[var(--o-ink-3)]">Ce que cela a changé</p>
              <ul className="mt-2 grid gap-1 text-[14.5px] text-[var(--o-ink)]">
                {changes.map((c) => (
                  <li key={c} className="tabular-nums">{c}</li>
                ))}
              </ul>
            </div>
          )}
          {phase === "done" && !escalated && changes.length === 0 && (
            <p className="mt-3 text-[14px] text-[var(--o-ink-3)]">Vos montants n’ont pas changé : votre réponse confirme ce que j’avais estimé.</p>
          )}
        </div>
        <div className="mt-8 hidden flex-wrap gap-3 md:flex">
          <PrimaryButton onClick={goNext}>
            {nextPoint ? "Point suivant" : "Terminer"} <Icon name="arrow" />
          </PrimaryButton>
          <SecondaryButton onClick={() => go("dossier")}>Revenir au dossier</SecondaryButton>
        </div>
        <MobileBar>
          <PrimaryButton className="w-full" onClick={goNext}>
            {nextPoint ? "Point suivant" : "Terminer"} <Icon name="arrow" />
          </PrimaryButton>
        </MobileBar>
      </Card>
    );
  }

  return (
    <div className="mt-6">
      <div className="flex flex-wrap items-center gap-2">
        <Pill tone={kind.tone}>
          <Icon name={kind.icon} className="h-3 w-3" />
          {kind.label}
        </Pill>
        {!point.blocking && <Pill tone="neutral">Ne bloque pas votre dossier</Pill>}
        {pointState.status === "deferred" && <Pill tone="neutral">Mis de côté</Pill>}
      </div>
      <h1 className={`${serif} mt-4 text-[30px] leading-[1.12] text-[var(--o-ink)] md:text-[38px]`}>{point.title}</h1>
      <p className="mt-3 text-[16px] leading-7 text-[var(--o-ink-2)]">{point.context}</p>

      {pointState.status === "answered" && (
        <p className="mt-4 rounded-2xl bg-[var(--o-ok-soft)] px-4 py-3 text-[14.5px] text-[var(--o-ink)]">
          Votre réponse actuelle : <span className="font-medium">{pointState.answer}</span>. Vous pouvez la modifier ci-dessous.
        </p>
      )}

      {point.sources && (
        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          {point.sources.map((src, i) => (
            <Card key={src.docId} className="p-5">
              <p className="text-[12px] font-medium uppercase tracking-[0.12em] text-[var(--o-ink-3)]">Source {String.fromCharCode(65 + i)}</p>
              <p className={`${serif} mt-2 text-[26px] leading-none text-[var(--o-ink)]`}>{src.value}</p>
              <p className="mt-2 text-[14px] text-[var(--o-ink-2)]">{src.label}</p>
              <TextButton className="mt-3" onClick={() => openDoc(src.docId)}>
                <Icon name="eye" /> Voir dans le document
              </TextButton>
            </Card>
          ))}
        </div>
      )}

      <div className="mt-5">
        <Explain summary="Pourquoi je vous pose cette question">{point.why}</Explain>
      </div>

      <fieldset className="mt-6">
        <legend className="text-[13px] font-medium uppercase tracking-[0.12em] text-[var(--o-ink-3)]">Votre réponse</legend>
        <div className="mt-3 grid gap-2.5" role="radiogroup">
          {point.options.map((o) => {
            const isSel = selected === o.id;
            const pv = previewFor(o);
            return (
              <div key={o.id}>
                <label
                  className={`flex cursor-pointer items-start gap-3 rounded-2xl border px-4 py-3.5 transition ${
                    isSel ? "border-[var(--o-accent)] bg-[var(--o-accent-soft)] shadow-[0_0_0_3px_rgba(232,125,58,0.12)]" : "border-[var(--o-line)] bg-[var(--o-surface)] hover:border-[#DAD3C8]"
                  }`}
                >
                  <input
                    type="radio"
                    name={`opt-${point.id}`}
                    value={o.id}
                    checked={isSel}
                    onChange={() => {
                      setSelected(o.id);
                      setRaw("");
                    }}
                    className="mt-1 h-4 w-4 accent-[var(--o-accent-strong)]"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="text-[15.5px] font-medium text-[var(--o-ink)]">{o.label}</span>
                      {o.recommended && <Pill tone="accent">Proposé</Pill>}
                    </span>
                    {o.hint && <span className="block text-[13.5px] leading-5 text-[var(--o-ink-3)]">{o.hint}</span>}
                    {pv && <span className="mt-1 block text-[13px] tabular-nums text-[var(--o-ink-2)]">→ {pv}</span>}
                  </span>
                </label>
                {isSel && o.input && (
                  <div className="mt-2 pl-4">
                    <label className="block text-[13px] text-[var(--o-ink-2)]">
                      {o.input.kind === "date" ? "Date" : o.input.kind === "percent" ? "Part du terrain (%)" : "Montant (€)"}
                      <input
                        type={o.input.kind === "date" ? "date" : "text"}
                        inputMode={o.input.kind === "date" ? undefined : "decimal"}
                        min={o.input.kind === "date" ? "2026-03-14" : undefined}
                        max={o.input.kind === "date" ? "2026-12-31" : undefined}
                        value={raw}
                        onChange={(e) => setRaw(e.target.value)}
                        autoFocus
                        className="mt-1 block w-full max-w-[240px] rounded-xl border border-[var(--o-line)] bg-[var(--o-surface)] px-3 py-2.5 text-[15px] text-[var(--o-ink)] outline-none focus:border-[var(--o-accent)] focus:shadow-[0_0_0_3px_rgba(232,125,58,0.15)]"
                      />
                    </label>
                    {raw && parsed && !parsed.valid && <p className="mt-1.5 text-[13px] text-[var(--o-err)]">Cette valeur ne semble pas possible pour ce dossier.</p>}
                    {parsed?.warning && <p className="mt-1.5 text-[13px] text-[var(--o-warn)]">{parsed.warning}</p>}
                  </div>
                )}
                {isSel && o.escalate && (
                  <p className="mt-2 rounded-xl bg-[var(--o-warn-soft)] px-4 py-2.5 text-[13.5px] leading-5 text-[var(--o-ink-2)]">
                    Je ne conclurai pas seul sur cette situation : elle sera transmise pour vérification.
                  </p>
                )}
              </div>
            );
          })}
        </div>
      </fieldset>

      {point.delegate && (
        <div className="mt-5">
          {!showDelegate ? (
            <SecondaryButton onClick={() => setShowDelegate(true)}>
              <Icon name="mail" /> Demander à {point.delegate.to}
            </SecondaryButton>
          ) : (
            <Card className="p-5">
              <p className="text-[14px] font-medium text-[var(--o-ink)]">Message prêt à envoyer à {point.delegate.to}</p>
              <pre className="mt-3 whitespace-pre-wrap rounded-xl bg-[var(--o-bg)] p-4 font-sans text-[13.5px] leading-6 text-[var(--o-ink-2)]">{point.delegate.message}</pre>
              <div className="mt-4 flex flex-wrap gap-3">
                <SecondaryButton
                  onClick={() => {
                    navigator.clipboard?.writeText(point.delegate?.message ?? "").catch(() => undefined);
                    notify("Message copié.");
                  }}
                >
                  <Icon name="copy" /> Copier
                </SecondaryButton>
                <PrimaryButton onClick={defer}>C’est envoyé — je mets ce point de côté</PrimaryButton>
              </div>
            </Card>
          )}
        </div>
      )}

      <div className="mt-8 hidden items-center gap-5 md:flex">
        <PrimaryButton onClick={submit} disabled={!canSubmit}>
          Valider ma réponse
        </PrimaryButton>
        <TextButton onClick={defer}>
          <Icon name="clock" /> {point.deferLabel} — plus tard
        </TextButton>
      </div>
      <p className="mt-3 hidden text-[13px] text-[var(--o-ink-3)] md:block">
        {point.blocking ? "Vous pouvez reporter cette question. Elle restera nécessaire pour finaliser votre dossier." : "Facultatif : votre dossier peut être finalisé sans réponse."}
      </p>

      <MobileBar>
        <PrimaryButton className="w-full" onClick={submit} disabled={!canSubmit}>
          Valider ma réponse
        </PrimaryButton>
        <button type="button" onClick={defer} className="mt-2 w-full text-center text-[13.5px] font-medium text-[var(--o-accent-text)]">
          {point.deferLabel} — plus tard
        </button>
      </MobileBar>
    </div>
  );
}
