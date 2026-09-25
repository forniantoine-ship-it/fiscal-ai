"use client";

import { useSyncExternalStore } from "react";

import type { Fact, ScenarioId, ScenarioState } from "./model";
import { type AllStates, SCENARIOS, initialState } from "./scenarios";

// ─── Routage par hash (retour navigateur natif, aucune persistance) ─────────

export type Screen =
  | "home"
  | "start"
  | "analyse"
  | "dossier"
  | "points"
  | "resultat"
  | "documents"
  | "liasse";

export type Route = {
  scenario: ScenarioId | null;
  screen: Screen;
  arg: string | null;
  panel: string | null;
};

const SCREENS: Screen[] = ["start", "analyse", "dossier", "points", "resultat", "documents", "liasse"];
const NAV_EVENT = "ux-opus:navigate";

export function parseRoute(hash: string): Route {
  const raw = hash.replace(/^#\/?/, "");
  const [path, panel] = raw.split("~");
  const [s, screen, arg] = path.split("/");
  if (s !== "a" && s !== "b" && s !== "c") {
    return { scenario: null, screen: "home", arg: null, panel: null };
  }
  const safeScreen = SCREENS.includes(screen as Screen) ? (screen as Screen) : "start";
  return { scenario: s, screen: safeScreen, arg: arg ?? null, panel: panel ?? null };
}

export function routeHash(route: Partial<Route> & { scenario: ScenarioId | null }): string {
  if (!route.scenario) return "#/";
  let hash = `#/${route.scenario}/${route.screen ?? "start"}`;
  if (route.arg) hash += `/${route.arg}`;
  if (route.panel) hash += `~${route.panel}`;
  return hash;
}

function subscribe(callback: () => void) {
  window.addEventListener("popstate", callback);
  window.addEventListener("hashchange", callback);
  window.addEventListener(NAV_EVENT, callback);
  return () => {
    window.removeEventListener("popstate", callback);
    window.removeEventListener("hashchange", callback);
    window.removeEventListener(NAV_EVENT, callback);
  };
}

export function useHash(): string {
  return useSyncExternalStore(
    subscribe,
    () => window.location.hash,
    () => "",
  );
}

export function navigate(hash: string, options: { replace?: boolean; panel?: boolean } = {}) {
  if (window.location.hash === hash) return;
  const state = options.panel ? { uxOpusPanel: true } : null;
  if (options.replace) window.history.replaceState(state, "", hash);
  else window.history.pushState(state, "", hash);
  window.dispatchEvent(new Event(NAV_EVENT));
}

export function closePanel(route: Route) {
  const state = window.history.state as { uxOpusPanel?: boolean } | null;
  if (state?.uxOpusPanel) {
    window.history.back();
    return;
  }
  navigate(routeHash({ ...route, panel: null }), { replace: true });
}

// ─── État des scénarios ──────────────────────────────────────────────────────

export type Action =
  | { type: "deposit"; s: ScenarioId }
  | { type: "analysisDone"; s: ScenarioId }
  | { type: "fastForward"; s: ScenarioId }
  | { type: "answer"; s: ScenarioId; pointId: string; optionId: string; value?: Fact; label: string }
  | { type: "defer"; s: ScenarioId; pointId: string }
  | { type: "reopen"; s: ScenarioId; pointId: string }
  | { type: "removeRow"; s: ScenarioId; rowId: string }
  | { type: "restoreRow"; s: ScenarioId; rowId: string }
  | { type: "generate"; s: ScenarioId }
  | { type: "reset"; s: ScenarioId };

export function initialAll(): AllStates {
  return { a: initialState("a"), b: initialState("b"), c: initialState("c") };
}

function update(all: AllStates, s: ScenarioId, fn: (state: ScenarioState) => ScenarioState): AllStates {
  return { ...all, [s]: fn(all[s]) };
}

export function reducer(all: AllStates, action: Action): AllStates {
  switch (action.type) {
    case "deposit":
      return update(all, action.s, (st) => ({ ...st, phase: "analyzing" }));
    case "analysisDone":
    case "fastForward":
      return update(all, action.s, (st) => ({ ...st, phase: "ready" }));
    case "answer":
      return update(all, action.s, (st) => {
        const point = SCENARIOS[action.s].points.find((p) => p.id === action.pointId);
        const option = point?.options.find((o) => o.id === action.optionId);
        if (!point || !option) return st;
        const facts = { ...st.facts, ...(option.set ?? {}) };
        if (option.input && action.value !== undefined) facts[option.input.key] = action.value;
        const addedDocs =
          option.addDoc && !st.addedDocs.includes(option.addDoc) ? [...st.addedDocs, option.addDoc] : st.addedDocs;
        const status = option.escalate ? "escalated" : "answered";
        return {
          ...st,
          facts,
          addedDocs,
          points: { ...st.points, [action.pointId]: { status, answer: action.label } },
        };
      });
    case "defer":
      return update(all, action.s, (st) => ({
        ...st,
        points: { ...st.points, [action.pointId]: { status: "deferred" } },
      }));
    case "reopen":
      return update(all, action.s, (st) => ({
        ...st,
        points: { ...st.points, [action.pointId]: { status: "open" } },
        generated: false,
      }));
    case "removeRow":
      return update(all, action.s, (st) =>
        st.removedRows.includes(action.rowId) ? st : { ...st, removedRows: [...st.removedRows, action.rowId], generated: false },
      );
    case "restoreRow":
      return update(all, action.s, (st) => ({
        ...st,
        removedRows: st.removedRows.filter((r) => r !== action.rowId),
        generated: false,
      }));
    case "generate":
      return update(all, action.s, (st) => ({ ...st, generated: true }));
    case "reset":
      return update(all, action.s, () => initialState(action.s));
    default:
      return all;
  }
}

// ─── Lecture de l'avancement ─────────────────────────────────────────────────

export function progressOf(s: ScenarioId, state: ScenarioState) {
  const points = SCENARIOS[s].points;
  const status = (id: string) => state.points[id]?.status ?? "open";
  const blockingOpen = points.filter((p) => p.blocking && (status(p.id) === "open" || status(p.id) === "deferred"));
  const optionalOpen = points.filter((p) => !p.blocking && (status(p.id) === "open" || status(p.id) === "deferred"));
  const deferred = points.filter((p) => status(p.id) === "deferred");
  const escalated = points.filter((p) => status(p.id) === "escalated");
  const answered = points.filter((p) => status(p.id) === "answered");
  const queue = [
    ...points.filter((p) => p.blocking && status(p.id) === "open"),
    ...points.filter((p) => !p.blocking && status(p.id) === "open"),
    ...points.filter((p) => status(p.id) === "deferred"),
  ];
  return {
    total: points.length,
    blockingOpen,
    optionalOpen,
    deferred,
    escalated,
    answered,
    queue,
    toHandle: blockingOpen.length + optionalOpen.length,
    ready: blockingOpen.length === 0 && escalated.length === 0,
  };
}
