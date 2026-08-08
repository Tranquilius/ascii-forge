import { describe, expect, it } from 'vitest';
import { BLANK_ALPHA, applyMatte, buildMatteMask, colorDistance, detectBackgroundColor } from './matte';

type RGB = [number, number, number];

/** Build a cols x rows RGBA grid from a per-cell colour function. */
function grid(cols: number, rows: number, at: (col: number, row: number) => RGB | [number, number, number, number]) {
  const buf = new Uint8ClampedArray(cols * rows * 4);
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const o = (row * cols + col) * 4;
      const c = at(col, row);
      buf[o] = c[0];
      buf[o + 1] = c[1];
      buf[o + 2] = c[2];
      buf[o + 3] = c.length === 4 ? c[3] : 255;
    }
  }
  return buf;
}

const GREEN: RGB = [0, 255, 0];
const RED: RGB = [255, 0, 0];

const alphaAt = (buf: Uint8ClampedArray, cols: number, col: number, row: number) =>
  buf[(row * cols + col) * 4 + 3];

describe('colorDistance', () => {
  it('is zero for identical colours', () => {
    expect(colorDistance(GREEN, GREEN)).toBe(0);
  });

  it('maxes out at 100 for black vs white', () => {
    expect(colorDistance([0, 0, 0], [255, 255, 255])).toBeCloseTo(100, 5);
  });

  it('is symmetric', () => {
    expect(colorDistance(RED, GREEN)).toBeCloseTo(colorDistance(GREEN, RED), 10);
  });

  it('weights green above blue, matching how the eye reads them', () => {
    const greenShift = colorDistance([0, 0, 0], [60, 0, 0]);
    const blueShift = colorDistance([0, 0, 0], [0, 0, 60]);
    void greenShift;
    // channel order is [r,g,b]; compare the g and b channels directly
    expect(colorDistance([0, 0, 0], [0, 60, 0])).toBeGreaterThan(blueShift);
  });
});

describe('detectBackgroundColor', () => {
  it('finds a flat border colour exactly', () => {
    // Exactness matters: a user keying a pure green screen at tolerance 0 must get a hit.
    const buf = grid(8, 8, (col, row) => (col === 0 || row === 0 || col === 7 || row === 7 ? GREEN : RED));
    expect(detectBackgroundColor(buf, 8, 8)).toEqual([0, 255, 0]);
  });

  it('picks the dominant border colour when the border is not uniform', () => {
    const buf = grid(10, 10, (col, row) => {
      const onBorder = col === 0 || row === 0 || col === 9 || row === 9;
      if (!onBorder) return RED;
      // one stray corner cell of a different colour
      return col === 0 && row === 0 ? [10, 10, 200] : GREEN;
    });
    expect(detectBackgroundColor(buf, 10, 10)).toEqual([0, 255, 0]);
  });

  it('ignores already-transparent border cells', () => {
    const buf = grid(6, 6, (col, row) => {
      const onBorder = col === 0 || row === 0 || col === 5 || row === 5;
      if (!onBorder) return RED;
      return col < 3 ? [9, 9, 9, 0] : [0, 255, 0, 255];
    });
    expect(detectBackgroundColor(buf, 6, 6)).toEqual([0, 255, 0]);
  });

  it('returns null for an empty grid', () => {
    expect(detectBackgroundColor(new Uint8ClampedArray(0), 0, 0)).toBeNull();
  });
});

describe('buildMatteMask — contiguous vs global', () => {
  /**
   * A subject with a hole of background-coloured pixels inside it. This is the case the two
   * modes exist to distinguish, so it is the test that proves they actually differ.
   *
   *   G G G G G
   *   G R R R G
   *   G R G R G     <- the centre cell is green but enclosed by the subject
   *   G R R R G
   *   G G G G G
   */
  const enclosed = grid(5, 5, (col, row) => {
    const ring = col === 0 || row === 0 || col === 4 || row === 4;
    if (ring) return GREEN;
    if (col === 2 && row === 2) return GREEN;
    return RED;
  });

  it('contiguous mode leaves the enclosed pocket intact', () => {
    const mask = buildMatteMask(enclosed, 5, 5, GREEN, 5, true);
    expect(mask[0]).toBe(1); // border is removed
    expect(mask[2 * 5 + 2]).toBe(0); // the enclosed pocket survives
  });

  it('global mode removes the enclosed pocket too', () => {
    const mask = buildMatteMask(enclosed, 5, 5, GREEN, 5, false);
    expect(mask[0]).toBe(1);
    expect(mask[2 * 5 + 2]).toBe(1);
  });

  it('tolerance 0 matches only exact colours', () => {
    const buf = grid(4, 4, (col) => (col === 0 ? GREEN : [0, 250, 0]));
    const strict = buildMatteMask(buf, 4, 4, GREEN, 0, false);
    expect(strict[0]).toBe(1);
    expect(strict[1]).toBe(0);
  });

  it('a wider tolerance picks up near-matches', () => {
    const buf = grid(4, 4, (col) => (col === 0 ? GREEN : [0, 250, 0]));
    const loose = buildMatteMask(buf, 4, 4, GREEN, 5, false);
    expect(loose[1]).toBe(1);
  });

  it('leaves the subject alone when nothing matches', () => {
    const buf = grid(4, 4, () => RED);
    const mask = buildMatteMask(buf, 4, 4, GREEN, 5, true);
    expect([...mask].every((v) => v === 0)).toBe(true);
  });
});

