/**
 * Lighting controls for the 3D tab: date, time-of-day slider (clamped to the
 * daylight window, with a full-24h override), latitude/longitude, a
 * north-offset dial to orient the plan to real-world north, a quality preset,
 * and per-lamp on/off toggles.
 *
 * Sun state lives in the scene document's `SunLightConfig` (persisted with
 * designs). Time-slider drags are transient and coalesce into one undo step
 * via the store's `setSunLight({...}, { transient })` / `commitSunLight`
 * pattern; discrete inputs commit immediately.
 */

import { useMemo, useState } from "react";
import {
  createSunLight,
  getLampLights,
  getSunLight,
  minutesToTime,
  sliderRange,
  sunDirection,
  sunTimes,
  timeToMinutes
} from "@interior/core";
import type { QualityLevel } from "@interior/renderer";
import { getCatalogItem } from "../catalog/catalogData";
import { useSceneStore } from "../store/sceneStore";
import { AutoQualityController } from "../perf/AutoQualityController";
import { Toast } from "../perf/Toast";
import { markManualQualityOverride } from "../perf/qualityPreference";
import { DaylightSummary } from "./DaylightSummary";
import { Collapsible } from "./ui/Collapsible";

const QUALITY_OPTIONS: { value: QualityLevel; label: string }[] = [
  { value: "low", label: "Low (no shadows)" },
  { value: "medium", label: "Medium (1k shadows)" },
  { value: "high", label: "High (2k + AO)" }
];

const labelStyle: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 600,
  color: "#333",
  display: "block",
  marginBottom: 4
};

const rowStyle: React.CSSProperties = { marginBottom: 14 };

const helperTextStyle: React.CSSProperties = {
  fontSize: 11,
  color: "#777",
  marginTop: 2
};

function radToDeg(rad: number): number {
  return (rad * 180) / Math.PI;
}

