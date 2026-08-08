import type { AsciiFrame } from '../types';
import { BLANK_ALPHA } from '../matte';

export type RGBA = readonly [number, number, number, number];

/**
 * A cell too transparent to draw. Background removal works by zeroing alpha, so this is what
 * turns a matted cell into a blank everywhere at once.
 *
 * The canvas hides such a cell on its own (it fills at alpha 0), but the text renderers do
 * not — without this the TXT and ANSI exports would still show glyphs where the background
 * was cut out. Routing the check through here means every renderer that builds runs inherits
 * the same answer.
 */
export function isBlankCell(rgba: Uint8ClampedArray, cellIdx: number): boolean {
  return rgba[cellIdx * 4 + 3] <= BLANK_ALPHA;
}

/** The glyph a cell should draw — a space once it's too transparent to see. */
export function glyphAt(frame: AsciiFrame, cellIdx: number): string {
  if (isBlankCell(frame.rgba, cellIdx)) return ' ';
  return frame.ramp[frame.chars[cellIdx]] ?? ' ';
}

export interface ColorRun {
  startCol: number;
  text: string;
  color: RGBA;
}

export function cellColorAt(rgba: Uint8ClampedArray, cellIdx: number): RGBA {
  const o = cellIdx * 4;
  return [rgba[o], rgba[o + 1], rgba[o + 2], rgba[o + 3]];
}

export function colorsEqual(a: RGBA, b: RGBA): boolean {
  return a[0] === b[0] && a[1] === b[1] && a[2] === b[2] && a[3] === b[3];
}

export function rgbaToCss([r, g, b, a]: RGBA): string {
  return `rgba(${r}, ${g}, ${b}, ${(a / 255).toFixed(3)})`;
}

/**
 * Group one row of a frame into runs of consecutive cells sharing the same color.
 *
 * Every renderer (canvas, SVG, ANSI, HTML) needs this: emitting one fillStyle/span/escape
 * code per color run instead of per cell is what keeps mono-color frames (the common case)
 * to a single draw call per row instead of `cols` of them.
 */
export function buildRowRuns(frame: AsciiFrame, row: number): ColorRun[] {
  const { cols, chars, rgba, ramp } = frame;
  const rowBase = row * cols;
  const runs: ColorRun[] = [];
  if (cols === 0) return runs;

  const glyph = (idx: number) => (isBlankCell(rgba, idx) ? ' ' : (ramp[chars[idx]] ?? ' '));

  let runStart = 0;
  let runColor = cellColorAt(rgba, rowBase);
  let runStr = glyph(rowBase);

  for (let col = 1; col < cols; col++) {
    const idx = rowBase + col;
    const color = cellColorAt(rgba, idx);
    if (colorsEqual(color, runColor)) {
      runStr += glyph(idx);
      continue;
    }
    runs.push({ startCol: runStart, text: runStr, color: runColor });
    runStart = col;
    runColor = color;
    runStr = glyph(idx);
  }
  runs.push({ startCol: runStart, text: runStr, color: runColor });
  return runs;
}
