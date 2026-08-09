import { describe, expect, it } from 'vitest';
import { clampCrop, composeCrop, FULL_CROP, isValidCrop, resolveCrop } from './crop';
import { computeRows } from './sample';

const FULL = { x: 0, y: 0, w: 1, h: 1 };

describe('isValidCrop', () => {
  it('rejects null and undefined', () => {
    expect(isValidCrop(null)).toBe(false);
    expect(isValidCrop(undefined)).toBe(false);
  });

  it('rejects non-finite values', () => {
    expect(isValidCrop({ x: NaN, y: 0, w: 1, h: 1 })).toBe(false);
    expect(isValidCrop({ x: 0, y: 0, w: Infinity, h: 1 })).toBe(false);
  });

  it('rejects degenerate rectangles', () => {
    expect(isValidCrop({ x: 0.5, y: 0.5, w: 0, h: 0.5 })).toBe(false);
    expect(isValidCrop({ x: 0.5, y: 0.5, w: 0.5, h: -0.2 })).toBe(false);
  });

  it('rejects a rectangle entirely outside the source', () => {
    expect(isValidCrop({ x: 1.5, y: 0, w: 0.4, h: 0.4 })).toBe(false);
    expect(isValidCrop({ x: -0.9, y: 0, w: 0.4, h: 0.4 })).toBe(false);
  });

  it('accepts a normal rectangle', () => {
    expect(isValidCrop({ x: 0.25, y: 0.25, w: 0.5, h: 0.5 })).toBe(true);
  });
});

describe('clampCrop', () => {
  it('clips a rectangle that overhangs the source', () => {
    expect(clampCrop({ x: -0.25, y: 0.5, w: 0.5, h: 1 })).toEqual({ x: 0, y: 0.5, w: 0.25, h: 0.5 });
  });

  it('leaves an in-bounds rectangle alone', () => {
    // Clamping reconstructs the extent as (x + w) - x, so exact equality would be asserting
    // that float subtraction round-trips, which it does not. Closeness is the real contract.
    const c = { x: 0.1, y: 0.2, w: 0.3, h: 0.4 };
    const out = clampCrop(c);
    expect(out.x).toBeCloseTo(c.x, 10);
    expect(out.y).toBeCloseTo(c.y, 10);
    expect(out.w).toBeCloseTo(c.w, 10);
    expect(out.h).toBeCloseTo(c.h, 10);
  });
});

describe('resolveCrop', () => {
  it('treats null as the whole frame', () => {
    expect(resolveCrop(null, 800, 600)).toEqual({ sx: 0, sy: 0, sw: 800, sh: 600 });
  });

  it('treats an invalid crop as the whole frame rather than throwing', () => {
    expect(resolveCrop({ x: NaN, y: 0, w: 1, h: 1 }, 800, 600)).toEqual({
      sx: 0,
      sy: 0,
      sw: 800,
      sh: 600,
    });
  });

  it('a full-frame crop is identical to no crop at all', () => {
    expect(resolveCrop(FULL, 800, 600)).toEqual(resolveCrop(null, 800, 600));
  });

  it('converts normalised coordinates to source pixels', () => {
    expect(resolveCrop({ x: 0.25, y: 0.5, w: 0.5, h: 0.25 }, 800, 600)).toEqual({
      sx: 200,
      sy: 300,
      sw: 400,
      sh: 150,
    });
  });

  it('lands exactly on the far edge instead of a pixel short', () => {
    const r = resolveCrop({ x: 0.5, y: 0.5, w: 0.5, h: 0.5 }, 801, 601);
    expect(r.sx + r.sw).toBe(801);
    expect(r.sy + r.sh).toBe(601);
  });

  it('never returns a zero-area rectangle', () => {
    const r = resolveCrop({ x: 0.999, y: 0.999, w: 0.01, h: 0.01 }, 100, 100);
    expect(r.sw).toBeGreaterThanOrEqual(1);
    expect(r.sh).toBeGreaterThanOrEqual(1);
    expect(r.sx + r.sw).toBeLessThanOrEqual(100);
    expect(r.sy + r.sh).toBeLessThanOrEqual(100);
  });

  it('stays within the source for an overhanging crop', () => {
    const r = resolveCrop({ x: 0.8, y: 0.8, w: 0.5, h: 0.5 }, 500, 400);
    expect(r.sx + r.sw).toBeLessThanOrEqual(500);
    expect(r.sy + r.sh).toBeLessThanOrEqual(400);
  });

  it('handles a zero-sized source', () => {
    expect(resolveCrop(FULL, 0, 0)).toEqual({ sx: 0, sy: 0, sw: 0, sh: 0 });
  });
});

