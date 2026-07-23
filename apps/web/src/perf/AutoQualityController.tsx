/**
 * Wires the pure auto-quality logic (`deviceCapability.ts` + `autoQuality.ts`)
 * into the scene store and the perf counters store.
 *
 * Deliberately DOM-only (no R3F/`Canvas` dependency): it reads fps off
 * `perfStore`, which the existing `PerfSampler` (inside `Scene3D`'s `Canvas`)
 * already publishes to every frame — the same pattern `PerfHud` uses to read
 * counters from outside the `Canvas`. That means this component can be
 * mounted anywhere that lives alongside the 3D view (currently: from
 * `LightingPanel`, which mounts/unmounts on the same "3D tab" lifecycle as
 * `Scene3D`) without needing to touch `Scene3D.tsx` itself.
 *
 * Renders nothing.
 */

import { useEffect, useRef } from "react";
import { useSceneStore } from "../store/sceneStore";
import { detectDeviceSignals, pickInitialQuality } from "./deviceCapability";
import { evaluateAutoDowngrade, initialAutoDowngradeState, type AutoDowngradeState } from "./autoQuality";
import { hasAutoQualityBeenApplied, hasManualQualityOverride, markAutoQualityApplied } from "./qualityPreference";
import { getPerfCounters, subscribePerfCounters } from "./perfStore";
import { pushToast } from "./toastStore";

export function AutoQualityController() {
  const setLightingQuality = useSceneStore((s) => s.setLightingQuality);
  const downgradeStateRef = useRef<AutoDowngradeState>(initialAutoDowngradeState);

  // One-time initial pick, on mount, unless the user already made a manual
  // choice (any time, any session) or auto-detect already ran this session
  // (e.g. the user switched tabs away and back after a dynamic downgrade).
  useEffect(() => {
    if (hasManualQualityOverride() || hasAutoQualityBeenApplied()) return;
    const signals = detectDeviceSignals();
    setLightingQuality(pickInitialQuality(signals));
    markAutoQualityApplied();
  }, [setLightingQuality]);

  // Dynamic downgrade: watch rolling-average fps published by the existing
  // FrameSampler and drop one quality tier if it stays under budget.
  useEffect(() => {
    const unsubscribe = subscribePerfCounters(() => {
      const { fps } = getPerfCounters();
      const currentQuality = useSceneStore.getState().lightingQuality;
      const result = evaluateAutoDowngrade(downgradeStateRef.current, fps, Date.now(), currentQuality);
      downgradeStateRef.current = result.state;
      if (result.downgradeTo) {
        setLightingQuality(result.downgradeTo);
        pushToast("Reduced quality for smoothness");
      }
    });
    return unsubscribe;
  }, [setLightingQuality]);

  return null;
}
