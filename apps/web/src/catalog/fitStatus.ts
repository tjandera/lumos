export type FitLevel = "fits" | "tight" | "does-not-fit";

export interface FitResult {
  level: FitLevel;
  label: string;
  detail: string;
}

export function classifyFit(
  room: { width: number; depth: number },
  dimensions: { w: number; d: number; h: number }
): FitResult {
  const clearanceTotal = 0.8; // 0.4m on both sides

  const fitsOrientation1 = dimensions.w <= room.width && dimensions.d <= room.depth;
  const clearsOrientation1 = 
    (room.width - dimensions.w >= clearanceTotal) && 
    (room.depth - dimensions.d >= clearanceTotal);

  const fitsOrientation2 = dimensions.d <= room.width && dimensions.w <= room.depth;
  const clearsOrientation2 = 
    (room.width - dimensions.d >= clearanceTotal) && 
    (room.depth - dimensions.w >= clearanceTotal);

  if ((fitsOrientation1 && clearsOrientation1) || (fitsOrientation2 && clearsOrientation2)) {
    return { level: "fits", label: "Fits", detail: "Has plenty of clearance." };
  }

  if (fitsOrientation1 || fitsOrientation2) {
    return { level: "tight", label: "Tight fit", detail: "Fits, but leaves less than 0.4m clearance." };
  }

  return { level: "does-not-fit", label: "Does not fit", detail: "Too large for this room." };
}
