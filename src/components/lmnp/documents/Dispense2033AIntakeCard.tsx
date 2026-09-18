"use client";

import { colors } from "@/design-system/theme/colors";
import { radius } from "@/design-system/theme/radius";
import { spacing } from "@/design-system/theme/spacing";
import { typography } from "@/design-system/theme/typography";
import {
  resolveCaReferenceN1Fact,
  resolveDispense2033AEligibilite,
  resolveSeuilDispense2033A,
  type Dispense2033ADecision,
} from "@/runtime/capabilities/rfs/dispense-2033a";
import type { DeclarationDraft } from "@/lib/lmnp/types/domain";

export type Dispense2033AIntakeValue = NonNullable<DeclarationDraft["dispense2033A"]>;

type Dispense2033AIntakeCardProps = {
  cardStyle: React.CSSProperties;
  value: Dispense2033AIntakeValue | undefined;
  onChange: (value: Dispense2033AIntakeValue | undefined) => void;
  exercice: number;
};

/**
 * Dispense de bilan 2033-A (CGI, art. 302 septies A bis, VI) — intake
 * minimal, entièrement séparé de `PatrimonialIntakeCard` (question
 * d'obligation déclarative, pas une donnée de bilan). Même doctrine de
 * contrôle : la logique de résolution vit dans le module pur
 * `dispense-2033a.ts` (source unique, partagée avec le serveur et le payload
 * de téléchargement) — ce composant ne fait que refléter l'état résolu et
 * notifier le parent du fait brut saisi.
 *
 * N'affiche RIEN quand :
 * - aucun seuil n'est publié pour cet exercice (échec fermé silencieux, le
 *   2033-A normal reste inchangé) ;
 * - le dossier n'est pas éligible (jamais un choix hors sujet affiché).
 *
 * Aucune dérivation automatique du chiffre d'affaires N-1 (correction audit
 * contradictoire — voir `resolveCaReferenceN1Fact()`) : la question est
 * toujours posée tant qu'aucune valeur explicite valide n'a été saisie, y
 * compris pour un dossier apparemment de première année.
 */
export function Dispense2033AIntakeCard({ cardStyle, value, onChange, exercice }: Dispense2033AIntakeCardProps) {
  const seuil = resolveSeuilDispense2033A(exercice);
  if (!seuil) return null;

  const caReferenceN1Fact = resolveCaReferenceN1Fact({ caReferenceN1Declaree: value?.caReferenceN1Declaree });
  const eligibilite = resolveDispense2033AEligibilite({ exercice, caReferenceN1: caReferenceN1Fact });

  if (eligibilite.etat === "NOT_ELIGIBLE") return null;

  function setDecision(decision: Dispense2033ADecision) {
    onChange({ ...value, decision });
  }

  /**
   * Rejette explicitement les valeurs non finies ou négatives (correction
   * audit contradictoire) — jamais persistées, jamais transmises à
   * `resolveCaReferenceN1Fact()` en tant que "DECLARE" : une saisie invalide
   * doit rester `undefined` (⇔ INCONNU), jamais une valeur inventée ni
   * arrondie silencieusement. Zéro reste une valeur valide.
   */
  function setCaReferenceN1Declaree(raw: string) {
    const trimmed = raw.trim();
    if (trimmed === "") {
      onChange({ ...value, caReferenceN1Declaree: undefined });
      return;
    }
    const montant = Number(trimmed.replace(",", "."));
    const valide = Number.isFinite(montant) && montant >= 0;
    onChange({ ...value, caReferenceN1Declaree: valide ? montant : undefined });
  }

  return (
    <section className="w-full space-y-4" style={cardStyle}>
      <div>
        <p style={{ fontFamily: typography.fontFamily.display, fontSize: typography.fontSize.lg, color: colors.text.primary }}>
          Dispense de bilan simplifié 2033-A
        </p>
      </div>

      {eligibilite.etat === "UNKNOWN" ? (
        <label className="block space-y-1">
          <span style={{ ...typography.body.desktop, color: colors.text.primary, fontWeight: 500 }}>
            Quel était le chiffre d&apos;affaires HT de cette activité en {exercice - 1} ?
          </span>
          <input
            type="text"
            inputMode="decimal"
            value={value?.caReferenceN1Declaree !== undefined ? String(value.caReferenceN1Declaree) : ""}
            onChange={(event) => setCaReferenceN1Declaree(event.target.value)}
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
          <span style={{ ...typography.caption.desktop, color: colors.text.tertiary }}>
            Cette information détermine si vous pouvez être dispensé de déposer le bilan simplifié 2033-A.
          </span>
        </label>
      ) : (
        <>
          <p style={{ ...typography.body.desktop, color: colors.text.secondary }}>
            Vous pouvez être dispensé de déposer le bilan simplifié 2033-A. Les autres documents de votre liasse
            (2031, compte de résultat, immobilisations) restent inchangés. Vous pouvez toujours choisir de le
            déposer.
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setDecision("USE_DISPENSE")}
              className="min-h-[40px]"
              style={{
                borderRadius: radius.md,
                border: `1px solid ${value?.decision === "USE_DISPENSE" ? colors.border.selected : colors.border.default}`,
                backgroundColor: value?.decision === "USE_DISPENSE" ? colors.surface.selected : colors.surface.primary,
                color: value?.decision === "USE_DISPENSE" ? colors.text.accent : colors.text.secondary,
                padding: `${spacing.scale[2]} ${spacing.scale[3]}`,
                ...typography.body.desktop,
              }}
            >
              Ne pas déposer le 2033-A
            </button>
            <button
              type="button"
              onClick={() => setDecision("FILE_2033A")}
              className="min-h-[40px]"
              style={{
                borderRadius: radius.md,
                border: `1px solid ${value?.decision === "FILE_2033A" ? colors.border.selected : colors.border.default}`,
                backgroundColor: value?.decision === "FILE_2033A" ? colors.surface.selected : colors.surface.primary,
                color: value?.decision === "FILE_2033A" ? colors.text.accent : colors.text.secondary,
                padding: `${spacing.scale[2]} ${spacing.scale[3]}`,
                ...typography.body.desktop,
              }}
            >
              Déposer le 2033-A quand même
            </button>
          </div>
        </>
      )}
    </section>
  );
}
