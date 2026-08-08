import type { AsciiFrame, BackgroundMode, BlendMode } from '../types';
import { measureRampCell } from '../metrics';
import { buildRowRuns, rgbaToCss } from './runs';

/** Glyph size in px at charSize 1. Render sizes are this times `scale`. */
export const CELL_FONT_SIZE = 16;

/**
 * Glyph pixel size for a given coarseness.
 *
 * Scaling the glyph by the same factor the grid was divided by is what keeps the output
 * dimensions constant as `charSize` rises: fewer columns times proportionally bigger
 * characters lands on the same pixel width, so raising it trades detail for legibility
 * rather than shrinking the image.
 */
export function glyphPixelSize(charSize: number): number {
  return CELL_FONT_SIZE * Math.max(1, charSize);
}

const BLEND_MODE_TO_COMPOSITE: Record<BlendMode, GlobalCompositeOperation> = {
  normal: 'source-over',
  multiply: 'multiply',
  screen: 'screen',
  overlay: 'overlay',
  darken: 'darken',
  lighten: 'lighten',
  'color-dodge': 'color-dodge',
  'color-burn': 'color-burn',
  'soft-light': 'soft-light',
  'hard-light': 'hard-light',
};

export interface RenderOptions {
  fontFamily: string;
  /** 1..6 — also used for PNG export resolution, same code path as the live preview. */
  scale: number;
  /**
   * Glyph size in px before `scale`. Sets how many pixels each character occupies, so it
   * drives the intrinsic output resolution — unlike `scale`, which is an export
   * multiplier, and unlike zoom, which only affects the view.
   */
  fontSize?: number;
  bgMode: BackgroundMode;
  bgColor: string;
  blendMode: BlendMode;
}

type Ctx2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
export interface CanvasLike {
  width: number;
  height: number;
  getContext(id: '2d'): Ctx2D | null;
}

export function computeCanvasSize(
  frame: AsciiFrame,
  fontFamily: string,
  scale: number,
  fontSize: number = CELL_FONT_SIZE,
) {
  // Sized from the frame's own ramp, so full-width alphabets get a wider cell.
  const { cellWidth, cellHeight } = measureRampCell(fontFamily, fontSize, frame.ramp);
  return {
    width: Math.max(1, Math.round(frame.cols * cellWidth * scale)),
    height: Math.max(1, Math.round(frame.rows * cellHeight * scale)),
    cellWidth: cellWidth * scale,
    cellHeight: cellHeight * scale,
  };
}

/** Render an AsciiFrame onto a canvas at `opts.scale`x. Sizes and clears the canvas itself. */
export function renderToCanvas(frame: AsciiFrame, canvas: CanvasLike, opts: RenderOptions): void {
  const fontSize = opts.fontSize ?? CELL_FONT_SIZE;
  const { width, height, cellWidth, cellHeight } = computeCanvasSize(
    frame,
    opts.fontFamily,
    opts.scale,
    fontSize,
  );
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  ctx.globalCompositeOperation = 'source-over';
  ctx.clearRect(0, 0, width, height);
  if (opts.bgMode === 'solid') {
    ctx.fillStyle = opts.bgColor;
    ctx.fillRect(0, 0, width, height);
  }

  ctx.font = `${fontSize * opts.scale}px ${opts.fontFamily}`;
  ctx.textBaseline = 'top';
  ctx.globalCompositeOperation = BLEND_MODE_TO_COMPOSITE[opts.blendMode] ?? 'source-over';

  for (let row = 0; row < frame.rows; row++) {
    const y = row * cellHeight;
    for (const run of buildRowRuns(frame, row)) {
      ctx.fillStyle = rgbaToCss(run.color);
      ctx.fillText(run.text, run.startCol * cellWidth, y);
    }
  }
}
