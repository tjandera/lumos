import { describe, expect, it } from "vitest";
import { checkBudget, PERF_BUDGET } from "./budget";

const withinBudget = {
  fps: 60,
  worstFrameFps: 55,
  drawCalls: 100,
  triangles: 100_000,
  geometries: 50,
  textures: 20
};

describe("checkBudget", () => {
  it("reports no overages when everything is within budget", () => {
    const status = checkBudget(withinBudget);
    expect(status.anyOver).toBe(false);
    expect(status.fpsOver).toBe(false);
    expect(status.drawCallsOver).toBe(false);
    expect(status.trianglesOver).toBe(false);
    expect(status.geometriesOver).toBe(false);
    expect(status.texturesOver).toBe(false);
  });

  it("flags fps under the minimum acceptable threshold", () => {
    const status = checkBudget({ ...withinBudget, fps: PERF_BUDGET.minAcceptableFps - 1 });
    expect(status.fpsOver).toBe(true);
    expect(status.anyOver).toBe(true);
  });

  it("flags draw calls over budget", () => {
    const status = checkBudget({ ...withinBudget, drawCalls: PERF_BUDGET.maxDrawCalls + 1 });
    expect(status.drawCallsOver).toBe(true);
    expect(status.anyOver).toBe(true);
  });

  it("flags triangles over budget", () => {
    const status = checkBudget({ ...withinBudget, triangles: PERF_BUDGET.maxTriangles + 1 });
    expect(status.trianglesOver).toBe(true);
    expect(status.anyOver).toBe(true);
  });

  it("flags geometries and textures over budget independently", () => {
    const geo = checkBudget({ ...withinBudget, geometries: PERF_BUDGET.maxGeometries + 1 });
    expect(geo.geometriesOver).toBe(true);
    const tex = checkBudget({ ...withinBudget, textures: PERF_BUDGET.maxTextures + 1 });
    expect(tex.texturesOver).toBe(true);
  });

  it("is exact at the boundary (equal to max is NOT over)", () => {
    const status = checkBudget({
      ...withinBudget,
      drawCalls: PERF_BUDGET.maxDrawCalls,
      triangles: PERF_BUDGET.maxTriangles
    });
    expect(status.drawCallsOver).toBe(false);
    expect(status.trianglesOver).toBe(false);
  });
});
