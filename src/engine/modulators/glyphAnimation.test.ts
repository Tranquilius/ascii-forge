import { describe, expect, it } from 'vitest';
import type { AsciiFrame } from '../types';
import {
  ANIMATION_STYLES,
  type AnimationStyle,
  cellHash,
  createGlyphAnimator,
  crtBrightness,
  phaseFor,
  phaseOf,
} from './glyphAnimation';

/** 6-glyph ramp where indices {0,1,2} and {3,4,5} are mutually interchangeable. */
const ALTERNATIVES = [
  [0, 1, 2],
  [0, 1, 2],
  [0, 1, 2],
  [3, 4, 5],
  [3, 4, 5],
  [3, 4, 5],
];

function gridFrame(cols: number, rows: number): AsciiFrame {
  const n = cols * rows;
  const chars = Uint16Array.from({ length: n }, (_, i) => i % 6);
  const rgba = new Uint8ClampedArray(n * 4);
  for (let i = 0; i < n; i++) rgba.set([10, 20, 30, 255], i * 4);
  return { cols, rows, chars, rgba, ramp: ['a', 'b', 'c', 'X', 'Y', 'Z'], durationMs: 0 };
}

const STYLES = ANIMATION_STYLES.map((s) => s.id);

/** Fraction of cells whose glyph differs between two times. */
function movedFraction(style: AnimationStyle, frame: AsciiFrame, t0: number, t1: number): number {
  const anim = createGlyphAnimator({ alternatives: ALTERNATIVES, style, holdMs: 500 });
  const a = anim.apply(frame, t0).chars;
  const b = anim.apply(frame, t1).chars;
  let moved = 0;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) moved++;
  return moved / a.length;
}

describe('cellHash / phaseOf', () => {
  it('is deterministic and 32-bit', () => {
    expect(cellHash(7, 3, 1)).toBe(cellHash(7, 3, 1));
    const h = cellHash(99999, 12345, 0x5eed);
    expect(h).toBeGreaterThanOrEqual(0);
    expect(h).toBeLessThanOrEqual(0xffffffff);
  });

  it('phaseOf stays within [0, 1) and spreads roughly evenly', () => {
    const buckets = new Array(4).fill(0);
    for (let i = 0; i < 4000; i++) {
      const p = phaseOf(i, 0x5eed);
      expect(p).toBeGreaterThanOrEqual(0);
      expect(p).toBeLessThan(1);
      buckets[Math.floor(p * 4)]++;
    }
    for (const b of buckets) expect(b).toBeGreaterThan(700);
  });
});

describe('phaseFor', () => {
  it('gives every cell the same phase for pulse', () => {
    const phases = new Set([0, 5, 37, 99].map((i) => phaseFor('pulse', i, 10, 10, 1)));
    expect(phases.size).toBe(1);
  });

  it('varies with position for wave and ripple, and ignores the seed', () => {
    for (const style of ['wave', 'ripple'] as AnimationStyle[]) {
      expect(phaseFor(style, 0, 10, 10, 1)).toBe(phaseFor(style, 0, 10, 10, 999));
      // compare a corner against a mid-grid cell: opposite corners are equidistant from
      // the centre, so for ripple they are legitimately identical
      expect(phaseFor(style, 0, 10, 10, 1)).not.toBe(phaseFor(style, 55, 10, 10, 1));
    }
  });

  it('ripple treats opposite corners identically — rings are symmetric', () => {
    expect(phaseFor('ripple', 0, 10, 10, 1)).toBeCloseTo(phaseFor('ripple', 99, 10, 10, 1), 10);
  });

  it('wave leads at the top-left corner and trails at the bottom-right', () => {
    // larger phase = changes earlier, so the sweep starts top-left
    expect(phaseFor('wave', 0, 10, 10, 1)).toBeGreaterThan(phaseFor('wave', 99, 10, 10, 1));
  });

  it('ripple leads at the centre and trails at the edges', () => {
    const centre = phaseFor('ripple', 5 * 10 + 5, 10, 10, 1);
    const corner = phaseFor('ripple', 0, 10, 10, 1);
    expect(centre).toBeGreaterThan(corner);
  });

  it('stays within [0, 1] for every style across a whole grid', () => {
    for (const style of STYLES) {
      for (let i = 0; i < 400; i++) {
        const p = phaseFor(style, i, 20, 20, 0x5eed);
        expect(p).toBeGreaterThanOrEqual(0);
        expect(p).toBeLessThanOrEqual(1);
      }
    }
  });
});

