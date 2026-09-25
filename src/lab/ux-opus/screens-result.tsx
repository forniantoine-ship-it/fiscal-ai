"use client";

import { type ReactNode, useEffect, useState } from "react";

import { BackLink, MobileBar, PageTitle } from "./chrome";
import { useScenario } from "./context";
import { KIND_META } from "./meta";
import { type ScenarioId, eur } from "./model";
import { navigate, routeHash } from "./store";
import { Card, Eyebrow, Icon, Money, PrimaryButton, SecondaryButton, TextButton, serif } from "./ui";

function ResultLine({
  label,
  hint,
  value,
  strong,
  explain,
  onDetail,
  subtotal,
}: {
  label: string;
  hint?: string;
  value: ReactNode;
  strong?: boolean;
  subtotal?: boolean;
  explain?: ReactNode;
  onDetail?: () => void;
}) {
  if (!explain) {
    return (
      <div className={`flex items-baseline justify-between gap-4 px-5 py-4 md:px-7 ${subtotal ? "bg-[var(--o-bg)]" : ""}`}>
        <span className={`text-[15.5px] ${subtotal ? "font-medium text-[var(--o-ink)]" : "text-[var(--o-ink-2)]"}`}>{label}</span>
        <span className={`${strong ? `${serif} text-[30px]` : "text-[16px] font-medium"} text-[var(--o-ink)]`}>{value}</span>
      </div>
    );
  }
  return (
    <details className="group [&_summary::-webkit-details-marker]:hidden">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 hover:bg-[var(--o-bg)] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--o-accent)] md:px-7">
        <span className="min-w-0">
          <span className="flex items-center gap-2 text-[15.5px] text-[var(--o-ink)]">
            <Icon name="chevron" className="h-3.5 w-3.5 shrink-0 text-[var(--o-ink-4)] transition group-open:rotate-90" />
            {label}
          </span>
          {hint && <span className="block pl-[22px] text-[12.5px] uppercase tracking-[0.1em] text-[var(--o-ink-4)]">{hint}</span>}
        </span>
        <span className="text-[16px] font-medium text-[var(--o-ink)]">{value}</span>
      </summary>
      <div className="px-5 pb-5 pl-[42px] text-[14.5px] leading-6 text-[var(--o-ink-2)] md:px-7 md:pl-[50px]">
        {explain}
        {onDetail && (
          <TextButton className="mt-2" onClick={onDetail}>
            Vérifier le détail et les sources <Icon name="arrow" />
          </TextButton>
        )}
      </div>
    </details>
  );
}

