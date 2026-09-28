"use client";

/**
 * R14.4A — F009 (activité) mounted inside V3, without leaving V3's shell.
 *
 * This is an ADAPTER, not a rewrite: the exact same gates, providers and
 * business owner used by the legacy scoped correction path (the route group
 * wrapping the historical F009 panel) are reused here verbatim. Only the
 * visual shell differs — the legacy header/carousel chrome is replaced by a
 * thin V3-styled wrapper reusing `prototype.module.css`. No F009 rule,
 * extraction, validation, reducer or persistence logic is duplicated.
 */

import { Suspense } from "react";
import { FeedbackProvider } from "@/components/lmnp/shared/FeedbackProvider";
import { DossierProvider } from "@/lib/lmnp/dossier";
import { LmnpProvider, useLmnp } from "@/lib/lmnp/store";
import { V3CorrectionEntryGate } from "@/components/lmnp/app-shell/V3CorrectionEntryGate";
import { V3CorrectionReturnBar } from "@/components/lmnp/app-shell/V3CorrectionReturnBar";
import { ExplicitDossierScopeGate } from "@/components/lmnp/app-shell/ExplicitDossierScopeGate";
import { F009ActiviteAssistantPanel } from "@/components/lmnp/assistants/F009ActiviteAssistantPanel";
import { InpiCompanionPanel } from "@/components/lmnp/inpi-companion/InpiCompanionPanel";
import { shouldShowInpiCompanion } from "@/components/lmnp/inpi-companion/should-show-inpi-companion";
import styles from "./prototype.module.css";

function V3ActivityContent() {
  const { workspace, dossierInpiStatus } = useLmnp();
  const year = workspace.fiscalYear.year;
  return (
    <div className={styles.root}>
      <div className={styles.labBar}>
        <div><span className={styles.labDot} /> LABORATOIRE UX V3.1 <span className={styles.labDivider}>/</span> Activité · exercice {year}</div>
      </div>
      <header className={styles.header}>
        <div className={styles.brand}><span className={styles.brandMark}>✳</span><span>L’Assistant du Réel<small>VOTRE COMPTABILITÉ LMNP</small></span></div>
        <div />
        <div className={styles.headerRight}><span>Activité · {year}</span><span className={styles.avatar}>✳</span></div>
      </header>
      <main className={styles.main}>
        <section className={styles.realActions} aria-label="Retour au dossier">
          <V3CorrectionReturnBar />
        </section>
        <F009ActiviteAssistantPanel key={workspace.fiscalYear.id} />
        {shouldShowInpiCompanion(dossierInpiStatus?.status) ? (
          <section id="activite-inpi-companion" aria-label="Compagnon INPI"><InpiCompanionPanel /></section>
        ) : null}
      </main>
      <footer className={styles.footer}>
        <span>Vos modifications sont enregistrées dans votre dossier réel</span>
        <span>L’Assistant du Réel · laboratoire V3.1</span>
      </footer>
    </div>
  );
}

export function V3ActivityRoute() {
  return (
    <Suspense fallback={<div role="status">Chargement du parcours…</div>}>
      <V3CorrectionEntryGate>
        <ExplicitDossierScopeGate>{dossier => (
          <DossierProvider explicitDossier={dossier}>
            <LmnpProvider explicitDossier={dossier}>
              <FeedbackProvider>
                <V3ActivityContent />
              </FeedbackProvider>
            </LmnpProvider>
          </DossierProvider>
        )}</ExplicitDossierScopeGate>
      </V3CorrectionEntryGate>
    </Suspense>
  );
}
