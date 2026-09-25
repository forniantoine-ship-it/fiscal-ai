"use client";

import { type Dispatch, createContext, useContext } from "react";

import type { ScenarioId, ScenarioState, View } from "./model";
import { type AllStates, type ScenarioDef, SCENARIOS, findDoc } from "./scenarios";
import { type Action, type Route, type Screen, navigate, progressOf, routeHash } from "./store";

export type Notice = { id: number; text: string; undo?: () => void; at: string };

export type LabContextValue = {
  all: AllStates;
  dispatch: Dispatch<Action>;
  route: Route;
  notify: (text: string, undo?: () => void) => void;
};

export const LabContext = createContext<LabContextValue | null>(null);

export function useLab() {
  const ctx = useContext(LabContext);
  if (!ctx) throw new Error("useLab doit être utilisé dans le laboratoire ux-opus");
  return ctx;
}

/** Tout ce dont un écran de scénario a besoin, dérivé une seule fois. */
export function useScenario(s: ScenarioId) {
  const { all, dispatch, route, notify } = useLab();
  const def: ScenarioDef = SCENARIOS[s];
  const state: ScenarioState = all[s];
  const view: View = def.derive(state, all);
  const progress = progressOf(s, state);
  const docName = (id: string) => findDoc(def, id)?.kind ?? id;

  const go = (screen: Screen, arg: string | null = null) => navigate(routeHash({ scenario: s, screen, arg }));
  const openPanel = (panel: string) =>
    navigate(routeHash({ scenario: s, screen: route.screen, arg: route.arg, panel }), { panel: true });
  const openDoc = (docId: string) => openPanel(`doc:${docId}`);

  return { def, state, view, progress, docName, go, openPanel, openDoc, dispatch, notify, all, route };
}
