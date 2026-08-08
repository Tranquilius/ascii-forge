import { describe, expect, it } from 'vitest';
import { MAX_ZOOM, MIN_ZOOM, clampZoom, computeFitZoom, safeRenderScale, stepZoom } from './zoom';

describe('clampZoom', () => {
  it('holds values inside the range', () => {
    expect(clampZoom(1)).toBe(1);
    expect(clampZoom(2.5)).toBe(2.5);
  });

  it('clamps beyond the range', () => {
    expect(clampZoom(0.001)).toBe(MIN_ZOOM);
    expect(clampZoom(9999)).toBe(MAX_ZOOM);
  });

  it('falls back to 1 for non-finite input rather than jumping to a bound', () => {
    // Infinity/NaN only arise from a bad division upstream; landing on 1 is recoverable,
    // whereas snapping to MAX_ZOOM would look like a rendering bug to the user.
    expect(clampZoom(Number.NaN)).toBe(1);
    expect(clampZoom(Number.POSITIVE_INFINITY)).toBe(1);
    expect(clampZoom(Number.NEGATIVE_INFINITY)).toBe(1);
  });
});

describe('stepZoom', () => {
  it('is reversible in the middle of the range', () => {
    const zoomed = stepZoom(1, 1);
    expect(stepZoom(zoomed, -1)).toBeCloseTo(1, 10);
  });

  it('increases going in and decreases going out', () => {
    expect(stepZoom(1, 1)).toBeGreaterThan(1);
    expect(stepZoom(1, -1)).toBeLessThan(1);
  });

  it('saturates at the bounds instead of overshooting', () => {
    expect(stepZoom(MAX_ZOOM, 1)).toBe(MAX_ZOOM);
    expect(stepZoom(MIN_ZOOM, -1)).toBe(MIN_ZOOM);
  });
});

describe('computeFitZoom', () => {
  it('shrinks content that overflows the container', () => {
    // 1000 wide into 500 wide -> half size
    expect(computeFitZoom(1000, 500, 500, 500)).toBeCloseTo(0.5, 5);
  });

  it('constrains by the tighter of the two axes', () => {
    // width would allow 1.0, height only allows 0.25
    expect(computeFitZoom(500, 2000, 500, 500)).toBeCloseTo(0.25, 5);
  });

  it('never upscales past 1 — fit only shrinks', () => {
    expect(computeFitZoom(100, 100, 1000, 1000)).toBe(1);
  });

  it('returns 1 for degenerate sizes rather than 0 or NaN', () => {
    expect(computeFitZoom(0, 0, 500, 500)).toBe(1);
    expect(computeFitZoom(500, 500, 0, 0)).toBe(1);
  });
});

describe('safeRenderScale', () => {
  it('passes the desired scale through when the canvas stays small', () => {
    expect(safeRenderScale(400, 300, 2)).toBe(2);
  });

  it('reduces the scale rather than exceeding the canvas edge limit', () => {
    // 4000px base at 8x would be 32000px wide — well past what browsers allow
    const scale = safeRenderScale(4000, 3000, 8);
    expect(scale).toBeLessThan(8);
    expect(4000 * scale).toBeLessThanOrEqual(8192);
    expect(3000 * scale).toBeLessThanOrEqual(8192);
  });

  it('keeps the resulting canvas area within budget', () => {
    const scale = safeRenderScale(3000, 3000, 8);
    expect(3000 * scale * 3000 * scale).toBeLessThanOrEqual(32_000_000 * 1.01);
  });

  it('never drops below 0.5 even for enormous input', () => {
    expect(safeRenderScale(50_000, 50_000, 4)).toBe(0.5);
  });

  it('handles degenerate input', () => {
    expect(safeRenderScale(0, 0, 2)).toBe(1);
  });
});
