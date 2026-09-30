"use client";

/**
 * R15 — V3 en mode RÉEL. Alimenté uniquement par le workspace réel, ses read models et le scope vérifié.
 * Ce module (et ses dépendances) n'importe jamais `./fixtures`, `./model` ni `./V3Prototype` : aucune valeur de
 * démonstration ne peut apparaître ici. Lecture seule ; toute modification passe par les assistants propriétaires.
 */
import { useRef, useState, type ReactNode } from "react";
import type { PersistedWorkspace } from "@/lib/lmnp/store/persistence";
import { v3CorrectionActionFor } from "@/lab/v2-dossier/correction-registry";
import type { V3CorrectionScope } from "@/lab/v2-dossier/correction-scope";
import type { V3DocumentProcessingStatus, V3DocumentsReadModel } from "@/lab/v2-dossier/document-read-model";
import { buildV3ActivityDetail } from "@/lab/v2-dossier/activity-detail-read-model";
import { buildV3FinancingDetail } from "@/lab/v2-dossier/financing-detail-read-model";
import { buildV3DossierDetailReadModel, type V3DomainId, type V3DomainReadModel } from "@/lab/v2-dossier/read-model";
import { buildActivityView, REVIEW_IN_F009_LABEL } from "./activity-view-model";
import { RealActivityReport, RealActivityWorkspace } from "./RealActivity";
import { buildFinancingView, financingRubrique, REVIEW_IN_F011_LABEL } from "./financing-view-model";
import { RealFinancementReport, RealFinancementWorkspace } from "./RealFinancement";
import { resolveRealUserActions } from "./real-user-actions";
import { Drawer } from "./shell";
import styles from "./prototype.module.css";

type View = "dossier" | "documents" | "financement" | "activite";

const DOCUMENT_STATUS: Record<V3DocumentProcessingStatus, string> = {
  uploaded: "Reçu", processing: "Analyse en cours", analyzed: "Analyse terminée", failed: "Analyse à reprendre", unknown: "État non déterminé",
};

function DomainPanelBody({ domain, scope }: { domain: V3DomainReadModel; scope: V3CorrectionScope | null }) {
  const action = v3CorrectionActionFor(domain.id, scope);
  return <>
    <section className={styles.panelSection}>
      <h3 className={styles.eyebrow}>Ce que le dossier sait</h3>
      <ul className={styles.findings}>{domain.facts.map(fact => <li key={fact.id}>
        <span aria-hidden="true">{fact.value === null ? "·" : "✓"}</span>{fact.label} · {fact.value ?? "Non renseigné"}{fact.evidence ? ` · ${fact.evidence}` : ""}
      </li>)}</ul>
    </section>
    <section className={styles.panelSection}>
      <h3 className={styles.eyebrow}>Sources associées</h3>
      {domain.sources.length > 0
        ? <ul className={styles.findings}>{domain.sources.map(source => <li key={source.id}><span aria-hidden="true">▤</span>{source.label}</li>)}</ul>
        : <p className={styles.panelLead}>Aucune source documentaire disponible pour cette rubrique.</p>}
      <p className={styles.tableNote}>Provenance {domain.provenance === "complete" ? "documentée" : domain.provenance === "partial" ? "partielle" : "indisponible"}.</p>
    </section>
    {action ? <footer className={styles.drawerActions}><a className={styles.secondaryButton} href={action.href}>{action.label}</a></footer> : null}
  </>;
}

