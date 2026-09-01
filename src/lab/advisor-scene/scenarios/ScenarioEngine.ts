"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { inferGestures } from "@/lab/advisor-scene/scenarios/gestureInference";
import type { Scenario } from "@/lab/advisor-scene/scenarios/types";
import type { Gesture, SceneState, Subject, SubjectId } from "@/lab/advisor-scene/types";

const AUTOPLAY_DELAY_MS = 2200;

function applyBeats(scenario: Scenario, uptoIndex: number): SceneState {
  const subjects: Subject[] = scenario.baseSubjects.map((s) => ({ ...s }));
  let activeId: SubjectId | null = null;

  for (let i = 0; i <= uptoIndex; i += 1) {
    const beat = scenario.beats[i];
    if (!beat) continue;
    for (const [id, lifecycle] of Object.entries(beat.lifecycle)) {
      if (!lifecycle) continue;
      const subject = subjects.find((s) => s.id === id);
      if (subject) subject.lifecycle = lifecycle;
    }
    activeId = beat.activeId;
  }

  return { subjects, activeId };
}

/**
 * Rejoue un scénario, beat par beat, et fournit à AdvisorScene l'état courant
 * ainsi que le geste déduit pour chaque sujet ayant changé.
 *
 * Le composant appelant doit monter ce hook avec une `key={scenario.id}` :
 * changer de scénario doit remonter le lecteur, pas réinitialiser son state
 * depuis un effet (voir AdvisorLab.tsx).
 */
export function useScenarioPlayer(scenario: Scenario) {
  const [beatIndex, setBeatIndex] = useState(0);
  const [playing, setPlaying] = useState(false);

  const previousScene = useMemo(() => applyBeats(scenario, beatIndex - 1), [scenario, beatIndex]);
  const currentScene = useMemo(() => applyBeats(scenario, beatIndex), [scenario, beatIndex]);

  const gestureBySubject: Record<SubjectId, Gesture> = useMemo(() => {
    const inferred = beatIndex === 0 ? {} : inferGestures(previousScene, currentScene);
    const forced = scenario.beats[beatIndex]?.forcedGesture ?? {};
    // Un geste forcé sert à démontrer délibérément un geste précis dans le
    // laboratoire — il prime sur la déduction automatique, jamais l'inverse.
    const merged: Record<SubjectId, Gesture> = { ...inferred };
    for (const [id, gesture] of Object.entries(forced)) {
      if (gesture) merged[id] = gesture;
    }
    return merged;
  }, [previousScene, currentScene, beatIndex, scenario]);

  const isLast = beatIndex >= scenario.beats.length - 1;

  const next = useCallback(() => {
    setBeatIndex((i) => Math.min(i + 1, scenario.beats.length - 1));
  }, [scenario]);

  const reset = useCallback(() => {
    setBeatIndex(0);
    setPlaying(false);
  }, []);

  useEffect(() => {
    if (!playing || isLast) return;
    const timer = window.setTimeout(next, AUTOPLAY_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [playing, isLast, next]);

  return {
    scene: currentScene,
    gestureBySubject,
    caption: scenario.beats[beatIndex]?.caption ?? "",
    beatIndex,
    beatCount: scenario.beats.length,
    isLast,
    // Dérivé plutôt que stocké : atteindre le dernier beat arrête visuellement
    // la lecture sans avoir à muter le state depuis l'effet.
    playing: playing && !isLast,
    next,
    reset,
    togglePlay: () => setPlaying((p) => !p),
  };
}
