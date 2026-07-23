import { describe, expect, it } from "vitest";
import type { SunLightConfig } from "./types.js";
import {
  instantToLocalSolarMinutes,
  localSolarInstant,
  minutesToTime,
  sliderRange,
  sunDirection,
  sunTimes,
  timeToMinutes
} from "./sun.js";

function sun(overrides: Partial<Omit<SunLightConfig, "type">> = {}): SunLightConfig {
  return {
    type: "sun",
    id: "sun",
    date: "2024-03-20",
    time: "12:00",
    latitude: 0,
    longitude: 0,
    northOffset: 0,
    ...overrides
  };
}

const toDeg = (rad: number): number => (rad * 180) / Math.PI;
/** Normalize an angle difference into (-PI, PI]. */
function wrap(angle: number): number {
  let a = angle;
  while (a <= -Math.PI) a += 2 * Math.PI;
  while (a > Math.PI) a -= 2 * Math.PI;
  return a;
}

describe("time helpers", () => {
  it("round-trips minutes and HH:MM", () => {
    expect(timeToMinutes("00:00")).toBe(0);
    expect(timeToMinutes("15:30")).toBe(930);
    expect(minutesToTime(930)).toBe("15:30");
    expect(minutesToTime(0)).toBe("00:00");
  });

  it("local-solar instant round-trips to minutes", () => {
    const minutes = 13 * 60 + 20;
    const instant = localSolarInstant("2024-06-21", minutes, 10.75);
    expect(instantToLocalSolarMinutes(instant, "2024-06-21", 10.75)).toBeCloseTo(minutes, 6);
  });
});

describe("sunDirection", () => {
  it("puts the sun nearly overhead at the equator at solar noon on the equinox", () => {
    const { elevation, toSun } = sunDirection(sun());
    expect(toDeg(elevation)).toBeGreaterThan(85);
    expect(toSun.y).toBeGreaterThan(0.99);
    // toSun should be a unit vector.
    const len = Math.hypot(toSun.x, toSun.y, toSun.z);
    expect(len).toBeCloseTo(1, 6);
  });

  it("gives a low winter sun at northern latitudes (Oslo, Dec solstice noon)", () => {
    const { elevation } = sunDirection(
      sun({ date: "2024-12-21", time: "12:00", latitude: 59.91, longitude: 10.75 })
    );
    const deg = toDeg(elevation);
    expect(deg).toBeGreaterThan(0);
    expect(deg).toBeLessThan(12);
  });

  it("puts the sun below the horizon at night (equator, midnight)", () => {
    const { elevation, toSun } = sunDirection(sun({ time: "00:00" }));
    expect(elevation).toBeLessThan(0);
    expect(toSun.y).toBeLessThan(0);
  });

  it("northOffset rotates the azimuth by exactly that amount", () => {
    const base = sunDirection(sun({ time: "09:00", latitude: 40 }));
    const rotated = sunDirection(sun({ time: "09:00", latitude: 40, northOffset: Math.PI / 2 }));
    expect(wrap(rotated.azimuth - base.azimuth)).toBeCloseTo(Math.PI / 2, 6);
    // The horizontal direction vector rotates about +Y by the same amount.
    const heading = (v: { x: number; z: number }): number => Math.atan2(v.x, -v.z);
    expect(wrap(heading(rotated.toSun) - heading(base.toSun))).toBeCloseTo(Math.PI / 2, 3);
  });

  it("east vs west: morning sun is toward the east (+X), evening toward the west (-X)", () => {
    const morning = sunDirection(sun({ time: "07:00", latitude: 40 }));
    const evening = sunDirection(sun({ time: "17:00", latitude: 40 }));
    expect(morning.toSun.x).toBeGreaterThan(0);
    expect(evening.toSun.x).toBeLessThan(0);
  });
});

describe("sunTimes / sliderRange", () => {
  it("produces a realistic sunrise-before-sunset window (London, June)", () => {
    const t = sunTimes("2024-06-21", 51.5074, -0.1278);
    expect(t.sunriseMinutes).not.toBeNull();
    expect(t.sunsetMinutes).not.toBeNull();
    expect(t.sunriseMinutes!).toBeLessThan(t.solarNoonMinutes);
    expect(t.solarNoonMinutes).toBeLessThan(t.sunsetMinutes!);
    // London midsummer day is long (> 15h).
    expect(t.sunsetMinutes! - t.sunriseMinutes!).toBeGreaterThan(15 * 60);
  });

  it("slider range pads around sunrise/sunset and stays within a day", () => {
    const { min, max } = sliderRange("2024-06-21", 51.5074, -0.1278, 1);
    const t = sunTimes("2024-06-21", 51.5074, -0.1278);
    expect(min).toBeGreaterThanOrEqual(0);
    expect(max).toBeLessThanOrEqual(1440);
    expect(min).toBeLessThan(t.sunriseMinutes!);
    expect(max).toBeGreaterThan(t.sunsetMinutes!);
  });
});