describe('every style', () => {
  const frame = gridFrame(40, 25);

  it('only ever swaps within the same density group — tone is preserved', () => {
    for (const style of STYLES) {
      const anim = createGlyphAnimator({ alternatives: ALTERNATIVES, style, holdMs: 500 });
      for (let s = 0; s < 40; s++) {
        const out = anim.apply(frame, s * 0.05);
        for (let i = 0; i < out.chars.length; i++) {
          expect(ALTERNATIVES[frame.chars[i]]).toContain(out.chars[i]);
        }
      }
    }
  });

  it('never mutates the input frame', () => {
    for (const style of STYLES) {
      const anim = createGlyphAnimator({ alternatives: ALTERNATIVES, style, holdMs: 500 });
      const beforeChars = Array.from(frame.chars);
      const beforeRgba = Array.from(frame.rgba);
      anim.apply(frame, 2.5);
      expect(Array.from(frame.chars)).toEqual(beforeChars);
      expect(Array.from(frame.rgba)).toEqual(beforeRgba);
    }
  });

  it('leaves colour alone for every style except CRT', () => {
    for (const style of STYLES.filter((s) => s !== 'crt')) {
      const anim = createGlyphAnimator({ alternatives: ALTERNATIVES, style, holdMs: 500 });
      const out = anim.apply(frame, 2.5);
      // the untouched buffer is passed straight through, not copied
      expect(out.rgba).toBe(frame.rgba);
    }
  });

  it('leaves glyphs with no partner completely fixed', () => {
    for (const style of STYLES) {
      const anim = createGlyphAnimator({
        alternatives: [[0], [1], [2], [3], [4], [5]],
        style,
        holdMs: 500,
      });
      expect(Array.from(anim.apply(frame, 1.7).chars)).toEqual(Array.from(frame.chars));
    }
  });

  it('loops seamlessly when loopSteps is set', () => {
    const holdMs = 250;
    const loopSteps = 8;
    const period = (holdMs / 1000) * loopSteps;
    for (const style of STYLES) {
      const anim = createGlyphAnimator({ alternatives: ALTERNATIVES, style, holdMs, loopSteps });
      for (const t of [0, 0.13, 0.5, 1.234]) {
        expect(Array.from(anim.apply(frame, t).chars)).toEqual(
          Array.from(anim.apply(frame, t + period).chars),
        );
      }
    }
  });

  it('changes every eligible cell when its step advances', () => {
    // cycling through the density group guarantees a visible change on each beat,
    // where a random re-roll would sometimes redraw the same glyph
    for (const style of STYLES) {
      const anim = createGlyphAnimator({ alternatives: ALTERNATIVES, style, holdMs: 500 });
      const a = anim.apply(frame, 0).chars;
      const b = anim.apply(frame, 10).chars; // 20 steps later, all phases have advanced
      for (let i = 0; i < a.length; i++) expect(a[i]).not.toBe(b[i]);
    }
  });
});

describe('crt', () => {
  const frame = gridFrame(20, 40);
  const holdSec = 0.5;

  it('brightness stays within a sane multiplier range', () => {
    for (let row = 0; row < 40; row++) {
      for (const t of [0, 0.12, 0.25, 0.37, 0.49]) {
        const b = crtBrightness(row, 40, t, holdSec);
        expect(b).toBeGreaterThan(0);
        expect(b).toBeLessThanOrEqual(2);
      }
    }
  });

  it('peaks at the beam and falls off behind it', () => {
    // at t=0 the beam sits on row 0
    const atBeam = crtBrightness(0, 40, 0, holdSec);
    const justBehind = crtBrightness(4, 40, 0, holdSec);
    const farBehind = crtBrightness(20, 40, 0, holdSec);
    expect(atBeam).toBeGreaterThan(justBehind);
    expect(justBehind).toBeGreaterThan(farBehind);
  });

  it('the beam travels down as time advances', () => {
    const rowOfPeak = (t: number) => {
      let best = 0;
      let bestRow = 0;
      for (let row = 0; row < 40; row++) {
        // compare even rows only, so the scanline dimming doesn't bias the peak
        if (row % 2) continue;
        const b = crtBrightness(row, 40, t, holdSec);
        if (b > best) {
          best = b;
          bestRow = row;
        }
      }
      return bestRow;
    };
    expect(rowOfPeak(0)).toBeLessThan(rowOfPeak(0.2));
    expect(rowOfPeak(0.2)).toBeLessThan(rowOfPeak(0.4));
  });

  it('repeats every hold period', () => {
    for (const row of [0, 7, 22, 39]) {
      expect(crtBrightness(row, 40, 0.1, holdSec)).toBeCloseTo(
        crtBrightness(row, 40, 0.1 + holdSec, holdSec),
        10,
      );
    }
  });

  it('dims alternate rows to give the scanline pattern', () => {
    // sample far from the beam so the glow term is effectively equal for both rows
    const even = crtBrightness(20, 40, 0, holdSec);
    const odd = crtBrightness(21, 40, 0, holdSec);
    expect(odd).toBeLessThan(even);
  });

  it('modulates colour without changing which colours are present per channel ratio', () => {
    const anim = createGlyphAnimator({ alternatives: ALTERNATIVES, style: 'crt', holdMs: 500 });
    const out = anim.apply(frame, 0.1);
    expect(out.rgba).not.toBe(frame.rgba);
    let dimmed = 0;
    for (let i = 0; i < frame.chars.length; i++) {
      const o = i * 4;
      if (out.rgba[o] !== frame.rgba[o]) dimmed++;
      // alpha must survive, or transparent backgrounds would develop holes
      expect(out.rgba[o + 3]).toBe(frame.rgba[o + 3]);
    }
    expect(dimmed).toBeGreaterThan(0);
  });

  it('shades every row, including cells whose glyph cannot change', () => {
    const anim = createGlyphAnimator({
      alternatives: [[0], [1], [2], [3], [4], [5]],
      style: 'crt',
      holdMs: 500,
    });
    const out = anim.apply(frame, 0.1);
    // glyphs are pinned, but the beam must still sweep the picture
    expect(Array.from(out.chars)).toEqual(Array.from(frame.chars));
    expect(Array.from(out.rgba)).not.toEqual(Array.from(frame.rgba));
  });
});

