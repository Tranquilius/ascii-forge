/**
 * Crop stage: resolve a normalised crop rectangle into a concrete source-pixel rectangle.
 *
 * The crop is applied *before* sampling rather than to the generated grid, so the full
 * column budget is spent on the selected region. A half-width crop therefore yields a
 * full-width result of that region — roughly double the detail — instead of half the cells.
 */

import type { CropRect } from './types';

/** A crop resolved against a specific source size, in source pixels. */
export interface SourceRect {
  sx: number;
  sy: number;
  sw: number;
  sh: number;
}

/** Smallest crop we accept, as a fraction of the source. Guards against a stray click. */
const MIN_NORMALISED_EXTENT = 0.01;

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

/**
 * Is this a crop worth applying? Rejects nulls, NaN/Infinity, and degenerate or inverted
 * rectangles. Callers use this to decide whether to show "cropped" affordances.
 */
export function isValidCrop(crop: CropRect | null | undefined): crop is CropRect {
  if (!crop) return false;
  const { x, y, w, h } = crop;
  if (![x, y, w, h].every(isFiniteNumber)) return false;
  if (w < MIN_NORMALISED_EXTENT || h < MIN_NORMALISED_EXTENT) return false;
  // Must overlap the source at all.
  return x < 1 && y < 1 && x + w > 0 && y + h > 0;
}

/**
 * Clamp a normalised crop to the unit square, preserving as much of the requested rectangle
 * as actually overlaps the source.
 */
export function clampCrop(crop: CropRect): CropRect {
  const x0 = Math.min(Math.max(crop.x, 0), 1);
  const y0 = Math.min(Math.max(crop.y, 0), 1);
  const x1 = Math.min(Math.max(crop.x + crop.w, 0), 1);
  const y1 = Math.min(Math.max(crop.y + crop.h, 0), 1);
  return { x: x0, y: y0, w: Math.max(0, x1 - x0), h: Math.max(0, y1 - y0) };
}

/**
 * Resolve a normalised crop against a source size.
 *
 * An absent or unusable crop resolves to the whole frame, which is what makes this safe to
 * call unconditionally from the sampler — there is no "cropped" branch anywhere downstream.
 * The returned rectangle is always at least 1x1 so `drawImage` can never be handed a
 * zero-area source.
 */
export function resolveCrop(
  crop: CropRect | null | undefined,
  sourceWidth: number,
  sourceHeight: number,
): SourceRect {
  const full: SourceRect = { sx: 0, sy: 0, sw: sourceWidth, sh: sourceHeight };
  if (sourceWidth <= 0 || sourceHeight <= 0) return full;
  if (!isValidCrop(crop)) return full;

  const c = clampCrop(crop);
  if (c.w < MIN_NORMALISED_EXTENT || c.h < MIN_NORMALISED_EXTENT) return full;

  const sx = Math.round(c.x * sourceWidth);
  const sy = Math.round(c.y * sourceHeight);
  // Round the far edge independently rather than rounding the width, so a crop ending at
  // 1.0 lands exactly on the source edge instead of a pixel short.
  const sw = Math.max(1, Math.round((c.x + c.w) * sourceWidth) - sx);
  const sh = Math.max(1, Math.round((c.y + c.h) * sourceHeight) - sy);

  return {
    sx: Math.min(sx, sourceWidth - 1),
    sy: Math.min(sy, sourceHeight - 1),
    sw: Math.min(sw, sourceWidth - sx),
    sh: Math.min(sh, sourceHeight - sy),
  };
}

/** The full-frame crop, useful as an overlay's starting rectangle. */
export const FULL_CROP: CropRect = { x: 0, y: 0, w: 1, h: 1 };