export function ResultScreen({ s }: { s: ScenarioId }) {
  const { def, view, progress, go, openPanel } = useScenario(s);
  const { seq } = view;
  const usure = seq.amortUsed + seq.ardUsed;
  const ready = progress.ready;
  const nOpen = progress.blockingOpen.length;
  const encaissements = view.loyers.rows.filter((r) => (r.amount ?? 0) > 0 && !r.removed).length;
  const depensesLabels = view.depenses.rows.filter((r) => !r.removed && r.flag !== "gap").map((r) => r.label.toLowerCase());

  const primary = ready
    ? { label: "Préparer ma liasse", run: () => go("liasse") }
    : nOpen > 0
      ? { label: nOpen > 1 ? `Répondre aux ${nOpen} points` : "Répondre au dernier point", run: () => go("points") }
      : { label: "Revenir à mon dossier", run: () => go("dossier") };

  return (
    <main className="mx-auto max-w-[1180px] px-4 pb-36 pt-8 md:px-8 md:pb-24 md:pt-12">
      <PageTitle
        eyebrow={`Résultat ${def.year} · ${view.propertyShort}`}
        title={view.provisional ? "Votre résultat, en l’état." : "Votre résultat de location meublée."}
        lead="En quelques lignes : ce que vous avez encaissé, ce que vous avez payé, et ce que l’usure du logement vous permet de déduire. Chaque ligne s’ouvre."
      />

      {view.provisional && (
        <div className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[var(--o-warn-line)] bg-[var(--o-warn-soft)] px-5 py-4">
          <p className="text-[14.5px] text-[var(--o-ink)]">
            <span className="font-medium">Provisoire.</span>{" "}
            {progress.escalated.length > 0 && nOpen === 0
              ? "Un point est en vérification : ce résultat peut encore changer."
              : `${nOpen} réponse${nOpen > 1 ? "s" : ""} peu${nOpen > 1 ? "vent" : "t"} encore le modifier. Les montants en attente sont estimés.`}
          </p>
          {nOpen > 0 && (
            <TextButton onClick={() => go("points")}>
              Répondre <Icon name="arrow" />
            </TextButton>
          )}
        </div>
      )}

      <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] lg:items-start">
        <Card className="overflow-hidden">
          <div className="divide-y divide-[var(--o-line-soft)]">
            <ResultLine
              label="Vous avez encaissé"
              hint="recettes"
              value={<Money value={seq.recettes} />}
              explain={<p>Tous les loyers reçus en {def.year} pour ce logement : {encaissements} encaissement{encaissements > 1 ? "s" : ""} retrouvé{encaissements > 1 ? "s" : ""} dans vos documents ou confirmé{encaissements > 1 ? "s" : ""} par vous.</p>}
              onDetail={() => openPanel("loyers")}
            />
            <ResultLine
              label="Vous avez payé"
              hint="charges déductibles"
              value={<Money value={-seq.charges} signed />}
              explain={<p>Ce que vous avez payé pour ce logement et qui réduit votre résultat : {depensesLabels.join(", ")}.</p>}
              onDetail={() => openPanel("depenses")}
            />
            <ResultLine label="Avant l’usure du logement" value={<Money value={seq.avant} />} subtotal />
            {seq.deficitsUsed > 0 && (
              <ResultLine
                label="Déficit des années passées"
                hint="déficit reportable"
                value={<Money value={-seq.deficitsUsed} signed />}
                explain={<p>Une année précédente, vos dépenses avaient dépassé vos loyers. Ce déficit se déduit en premier, car il expire au bout de 10 ans — contrairement à l’usure mise de côté, qui n’expire jamais.</p>}
                onDetail={() => openPanel("historique")}
              />
            )}
            <ResultLine
              label="Usure déduite cette année"
              hint="amortissements"
              value={<Money value={-usure} signed />}
              explain={
                <>
                  <p>
                    L’usure du logement et des meubles calculée pour {def.year} est de <span className="font-medium text-[var(--o-ink)]">{eur(seq.amortYear)}</span>.
                    {seq.amortUsed < seq.amortYear
                      ? ` Elle ne peut pas créer de perte : j’en déduis seulement ${eur(seq.amortUsed)}, ce qui ramène votre résultat à zéro. Les ${eur(seq.newArd)} restants ne sont pas perdus : ils sont mis de côté.`
                      : " Elle est entièrement déduite cette année."}
                  </p>
                  {seq.ardUsed > 0 && <p className="mt-2">J’ai aussi utilisé {eur(seq.ardUsed)} d’usure mise de côté les années précédentes.</p>}
                </>
              }
              onDetail={() => openPanel("amortissements")}
            />
            <div className="flex items-end justify-between gap-4 bg-[var(--o-ink)] px-5 py-6 text-white md:px-7">
              <div>
                <p className="text-[15.5px] font-medium">Résultat de votre location meublée</p>
                <p className="text-[12.5px] uppercase tracking-[0.1em] text-white/60">résultat fiscal LMNP {def.year}</p>
              </div>
              <p className={`${serif} text-[40px] leading-none`}>{seq.result < 0 ? `− ${eur(-seq.result)}` : eur(seq.result)}</p>
            </div>
          </div>
        </Card>

        <div className="grid gap-6">
          <Card className="p-6">
            <Eyebrow>Mis de côté pour les années suivantes</Eyebrow>
            <p className={`${serif} mt-3 text-[36px] leading-none text-[var(--o-ink)]`}>{eur(seq.ardStockAfter)}</p>
            <p className="mt-2 text-[14.5px] leading-6 text-[var(--o-ink-2)]">d’usure non encore déduite. Elle réduira vos résultats futurs, sans limite de durée.</p>
            {seq.deficitsStockAfter > 0 && (
              <p className="mt-3 text-[14.5px] leading-6 text-[var(--o-ink-2)]">
                Et <span className="font-medium text-[var(--o-ink)]">{eur(seq.deficitsStockAfter)}</span> de déficit, utilisable pendant 10 ans.
              </p>
            )}
            <TextButton className="mt-4" onClick={() => openPanel("historique")}>
              Voir l’historique <Icon name="arrow" />
            </TextButton>
          </Card>
          <Card className="border-[var(--o-accent-line)] bg-[var(--o-accent-soft)] p-6">
            <p className={`${serif} text-[22px] leading-tight text-[var(--o-ink)]`}>Ce résultat n’est pas votre impôt.</p>
            <p className="mt-2 text-[14.5px] leading-6 text-[var(--o-ink-2)]">
              C’est le résultat de votre activité de location meublée. Il se reporte sur votre déclaration de revenus, où votre impôt dépend de l’ensemble des revenus de votre foyer.
              {seq.result === 0 && " Un résultat à zéro ne dispense pas de déposer la liasse."}
            </p>
          </Card>
          <SecondaryButton onClick={() => openPanel("trace")}>
            <Icon name="eye" /> Vérifier le calcul complet
          </SecondaryButton>
        </div>
      </div>

      <div className="mt-10 hidden md:block">
        <PrimaryButton onClick={primary.run}>
          {primary.label} <Icon name="arrow" />
        </PrimaryButton>
      </div>
      <MobileBar>
        <PrimaryButton className="w-full" onClick={primary.run}>
          {primary.label} <Icon name="arrow" />
        </PrimaryButton>
      </MobileBar>
    </main>
  );
}

