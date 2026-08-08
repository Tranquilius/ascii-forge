import { describe, expect, it } from 'vitest';
import {
  applyAspect,
  clientToNormalised,
  croppedGridSize,
  isUsableRect,
  moveCrop,
  normalisedToBox,
  rectFromPoints,
  resizeCrop,
  type DisplayBox,
} from './cropGeometry';

/** The canvas box as it appears on screen at a given zoom. */
function boxAtZoom(zoom: number, baseW = 800, baseH = 400, left = 120, top = 60): DisplayBox {
  return { left, top, width: baseW * zoom, height: baseH * zoom };
}

describe('clientToNormalised', () => {
  // Zoom is baked into the displayed box, so dividing by it cancels out — this is the whole
  // reason the mapping never reads canvas.width.
  it.each([0.34, 1, 4])('gives the same normalised point at zoom %s', (zoom) => {
    const box = boxAtZoom(zoom);
    const clientX = box.left + box.width * 0.25;
    const clientY = box.top + box.height * 0.75;
    const p = clientToNormalised(clientX, clientY, box);
    expect(p.x).toBeCloseTo(0.25, 10);
    expect(p.y).toBeCloseTo(0.75, 10);
  });

  it('round-trips through normalisedToBox at any zoom', () => {
    for (const zoom of [0.34, 1, 4]) {
      const box = boxAtZoom(zoom);
      const crop = { x: 0.2, y: 0.3, w: 0.5, h: 0.4 };
      const pixels = normalisedToBox(crop, box);
      const back = clientToNormalised(box.left + pixels.left, box.top + pixels.top, box);
      expect(back.x).toBeCloseTo(crop.x, 10);
      expect(back.y).toBeCloseTo(crop.y, 10);
    }
  });

  it('clamps a pointer dragged outside the canvas', () => {
    const box = boxAtZoom(1);
    expect(clientToNormalised(box.left - 500, box.top - 500, box)).toEqual({ x: 0, y: 0 });
    expect(clientToNormalised(box.left + 99999, box.top + 99999, box)).toEqual({ x: 1, y: 1 });
  });

  it('does not divide by zero on an unmeasured box', () => {
    expect(clientToNormalised(10, 10, { left: 0, top: 0, width: 0, height: 0 })).toEqual({ x: 0, y: 0 });
  });
});

describe('rectFromPoints', () => {
  it('normalises a drag made in any direction', () => {
    const forward = rectFromPoints({ x: 0.2, y: 0.2 }, { x: 0.6, y: 0.8 });
    const backward = rectFromPoints({ x: 0.6, y: 0.8 }, { x: 0.2, y: 0.2 });
    expect(forward).toEqual(backward);
    expect(forward.x).toBeCloseTo(0.2, 10);
    expect(forward.y).toBeCloseTo(0.2, 10);
    expect(forward.w).toBeCloseTo(0.4, 10);
    expect(forward.h).toBeCloseTo(0.6, 10);
  });

  it('produces a degenerate rect for a click without a drag', () => {
    expect(isUsableRect(rectFromPoints({ x: 0.5, y: 0.5 }, { x: 0.5, y: 0.5 }))).toBe(false);
  });
});

describe('resizeCrop', () => {
  const crop = { x: 0.2, y: 0.2, w: 0.4, h: 0.4 };

  it('moves only the dragged edge', () => {
    const out = resizeCrop(crop, 'e', { x: 0.9, y: 0.5 });
    expect(out.x).toBeCloseTo(0.2, 10);
    expect(out.x + out.w).toBeCloseTo(0.9, 10);
    expect(out.y).toBeCloseTo(0.2, 10);
    expect(out.h).toBeCloseTo(0.4, 10);
  });

  it('moves both edges for a corner handle', () => {
    const out = resizeCrop(crop, 'nw', { x: 0.1, y: 0.05 });
    expect(out.x).toBeCloseTo(0.1, 10);
    expect(out.y).toBeCloseTo(0.05, 10);
    expect(out.x + out.w).toBeCloseTo(0.6, 10);
  });

  it('flips rather than collapsing when dragged past the opposite edge', () => {
    // y is ignored for an east handle, but the point type still requires it.
    const out = resizeCrop(crop, 'e', { x: 0.05, y: 0.4 });
    expect(out.w).toBeGreaterThan(0);
    expect(out.x).toBeCloseTo(0.05, 10);
  });

  it('clamps a handle dragged outside the source', () => {
    const out = resizeCrop(crop, 'se', { x: 5, y: 5 });
    expect(out.x + out.w).toBeLessThanOrEqual(1);
    expect(out.y + out.h).toBeLessThanOrEqual(1);
  });
});

