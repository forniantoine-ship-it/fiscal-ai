"use client";

import { type ReactNode, useCallback, useEffect, useMemo, useReducer, useState } from "react";

import { AppHeader, LabBar } from "./chrome";
import { LabContext, type Notice } from "./context";
import { PanelHost } from "./panels";
import { DossierScreen } from "./screens-dossier";
import { DocumentsScreen } from "./screens-docs";
import { AnalysisScreen, HomeScreen, StartScreen } from "./screens-entry";
import { PointsScreen } from "./screens-points";
import { LiasseScreen, ResultScreen } from "./screens-result";
import { initialAll, parseRoute, reducer, useHash } from "./store";
import { Icon, tokens } from "./ui";

export default function UxOpusLab() {
  const hash = useHash();
  const route = useMemo(() => parseRoute(hash), [hash]);
  const [all, dispatch] = useReducer(reducer, undefined, initialAll);
  const [notice, setNotice] = useState<Notice | null>(null);

  const notify = useCallback((text: string, undo?: () => void) => {
    setNotice({ id: Date.now(), text, undo, at: window.location.hash.split("~")[0] });
  }, []);

  useEffect(() => {
    if (!notice) return;
    const id = window.setTimeout(() => setNotice(null), notice.undo ? 6000 : 4200);
    return () => window.clearTimeout(id);
  }, [notice]);

  const screenKey = `${route.scenario}/${route.screen}/${route.arg}`;
  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [screenKey]);

  const s = route.scenario;
  let content: ReactNode;
  if (!s) {
    content = <HomeScreen />;
  } else {
    const phase = all[s].phase;
    const screen = route.screen;
    if (screen === "start" || phase === "start") content = <StartScreen s={s} />;
    else if (screen === "analyse" || phase === "analyzing") content = phase === "ready" ? <DossierScreen s={s} /> : <AnalysisScreen s={s} />;
    else if (screen === "points") content = <PointsScreen s={s} />;
    else if (screen === "resultat") content = <ResultScreen s={s} />;
    else if (screen === "documents") content = <DocumentsScreen s={s} />;
    else if (screen === "liasse") content = <LiasseScreen s={s} />;
    else content = <DossierScreen s={s} />;
  }

  return (
    <LabContext.Provider value={{ all, dispatch, route, notify }}>
      <div
        style={tokens}
        className="min-h-screen bg-[var(--o-bg)] bg-[radial-gradient(1200px_520px_at_100%_-10%,rgba(255,220,196,0.55),transparent_60%),radial-gradient(900px_480px_at_-10%_110%,rgba(255,196,154,0.28),transparent_60%)] font-[family-name:var(--font-sans)] text-[var(--o-ink)] antialiased"
      >
        <LabBar scenario={s} />
        {s && all[s].phase !== "start" && <AppHeader s={s} />}
        {s && all[s].phase === "start" && (
          <header className="mx-auto flex h-[68px] max-w-[1180px] items-center px-4 md:px-8">
            <span className="flex items-center gap-2.5">
              <span className="grid h-8 w-8 place-items-center rounded-[10px] bg-[image:var(--o-cta)] text-[15px] font-semibold text-white">F</span>
              <span className="font-[family-name:var(--font-display)] text-[20px]">Fiscal AI</span>
            </span>
          </header>
        )}
        {content}
        {s && all[s].phase === "ready" && <PanelHost s={s} />}
        {notice && notice.at === hash.split("~")[0] && (
          <div role="status" className="fixed inset-x-4 bottom-[104px] z-[60] mx-auto flex max-w-[520px] items-center justify-between gap-4 rounded-2xl bg-[var(--o-ink)] px-5 py-3.5 text-[14px] text-white shadow-[0_18px_40px_-16px_rgba(28,25,23,0.6)] motion-safe:animate-[fiscal-fade-in_220ms_ease-out] md:bottom-8">
            <span className="flex items-start gap-2">
              <Icon name="spark" className="mt-0.5 h-4 w-4 shrink-0 text-[#FFC49A]" />
              {notice.text}
            </span>
            {notice.undo && (
              <button
                type="button"
                className="shrink-0 font-medium text-[#FFC49A] underline-offset-4 hover:underline"
                onClick={() => {
                  notice.undo?.();
                  setNotice(null);
                }}
              >
                Annuler
              </button>
            )}
          </div>
        )}
      </div>
    </LabContext.Provider>
  );
}