const CHECKS = [
  "Chaque montant est relié à un document ou à une de vos réponses",
  "Aucune contradiction ne reste ouverte",
  "Loyers couverts pour toute la période de location",
  "Ordre de déduction respecté : déficits, puis usure de l’année, puis usure mise de côté",
  "Cohérence entre résultat, immobilisations et bilan",
];

export function LiasseScreen({ s }: { s: ScenarioId }) {
  const { def, state, view, progress, dispatch, go } = useScenario(s);
  const [attested, setAttested] = useState(false);
  const [checkStep, setCheckStep] = useState(-1);

  useEffect(() => {
    if (checkStep < 0 || checkStep >= CHECKS.length) return;
    const id = window.setTimeout(() => {
      setCheckStep((n) => n + 1);
      if (checkStep + 1 === CHECKS.length) dispatch({ type: "generate", s });
    }, 480);
    return () => window.clearTimeout(id);
  }, [checkStep, dispatch, s]);

  if (!progress.ready) {
    const blockers = [...progress.blockingOpen, ...progress.escalated];
    return (
      <main className="mx-auto max-w-[760px] px-4 pb-36 pt-8 md:px-8 md:pt-12">
        <BackLink onClick={() => go("resultat")} label="Mon résultat" />
        <div className="mt-8">
          <PageTitle
            eyebrow={`Liasse ${def.year}`}
            title="Je ne peux pas encore préparer votre liasse."
            lead="Une liasse fiscale vous engage. Je ne la génère pas tant qu’une information indispensable manque ou reste incertaine — même si tout le reste est prêt."
          />
        </div>
        <Card className="mt-8 divide-y divide-[var(--o-line-soft)]">
          {blockers.map((p) => {
            const escalated = state.points[p.id]?.status === "escalated";
            return (
              <button key={p.id} type="button" onClick={() => go("points", p.id)} className="flex w-full items-start gap-3 px-5 py-4 text-left hover:bg-[var(--o-bg)] md:px-6">
                <span className={`mt-0.5 ${escalated ? "text-[var(--o-warn)]" : "text-[var(--o-accent-strong)]"}`}>
                  <Icon name={escalated ? "shield" : KIND_META[p.kind].icon} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[15px] text-[var(--o-ink)]">{p.title}</span>
                  <span className="block text-[13px] text-[var(--o-ink-3)]">
                    {escalated ? "En vérification par un expert" : state.points[p.id]?.status === "deferred" ? "Mis de côté" : KIND_META[p.kind].label}
                  </span>
                </span>
                <Icon name="chevron" className="mt-1 h-4 w-4 text-[var(--o-ink-4)]" />
              </button>
            );
          })}
        </Card>
        {progress.blockingOpen.length > 0 && (
          <PrimaryButton className="mt-8 hidden md:inline-flex" onClick={() => go("points", progress.blockingOpen[0].id)}>
            Répondre maintenant <Icon name="arrow" />
          </PrimaryButton>
        )}
        {progress.blockingOpen.length > 0 && (
          <MobileBar>
            <PrimaryButton className="w-full" onClick={() => go("points", progress.blockingOpen[0].id)}>
              Répondre maintenant <Icon name="arrow" />
            </PrimaryButton>
          </MobileBar>
        )}
      </main>
    );
  }

  if (state.generated) {
    return (
      <main className="mx-auto max-w-[900px] px-4 pb-36 pt-8 md:px-8 md:pt-12">
        <PageTitle
          eyebrow={`Liasse ${def.year} · simulation`}
          title={`Votre liasse ${def.year} est prête.`}
          lead="Dans le produit réel, vous recevriez ici votre dossier complet. Aucun PDF n’est produit par ce prototype."
        />
        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          {[
            ["Note de synthèse", "Ce qui a été fait pour vous, en langage clair."],
            ["Guide de dépôt", "Les étapes, dans l’ordre, jusqu’à impots.gouv.fr."],
            ["Liasse fiscale", "2031 et ses annexes 2033, prêtes à déposer."],
            ["Journal des calculs", "Chaque montant, sa source, sa règle."],
          ].map(([title, text]) => (
            <Card key={title} className="flex items-start gap-4 p-5">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[var(--o-sand)] text-[var(--o-ink-2)]">
                <Icon name="doc" />
              </span>
              <div>
                <p className="text-[15.5px] font-medium text-[var(--o-ink)]">{title}</p>
                <p className="text-[14px] leading-5 text-[var(--o-ink-2)]">{text}</p>
                <p className="mt-1 text-[12.5px] text-[var(--o-ink-4)]">Aperçu non disponible dans le prototype</p>
              </div>
            </Card>
          ))}
        </div>

        <Card className="mt-8 p-6 md:p-8">
          <Eyebrow>À faire maintenant</Eyebrow>
          <h2 className={`${serif} mt-2 text-[28px] leading-tight text-[var(--o-ink)]`}>Déposer votre liasse</h2>
          <ol className="mt-5 grid gap-4">
            {[
              "Connectez-vous à votre espace professionnel sur impots.gouv.fr.",
              "Déposez votre liasse fiscale, dans l’ordre indiqué par votre guide.",
              `Reportez votre résultat (${eur(view.seq.result)}) sur votre déclaration de revenus : votre guide vous indique la case exacte.`,
              "Gardez votre dossier : il servira de point de départ l’an prochain.",
            ].map((step, i) => (
              <li key={step} className="flex gap-4 text-[15px] leading-6 text-[var(--o-ink-2)]">
                <span className={`${serif} grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[var(--o-accent-soft-2)] text-[16px] text-[var(--o-accent-strong)]`}>{i + 1}</span>
                <span className="pt-1">{step}</span>
              </li>
            ))}
          </ol>
        </Card>

        {s === "a" && (
          <Card className="mt-6 flex flex-wrap items-center justify-between gap-4 p-6">
            <div>
              <p className={`${serif} text-[22px] text-[var(--o-ink)]`}>Et l’an prochain ?</p>
              <p className="text-[14.5px] text-[var(--o-ink-2)]">Votre dossier 2027 est déjà ouvert. Je garderai tout ce que nous avons établi.</p>
            </div>
            <SecondaryButton onClick={() => navigate(routeHash({ scenario: "c", screen: "start" }))}>
              Voir l’année suivante <Icon name="arrow" />
            </SecondaryButton>
          </Card>
        )}
        <div className="mt-8">
          <SecondaryButton onClick={() => go("dossier")}>Revenir à mon dossier</SecondaryButton>
        </div>
      </main>
    );
  }

  const optionalLeft = progress.optionalOpen.length;
  return (
    <main className="mx-auto max-w-[760px] px-4 pb-40 pt-8 md:px-8 md:pt-12">
      <BackLink onClick={() => go("resultat")} label="Mon résultat" />
      <div className="mt-8">
        <PageTitle
          eyebrow={`Liasse ${def.year}`}
          title="Une dernière confirmation, et je prépare votre liasse."
          lead={`Résultat de votre location meublée : ${eur(view.seq.result)}. Mis de côté pour la suite : ${eur(view.seq.ardStockAfter)}.`}
        />
      </div>

      {optionalLeft > 0 && (
        <div className="mt-6 rounded-2xl border border-[var(--o-line)] bg-[var(--o-sand)] px-5 py-4 text-[14.5px] leading-6 text-[var(--o-ink-2)]">
          {optionalLeft} question facultative n’a pas de réponse. Vous pouvez continuer : elle ne concerne que des dépenses que vous auriez pu déduire en plus.{" "}
          <TextButton onClick={() => go("points", progress.optionalOpen[0].id)}>Y répondre</TextButton>
        </div>
      )}

      <Card className="mt-6 p-6">
        <label className="flex cursor-pointer items-start gap-3">
          <input type="checkbox" checked={attested} onChange={(e) => setAttested(e.target.checked)} className="mt-1 h-5 w-5 accent-[var(--o-accent-strong)]" disabled={checkStep >= 0} />
          <span className="text-[15px] leading-6 text-[var(--o-ink)]">
            Je confirme que mes documents et mes réponses couvrent l’ensemble des loyers encaissés et des dépenses payées en {def.year} pour ce logement.
          </span>
        </label>
      </Card>

      {checkStep >= 0 && (
        <Card className="mt-6 p-6" >
          <p className="text-[13px] font-medium uppercase tracking-[0.12em] text-[var(--o-ink-3)]">Contrôles avant génération</p>
          <ul className="mt-3 grid gap-2" aria-live="polite">
            {CHECKS.map((c, i) => (
              <li key={c} className={`flex items-start gap-3 text-[14.5px] ${i < checkStep ? "text-[var(--o-ink)]" : "text-[var(--o-ink-4)]"}`}>
                <span className={`mt-0.5 ${i < checkStep ? "text-[var(--o-ok)]" : ""}`}>
                  <Icon name={i < checkStep ? "check" : "clock"} />
                </span>
                {c}
              </li>
            ))}
          </ul>
        </Card>
      )}

      <div className="mt-8 hidden md:block">
        <PrimaryButton onClick={() => setCheckStep(0)} disabled={!attested || checkStep >= 0}>
          Générer ma liasse (simulation)
        </PrimaryButton>
      </div>
      <MobileBar>
        <PrimaryButton className="w-full" onClick={() => setCheckStep(0)} disabled={!attested || checkStep >= 0}>
          Générer ma liasse (simulation)
        </PrimaryButton>
      </MobileBar>
    </main>
  );
}