describe('crop feeds the aspect calculation', () => {
  // The one mistake that would silently stretch the output: computing rows from the source
  // size rather than the cropped size.
  const CELL_ASPECT = 0.5;

  it('a square crop of a widescreen source comes out square', () => {
    const source = { w: 1920, h: 1080 };
    const rect = resolveCrop({ x: 0.25, y: 0, w: 1080 / 1920, h: 1 }, source.w, source.h);
    expect(rect.sw).toBe(rect.sh);

    const cols = 200;
    const rows = computeRows(cols, rect.sw, rect.sh, CELL_ASPECT, 1);
    // A square region at cellAspect 0.5 needs half as many rows as columns to read square.
    expect(rows).toBe(100);
  });

  it('the uncropped widescreen source is wider than it is tall', () => {
    const rows = computeRows(200, 1920, 1080, CELL_ASPECT, 1);
    expect(rows).toBe(56);
  });
});

describe('composeCrop', () => {
  // A selection drawn on a cropped view is normalised against that view, not the original
  // image. Without composing, cropping twice jumps to the wrong region.
  it('passes a child through when the parent is the whole image', () => {
    const child = { x: 0.2, y: 0.3, w: 0.4, h: 0.5 };
    expect(composeCrop(null, child)).toEqual(child);
    expect(composeCrop(FULL_CROP, child)).toEqual(child);
  });

  it('rescales a child into the parent window', () => {
    // Parent is the right half; selecting the left half of that view is the middle quarter.
    const out = composeCrop({ x: 0.5, y: 0, w: 0.5, h: 1 }, { x: 0, y: 0, w: 0.5, h: 1 });
    expect(out).toEqual({ x: 0.5, y: 0, w: 0.25, h: 1 });
  });

  it('offsets by the parent origin', () => {
    const out = composeCrop({ x: 0.25, y: 0.25, w: 0.5, h: 0.5 }, { x: 0.5, y: 0.5, w: 0.5, h: 0.5 });
    expect(out.x).toBeCloseTo(0.5, 10);
    expect(out.y).toBeCloseTo(0.5, 10);
    expect(out.w).toBeCloseTo(0.25, 10);
    expect(out.h).toBeCloseTo(0.25, 10);
  });

  it('a full-frame child selects the whole parent unchanged', () => {
    const parent = { x: 0.1, y: 0.2, w: 0.3, h: 0.4 };
    const out = composeCrop(parent, FULL_CROP);
    expect(out.x).toBeCloseTo(parent.x, 10);
    expect(out.y).toBeCloseTo(parent.y, 10);
    expect(out.w).toBeCloseTo(parent.w, 10);
    expect(out.h).toBeCloseTo(parent.h, 10);
  });

  it('never escapes the parent window', () => {
    const parent = { x: 0.3, y: 0.3, w: 0.4, h: 0.4 };
    for (const child of [
      { x: 0, y: 0, w: 1, h: 1 },
      { x: 0.9, y: 0.9, w: 0.1, h: 0.1 },
      { x: 0.4, y: 0.1, w: 0.5, h: 0.8 },
    ]) {
      const out = composeCrop(parent, child);
      expect(out.x).toBeGreaterThanOrEqual(parent.x - 1e-9);
      expect(out.y).toBeGreaterThanOrEqual(parent.y - 1e-9);
      expect(out.x + out.w).toBeLessThanOrEqual(parent.x + parent.w + 1e-9);
      expect(out.y + out.h).toBeLessThanOrEqual(parent.y + parent.h + 1e-9);
    }
  });

  it('composes repeatedly, each step shrinking into the last', () => {
    // Three successive half-crops of the top-left corner land on one eighth.
    const half = { x: 0, y: 0, w: 0.5, h: 0.5 };
    let acc = composeCrop(null, half);
    acc = composeCrop(acc, half);
    acc = composeCrop(acc, half);
    expect(acc.w).toBeCloseTo(0.125, 10);
    expect(acc.h).toBeCloseTo(0.125, 10);
  });

  it('resolves against real pixels the way nesting implies', () => {
    // Right half of a 800x600 image, then the bottom half of that view.
    const first = composeCrop(null, { x: 0.5, y: 0, w: 0.5, h: 1 });
    const second = composeCrop(first, { x: 0, y: 0.5, w: 1, h: 0.5 });
    expect(resolveCrop(second, 800, 600)).toEqual({ sx: 400, sy: 300, sw: 400, sh: 300 });
  });
});