describe('moveCrop', () => {
  it('translates without changing size', () => {
    const out = moveCrop({ x: 0.2, y: 0.2, w: 0.3, h: 0.3 }, 0.1, -0.1);
    expect(out.x).toBeCloseTo(0.3, 10);
    expect(out.y).toBeCloseTo(0.1, 10);
    expect(out.w).toBeCloseTo(0.3, 10);
    expect(out.h).toBeCloseTo(0.3, 10);
  });

  it('stops at the edge instead of shrinking', () => {
    const out = moveCrop({ x: 0.8, y: 0.8, w: 0.2, h: 0.2 }, 0.5, 0.5);
    expect(out.w).toBeCloseTo(0.2, 10);
    expect(out.h).toBeCloseTo(0.2, 10);
    expect(out.x + out.w).toBeCloseTo(1, 10);
  });

  it('stops at the near edge too', () => {
    const out = moveCrop({ x: 0.1, y: 0.1, w: 0.2, h: 0.2 }, -0.5, -0.5);
    expect(out.x).toBe(0);
    expect(out.y).toBe(0);
  });
});

describe('applyAspect', () => {
  // Normalised space is anisotropic, so the source dimensions genuinely matter here.
  it('makes a crop square in source pixels, not in normalised units', () => {
    const out = applyAspect({ x: 0.1, y: 0.1, w: 0.8, h: 0.8 }, 1, 1600, 800);
    expect(out.w * 1600).toBeCloseTo(out.h * 800, 6);
  });

  it('hits a 16:9 target', () => {
    const out = applyAspect({ x: 0, y: 0, w: 1, h: 1 }, 16 / 9, 1000, 1000);
    expect((out.w * 1000) / (out.h * 1000)).toBeCloseTo(16 / 9, 6);
  });

  it('shrinks to fit rather than overflowing the frame', () => {
    const out = applyAspect({ x: 0, y: 0, w: 1, h: 1 }, 16 / 9, 1000, 1000);
    expect(out.x).toBeGreaterThanOrEqual(0);
    expect(out.y).toBeGreaterThanOrEqual(0);
    expect(out.x + out.w).toBeLessThanOrEqual(1.000001);
    expect(out.y + out.h).toBeLessThanOrEqual(1.000001);
  });

  it('keeps the crop centred', () => {
    const before = { x: 0.2, y: 0.2, w: 0.6, h: 0.6 };
    const out = applyAspect(before, 1, 1000, 1000);
    expect(out.x + out.w / 2).toBeCloseTo(0.5, 6);
    expect(out.y + out.h / 2).toBeCloseTo(0.5, 6);
  });

  it('ignores a nonsensical ratio instead of producing NaN', () => {
    const crop = { x: 0.1, y: 0.1, w: 0.5, h: 0.5 };
    expect(applyAspect(crop, 0, 100, 100)).toEqual(crop);
    expect(applyAspect(crop, NaN, 100, 100)).toEqual(crop);
  });
});

describe('croppedGridSize', () => {
  const CELL_ASPECT = 0.5;

  it('reports the full-frame grid when there is no crop', () => {
    expect(croppedGridSize(null, 200, 1920, 1080, CELL_ASPECT, 1)).toEqual({ cols: 200, rows: 56 });
  });

  // The point of cropping the source rather than the grid: the column count is unchanged.
  it('keeps the full column budget on a cropped region', () => {
    const out = croppedGridSize({ x: 0, y: 0, w: 0.5, h: 1 }, 200, 1920, 1080, CELL_ASPECT, 1);
    expect(out.cols).toBe(200);
    expect(out.rows).toBe(113);
  });

  it('a square crop of a widescreen source comes out square', () => {
    const out = croppedGridSize(
      { x: 0, y: 0, w: 1080 / 1920, h: 1 },
      200,
      1920,
      1080,
      CELL_ASPECT,
      1,
    );
    expect(out.rows).toBe(100);
  });
});
