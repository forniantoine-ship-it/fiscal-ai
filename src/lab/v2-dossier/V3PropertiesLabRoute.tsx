"use client";

/**
 * MB-MULTI-E2E-LAB-1 — banc de test LAB de l'écran « Mes biens » (ajout de bien, attestations, domaine).
 *
 * Même chaîne de gardes et de providers que `/assistants/biens` et que `V3ActivityRoute` (scope vérifié, DossierProvider,
 * LmnpProvider, persistance serveur) ; le vrai `PropertiesManager` et le vrai `ADD_PROPERTY` sont montés, rien n'est réimplémenté.
 *
 * Seule différence : la capacité d'ÉDITION est fournie LOCALEMENT à ce composant. `MULTI_PROPERTY_CAPABILITIES` (production)
 * n'est pas modifié ; les autres capacités sont héritées telles quelles de la production (livraison, paiement, clôture et exercice
 * suivant fermés ici aussi). Ce contrat n'est
 * exporté d'aucun module de capacités et ne doit être importé que par la route LAB (gardée comme `/lab/v2-dossier/real`).
 */

import { Suspense } from "react";
import { FeedbackProvider } from "@/components/lmnp/shared/FeedbackProvider";
import { DossierProvider } from "@/lib/lmnp/dossier";
import { LmnpProvider } from "@/lib/lmnp/store";
import { V3CorrectionEntryGate } from "@/components/lmnp/app-shell/V3CorrectionEntryGate";
import { V3CorrectionReturnBar } from "@/components/lmnp/app-shell/V3CorrectionReturnBar";
import { ExplicitDossierScopeGate } from "@/components/lmnp/app-shell/ExplicitDossierScopeGate";
import { PropertiesManager } from "@/components/lmnp/biens/PropertiesManager";
import { MULTI_PROPERTY_CAPABILITIES, type MultiPropertyCapabilities } from "@/lib/lmnp/dossier/multi-property-activation";
import styles from "./prototype.module.css";

/** LAB uniquement : édition ouverte, les cinq autres capacités héritées (fermées) de la production. */
export const LAB_EDITION_ONLY_CAPABILITIES: MultiPropertyCapabilities = { ...MULTI_PROPERTY_CAPABILITIES, edition: true };

export function V3PropertiesLabRoute() {
  return (
    <Suspense fallback={<div role="status">Chargement du parcours…</div>}>
      <V3CorrectionEntryGate>
        <ExplicitDossierScopeGate>{dossier => (
          <DossierProvider explicitDossier={dossier}>
            <LmnpProvider explicitDossier={dossier}>
              <FeedbackProvider>
                <div className={styles.root}>
                  <div className={styles.labBar}>
                    <div><span className={styles.labDot} /> LABORATOIRE MULTI-BIENS <span className={styles.labDivider}>/</span> Mes biens · édition ouverte (LAB uniquement)</div>
                  </div>
                  <main className={styles.main}>
                    <section className={styles.realActions} aria-label="Retour au dossier"><V3CorrectionReturnBar /></section>
                    <PropertiesManager capabilities={LAB_EDITION_ONLY_CAPABILITIES} />
                  </main>
                </div>
              </FeedbackProvider>
            </LmnpProvider>
          </DossierProvider>
        )}</ExplicitDossierScopeGate>
      </V3CorrectionEntryGate>
    </Suspense>
  );
}
