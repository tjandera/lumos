const clamp255 = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
const toHex = (v: number) => clamp255(v).toString(16).padStart(2, '0');

/**
 * Approximate black-body colour temperature → sRGB hex, valid roughly 1000–40000K
 * (Tanner Helland's fit). Real fixtures are specified by Kelvin (warm ~2700K,
 * neutral ~4000K, daylight ~6500K), so this drives fixture tint from a single,
 * physically-meaningful number instead of an arbitrary colour picker.
 */
export function kelvinToRgb(kelvin: number): string {
  const t = clamp(kelvin, 1000, 40000) / 100;

  let r: number;
  let g: number;
  let b: number;

  if (t <= 66) {
    r = 255;
    g = 99.47 * Math.log(t) - 161.12;
  } else {
    r = 329.7 * Math.pow(t - 60, -0.1332);
    g = 288.12 * Math.pow(t - 60, -0.0755);
  }

  if (t >= 66) {
    b = 255;
  } else if (t <= 19) {
    b = 0;
  } else {
    b = 138.52 * Math.log(t - 10) - 305.04;
  }

  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}
