/**
 * Zoom math for the preview stage.
 *
 * Kept pure and separate from the component so the clamping rules — especially the
 * canvas-size guard, which is what stops a high zoom from allocating a canvas the
 * browser refuses to create — are directly testable.
 */

export const MIN_ZOOM = 0.1;
export const MAX_ZOOM = 8;
/** Multiplicative step, so each click feels like the same relative jump at any zoom. */
export const ZOOM_STEP = 1.25;

/**
 * Browsers cap canvas dimensions (commonly 16384px, lower on mobile Safari) and a very
 * large canvas costs width*height*4 bytes regardless. Staying well under the hard limit
 * keeps memory sane at high zoom.
 */
const MAX_CANVAS_EDGE = 8192;
const MAX_CANVAS_AREA = 32_000_000;

export function clampZoom(zoom: number): number {
  if (!Number.isFinite(zoom)) return 1;
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom));
}

/** One zoom step in `direction` (+1 in, -1 out), clamped to the allowed range. */
export function stepZoom(zoom: number, direction: 1 | -1): number {
  return clampZoom(direction > 0 ? zoom * ZOOM_STEP : zoom / ZOOM_STEP);
}

/**
 * Zoom that fits `content` inside `container`.
 *
 * Capped at 1 so "Fit" only ever shrinks oversized output — blowing a small render up to
 * fill the stage would just produce enormous glyphs, which is never what's wanted here.
 */
export function computeFitZoom(
  contentWidth: number,
  contentHeight: number,
  containerWidth: number,
  containerHeight: number,
): number {
  if (contentWidth <= 0 || contentHeight <= 0) return 1;
  if (containerWidth <= 0 || containerHeight <= 0) return 1;
  const fit = Math.min(containerWidth / contentWidth, containerHeight / contentHeight);
  return clampZoom(Math.min(1, fit));
}

/**
 * Device-pixel scale to render at for a given zoom, reduced if the resulting canvas would
 * be too large. Returning less than `dpr * zoom` means glyphs soften slightly at extreme
 * zoom, which is a far better failure mode than a blank canvas.
 */
export function safeRenderScale(
  baseWidth: number,
  baseHeight: number,
  desiredScale: number,
): number {
  if (baseWidth <= 0 || baseHeight <= 0) return 1;
  const byEdge = Math.min(MAX_CANVAS_EDGE / baseWidth, MAX_CANVAS_EDGE / baseHeight);
  const byArea = Math.sqrt(MAX_CANVAS_AREA / (baseWidth * baseHeight));
  return Math.max(0.5, Math.min(desiredScale, byEdge, byArea));
}
