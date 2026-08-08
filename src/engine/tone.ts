/**
 * Tone stage: brightness / contrast / gamma, applied per RGB channel so both the glyph
 * selection (luminance, derived downstream in map.ts) and the cell color (multi/original
 * mix modes) see a consistently adjusted image — the same behavior a photo editor's
 * brightness/contrast sliders give you.
 */

function clamp255(v: number): number {
  return v < 0 ? 0 : v > 255 ? 255 : v;
}

/** Standard "Photoshop-style" contrast factor for contrast in [-255, 255]. */
export function contrastFactor(contrast: number): number {
  return (259 * (contrast + 255)) / (255 * (259 - contrast));
}

/**
 * Apply brightness/contrast/gamma to a single channel value in [0, 255].
 * gamma === 1 is a no-op for the gamma step; brightness 0 and contrast 0 are no-ops
 * for their steps (contrastFactor(0) === 1).
 */
export function toneChannel(value: number, brightness: number, contrast: number, gamma: number): number {
  const factor = contrastFactor(contrast);
  let v = factor * (value - 128) + 128 + brightness;
  v = clamp255(v);
  if (gamma !== 1) {
    const exp = 1 / Math.max(gamma, 0.001);
    v = 255 * (v / 255) ** exp;
  }
  return clamp255(v);
}

/** Apply tone to every RGB channel of an RGBA buffer, alpha untouched. Returns a new buffer. */
export function applyToneRGBA(
  rgba: Uint8ClampedArray,
  brightness: number,
  contrast: number,
  gamma: number,
): Uint8ClampedArray {
  const out = new Uint8ClampedArray(rgba.length);
  const isNoOp = brightness === 0 && contrast === 0 && gamma === 1;
  if (isNoOp) {
    out.set(rgba);
    return out;
  }
  for (let i = 0; i < rgba.length; i += 4) {
    out[i] = toneChannel(rgba[i], brightness, contrast, gamma);
    out[i + 1] = toneChannel(rgba[i + 1], brightness, contrast, gamma);
    out[i + 2] = toneChannel(rgba[i + 2], brightness, contrast, gamma);
    out[i + 3] = rgba[i + 3];
  }
  return out;
}
