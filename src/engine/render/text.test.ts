import { describe, expect, it } from 'vitest';
import type { AsciiFrame } from '../types';
import { toAnsi, toHtml, toJsonData, toPlainText } from './text';

function twoRowFrame(): AsciiFrame {
  // "AB" / "C " over a ramp where index 0 -> 'A'-ish glyphs; just use a 4-glyph ramp
  const ramp = [' ', '.', ':', '#'];
  const chars = Uint16Array.from([1, 2, 3, 0]); // row0: '.', ':'  row1: '#', ' '
  const rgba = new Uint8ClampedArray(4 * 4);
  rgba.set([255, 0, 0, 255], 0);
  rgba.set([255, 0, 0, 255], 4); // row0 uniform red
  rgba.set([0, 255, 0, 128], 8);
  rgba.set([0, 0, 255, 255], 12); // row1 two different colors
  return { cols: 2, rows: 2, chars, rgba, ramp, durationMs: 0 };
}

/** The same frame with its first cell matted out (alpha 0). */
function mattedFrame(): AsciiFrame {
  const frame = twoRowFrame();
  const rgba = new Uint8ClampedArray(frame.rgba);
  rgba[3] = 0;
  return { ...frame, rgba };
}

describe('toPlainText', () => {
  it('joins rows of the exact ramp glyphs with newlines', () => {
    expect(toPlainText(twoRowFrame())).toBe('.:\n# ');
  });

  // Without this, a TXT export would still show the background the preview cut out.
  it('renders a matted-out cell as a space', () => {
    expect(toPlainText(mattedFrame())).toBe(' :\n# ');
  });

  it('keeps the grid rectangular when cells are removed', () => {
    const lines = toPlainText(mattedFrame()).split('\n');
    expect(new Set(lines.map((l) => l.length)).size).toBe(1);
  });
});

describe('toAnsi', () => {
  it('emits one truecolor escape per color run and resets at end of line', () => {
    const ansi = toAnsi(twoRowFrame());
    const lines = ansi.split('\n');
    expect(lines[0]).toBe('\x1b[38;2;255;0;0m.:\x1b[0m');
    expect(lines[1]).toBe('\x1b[38;2;0;255;0m#\x1b[38;2;0;0;255m \x1b[0m');
  });
});

describe('toHtml', () => {
  it('wraps color runs in spans inside a pre block', () => {
    const html = toHtml(twoRowFrame(), { fontFamily: 'monospace' });
    expect(html).toContain('<pre');
    expect(html).toContain('<span style="color:rgb(255, 0, 0)">.:</span>');
    expect(html).toContain('<span style="color:rgba(0, 255, 0, 0.502)">#</span>');
  });

  it('escapes HTML-significant characters in glyphs', () => {
    const frame: AsciiFrame = {
      cols: 1,
      rows: 1,
      chars: Uint16Array.from([0]),
      rgba: Uint8ClampedArray.from([1, 2, 3, 255]),
      ramp: ['<'],
      durationMs: 0,
    };
    expect(toHtml(frame, { fontFamily: 'monospace' })).toContain('&lt;');
  });
});

describe('toJsonData', () => {
  it('round-trips every cell glyph and color', () => {
    const data = toJsonData(twoRowFrame());
    expect(data.cols).toBe(2);
    expect(data.rows).toBe(2);
    expect(data.cells).toHaveLength(4);
    expect(data.cells[0]).toEqual({ ch: '.', rgba: [255, 0, 0, 255] });
    expect(data.cells[3]).toEqual({ ch: ' ', rgba: [0, 0, 255, 255] });
  });

  it('reports a matted-out cell as a blank glyph with its alpha intact', () => {
    const data = toJsonData(mattedFrame());
    expect(data.cells[0]).toEqual({ ch: ' ', rgba: [255, 0, 0, 0] });
  });
});