export function V3RealPrototype({ workspace, scope, documents }: {
  workspace: PersistedWorkspace;
  scope: V3CorrectionScope | null;
  documents: V3DocumentsReadModel;
}) {
  const [view, setView] = useState<View>("dossier");
  const [openDomain, setOpenDomain] = useState<V3DomainId | null>(null);
  const mainRef = useRef<HTMLElement>(null);

  const year = workspace.fiscalYear.year;
  const detail = buildV3DossierDetailReadModel(workspace);
  const domains = [detail.activity, detail.property, detail.financing, detail.revenue, detail.charges, detail.amortization];
  const userActions = resolveRealUserActions(workspace, scope);
  const financingAction = v3CorrectionActionFor("financing", scope);
  const financingView = buildFinancingView(
    buildV3FinancingDetail(workspace, documents),
    financingAction ? { label: REVIEW_IN_F011_LABEL, href: financingAction.href } : null,
  );
  const activityAction = v3CorrectionActionFor("activity", scope);
  const activityView = buildActivityView(
    buildV3ActivityDetail(workspace, documents),
    activityAction ? { label: REVIEW_IN_F009_LABEL, href: activityAction.href } : null,
  );
  const selected = domains.find(domain => domain.id === openDomain);
  // Same statuses as the read model, except that a financing result that exists but cannot yet be secured is not shown as "À compléter".
  const financingState = financingRubrique(financingView, { summary: detail.financing.summary, complete: detail.financing.status === "complete" });
  const rubrique = (domain: V3DomainReadModel) => {
    if (domain.id === "financing") {
      const verification = financingView.verification !== undefined && financingView.headline !== undefined;
      return { summary: financingState.summary, ok: financingState.tone === "ok", status: financingState.tone === "ok" ? "Complet" : verification ? "Vérification nécessaire" : "À compléter" };
    }
    const ok = domain.status === "complete";
    return { summary: domain.summary, ok, status: ok ? "Complet" : domain.status === "unsupported" ? "Non pris en charge" : "À compléter" };
  };

  function go(next: View) {
    setView(next);
    setOpenDomain(null);
    window.scrollTo({ top: 0, behavior: "instant" });
    window.setTimeout(() => mainRef.current?.focus({ preventScroll: true }), 0);
  }

  const back: ReactNode = <button type="button" className={styles.backLink} onClick={() => go("dossier")}>← Mon dossier</button>;

  return <div className={styles.root}>
    <div className={styles.labBar}><span><span className={styles.labDot} aria-hidden="true" /> LAB UX V3 · dossier réel · lecture seule · exercice {year}</span></div>
    <header className={styles.header}>
      <span className={styles.brand}><span className={styles.brandMark} aria-hidden="true">✳</span>L’Assistant du Réel</span>
      <nav aria-label="Navigation principale" className={styles.nav}>
        <button type="button" aria-current={view !== "documents" ? "page" : undefined} onClick={() => go("dossier")}>Mon dossier</button>
        <button type="button" aria-current={view === "documents" ? "page" : undefined} onClick={() => go("documents")}>Mes documents</button>
      </nav>
      <span className={styles.user}><span className={styles.avatar} aria-hidden="true">✳</span><span className={styles.srOnly}>Dossier réel</span></span>
    </header>
    <main ref={mainRef} tabIndex={-1} className={styles.main}>
      {view === "financement" ? <RealFinancementWorkspace view={financingView} back={back} />
        : view === "activite" ? <RealActivityWorkspace view={activityView} back={back} />
        : view === "documents" ? <>
          <header className={styles.pageHead}><p className={styles.eyebrow}>Mes documents {year}</p><h1>Vos documents</h1></header>
          {documents.state === "unknown"
            ? <p className={styles.panelLead} role="alert">Nous ne pouvons pas charger vos documents pour le moment.</p>
            : documents.documents.length === 0
              ? <p className={styles.panelLead}>Aucun document enregistré pour ce dossier et cet exercice.</p>
              : <ul className={styles.docList}>{documents.documents.map(doc => <li key={doc.id}>
                <span className={styles.fileGlyph} aria-hidden="true">▤</span><strong>{doc.fileName}</strong>
                <span>{doc.label !== doc.fileName ? doc.label : ""}</span>
                <span className={doc.processingStatus === "analyzed" ? styles.pieceDone : styles.pieceReading}>{DOCUMENT_STATUS[doc.processingStatus]}</span>
              </li>)}</ul>}
        </>
          : <>
            <header className={styles.pageHead}>
              <p className={styles.eyebrow}>Mon dossier {year}</p>
              <h1>Votre dossier {year}</h1>
              <p className={styles.lead}>Les informations ci-dessous proviennent du dossier enregistré.</p>
            </header>
            <section className={styles.needCard} aria-label="Besoin de vous">
              <div className={styles.needTop}><p className={styles.eyebrow}>J’ai besoin de vous</p></div>
              {userActions.state === "unknown"
                ? <p className={styles.panelLead}>Nous vérifions les prochaines étapes de votre dossier.</p>
                : userActions.actions.length === 0
                  ? <p className={styles.panelLead}>Rien à faire pour le moment : votre dossier n’attend aucune action de votre part.</p>
                  : <ul className={styles.findings}>{userActions.actions.map(action => <li key={action.id}>
                    <span aria-hidden="true">!</span>{action.label} <a className={styles.textButton} href={action.href}>Continuer</a>
                  </li>)}</ul>}
            </section>
            <section className={styles.domains} aria-labelledby="v3r-domains-title">
              <h2 id="v3r-domains-title" className={styles.sectionTitle}>Votre dossier en six rubriques</h2>
              <ul className={styles.domainGrid}>{domains.map(domain => {
                const { ok, status, summary } = rubrique(domain);
                return <li key={domain.id}>
                  <button type="button" className={styles.domainCard} onClick={() => setOpenDomain(domain.id)} aria-haspopup="dialog">
                    <span className={styles.domainName}>{domain.label}</span>
                    <span className={`${styles.domainStatus} ${ok ? styles.toneOk : styles.toneAttention}`}><span aria-hidden="true">{ok ? "✓" : "!"}</span> {status}</span>
                    <span className={styles.domainMain}>{summary}</span>
                    <span className={styles.domainChevron} aria-hidden="true">›</span>
                  </button>
                </li>;
              })}</ul>
            </section>
          </>}
    </main>
    {selected ? <Drawer title={selected.label} onClose={() => setOpenDomain(null)}
      status={<span className={`${styles.domainStatus} ${rubrique(selected).ok ? styles.toneOk : styles.toneAttention}`}>{rubrique(selected).summary}</span>}>
      {selected.id === "activity"
        ? <>
          <RealActivityReport view={activityView} />
          <div className={styles.drawerActions}><button type="button" className={styles.textButton} onClick={() => go("activite")}>Ouvrir l’espace de travail Activité</button></div>
        </>
        : selected.id === "financing"
        ? <>
          <RealFinancementReport view={financingView} />
          <div className={styles.drawerActions}><button type="button" className={styles.textButton} onClick={() => go("financement")}>Ouvrir l’espace de travail Financement</button></div>
        </>
        : <DomainPanelBody domain={selected} scope={scope} />}
    </Drawer> : null}
  </div>;
}