describe('style signatures', () => {
  const frame = gridFrame(40, 25);

  it('pulse turns the entire grid over on a single beat', () => {
    // crossing one hold boundary must move essentially every cell at once
    expect(movedFraction('pulse', frame, 0.49, 0.51)).toBeGreaterThan(0.95);
  });

  it('shimmer moves only a small slice of the grid per frame', () => {
    // one 60fps frame at a 500ms hold should touch roughly 1/30th of cells
    const moved = movedFraction('shimmer', frame, 0.5, 0.5 + 1 / 60);
    expect(moved).toBeGreaterThan(0.005);
    expect(moved).toBeLessThan(0.15);
  });

  it('pulse and shimmer differ sharply in simultaneity', () => {
    const pulse = movedFraction('pulse', frame, 0.49, 0.51);
    const shimmer = movedFraction('shimmer', frame, 0.49, 0.51);
    expect(pulse).toBeGreaterThan(shimmer * 5);
  });

  it('wave moves a contiguous band, not the whole grid', () => {
    const moved = movedFraction('wave', frame, 0.5, 0.5 + 1 / 60);
    expect(moved).toBeGreaterThan(0);
    expect(moved).toBeLessThan(0.3);
  });

  it('wave advances across the image over a hold period', () => {
    const anim = createGlyphAnimator({ alternatives: ALTERNATIVES, style: 'wave', holdMs: 500 });
    // the leading edge should be at different columns at different times
    const columnOfChange = (t0: number, t1: number) => {
      const a = anim.apply(frame, t0).chars;
      const b = anim.apply(frame, t1).chars;
      let sum = 0;
      let n = 0;
      for (let i = 0; i < a.length; i++) {
        if (a[i] !== b[i]) {
          sum += (i % frame.cols) + ((i / frame.cols) | 0);
          n++;
        }
      }
      return n ? sum / n : -1;
    };
    const early = columnOfChange(0.1, 0.1 + 1 / 60);
    const late = columnOfChange(0.4, 0.4 + 1 / 60);
    expect(early).toBeGreaterThanOrEqual(0);
    expect(late).toBeGreaterThanOrEqual(0);
    expect(early).not.toBeCloseTo(late, 0);
  });

  it('ripple moves a ring, not the whole grid', () => {
    const moved = movedFraction('ripple', frame, 0.5, 0.5 + 1 / 60);
    expect(moved).toBeGreaterThan(0);
    expect(moved).toBeLessThan(0.3);
  });
});

describe('matted cells', () => {
  /** A grid where the left half has been matted out (alpha 0). */
  function halfMattedFrame(cols: number, rows: number): AsciiFrame {
    const frame = gridFrame(cols, rows);
    const rgba = new Uint8ClampedArray(frame.rgba);
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols / 2; col++) {
        rgba[(row * cols + col) * 4 + 3] = 0;
      }
    }
    return { ...frame, rgba };
  }

  const cols = 16;
  const rows = 8;
  const frame = halfMattedFrame(cols, rows);

  // A removed background that swaps glyphs would flicker back into view on every hold,
  // which defeats the point of removing it.
  it.each(STYLES)('%s never swaps a glyph in a transparent cell', (style) => {
    const anim = createGlyphAnimator({ alternatives: ALTERNATIVES, style, holdMs: 100 });
    for (const t of [0, 0.05, 0.3, 0.75, 1.4, 2.9]) {
      const out = anim.apply(frame, t);
      for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols / 2; col++) {
          const i = row * cols + col;
          expect(out.chars[i]).toBe(frame.chars[i]);
        }
      }
    }
  });

  it('still animates the cells that remain visible', () => {
    const anim = createGlyphAnimator({ alternatives: ALTERNATIVES, style: 'pulse', holdMs: 100 });
    const a = anim.apply(frame, 0).chars;
    const b = anim.apply(frame, 0.15).chars;
    let moved = 0;
    for (let row = 0; row < rows; row++) {
      for (let col = cols / 2; col < cols; col++) {
        const i = row * cols + col;
        if (a[i] !== b[i]) moved++;
      }
    }
    expect(moved).toBeGreaterThan(0);
  });

  it('leaves the alpha channel of removed cells at zero', () => {
    const anim = createGlyphAnimator({ alternatives: ALTERNATIVES, style: 'crt', holdMs: 100 });
    const out = anim.apply(frame, 0.4);
    expect(out.rgba[3]).toBe(0);
  });
});
