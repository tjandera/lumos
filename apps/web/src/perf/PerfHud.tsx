import { useEffect, useState, useSyncExternalStore } from "react";
import { checkBudget, PERF_BUDGET } from "./budget";
import { getPerfCounters, subscribePerfCounters } from "./perfStore";
import { getSimulateContextLossFn } from "./contextLossStore";

/** Default-hidden in production; toggled with F9 or the small corner button. */
const DEFAULT_VISIBLE = import.meta.env.DEV;

function usePerfCounters() {
  return useSyncExternalStore(subscribePerfCounters, getPerfCounters, getPerfCounters);
}

function row(label: string, value: string, over: boolean) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, color: over ? "#ff6b6b" : "#d5f2d5" }}>
      <span>{label}</span>
      <span>{value}</span>
    </div>
  );
}

export function PerfHud() {
  const [visible, setVisible] = useState(DEFAULT_VISIBLE);
  const counters = usePerfCounters();
  const status = checkBudget(counters);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "F9") {
        e.preventDefault();
        setVisible((v) => !v);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <>
      <button
        onClick={() => setVisible((v) => !v)}
        title="Toggle perf HUD (F9)"
        style={{
          position: "absolute",
          top: 8,
          right: 8,
          zIndex: 20,
          fontSize: 11,
          padding: "2px 6px",
          opacity: 0.6,
          fontFamily: "monospace"
        }}
      >
        {visible ? "HUD ▾" : "HUD ▸"}
      </button>

      {visible && (
        <div
          data-testid="perf-hud"
          style={{
            position: "absolute",
            top: 32,
            right: 8,
            zIndex: 20,
            background: "rgba(10,20,10,0.82)",
            color: "#d5f2d5",
            padding: "8px 10px",
            borderRadius: 6,
            fontFamily: "monospace",
            fontSize: 11,
            minWidth: 170,
            pointerEvents: "auto"
          }}
        >
          {row("fps (avg)", counters.fps.toFixed(0), status.fpsOver)}
          {row("fps (worst)", counters.worstFrameFps.toFixed(0), counters.worstFrameFps < PERF_BUDGET.minAcceptableFps)}
          {row("draw calls", `${counters.drawCalls} / ${PERF_BUDGET.maxDrawCalls}`, status.drawCallsOver)}
          {row("triangles", `${counters.triangles.toLocaleString()} / ${PERF_BUDGET.maxTriangles.toLocaleString()}`, status.trianglesOver)}
          {row("geometries", `${counters.geometries}`, status.geometriesOver)}
          {row("textures", `${counters.textures}`, status.texturesOver)}
          {typeof performance !== "undefined" && (performance as Performance & { memory?: { usedJSHeapSize: number } }).memory && (
            row(
              "JS heap",
              `${(((performance as Performance & { memory?: { usedJSHeapSize: number } }).memory!.usedJSHeapSize) / 1048576).toFixed(0)} MB`,
              false
            )
          )}
          <button
            onClick={() => getSimulateContextLossFn()?.()}
            title="Dev helper: force a WebGL context loss to test the recovery overlay"
            style={{ marginTop: 6, width: "100%", fontSize: 10, padding: "2px 4px" }}
          >
            Simulate context loss
          </button>
        </div>
      )}
    </>
  );
}