export function LightingPanel({ lightingMood, onLightingMoodChange }: { lightingMood: "natural" | "warm" | "bright", onLightingMoodChange: (mood: "natural" | "warm" | "bright") => void }) {
  const document = useSceneStore((s) => s.document);
  const quality = useSceneStore((s) => s.lightingQuality);
  const setLightingQuality = useSceneStore((s) => s.setLightingQuality);
  const setSunLight = useSceneStore((s) => s.setSunLight);
  const commitSunLight = useSceneStore((s) => s.commitSunLight);
  const toggleLamp = useSceneStore((s) => s.toggleLamp);

  const sun = getSunLight(document) ?? createSunLight();
  const lamps = getLampLights(document);

  const timeMinutes = timeToMinutes(sun.time);
  const [use24h, setUse24h] = useState(false);
  // Mobile-only bottom sheet (see CatalogPanel for the same pattern).
  const [sheetCollapsed, setSheetCollapsed] = useState(true);

  // Daylight-window slider bounds (sunrise-1h .. sunset+1h), or the full day.
  const range = useMemo(
    () => sliderRange(sun.date, sun.latitude, sun.longitude, 1),
    [sun.date, sun.latitude, sun.longitude]
  );
  const times = useMemo(
    () => sunTimes(sun.date, sun.latitude, sun.longitude),
    [sun.date, sun.latitude, sun.longitude]
  );
  const { elevation } = useMemo(() => sunDirection(sun), [sun]);

  const min = use24h ? 0 : Math.min(range.min, timeMinutes);
  const max = use24h ? 1440 : Math.max(range.max, timeMinutes);

  const elevDeg = radToDeg(elevation);
  const northDeg = Math.round(radToDeg(sun.northOffset));

  return (
    <div
      className={`mobile-sheet${sheetCollapsed ? " collapsed" : ""}`}
      style={{
        width: 260,
        borderLeft: "1px solid #ddd",
        padding: 12,
        overflowY: "auto",
        fontFamily: "sans-serif",
        boxSizing: "border-box",
        position: "relative"
      }}
    >
      {/* Renders nothing visible; wires auto quality-detect + dynamic
          downgrade in on the same mount lifecycle as the 3D view. */}
      <AutoQualityController />
      <Toast />
      <button
        type="button"
        className="mobile-sheet-handle"
        onClick={() => setSheetCollapsed((c) => !c)}
        aria-expanded={!sheetCollapsed}
      >
        Lighting {sheetCollapsed ? "▴" : "▾"}
      </button>
      <h3 style={{ margin: "0 0 12px", fontSize: 14 }}>Lighting</h3>

      <DaylightSummary 
        sun={sun} 
        onSetTime={(time) => {
          setSunLight({ time }, { transient: true });
          commitSunLight();
        }} 
      />

      <div style={rowStyle}>
        <label style={labelStyle}>Lighting mood</label>
        <div style={helperTextStyle}>Quickly styles the whole room's light without changing the time.</div>
        <select
          value={lightingMood}
          onChange={(e) => onLightingMoodChange(e.target.value as any)}
          style={{ width: "100%", boxSizing: "border-box", marginTop: 4 }}
        >
          <option value="natural">Natural daylight</option>
          <option value="warm">Warm evening</option>
          <option value="bright">Bright viewing</option>
        </select>
      </div>

      <div style={rowStyle}>
        <label style={labelStyle} htmlFor="lp-date">
          Date
        </label>
        <div style={helperTextStyle}>Sets the sun's path for the day you pick.</div>
        <input
          id="lp-date"
          type="date"
          value={sun.date}
          onChange={(e) => setSunLight({ date: e.target.value })}
          style={{ width: "100%", boxSizing: "border-box", marginTop: 4 }}
        />
      </div>

      <div style={rowStyle}>
        <label style={labelStyle} htmlFor="lp-time">
          Time of day — {minutesToTime(timeMinutes)}{" "}
          <span style={{ fontWeight: 400, color: "#888" }}>
            (sun {elevDeg >= 0 ? `${elevDeg.toFixed(0)}° up` : "below horizon"})
          </span>
        </label>
        <div style={helperTextStyle}>Drag to see how sunlight moves through your home.</div>
        <input
          id="lp-time"
          type="range"
          min={min}
          max={max}
          step={1}
          value={timeMinutes}
          onChange={(e) => setSunLight({ time: minutesToTime(Number(e.target.value)) }, { transient: true })}
          onPointerUp={() => commitSunLight()}
          onKeyUp={() => commitSunLight()}
          onBlur={() => commitSunLight()}
          style={{ width: "100%" }}
        />
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "#999" }}>
          <span>{minutesToTime(min)}</span>
          <span>
            {times.sunriseMinutes != null && times.sunsetMinutes != null
              ? `☀ ${minutesToTime(times.sunriseMinutes)}–${minutesToTime(times.sunsetMinutes)}`
              : "polar day/night"}
          </span>
          <span>{minutesToTime(max)}</span>
        </div>
        <label style={{ fontSize: 11, color: "#555", display: "flex", alignItems: "center", gap: 4, marginTop: 4 }}>
          <input type="checkbox" checked={use24h} onChange={(e) => setUse24h(e.target.checked)} />
          Full 24h range
        </label>
      </div>

      <Collapsible title="Advanced" advanced>
        <div style={{ ...rowStyle, display: "flex", gap: 8 }}>
          <div style={{ flex: 1 }}>
            <label style={labelStyle} htmlFor="lp-lat">
              Latitude
            </label>
            <input
              id="lp-lat"
              type="number"
              step={0.01}
              min={-90}
              max={90}
              value={sun.latitude}
              onChange={(e) => setSunLight({ latitude: clampNum(Number(e.target.value), -90, 90) })}
              style={{ width: "100%", boxSizing: "border-box" }}
            />
          </div>
          <div style={{ flex: 1 }}>
            <label style={labelStyle} htmlFor="lp-lng">
              Longitude
            </label>
            <input
              id="lp-lng"
              type="number"
              step={0.01}
              min={-180}
              max={180}
              value={sun.longitude}
              onChange={(e) => setSunLight({ longitude: clampNum(Number(e.target.value), -180, 180) })}
              style={{ width: "100%", boxSizing: "border-box" }}
            />
          </div>
        </div>
        <div style={helperTextStyle}>Where is this home? Used to compute real sunlight.</div>

        <div style={{ ...rowStyle, marginTop: 14 }}>
          <label style={labelStyle} htmlFor="lp-north">
            Plan north offset — {northDeg}°
          </label>
          <input
            id="lp-north"
            type="range"
            min={0}
            max={360}
            step={1}
            value={((northDeg % 360) + 360) % 360}
            onChange={(e) => setSunLight({ northOffset: (Number(e.target.value) * Math.PI) / 180 }, { transient: true })}
            onPointerUp={() => commitSunLight()}
            onKeyUp={() => commitSunLight()}
            onBlur={() => commitSunLight()}
            style={{ width: "100%" }}
          />
          <div style={{ fontSize: 10, color: "#999" }}>Rotates the plan relative to true north (compass bearing).</div>
        </div>

        <div style={rowStyle}>
          <label style={labelStyle} htmlFor="lp-quality">
            Quality preset
          </label>
          <div style={helperTextStyle}>Higher quality looks better but renders slower on this device.</div>
          <select
            id="lp-quality"
            value={quality}
            onChange={(e) => {
              markManualQualityOverride();
              setLightingQuality(e.target.value as QualityLevel);
            }}
            style={{ width: "100%", boxSizing: "border-box", marginTop: 4 }}
          >
            {QUALITY_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
      </Collapsible>

      <div style={rowStyle}>
        <label style={labelStyle}>Lamps</label>
        {lamps.length === 0 ? (
          <div style={{ fontSize: 11, color: "#999" }}>Add a lamp from the catalog to control it here.</div>
        ) : (
          lamps.map((lamp) => {
            const item = document.furniture.find((f) => f.id === lamp.furnitureItemId);
            const name = item ? getCatalogItem(item.catalogId)?.name ?? "Lamp" : "Lamp";
            return (
              <label
                key={lamp.id}
                style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, marginBottom: 4 }}
              >
                <input type="checkbox" checked={lamp.on} onChange={(e) => toggleLamp(lamp.furnitureItemId, e.target.checked)} />
                {name}
              </label>
            );
          })
        )}
      </div>
    </div>
  );
}

function clampNum(value: number, lo: number, hi: number): number {
  if (Number.isNaN(value)) return lo;
  return Math.max(lo, Math.min(hi, value));
}
