/**
 * Pure geometry for the crop overlay: mapping between pointer positions and normalised
 * crop rectangles.
 *
 * Kept free of DOM and React so the mapping can be tested directly — this is the part of
 * cropping most likely to break, since the canvas is displayed at a CSS size that differs
 * from its backing-store size by both the device pixel ratio and the zoom level.
 *
 * The trick that makes zoom a non-issue: everything is measured against the canvas's
 * *displayed* box. Because that box already has zoom baked into it, dividing by its width
 * cancels the zoom out automatically. Nothing here should ever read `canvas.width`.
 */

import type { CropRect } from '@/engine/types';

/** The displayed box of the canvas, i.e. what getBoundingClientRect() returns. */
export interface DisplayBox {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface Point {
  x: number;
  y: number;
}

/** Which part of an existing crop a drag is manipulating. */
export type CropHandle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | 'move';

export const CORNER_HANDLES: CropHandle[] = ['nw', 'ne', 'se', 'sw'];
export const EDGE_HANDLES: CropHandle[] = ['n', 'e', 's', 'w'];

/** Smallest crop the overlay will produce, normalised. Matches engine/crop.ts. */
export const MIN_EXTENT = 0.01;

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

/**
 * Convert a client-space pointer position to normalised 0..1 coordinates within the
 * displayed canvas. Points outside the canvas clamp to its edges, so dragging past the
 * boundary selects up to the edge rather than producing an out-of-range crop.
 */
export function clientToNormalised(clientX: number, clientY: number, box: DisplayBox): Point {
  if (box.width <= 0 || box.height <= 0) return { x: 0, y: 0 };
  return {
    x: clamp01((clientX - box.left) / box.width),
    y: clamp01((clientY - box.top) / box.height),
  };
}

/** Convert a normalised crop back to a CSS-pixel box, for positioning the overlay. */
export function normalisedToBox(crop: CropRect, box: DisplayBox) {
  return {
    left: crop.x * box.width,
    top: crop.y * box.height,
    width: crop.w * box.width,
    height: crop.h * box.height,
  };
}

/** Build a normalised rect from two dragged corners, in any direction. */
export function rectFromPoints(a: Point, b: Point): CropRect {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return {
    x: clamp01(x),
    y: clamp01(y),
    w: clamp01(Math.abs(b.x - a.x)),
    h: clamp01(Math.abs(b.y - a.y)),
  };
}

/** Does this rect enclose enough area to be worth applying? */
export function isUsableRect(crop: CropRect): boolean {
  return crop.w >= MIN_EXTENT && crop.h >= MIN_EXTENT;
}

/**
 * Resize a crop by dragging one of its handles to `point`.
 *
 * Edges are moved independently and then normalised, so dragging a handle past the opposite
 * edge flips the rectangle rather than collapsing it — the behaviour every image editor has.
 */
export function resizeCrop(crop: CropRect, handle: CropHandle, point: Point): CropRect {
  let left = crop.x;
  let top = crop.y;
  let right = crop.x + crop.w;
  let bottom = crop.y + crop.h;

  const px = clamp01(point.x);
  const py = clamp01(point.y);

  if (handle.includes('w')) left = px;
  if (handle.includes('e')) right = px;
  if (handle.includes('n')) top = py;
  if (handle.includes('s')) bottom = py;

  return rectFromPoints({ x: left, y: top }, { x: right, y: bottom });
}

/**
 * Translate a crop by a normalised delta, keeping it fully inside the source.
 *
 * The rectangle keeps its size and stops at the edge rather than being clipped, which is
 * what makes dragging a selection around feel solid instead of shrinking at the boundary.
 */
export function moveCrop(crop: CropRect, dx: number, dy: number): CropRect {
  const w = Math.min(crop.w, 1);
  const h = Math.min(crop.h, 1);
  return {
    x: Math.min(Math.max(crop.x + dx, 0), 1 - w),
    y: Math.min(Math.max(crop.y + dy, 0), 1 - h),
    w,
    h,
  };
}

/** Aspect-ratio presets offered alongside a free-form crop. */
export const ASPECT_PRESETS = [
  { id: 'free', label: 'Free', ratio: null },
  { id: 'square', label: '1:1', ratio: 1 },
  { id: 'wide', label: '16:9', ratio: 16 / 9 },
  { id: 'portrait', label: '9:16', ratio: 9 / 16 },
] as const;

export type AspectPresetId = (typeof ASPECT_PRESETS)[number]['id'];

/**
 * Force a crop to a target aspect ratio, expressed against the *source* pixel dimensions.
 *
 * The normalised space is anisotropic — 0.5 wide is not the same pixel count as 0.5 tall
 * unless the source is square — so the source size has to come in here. Shrinking to fit
 * rather than growing keeps the result inside the frame.
 */
export function applyAspect(
  crop: CropRect,
  ratio: number,
  sourceWidth: number,
  sourceHeight: number,
): CropRect {
  if (!(ratio > 0) || sourceWidth <= 0 || sourceHeight <= 0) return crop;

  const pxW = crop.w * sourceWidth;
  const pxH = crop.h * sourceHeight;
  const currentRatio = pxH > 0 ? pxW / pxH : ratio;

  let w = crop.w;
  let h = crop.h;
  if (currentRatio > ratio) {
    w = (pxH * ratio) / sourceWidth;
  } else {
    h = pxW / ratio / sourceHeight;
  }

  // Keep the centre put while resizing, then nudge back inside the frame if that pushed it out.
  const cx = crop.x + crop.w / 2;
  const cy = crop.y + crop.h / 2;
  w = Math.min(w, 1);
  h = Math.min(h, 1);
  return {
    x: Math.min(Math.max(cx - w / 2, 0), 1 - w),
    y: Math.min(Math.max(cy - h / 2, 0), 1 - h),
    w,
    h,
  };
}

/** Cell grid a crop will produce, for the overlay's live readout. */
export function croppedGridSize(
  crop: CropRect | null,
  cols: number,
  sourceWidth: number,
  sourceHeight: number,
  cellAspect: number,
  heightScale: number,
): { cols: number; rows: number } {
  const w = crop ? crop.w * sourceWidth : sourceWidth;
  const h = crop ? crop.h * sourceHeight : sourceHeight;
  if (w <= 0 || h <= 0 || cols <= 0) return { cols: Math.max(1, cols), rows: 1 };
  return { cols, rows: Math.max(1, Math.round(cols * (h / w) * cellAspect * heightScale)) };
}
