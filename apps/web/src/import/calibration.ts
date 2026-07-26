export const MAX_FLOOR_PLAN_BYTES = 10 * 1024 * 1024;

export const calibrateMetersPerPixel = (px: number, metres: number) => 
  Number.isFinite(px) && Number.isFinite(metres) && px > 0 && metres > 0 ? metres / px : null;

export interface ImportValidation {
  ok: boolean;
  error?: string;
}

export const validateFloorPlanFile = (file: File): ImportValidation => {
  if (file.size > MAX_FLOOR_PLAN_BYTES) {
    return { ok: false, error: "File too large (max 10MB)" };
  }
  if (file.type !== "application/pdf" && !file.type.startsWith("image/")) {
    return { ok: false, error: "Unsupported file type" };
  }
  return { ok: true };
};
