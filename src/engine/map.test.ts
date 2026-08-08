import { describe, expect, it } from 'vitest';
import { luminance709, luminanceToRampIndex } from './map';

describe('luminance709', () => {
  it('black is 0, white is 255', () => {
    expect(luminance709(0, 0, 0)).toBe(0);
    expect(luminance709(255, 255, 255)).toBeCloseTo(255, 5);
  });

  it('weights green highest, blue lowest (Rec.709)', () => {
    expect(luminance709(0, 255, 0)).toBeGreaterThan(luminance709(255, 0, 0));
    expect(luminance709(255, 0, 0)).toBeGreaterThan(luminance709(0, 0, 255));
  });
});

describe('luminanceToRampIndex', () => {
  const rampLength = 10;

  it('maps 0 to index 0 and 255 to the last index at bias=1, no invert', () => {
    expect(luminanceToRampIndex(0, rampLength, 1, false)).toBe(0);
    expect(luminanceToRampIndex(255, rampLength, 1, false)).toBe(rampLength - 1);
  });

  it('invert mirrors the mapping around the ramp', () => {
    for (const lum of [0, 40, 90, 128, 200, 255]) {
      const idx = luminanceToRampIndex(lum, rampLength, 1, false);
      const idxInverted = luminanceToRampIndex(lum, rampLength, 1, true);
      expect(idxInverted).toBe(rampLength - 1 - idx);
    }
  });

  it('is always within [0, rampLength - 1]', () => {
    for (const lum of [-10, 0, 60, 255, 400]) {
      for (const bias of [0.2, 1, 3]) {
        const idx = luminanceToRampIndex(lum, rampLength, bias, false);
        expect(idx).toBeGreaterThanOrEqual(0);
        expect(idx).toBeLessThanOrEqual(rampLength - 1);
      }
    }
  });

  it('bias monotonically shifts a below-midpoint luminance toward the dark end as it increases', () => {
    const lum = 0.3 * 255;
    const low = luminanceToRampIndex(lum, rampLength, 0.5, false);
    const linear = luminanceToRampIndex(lum, rampLength, 1, false);
    const high = luminanceToRampIndex(lum, rampLength, 2, false);
    expect(low).toBeGreaterThanOrEqual(linear);
    expect(linear).toBeGreaterThanOrEqual(high);
  });
});
