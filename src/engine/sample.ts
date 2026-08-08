/**
 * Sampling stage: source bitmap -> one RGBA sample per ASCII cell.
 *
 * The trick that makes this simple and fast: draw the source into an offscreen canvas
 * sized exactly `cols x rows` with image smoothing on. The browser's own box/bilinear
 * filter does the downsampling, so reading that canvas back gives one already-averaged
 * RGBA pixel per output cell — no manual box-filter loop needed.
 */

import type { SourceRect } from './crop';

let scratch: HTMLCanvasElement | OffscreenCanvas | null = null;
let scratchCtx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null = null;

function getScratchCanvas(w: number, h: number) {
  if (!scratch) {
    scratch =
      typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(w, h) : document.createElement('canvas');
    scratchCtx = scratch.getContext('2d', { willReadFrequently: true }) as
      | CanvasRenderingContext2D
      | OffscreenCanvasRenderingContext2D
      | null;
  }
  if (scratch.width !== w) scratch.width = w;
  if (scratch.height !== h) scratch.height = h;
  return { canvas: scratch, ctx: scratchCtx! };
}

/**
 * Compute the row count for a given column count so the ASCII grid reproduces the
 * source image's aspect ratio once rendered in a monospace font.
 *
 * `cellAspect` is cellWidth/cellHeight of the render font (see metrics.ts, ~0.5 for most
 * monospace fonts). Without this correction the output reads visibly stretched, since a
 * glyph cell is roughly twice as tall as it is wide.
 */
export function computeRows(
  cols: number,
  imgWidth: number,
  imgHeight: number,
  cellAspect: number,
  heightScale: number,
): number {
  if (imgWidth <= 0 || imgHeight <= 0 || cols <= 0) return 1;
  const rows = Math.round(cols * (imgHeight / imgWidth) * cellAspect * heightScale);
  return Math.max(1, rows);
}

/**
 * Grid width after coarsening. `charSize` of 3 makes one character stand in for a 3x3
 * block, so the column count is divided by it — the glyph is drawn proportionally larger
 * elsewhere, which keeps the output the same size while showing fewer, bigger characters.
 */
export function effectiveCols(cols: number, charSize: number): number {
  return Math.max(1, Math.round(cols / Math.max(1, charSize)));
}

/**
 * Sample a bitmap down to `cols x rows` RGBA cells.
 *
 * `pixelate` (0..20) blockifies the result: at 0 every cell is sampled independently at
 * full detail; above 0 the image is first downscaled to a coarser `cols/(pixelate+1) x
 * rows/(pixelate+1)` grid (smoothed) and then upscaled with nearest-neighbor, so groups
 * of ASCII cells share one flat color/glyph — a blocky mosaic look.
 */
export function sampleImage(
  bitmap: ImageBitmap,
  cols: number,
  rows: number,
  pixelate: number,
  crop?: SourceRect | null,
): Uint8ClampedArray {
  const { ctx } = getScratchCanvas(cols, rows);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.clearRect(0, 0, cols, rows);

  // Resolved unconditionally: an absent crop yields the full frame, so there is no cropped
  // vs uncropped branch to keep in sync between the two draw paths below.
  const { sx, sy, sw, sh } = crop ?? { sx: 0, sy: 0, sw: bitmap.width, sh: bitmap.height };

  if (pixelate > 0) {
    const factor = pixelate + 1;
    const blockCols = Math.max(1, Math.round(cols / factor));
    const blockRows = Math.max(1, Math.round(rows / factor));
    const { canvas: block, ctx: blockCtx } = (() => {
      const c: HTMLCanvasElement | OffscreenCanvas =
        typeof OffscreenCanvas !== 'undefined'
          ? new OffscreenCanvas(blockCols, blockRows)
          : document.createElement('canvas');
      c.width = blockCols;
      c.height = blockRows;
      const bctx = c.getContext('2d') as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
      bctx.imageSmoothingEnabled = true;
      bctx.imageSmoothingQuality = 'high';
      bctx.drawImage(bitmap, sx, sy, sw, sh, 0, 0, blockCols, blockRows);
      return { canvas: c, ctx: bctx };
    })();
    void blockCtx;
    ctx.imageSmoothingEnabled = false;
    // The block canvas is already cropped, so this second draw takes all of it.
    ctx.drawImage(block as CanvasImageSource, 0, 0, cols, rows);
  } else {
    ctx.drawImage(bitmap, sx, sy, sw, sh, 0, 0, cols, rows);
  }

  const data = ctx.getImageData(0, 0, cols, rows);
  return data.data;
}
