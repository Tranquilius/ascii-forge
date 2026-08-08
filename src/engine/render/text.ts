import type { AsciiFrame } from '../types';
import { buildRowRuns, glyphAt, type RGBA } from './runs';

/** Plain text — exactly the on-screen glyphs, no color. Rows joined by \n. */
export function toPlainText(frame: AsciiFrame): string {
  const lines: string[] = [];
  for (let row = 0; row < frame.rows; row++) {
    let line = '';
    const rowBase = row * frame.cols;
    for (let col = 0; col < frame.cols; col++) {
      // glyphAt, not a raw ramp lookup: a matted-out cell has to read as a space here, or
      // the TXT export would show the background the preview has already removed.
      line += glyphAt(frame, rowBase + col);
    }
    lines.push(line);
  }
  return lines.join('\n');
}

/** ANSI truecolor text, one 24-bit foreground escape per color run (not per cell). */
export function toAnsi(frame: AsciiFrame): string {
  const RESET = '\x1b[0m';
  const lines: string[] = [];
  for (let row = 0; row < frame.rows; row++) {
    let line = '';
    for (const run of buildRowRuns(frame, row)) {
      const [r, g, b] = run.color;
      line += `\x1b[38;2;${r};${g};${b}m${run.text}`;
    }
    line += RESET;
    lines.push(line);
  }
  return lines.join('\n');
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function rgbaToCssOpaque([r, g, b, a]: RGBA): string {
  return a === 255 ? `rgb(${r}, ${g}, ${b})` : `rgba(${r}, ${g}, ${b}, ${(a / 255).toFixed(3)})`;
}

export interface HtmlRenderOptions {
  fontFamily: string;
  bgColor?: string; // omit for transparent
}

/** A self-contained `<pre>` block: one `<span>` per color run, one line per row. */
export function toHtml(frame: AsciiFrame, opts: HtmlRenderOptions): string {
  const lines: string[] = [];
  for (let row = 0; row < frame.rows; row++) {
    let line = '';
    for (const run of buildRowRuns(frame, row)) {
      line += `<span style="color:${rgbaToCssOpaque(run.color)}">${escapeHtml(run.text)}</span>`;
    }
    lines.push(line);
  }
  const bg = opts.bgColor ? `background:${opts.bgColor};` : '';
  const style = `font-family:${opts.fontFamily};white-space:pre;line-height:1;${bg}`;
  return `<pre style="${style}">${lines.join('\n')}</pre>`;
}

export interface AsciiJson {
  cols: number;
  rows: number;
  ramp: string[];
  /** Row-major; one entry per cell. */
  cells: Array<{ ch: string; rgba: [number, number, number, number] }>;
}

/** Structured, roundtrippable JSON representation — every cell's glyph and exact color. */
export function toJsonData(frame: AsciiFrame): AsciiJson {
  const cells: AsciiJson['cells'] = new Array(frame.cols * frame.rows);
  for (let i = 0; i < frame.cols * frame.rows; i++) {
    const o = i * 4;
    cells[i] = {
      ch: glyphAt(frame, i),
      rgba: [frame.rgba[o], frame.rgba[o + 1], frame.rgba[o + 2], frame.rgba[o + 3]],
    };
  }
  return { cols: frame.cols, rows: frame.rows, ramp: [...frame.ramp], cells };
}
