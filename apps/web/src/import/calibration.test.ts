import { expect, test } from "vitest";
import { calibrateMetersPerPixel, validateFloorPlanFile } from "./calibration";

test("calibrateMetersPerPixel", () => {
  expect(calibrateMetersPerPixel(250, 5)).toBeCloseTo(0.02);
  expect(calibrateMetersPerPixel(0, 5)).toBeNull();
});

test("validateFloorPlanFile", () => {
  expect(validateFloorPlanFile(new File(["x"], "plan.png", { type: "image/png" }))).toEqual({ ok: true });
});