describe('applyMatte', () => {
  const cols = 7;
  const rows = 7;
  // A red square floating on a green field.
  const scene = grid(cols, rows, (col, row) =>
    col >= 2 && col <= 4 && row >= 2 && row <= 4 ? RED : GREEN,
  );

  it('zeroes alpha on the background and keeps the subject opaque', () => {
    const out = applyMatte(scene, cols, rows, { tolerance: 5, contiguous: true, feather: 0 });
    expect(alphaAt(out, cols, 0, 0)).toBe(0);
    expect(alphaAt(out, cols, 3, 3)).toBe(255);
  });

  it('auto-detects the key colour when none is given', () => {
    const out = applyMatte(scene, cols, rows, { tolerance: 5, contiguous: true, feather: 0 });
    // Nothing was passed as keyColor, yet the green field is gone.
    expect(alphaAt(out, cols, 6, 6)).toBe(0);
  });

  it('does not modify the input buffer', () => {
    const before = new Uint8ClampedArray(scene);
    applyMatte(scene, cols, rows, { tolerance: 5, contiguous: true, feather: 1 });
    expect(scene).toEqual(before);
  });

  it('leaves RGB untouched — only alpha changes', () => {
    const out = applyMatte(scene, cols, rows, { tolerance: 5, contiguous: true, feather: 0 });
    for (let i = 0; i < cols * rows; i++) {
      expect(out[i * 4]).toBe(scene[i * 4]);
      expect(out[i * 4 + 1]).toBe(scene[i * 4 + 1]);
      expect(out[i * 4 + 2]).toBe(scene[i * 4 + 2]);
    }
  });

  it('preserves existing source transparency rather than restoring it', () => {
    // A subject cell that was already half-transparent must not come back to full opacity.
    const withAlpha = grid(cols, rows, (col, row) => {
      if (col === 3 && row === 3) return [255, 0, 0, 100];
      return col >= 2 && col <= 4 && row >= 2 && row <= 4 ? RED : GREEN;
    });
    const out = applyMatte(withAlpha, cols, rows, { tolerance: 5, contiguous: true, feather: 0 });
    expect(alphaAt(out, cols, 3, 3)).toBe(100);
  });

  it('feathering softens the edge without touching the interior', () => {
    const out = applyMatte(scene, cols, rows, { tolerance: 5, contiguous: true, feather: 1 });
    const edge = alphaAt(out, cols, 2, 3); // subject cell adjacent to the cut
    const interior = alphaAt(out, cols, 3, 3); // subject cell one further in
    expect(edge).toBeGreaterThan(0);
    expect(edge).toBeLessThan(255);
    expect(interior).toBe(255);
  });

  it('feather alpha rises monotonically away from the cut', () => {
    // A wide field so a feather of 2 has room to ramp.
    const wide = grid(11, 11, (col, row) =>
      col >= 3 && col <= 7 && row >= 3 && row <= 7 ? RED : GREEN,
    );
    const out = applyMatte(wide, 11, 11, { tolerance: 5, contiguous: true, feather: 2 });
    const a1 = alphaAt(out, 11, 3, 5);
    const a2 = alphaAt(out, 11, 4, 5);
    const a3 = alphaAt(out, 11, 5, 5);
    expect(a1).toBeLessThan(a2);
    expect(a2).toBeLessThanOrEqual(a3);
    expect(a3).toBe(255);
  });

  it('a fully removed cell falls at or below the blank threshold', () => {
    const out = applyMatte(scene, cols, rows, { tolerance: 5, contiguous: true, feather: 2 });
    expect(alphaAt(out, cols, 0, 0)).toBeLessThanOrEqual(BLANK_ALPHA);
  });

  it('returns the input unchanged when the key cannot be determined', () => {
    const empty = new Uint8ClampedArray(0);
    expect(applyMatte(empty, 0, 0, { tolerance: 5, contiguous: true, feather: 0 }).length).toBe(0);
  });
});
