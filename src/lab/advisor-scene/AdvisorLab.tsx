"use client";

import { useState } from "react";

import { colors } from "@/design-system/theme/colors";
import { typography } from "@/design-system/theme/typography";
import { AdvisorScene } from "@/lab/advisor-scene/AdvisorScene";
import { compositions, type CompositionId } from "@/lab/advisor-scene/composition";
import { LabControlPanel } from "@/lab/advisor-scene/controls/LabControlPanel";
import { lighting } from "@/lab/advisor-scene/lighting";
import { scenarios } from "@/lab/advisor-scene/scenarios/fixtures";
import type { Scenario } from "@/lab/advisor-scene/scenarios/types";
import { useScenarioPlayer } from "@/lab/advisor-scene/scenarios/ScenarioEngine";
import { sceneVariants, type SceneVariant } from "@/lab/advisor-scene/variants";

/**
 * Remontée intentionnelle (key={scenario.id}) : changer de scénario doit
 * repartir du premier beat, pas réinitialiser un state existant depuis un effet.
 */
function ScenarioStage({
  scenario,
  compositionId,
  variant,
  onScenarioChange,
  compositionSelector,
  onVariantChange,
}: {
  scenario: Scenario;
  compositionId: CompositionId;
  variant: SceneVariant;
  onScenarioChange: (id: string) => void;
  compositionSelector: (id: CompositionId) => void;
  onVariantChange: (id: SceneVariant["id"]) => void;
}) {
  const player = useScenarioPlayer(scenario);

  return (
    <>
      <AdvisorScene
        scene={player.scene}
        composition={compositions[compositionId]}
        lighting={lighting}
        gestureBySubject={player.gestureBySubject}
        variant={variant}
      />

      <LabControlPanel
        scenarioId={scenario.id}
        onScenarioChange={onScenarioChange}
        compositionId={compositionId}
        onCompositionChange={compositionSelector}
        variantId={variant.id}
        onVariantChange={onVariantChange}
        caption={player.caption}
        beatIndex={player.beatIndex}
        beatCount={player.beatCount}
        isLast={player.isLast}
        playing={player.playing}
        onNext={player.next}
        onReset={player.reset}
        onTogglePlay={player.togglePlay}
      />
    </>
  );
}

/**
 * Théâtre où l'on observe le comportement du Conseiller — pas un panneau
 * technique. Le scénario est la matière première ; composition, lumière et
 * intensité (version A/B/C) restent des variables secondaires qu'on fait
 * varier à récit constant.
 */
export function AdvisorLab() {
  const [scenarioId, setScenarioId] = useState(scenarios[0].id);
  const [compositionId, setCompositionId] = useState<CompositionId>("fan");
  const [variantId, setVariantId] = useState<SceneVariant["id"]>("b");

  const scenario = scenarios.find((s) => s.id === scenarioId) ?? scenarios[0];
  const variant = sceneVariants.find((v) => v.id === variantId) ?? sceneVariants[1];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "20px", maxWidth: "880px", margin: "0 auto" }}>
      <div>
        <p style={{ ...typography.caption.desktop, color: colors.text.accent, letterSpacing: "0.04em" }}>
          laboratoire — advisor scene
        </p>
        <p style={{ fontFamily: typography.fontFamily.display, fontSize: typography.fontSize.xl, color: colors.text.primary, margin: "4px 0 0" }}>
          {scenario.title}
        </p>
        <p style={{ ...typography.body.desktop, color: colors.text.secondary, margin: "4px 0 0" }}>
          {scenario.description}
        </p>
        <p style={{ ...typography.caption.desktop, color: colors.text.muted, margin: "8px 0 0" }}>
          {variant.label} — {variant.description}
        </p>
      </div>

      <ScenarioStage
        key={scenario.id}
        scenario={scenario}
        compositionId={compositionId}
        variant={variant}
        onScenarioChange={setScenarioId}
        compositionSelector={setCompositionId}
        onVariantChange={setVariantId}
      />
    </div>
  );
}
