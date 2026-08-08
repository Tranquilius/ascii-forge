/**
 * Map stage: RGB -> luminance -> ramp index.
 */

/** Rec.709 luma weights. */
export function luminance709(r: number, g: number, b: number): number {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * Map a 0..255 luminance value to a ramp index in [0, rampLength - 1].
 *
 * `bias` warps the 0..1 luminance curve via `t ** bias` before indexing: bias > 1 pushes
 * more of the tonal range toward the dark end of the ramp (denser-looking output), bias < 1
 * pushes it toward the light end. bias === 1 is linear. `invert` flips light/dark mapping.
 */
export function luminanceToRampIndex(
  luminance: number,
  rampLength: number,
  bias: number,
  invert: boolean,
): number {
  let t = Math.min(1, Math.max(0, luminance / 255));
  if (invert) t = 1 - t;
  // t is clamped to [0, 1] above: a fractional bias on a negative base is NaN in JS
  // (Math.pow(-x, 0.5) is undefined), so this guards real-world float drift as well
  // as the out-of-range luminance values callers might pass in defensively.
  const biased = bias === 1 ? t : t ** Math.max(bias, 0.001);
  const idx = Math.floor(biased * (rampLength - 1) + 0.5);
  return Math.min(rampLength - 1, Math.max(0, idx));
}
