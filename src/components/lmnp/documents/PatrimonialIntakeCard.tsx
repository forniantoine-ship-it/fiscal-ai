"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { colors } from "@/design-system/theme/colors";
import { radius } from "@/design-system/theme/radius";
import { spacing } from "@/design-system/theme/spacing";
import { typography } from "@/design-system/theme/typography";
import {
  buildBilanPatrimonial,
  deriveIntakeStateFromBilanPatrimonial,
  type PatrimoineContinuite,
  type PatrimonialIntakeState,
} from "@/lib/lmnp/services/declaration/patrimonial-intake";
import { VentilationTiersIntakeCard } from "./VentilationTiersIntakeCard";
import type { BilanInputs } from "@/runtime/capabilities/bilan/types";

type PatrimonialIntakeCardProps = {
  cardStyle: React.CSSProperties;
  value: BilanInputs | undefined;
  onChange: (value: BilanInputs | undefined) => void;
  /**
   * G1-P1 — continuité N→N+1, telle que persistée sur
   * `FiscalYear.patrimoineOuverture` (résolue une seule fois à la création
   * de CET exercice, jamais recalculée ici). Absente pour un premier
   * exercice, un dossier repris sans continuité interne, ou tant que
   * l'exercice précédent n'a pas lui-même renseigné son intake patrimonial
   * — dans tous ces cas, le comportement G1-P0 (Q0/Q_OUV) reste inchangé.
   */
  patrimoineOuverture?: PatrimoineContinuite;
};

/**
 * G1-P0/G1-P1 — intake patrimonial minimal (2033-A). Composant entièrement
 * contrôlé par un état local (`PatrimonialIntakeState`) : la logique de
 * construction/doctrine INCONNU-NUL_CONFIRME-DECLARE-DERIVE vit dans le
 * module pur `patrimonial-intake.ts` (testé sans React, convention de ce
 * projet) — ce composant ne fait que refléter les réponses et notifier le
 * parent.
 *
 * `value`/`patrimoineOuverture` ne sont utilisés qu'à l'initialisation
 * (réhydratation d'un draft déjà répondu, ou reprise d'une continuité déjà
 * résolue) — leurs changements ultérieurs ne réinitialisent jamais le
 * formulaire en cours de frappe, pour ne pas perdre une saisie locale.
 */
