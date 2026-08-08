/**
 * Measures the render font's cell aspect ratio (width/height) so sample.ts can compute a
 * row count that reproduces the source image's proportions. Most monospace fonts are
 * roughly twice as tall as they are wide (aspect ~0.5); getting this from the actual font
 * rather than hardcoding it keeps the output correct if the render font ever changes.
 */

export interface FontMetrics {
  cellWidth: number;
  cellHeight: number;
  /** cellWidth / cellHeight */
  aspect: number;
}

const FALLBACK_ASPECT = 0.5;
const cache = new Map<string, FontMetrics>();
let measureCanvas: HTMLCanvasElement | null = null;

/**
 * Cell metrics for a specific ramp.
 *
 * Cell width is taken as the *modal* advance across the ramp's own glyphs rather than
 * from 'M'. This is what lets non-Latin alphabets work: CJK glyphs are full-width — twice
 * the advance of a Latin monospace character — so measuring 'M' would size every cell at
 * half the glyph and the characters would overlap horizontally. Using the ramp's own modal
 * advance sizes the grid to whatever alphabet is loaded, and the mode (rather than the max)
 * ignores the occasional odd-width outlier.
 */
export function measureRampCell(
  fontFamily: string,
  fontSizePx: number,
  ramp: readonly string[],
): FontMetrics {
  const base = measureFont(fontFamily, fontSizePx);
  if (ramp.length === 0 || typeof document === 'undefined') return base;

  const key = `${fontFamily}@${fontSizePx}#${ramp.join('')}`;
  const cached = cache.get(key);
  if (cached) return cached;

  if (!measureCanvas) measureCanvas = document.createElement('canvas');
  const ctx = measureCanvas.getContext('2d');
  if (!ctx) return base;
  ctx.font = `${fontSizePx}px ${fontFamily}`;

  // Bucket advances to a tenth of a pixel and take the most common. Height is the tallest
  // ink extent in the set, not 'M': rows are spaced by cellHeight, so measuring a
  // cap-height Latin letter would pack full-height glyphs (kana, block elements) into a
  // cell shorter than they draw and smear them into the row below.
  const counts = new Map<number, number>();
  let maxExtent = 0;
  for (const glyph of ramp) {
    const m = ctx.measureText(glyph);
    const w = Math.round(m.width * 10) / 10;
    if (w > 0) counts.set(w, (counts.get(w) ?? 0) + 1);
    const extent = (m.actualBoundingBoxAscent ?? 0) + (m.actualBoundingBoxDescent ?? 0);
    if (Number.isFinite(extent) && extent > maxExtent) maxExtent = extent;
  }

  let cellWidth = base.cellWidth;
  let best = 0;
  for (const [w, n] of counts) {
    if (n > best) {
      best = n;
      cellWidth = w;
    }
  }

  const cellHeight = Math.max(base.cellHeight, maxExtent);
  const metrics: FontMetrics = {
    cellWidth,
    cellHeight,
    aspect: cellWidth / cellHeight,
  };
  cache.set(key, metrics);
  return metrics;
}

export function measureFont(fontFamily: string, fontSizePx = 100): FontMetrics {
  const key = `${fontFamily}@${fontSizePx}`;
  const cached = cache.get(key);
  if (cached) return cached;

  if (typeof document === 'undefined') {
    const fallback: FontMetrics = {
      cellWidth: fontSizePx * FALLBACK_ASPECT,
      cellHeight: fontSizePx,
      aspect: FALLBACK_ASPECT,
    };
    cache.set(key, fallback);
    return fallback;
  }

  if (!measureCanvas) measureCanvas = document.createElement('canvas');
  const ctx = measureCanvas.getContext('2d');
  if (!ctx) {
    const fallback: FontMetrics = {
      cellWidth: fontSizePx * FALLBACK_ASPECT,
      cellHeight: fontSizePx,
      aspect: FALLBACK_ASPECT,
    };
    cache.set(key, fallback);
    return fallback;
  }

  ctx.font = `${fontSizePx}px ${fontFamily}`;
  const m = ctx.measureText('M');
  const cellWidth = m.width || fontSizePx * FALLBACK_ASPECT;
  const hasBounds =
    typeof m.actualBoundingBoxAscent === 'number' && typeof m.actualBoundingBoxDescent === 'number';
  const cellHeight = hasBounds && m.actualBoundingBoxAscent + m.actualBoundingBoxDescent > 0
    ? m.actualBoundingBoxAscent + m.actualBoundingBoxDescent
    : fontSizePx * 1.2;

  const metrics: FontMetrics = { cellWidth, cellHeight, aspect: cellWidth / cellHeight };
  cache.set(key, metrics);
  return metrics;
}

export function clearFontMetricsCache(): void {
  cache.clear();
}
