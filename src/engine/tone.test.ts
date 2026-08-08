import { describe, expect, it } from 'vitest';
import { applyToneRGBA, contrastFactor, toneChannel } from './tone';

describe('toneChannel', () => {
  it('is a no-op at brightness=0, contrast=0, gamma=1', () => {
    for (const v of [0, 1, 64, 128, 200, 255]) {
      expect(toneChannel(v, 0, 0, 1)).toBeCloseTo(v, 5);
    }
  });

  it('contrastFactor(0) === 1', () => {
    expect(contrastFactor(0)).toBeCloseTo(1, 10);
  });

  it('brightness shifts values up and clamps at 255', () => {
    expect(toneChannel(0, 50, 0, 1)).toBeCloseTo(50, 5);
    expect(toneChannel(250, 50, 0, 1)).toBe(255);
  });

  it('clamps at 0 for negative brightness', () => {
    expect(toneChannel(10, -50, 0, 1)).toBe(0);
  });

  it('positive contrast pushes values away from mid-gray (128)', () => {
    const lifted = toneChannel(200, 0, 50, 1);
    const lowered = toneChannel(50, 0, 50, 1);
    expect(lifted).toBeGreaterThan(200);
    expect(lowered).toBeLessThan(50);
  });

  it('gamma > 1 brightens midtones, gamma < 1 darkens them (v = (v/255)^(1/gamma)*255)', () => {
    const mid = 128;
    const brightened = toneChannel(mid, 0, 0, 2);
    const darkened = toneChannel(mid, 0, 0, 0.5);
    expect(brightened).toBeGreaterThan(mid);
    expect(darkened).toBeLessThan(mid);
  });
});

describe('applyToneRGBA', () => {
  it('leaves alpha untouched', () => {
    const src = new Uint8ClampedArray([10, 20, 30, 77]);
    const out = applyToneRGBA(src, 20, 30, 1.2);
    expect(out[3]).toBe(77);
  });

  it('is a byte-identical no-op at defaults', () => {
    const src = new Uint8ClampedArray([10, 20, 30, 77, 200, 100, 5, 255]);
    const out = applyToneRGBA(src, 0, 0, 1);
    expect(Array.from(out)).toEqual(Array.from(src));
  });
});