export function PatrimonialIntakeCard({ cardStyle, value, onChange, patrimoineOuverture }: PatrimonialIntakeCardProps) {
  const [state, setState] = useState<PatrimonialIntakeState>(() => ({
    ...deriveIntakeStateFromBilanPatrimonial(value),
    continuite: patrimoineOuverture,
  }));

  const built = useMemo(() => buildBilanPatrimonial(state), [state]);

  // `onChange` via une ref pour ne notifier le parent QUE lorsque `built`
  // change réellement (dépendance de l'effet), jamais à chaque rendu du
  // parent qui recréerait une fonction inline — évite toute boucle de
  // dispatch.
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  useEffect(() => {
    onChangeRef.current(built);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [built]);

  function patch(partial: Partial<PatrimonialIntakeState>) {
    setState((prev) => ({ ...prev, ...partial }));
  }

  return (
    <section className="w-full space-y-6" style={cardStyle}>
      <div>
        <p style={{ fontFamily: typography.fontFamily.display, fontSize: typography.fontSize.lg, color: colors.text.primary }}>
          Quelques questions sur votre situation patrimoniale
        </p>
        <p className="mt-1" style={{ ...typography.body.desktop, color: colors.text.secondary }}>
          Ces réponses complètent votre bilan simplifié (2033-A). Vous pouvez laisser une question sans
          réponse si vous ne savez pas — elle restera simplement non renseignée, jamais devinée.
        </p>
      </div>

      {/* G1-P1 — continuité disponible : Q0/Q_OUV entièrement sautées, valeurs affichées comme dérivées, jamais comme une nouvelle saisie. */}
      {state.continuite ? (
        <div
          style={{
            borderRadius: radius.md,
            border: `1px solid ${colors.border.subtle}`,
            backgroundColor: colors.surface.inset,
            padding: `${spacing.scale[3]} ${spacing.scale[4]}`,
          }}
        >
          <p style={{ ...typography.body.desktop, color: colors.text.primary, fontWeight: 500 }}>
            Données reprises automatiquement de votre exercice précédent
          </p>
          <p className="mt-1" style={{ ...typography.caption.desktop, color: colors.text.secondary }}>
            Solde du compte de l&apos;exploitant à l&apos;ouverture : {state.continuite.ouvertureCompteExploitant} € — Report à
            nouveau : {state.continuite.ran.valeur ?? 0} € ({state.continuite.ran.situation}). Ces valeurs proviennent de la
            clôture de votre exercice précédent, elles ne sont pas à ressaisir.
          </p>
        </div>
      ) : (
        <>
          {/* Q0 — routage */}
          <Question label="Ce dossier correspond-il à la première activité déclarée, ou reprenez-vous un suivi antérieur (comptable, autre outil) ?">
            <ChoiceButton
              selected={state.routage === "NATIF"}
              onClick={() => patch({ routage: "NATIF" })}
              label="Première activité — aucun exercice antérieur à reprendre"
            />
            <ChoiceButton
              selected={state.routage === "REPRISE"}
              onClick={() => patch({ routage: "REPRISE" })}
              label="Je reprends un dossier déjà suivi ailleurs"
            />
          </Question>

          {/* Q_OUV — uniquement si reprise */}
          {state.routage === "REPRISE" ? (
            <Question label="Reprise du dossier — éléments de votre dernière clôture">
              <AmountField
                label="Solde de votre compte de l'exploitant à la clôture de l'exercice précédent"
                raw={state.ouvertureRepriseRaw}
                onChange={(raw) => patch({ ouvertureRepriseRaw: raw })}
              />
              <AmountField
                label="Report à nouveau à reprendre de votre comptabilité antérieure (0 si aucun)"
                raw={state.ranRepriseRaw}
                onChange={(raw) => patch({ ranRepriseRaw: raw })}
              />
            </Question>
          ) : null}
        </>
      )}

      {/* Q1 — trésorerie */}
      <Question label="Avez-vous un compte bancaire dédié à cette activité de location meublée ?">
        <ChoiceButton selected={state.bankMode === "DEDIE"} onClick={() => patch({ bankMode: "DEDIE" })} label="Oui" />
        <ChoiceButton selected={state.bankMode === "MIXTE"} onClick={() => patch({ bankMode: "MIXTE" })} label="Non" />
      </Question>
      {state.bankMode === "DEDIE" ? (
        <AmountField
          label="Quel est le solde de ce compte au 31/12 ?"
          raw={state.closingCashRaw}
          onChange={(raw) => patch({ closingCashRaw: raw })}
        />
      ) : null}
      {state.bankMode === "MIXTE" ? (
        <AmountField
          label="Une partie de votre trésorerie personnelle est-elle identifiable comme liée à cette activité à la clôture ? Indiquez le montant (0 si aucune)."
          raw={state.declaredProfessionalCashRaw}
          onChange={(raw) => patch({ declaredProfessionalCashRaw: raw })}
        />
      ) : null}

      {/* Q2 — compte exploitant */}
      <Question label="Au cours de l'exercice, avez-vous versé de l'argent personnel pour cette activité, ou en avez-vous prélevé pour votre usage personnel ?">
        <AmountField label="Apports de l'exercice (0 si aucun)" raw={state.apportsRaw} onChange={(raw) => patch({ apportsRaw: raw })} />
        <AmountField
          label="Prélèvements de l'exercice (0 si aucun)"
          raw={state.prelevementsRaw}
          onChange={(raw) => patch({ prelevementsRaw: raw })}
        />
      </Question>

      {/* Q3 — subventions */}
      <Question label="Avez-vous perçu une subvention d'investissement pour cette activité cette année ?">
        <ChoiceButton selected={state.subvention === "NON"} onClick={() => patch({ subvention: "NON" })} label="Non" />
        <ChoiceButton selected={state.subvention === "OUI"} onClick={() => patch({ subvention: "OUI" })} label="Oui" />
      </Question>
      {state.subvention === "OUI" ? (
        <AmountField label="Montant de la subvention" raw={state.subventionMontantRaw} onChange={(raw) => patch({ subventionMontantRaw: raw })} />
      ) : null}

      {/* P1-B1 — case 064 */}
      <Question label="Avez-vous versé un acompte à un fournisseur pour cette activité, encore non soldé au 31/12 ?">
        <ChoiceButton
          selected={state.avancesAcomptesVerses === "NON"}
          onClick={() => patch({ avancesAcomptesVerses: "NON" })}
          label="Non"
        />
        <ChoiceButton
          selected={state.avancesAcomptesVerses === "OUI"}
          onClick={() => patch({ avancesAcomptesVerses: "OUI" })}
          label="Oui"
        />
      </Question>
      {state.avancesAcomptesVerses === "OUI" ? (
        <AmountField
          label="Montant de l'acompte versé"
          raw={state.avancesAcomptesVersesMontantRaw}
          onChange={(raw) => patch({ avancesAcomptesVersesMontantRaw: raw })}
        />
      ) : null}

      {/* P1-B2 — case 014 */}
      <Question label="Avez-vous acquis un logiciel, un droit au bail ou un autre élément incorporel pour cette activité ?">
        <ChoiceButton
          selected={state.autresImmobilisationsIncorporellesBrut === "NON"}
          onClick={() => patch({ autresImmobilisationsIncorporellesBrut: "NON" })}
          label="Non"
        />
        <ChoiceButton
          selected={state.autresImmobilisationsIncorporellesBrut === "OUI"}
          onClick={() => patch({ autresImmobilisationsIncorporellesBrut: "OUI" })}
          label="Oui"
        />
      </Question>
      {state.autresImmobilisationsIncorporellesBrut === "OUI" ? (
        <AmountField
          label="Montant de cet élément incorporel"
          raw={state.autresImmobilisationsIncorporellesBrutMontantRaw}
          onChange={(raw) => patch({ autresImmobilisationsIncorporellesBrutMontantRaw: raw })}
        />
      ) : null}

      {/* P1-B2 — case 040 */}
      <Question label="Avez-vous versé un dépôt de garantie ou détenez-vous des titres/cautions liés à cette activité, hors placements financiers ?">
        <ChoiceButton
          selected={state.immobilisationsFinancieresBrut === "NON"}
          onClick={() => patch({ immobilisationsFinancieresBrut: "NON" })}
          label="Non"
        />
        <ChoiceButton
          selected={state.immobilisationsFinancieresBrut === "OUI"}
          onClick={() => patch({ immobilisationsFinancieresBrut: "OUI" })}
          label="Oui"
        />
      </Question>
      {state.immobilisationsFinancieresBrut === "OUI" ? (
        <AmountField
          label="Montant du dépôt ou de la caution"
          raw={state.immobilisationsFinancieresBrutMontantRaw}
          onChange={(raw) => patch({ immobilisationsFinancieresBrutMontantRaw: raw })}
        />
      ) : null}

      {/* P1-B1 — case 080 */}
      <Question label="Détenez-vous des titres ou placements financiers au titre de cette activité ?">
        <ChoiceButton
          selected={state.valeursMobilieresPlacementBrut === "NON"}
          onClick={() => patch({ valeursMobilieresPlacementBrut: "NON" })}
          label="Non"
        />
        <ChoiceButton
          selected={state.valeursMobilieresPlacementBrut === "OUI"}
          onClick={() => patch({ valeursMobilieresPlacementBrut: "OUI" })}
          label="Oui"
        />
      </Question>
      {state.valeursMobilieresPlacementBrut === "OUI" ? (
        <AmountField
          label="Montant des titres/placements détenus"
          raw={state.valeursMobilieresPlacementBrutMontantRaw}
          onChange={(raw) => patch({ valeursMobilieresPlacementBrutMontantRaw: raw })}
        />
      ) : null}

      {/* P1-B1 — case 092 */}
      <Question label="Avez-vous payé d'avance une charge qui concerne l'exercice suivant (ex. assurance) ?">
        <ChoiceButton
          selected={state.chargesConstateesAvance === "NON"}
          onClick={() => patch({ chargesConstateesAvance: "NON" })}
          label="Non"
        />
        <ChoiceButton
          selected={state.chargesConstateesAvance === "OUI"}
          onClick={() => patch({ chargesConstateesAvance: "OUI" })}
          label="Oui"
        />
      </Question>
      {state.chargesConstateesAvance === "OUI" ? (
        <AmountField
          label="Montant payé d'avance"
          raw={state.chargesConstateesAvanceMontantRaw}
          onChange={(raw) => patch({ chargesConstateesAvanceMontantRaw: raw })}
        />
      ) : null}

      {/* P1-B1 — case 174 */}
      <Question label="Avez-vous encaissé un loyer qui concerne en réalité l'exercice suivant ?">
        <ChoiceButton
          selected={state.produitsConstatesAvance === "NON"}
          onClick={() => patch({ produitsConstatesAvance: "NON" })}
          label="Non"
        />
        <ChoiceButton
          selected={state.produitsConstatesAvance === "OUI"}
          onClick={() => patch({ produitsConstatesAvance: "OUI" })}
          label="Oui"
        />
      </Question>
      {state.produitsConstatesAvance === "OUI" ? (
        <AmountField
          label="Montant du loyer encaissé d'avance"
          raw={state.produitsConstatesAvanceMontantRaw}
          onChange={(raw) => patch({ produitsConstatesAvanceMontantRaw: raw })}
        />
      ) : null}

      {/* P1-B1 — case 175 */}
      <Question label="Détenez-vous un dépôt de garantie versé par votre locataire, ou une autre dette envers un tiers ?">
        <ChoiceButton selected={state.autresDettes === "NON"} onClick={() => patch({ autresDettes: "NON" })} label="Non" />
        <ChoiceButton selected={state.autresDettes === "OUI"} onClick={() => patch({ autresDettes: "OUI" })} label="Oui" />
      </Question>
      {state.autresDettes === "OUI" ? (
        <AmountField
          label="Montant du dépôt de garantie ou de l'autre dette"
          raw={state.autresDettesMontantRaw}
          onChange={(raw) => patch({ autresDettesMontantRaw: raw })}
        />
      ) : null}

      {/* Q4 — catch-all */}
      <Question label="Possédez-vous, au titre de cette activité, d'autres éléments patrimoniaux que votre bien, votre trésorerie et vos emprunts (dépôts versés à un tiers, titres de placement, créances ou dettes en cours à la clôture) ?">
        <ChoiceButton
          selected={state.autresElements === "NON"}
          onClick={() => patch({ autresElements: "NON" })}
          label="Non, rien de particulier"
        />
        <ChoiceButton selected={state.autresElements === "OUI"} onClick={() => patch({ autresElements: "OUI" })} label="Oui" />
      </Question>
      {state.autresElements === "OUI" ? (
        <p style={{ ...typography.caption.desktop, color: colors.text.tertiary }}>
          {/*
            B-FAMILY-5 — correction minimale : cette copie affirmait que les
            avances, titres, créances et dettes en cours restaient
            non collectables — c'est devenu faux depuis P1-B1 (questions
            ci-dessus) et B-FAMILY-2/3/4 (section ci-dessous). Seul le texte
            change ici ; `autresElements`/`lignesSimples`/`tiers` et leur
            logique de cascade restent strictement inchangés — une refonte
            conceptuelle de Q4 (fusion avec les questions ci-dessus/dessous,
            reformulation complète) est hors périmètre de ce chantier,
            documentée comme réserve.
          */}
          Les avances, titres, charges/produits constatés d&apos;avance et autres dettes se déclarent désormais dans
          les questions ci-dessus, et vos créances/dettes envers des tiers juste en dessous. Si un élément ne
          correspond à aucune de ces catégories, contactez-nous.
        </p>
      ) : null}

      {/*
        B-FAMILY-3 — collecte des 5 natures famille B (068/072/164/166/172),
        désormais connectée à `state`/`buildBilanPatrimonial` comme le reste
        du formulaire.
      */}
      <VentilationTiersIntakeCard
        value={state.ventilationTiersIntake}
        onChange={(ventilationTiersIntake) => patch({ ventilationTiersIntake })}
      />
    </section>
  );
}

function Question({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <p style={{ ...typography.body.desktop, color: colors.text.primary, fontWeight: 500 }}>{label}</p>
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  );
}

function ChoiceButton({ selected, onClick, label }: { selected: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="min-h-[40px]"
      style={{
        borderRadius: radius.md,
        border: `1px solid ${selected ? colors.border.selected : colors.border.default}`,
        backgroundColor: selected ? colors.surface.selected : colors.surface.primary,
        color: selected ? colors.text.accent : colors.text.secondary,
        padding: `${spacing.scale[2]} ${spacing.scale[3]}`,
        ...typography.body.desktop,
      }}
    >
      {label}
    </button>
  );
}

function AmountField({ label, raw, onChange }: { label: string; raw: string; onChange: (raw: string) => void }) {
  return (
    <label className="block space-y-1">
      <span style={{ ...typography.caption.desktop, color: colors.text.secondary }}>{label}</span>
      <input
        type="text"
        inputMode="decimal"
        value={raw}
        // Volontairement : on ne stocke que la chaîne saisie, jamais un
        // Number(raw) ici — la conversion (et la distinction "" vs "0")
        // n'a lieu qu'au moment de construire BilanInputs (parseMontantSaisi).
        onChange={(event) => onChange(event.target.value)}
        placeholder="Non renseigné"
        className="block w-48"
        style={{
          borderRadius: radius.md,
          border: `1px solid ${colors.border.default}`,
          backgroundColor: colors.surface.inset,
          color: colors.text.primary,
          padding: `${spacing.scale[2]} ${spacing.scale[3]}`,
          ...typography.body.desktop,
        }}
      />
    </label>
  );
}
